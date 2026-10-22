import { Buffer } from 'node:buffer';
import { MAX_EXPENSE_PDF_BYTES } from './blobPdf.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADDRESS = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const SEND_TIMEOUT_MS = 35_000;
const SENDER_EMAIL = 'christophe@bbtm.fr';

export interface ExpenseMailInput { noteId: string; issuerName: string; pdf: Uint8Array }
export interface ExpenseMailer {
  checkReady(): void;
  send(input: ExpenseMailInput): Promise<void>;
}

/** A definite refusal can be retried; an uncertain SMTP result must be reconciled first. */
export class ExpenseMailError extends Error {
  readonly definite: boolean;
  readonly status: number;
  constructor(message: string, definite: boolean, status = 502) {
    super(message);
    this.name = 'ExpenseMailError';
    this.definite = definite;
    this.status = status;
  }
}

export interface ExpenseSmtpOptions {
  host: string; port: number; secure: boolean;
  auth: { user: string; pass: string };
  tls: { rejectUnauthorized: boolean; minVersion: 'TLSv1.2'; servername: string };
  connectionTimeout: number; greetingTimeout: number; socketTimeout: number; dnsTimeout: number;
  disableFileAccess: boolean; disableUrlAccess: boolean;
  logger: boolean; debug: boolean;
}
export interface ExpenseMailMessage {
  from: { name: string; address: string }; to: string;
  envelope: { from: string; to: string[] };
  subject: string; text: string; messageId: string;
  disableFileAccess: boolean; disableUrlAccess: boolean;
  attachments: { filename: string; content: Buffer; contentType: string; contentDisposition: 'attachment' }[];
}
export interface ExpenseMailTransport {
  sendMail(message: ExpenseMailMessage): Promise<unknown>;
  close(): void;
}

function configuration(environment: (name: string) => string | undefined) {
  const user = environment('NDF_EMAIL_USER')?.trim().toLowerCase() || '';
  const to = environment('NDF_EMAIL_TO')?.trim() || '';
  const rawPassword = environment('NDF_EMAIL_APP_PASSWORD') || '';
  const pass = rawPassword.replace(/ /g, '');
  if (user !== SENDER_EMAIL || !ADDRESS.test(to) || to.length > 254 || !/^[a-z0-9]{16}$/i.test(pass)) {
    throw new ExpenseMailError('Envoi comptable non configuré. L’administrateur doit renseigner les paramètres Gmail du service NDF.', true, 503);
  }
  return { user, pass, to };
}

function safeMailError(failure: unknown): ExpenseMailError {
  if (failure instanceof ExpenseMailError) return failure;
  const detail = failure && typeof failure === 'object' ? failure as Record<string, unknown> : {};
  if (detail.code === 'EAUTH') {
    return new ExpenseMailError('Gmail a refusé l’authentification. L’administrateur doit vérifier le compte et son mot de passe d’application.', true, 503);
  }
  // A negative DATA reply explicitly refuses delivery. Nodemailer uses CONN for socket
  // errors and timeouts at any phase, including after DATA: that label never proves refusal.
  const rejected = typeof detail.responseCode === 'number' && detail.responseCode >= 400 && detail.responseCode <= 599
    && typeof detail.command === 'string' && /^DATA$/i.test(detail.command);
  const beforeData = typeof detail.command === 'string' && /^(?:EHLO|HELO|STARTTLS|AUTH(?: .*)?|MAIL FROM|RCPT TO)$/i.test(detail.command);
  if (rejected || beforeData || detail.code === 'EENVELOPE') {
    return new ExpenseMailError('Le serveur email a refusé la transmission. La note est conservée et peut être retransmise après correction du service.', true);
  }
  // Never expose SMTP responses: they can include addresses, credentials or message data.
  return new ExpenseMailError('La transmission n’a pas pu être confirmée. Vérifiez sa réception auprès de la comptabilité avant un nouvel envoi.', false);
}

export function createSmtpExpenseMailer(
  environment: (name: string) => string | undefined,
  createTransport: (options: ExpenseSmtpOptions) => ExpenseMailTransport,
): ExpenseMailer {
  return {
    checkReady() { configuration(environment); },
    async send(input) {
      const settings = configuration(environment);
      if (!UUID.test(input.noteId) || !(input.pdf instanceof Uint8Array) || input.pdf.length > MAX_EXPENSE_PDF_BYTES
        || new TextDecoder().decode(input.pdf.subarray(0, 5)) !== '%PDF-') {
        throw new ExpenseMailError('Le document comptable est invalide ou dépasse la limite d’envoi de 4 Mo.', true, 422);
      }
      const id = input.noteId.toLowerCase();
      const issuer = String(input.issuerName).replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'SeaPilot';
      let transport: ExpenseMailTransport;
      try {
        transport = createTransport({
          host: 'smtp.gmail.com', port: 465, secure: true,
          auth: { user: settings.user, pass: settings.pass },
          tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: 'smtp.gmail.com' },
          connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 25_000, dnsTimeout: 10_000,
          disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
        });
      } catch {
        throw new ExpenseMailError('Le service email n’a pas pu démarrer. La note est conservée.', true, 503);
      }
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          transport.sendMail({
            from: { name: 'SeaPilot — Notes de frais', address: settings.user }, to: settings.to,
            envelope: { from: settings.user, to: [settings.to] },
            subject: `Note de frais - ${issuer} [NDF ${id.slice(0, 8)}]`,
            text: `Note de frais en pièce jointe.\nRéférence SeaPilot : ${id}`,
            messageId: `<ndf-${id}@sea-pilot-ten.vercel.app>`,
            disableFileAccess: true, disableUrlAccess: true,
            attachments: [{ filename: `NDF-${id}.pdf`, content: Buffer.from(input.pdf), contentType: 'application/pdf', contentDisposition: 'attachment' }],
          }),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(() => reject(safeMailError(null)), SEND_TIMEOUT_MS);
          }),
        ]);
        const info = result && typeof result === 'object' ? result as Record<string, unknown> : {};
        const accepts = Array.isArray(info.accepted) && info.accepted.some((address) => typeof address === 'string' && address.toLowerCase() === settings.to.toLowerCase());
        const rejects = Array.isArray(info.rejected) && info.rejected.some((address) => typeof address === 'string' && address.toLowerCase() === settings.to.toLowerCase());
        if (rejects && !accepts) throw new ExpenseMailError('Le serveur email a refusé le destinataire comptable. La note est conservée.', true);
        if (!accepts || typeof info.response !== 'string' || !/^2\d\d\b/.test(info.response)) throw safeMailError(null);
      } catch (failure) {
        throw safeMailError(failure);
      } finally {
        if (deadline !== undefined) clearTimeout(deadline);
        try { transport.close(); } catch { /* Closing must not replace a confirmed SMTP result. */ }
      }
    },
  };
}
