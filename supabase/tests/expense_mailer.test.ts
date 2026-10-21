// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSmtpExpenseMailer, ExpenseMailError, type ExpenseMailInput, type ExpenseMailMessage, type ExpenseSmtpOptions } from '../functions/expense-note-send/mailer';

const ID = 'aa100000-0000-4000-8000-000000000001';
const TO = 'accounting@example.test';
const input: ExpenseMailInput = { noteId: ID, issuerName: 'Test NDF', pdf: new TextEncoder().encode('%PDF-1.7\nsynthetic fixture') };
const ENV: Record<string, string> = {
  NDF_EMAIL_USER: 'christophe@bbtm.fr', NDF_EMAIL_APP_PASSWORD: 'abcdefghijklmnop', NDF_EMAIL_TO: TO,
};
function setup(overrides: Record<string, string | undefined> = {}) {
  const environment = { ...ENV, ...overrides };
  const sendMail = vi.fn<(message: ExpenseMailMessage) => Promise<unknown>>().mockResolvedValue({ accepted: [TO], rejected: [], response: '250 2.0.0 OK synthetic' });
  const close = vi.fn();
  const createTransport = vi.fn((_options: ExpenseSmtpOptions) => ({ sendMail, close }));
  const mailer = createSmtpExpenseMailer((key) => environment[key], createTransport);
  return { mailer, createTransport, sendMail, close };
}
afterEach(() => vi.useRealTimers());

describe('server-side expense SMTP delivery', () => {
  it.each(['NDF_EMAIL_USER', 'NDF_EMAIL_APP_PASSWORD', 'NDF_EMAIL_TO'])('fails readiness without %s before opening any connection', (missing) => {
    const test = setup({ [missing]: undefined });
    expect(() => test.mailer.checkReady()).toThrow(expect.objectContaining({ definite: true, status: 503 }));
    expect(test.createTransport).not.toHaveBeenCalled();
  });
  it.each(['another@example.test,attacker@example.test', 'victim@example.test\r\nBcc: attacker@example.test', 'User <victim@example.test>', 'https://example.test/'])('rejects recipient lists, headers and non-address destinations: %s', (recipient) => {
    const test = setup({ NDF_EMAIL_TO: recipient });
    expect(() => test.mailer.checkReady()).toThrow(ExpenseMailError);
    expect(test.createTransport).not.toHaveBeenCalled();
  });
  it('validates readiness without sending a test message or contacting Gmail', () => {
    const test = setup(); test.mailer.checkReady();
    expect(test.createTransport).not.toHaveBeenCalled(); expect(test.sendMail).not.toHaveBeenCalled();
  });
  it('refuses configuration for another sending account and normalizes the required account', async () => {
    const invalid = setup({ NDF_EMAIL_USER: 'another@example.test' });
    expect(() => invalid.mailer.checkReady()).toThrow(expect.objectContaining({ definite: true, status: 503 }));
    expect(invalid.createTransport).not.toHaveBeenCalled();
    const valid = setup({ NDF_EMAIL_USER: ' Christophe@BBTM.FR ' }); await valid.mailer.send(input);
    expect(valid.createTransport.mock.calls[0][0].auth.user).toBe('christophe@bbtm.fr');
    expect(valid.sendMail.mock.calls[0][0].envelope.from).toBe('christophe@bbtm.fr');
  });
  it('uses Gmail TLS 465 with certificate validation, bounded timeouts and no file/URL loading', async () => {
    const test = setup({ NDF_EMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' }); await test.mailer.send(input);
    expect(test.createTransport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: ENV.NDF_EMAIL_USER, pass: 'abcdefghijklmnop' },
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: 'smtp.gmail.com' },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 25_000, dnsTimeout: 10_000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
    });
    expect(test.close).toHaveBeenCalledOnce();
  });
  it('fixes the envelope to server settings, strips header controls and attaches the exact archived bytes', async () => {
    const test = setup();
    await test.mailer.send({ ...input, issuerName: 'Adrien\r\nBcc: attacker@example.test\u0000', to: 'attacker@example.test', pdfUrl: 'https://attacker.example' } as ExpenseMailInput);
    const message = test.sendMail.mock.calls[0][0];
    expect(message.to).toBe(TO); expect(message.envelope).toEqual({ from: ENV.NDF_EMAIL_USER, to: [TO] });
    expect(message.subject).not.toMatch(/[\r\n\u0000]/); expect(message).not.toHaveProperty('bcc');
    expect(message.messageId).toBe(`<ndf-${ID}@sea-pilot-ten.vercel.app>`);
    expect(message.attachments).toEqual([{ filename: `NDF-${ID}.pdf`, content: Buffer.from(input.pdf), contentType: 'application/pdf', contentDisposition: 'attachment' }]);
    expect(message.disableFileAccess).toBe(true); expect(message.disableUrlAccess).toBe(true);
  });
  it('reuses the same message identifier across legitimate retries', async () => {
    const test = setup(); await test.mailer.send(input); await test.mailer.send(input);
    expect(test.sendMail.mock.calls[0][0].messageId).toBe(test.sendMail.mock.calls[1][0].messageId);
  });
  it.each([
    { ...input, noteId: '../other\r\nBcc: victim' },
    { ...input, pdf: new TextEncoder().encode('not a PDF') },
    { ...input, pdf: new Uint8Array(4_000_001) },
  ])('rejects invalid references and documents before opening SMTP', async (value) => {
    const test = setup(); await expect(test.mailer.send(value)).rejects.toMatchObject({ definite: true, status: 422 });
    expect(test.createTransport).not.toHaveBeenCalled();
  });
  it.each([
    { code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535 },
    { code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 },
    { code: 'EMESSAGE', command: 'DATA', responseCode: 552 },
    { code: 'ETIMEDOUT', command: 'AUTH PLAIN' },
  ])('permits retry after a definite pre-delivery refusal: %j', async (failure) => {
    const test = setup(); test.sendMail.mockRejectedValue({ ...failure, message: 'secret SMTP response' });
    await expect(test.mailer.send(input)).rejects.toMatchObject({ definite: true });
    await expect(test.mailer.send(input)).rejects.not.toThrow('secret SMTP response');
    expect(test.close).toHaveBeenCalledTimes(2);
  });
  it.each([
    { code: 'ETIMEDOUT', command: 'DATA' }, { code: 'ESOCKET', command: 'DATA' },
    { code: 'ETIMEDOUT', command: 'CONN' }, { code: 'ESOCKET', command: 'CONN' }, { code: 'ECONNECTION', command: 'CONN' },
    { command: 'QUIT', responseCode: 500 }, { command: 'RSET', responseCode: 421 },
    { responseCode: 550 }, new Error('unknown outcome'),
  ])('requires reconciliation after an ambiguous DATA/network failure', async (failure) => {
    const test = setup(); test.sendMail.mockRejectedValue(failure);
    await expect(test.mailer.send(input)).rejects.toMatchObject({ definite: false, status: 502 });
    expect(test.sendMail).toHaveBeenCalledOnce(); expect(test.close).toHaveBeenCalledOnce();
  });
  it('never reports success when the configured recipient is rejected', async () => {
    const test = setup(); test.sendMail.mockResolvedValue({ accepted: [], rejected: [TO], response: '550 refused' });
    await expect(test.mailer.send(input)).rejects.toMatchObject({ definite: true });
  });
  it.each([{}, { accepted: [TO], response: 'not a final reply' }, { accepted: ['someone@example.test'], response: '250 OK' }])('requires final SMTP confirmation for the exact configured recipient', async (info) => {
    const test = setup(); test.sendMail.mockResolvedValue(info);
    await expect(test.mailer.send(input)).rejects.toMatchObject({ definite: false });
  });
  it('bounds waiting time and requests cleanup after the deadline while retaining an unknown outcome', async () => {
    vi.useFakeTimers();
    const test = setup(); test.sendMail.mockImplementation(() => new Promise(() => {}));
    const send = expect(test.mailer.send(input)).rejects.toMatchObject({ definite: false });
    await vi.advanceTimersByTimeAsync(35_000); await send;
    expect(test.close).toHaveBeenCalledOnce(); expect(test.sendMail).toHaveBeenCalledOnce();
  });
  it('does not turn a confirmed delivery into failure if closing the transport fails', async () => {
    const test = setup(); test.close.mockImplementation(() => { throw new Error('already closed'); });
    await expect(test.mailer.send(input)).resolves.toBeUndefined();
  });
  it('generates a real MIME PDF attachment using Nodemailer stream transport, with no network', async () => {
    const { default: nodemailer } = await import('nodemailer');
    const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
    let mime = '';
    const mailer = createSmtpExpenseMailer((name) => ENV[name], () => ({
      async sendMail(message) {
        const built = await stream.sendMail(message);
        mime = built.message.toString('utf8');
        return { accepted: [TO], response: '250 synthetic stream transport' };
      },
      close: () => stream.close(),
    }));
    await mailer.send({ ...input, issuerName: 'Collaborateur\r\nBcc: injected@example.invalid' });
    const unfolded = mime.replace(/\r\n[ \t]+/g, ' ');
    expect(unfolded).toContain('<christophe@bbtm.fr>');
    expect(mime).not.toMatch(/\r?\nBcc:/i);
    expect(mime).toContain(`To: ${TO}\r\n`);
    expect(unfolded).toContain(`Message-ID: <ndf-${ID}@sea-pilot-ten.vercel.app>\r\n`);
    expect(unfolded).toContain(`Content-Type: application/pdf; name=NDF-${ID}.pdf`);
    expect(mime).toContain('Content-Transfer-Encoding: base64');
    expect(mime).toContain(Buffer.from(input.pdf).toString('base64'));
    expect(mime).not.toContain(ENV.NDF_EMAIL_APP_PASSWORD);
  });
});
