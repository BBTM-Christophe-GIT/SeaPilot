import type { SupabaseClient } from '@supabase/supabase-js';
import { isDriveDocument, DriveAccessError, type DriveDocument } from '../document-drive/googleDrive.ts';
import { ExpensePdfAccessError, MAX_EXPENSE_PDF_BYTES, readExpenseBlobPdf } from './blobPdf.ts';
import { ExpenseMailError, type ExpenseMailer } from './mailer.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface Dependencies {
  userClient: (authorization: string) => SupabaseClient;
  admin: SupabaseClient;
  fetch: typeof fetch;
  mailer: ExpenseMailer;
  readDrive?: (document: DriveDocument) => Promise<Response>;
}

export function createExpenseSendHandler({ userClient, admin, fetch: read, mailer, readDrive }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') || '';
    const allowed = ['https://sea-pilot-ten.vercel.app', 'https://sea-pilot-bbtm-app.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173'].includes(origin);
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': allowed ? origin : 'https://sea-pilot-ten.vercel.app',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
    const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json(405, { ok: false, error: 'Méthode non autorisée.' });
    if (origin && !allowed) return json(403, { ok: false, error: 'Origine non autorisée.' });
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer .+/i.test(authorization)) return json(401, { ok: false, error: 'Connexion requise.' });
    try {
      const text = await request.text();
      if (text.length > 2000) return json(400, { ok: false, error: 'Requête invalide.' });
      let input: { noteId?: string };
      try { input = JSON.parse(text); } catch { return json(400, { ok: false, error: 'Requête invalide.' }); }
      if (!input || typeof input.noteId !== 'string' || !UUID.test(input.noteId)) return json(400, { ok: false, error: 'Référence invalide.' });
      const client = userClient(authorization);
      const user = await client.auth.getUser();
      if (user.error || !user.data.user) return json(401, { ok: false, error: 'Session expirée.' });
      // Authorization is performed through the caller's RLS, before any service-role access.
      const visible = await client.from('expense_notes').select('id,status,pdf_path,issuer_name,delivery_status,delivery_attempted_at').eq('id', input.noteId).maybeSingle();
      if (visible.error || !visible.data || visible.data.status !== 'issued') return json(404, { ok: false, error: 'Note émise introuvable.' });
      const note = visible.data;
      if (note.delivery_status === 'sent') return json(200, { ok: true, message: 'Cette note a déjà été transmise à la comptabilité.' });
      if (note.delivery_status === 'unknown') return json(409, { ok: false, error: 'La réception de cette note doit être vérifiée avant un nouvel envoi.' });
      if (note.delivery_status === 'sending') {
        if (Date.now() - Date.parse(note.delivery_attempted_at) > 120_000) {
          await admin.from('expense_notes').update({ delivery_status: 'unknown', delivery_error: 'Confirmation de transmission absente.' }).eq('id', note.id).eq('delivery_status', 'sending');
        }
        return json(409, { ok: false, error: 'Une transmission a déjà été lancée. Vérifiez son résultat avant de réessayer.' });
      }
      // Missing mail configuration cannot turn a retryable note into a sending lock.
      mailer.checkReady();
      // Blob authorizes the same archived path using the real caller's JWT.
      let bytes = await readExpenseBlobPdf(read, authorization, note.pdf_path);
      if (bytes === null) {
        // The caller's note visibility above authorizes this exact archived PDF.
        // A service-only lookup is appropriate here; it never accepts a caller's
        // Drive ID and cannot broaden the existing expense-note RLS.
        const mapped = await admin.from('document_drive_files')
          .select('drive_file_id,drive_path,file_name,mime_type,bytes,sha256,verified_at,active')
          .eq('source_bucket', 'expense-note-pdfs').eq('source_path', note.pdf_path).maybeSingle();
        if (mapped.error) return json(503, { ok: false, error: 'Références Google Drive indisponibles.' });
        let pdf: Blob;
        if (mapped.data) {
          if (mapped.data.active !== true) return json(403, { ok: false, error: 'Accès au PDF Drive désactivé.' });
          if (!isDriveDocument(mapped.data) || mapped.data.mime_type !== 'application/pdf') return json(422, { ok: false, error: 'PDF Drive non vérifié.' });
          if (!readDrive) return json(503, { ok: false, error: 'Accès serveur Google Drive non configuré.' });
          // A failed Drive read never falls back to a possibly stale Storage copy.
          pdf = await (await readDrive(mapped.data)).blob();
        } else {
          const legacy = await client.storage.from('expense-note-pdfs').download(note.pdf_path);
          if (legacy.error || !legacy.data) return json(422, { ok: false, error: 'PDF de la note indisponible.' });
          pdf = legacy.data;
        }
        if (pdf.size > MAX_EXPENSE_PDF_BYTES) return json(413, { ok: false, error: 'Le PDF dépasse la limite d’envoi de 4 Mo.' });
        bytes = new Uint8Array(await pdf.arrayBuffer());
      }
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return json(422, { ok: false, error: 'Le document enregistré est invalide.' });
      const claim = await admin.from('expense_notes').update({ delivery_status: 'sending', delivery_attempted_at: new Date().toISOString(), delivery_error: null })
        .eq('id', note.id).in('delivery_status', ['pending', 'failed']).select('id').maybeSingle();
      if (claim.error) return json(500, { ok: false, error: 'Transmission non démarrée. Réessayez.' });
      if (!claim.data) return json(409, { ok: false, error: 'Cette note est déjà en cours de transmission.' });
      let status: 'sent' | 'failed' | 'unknown' = 'unknown';
      let error = 'La transmission n’a pas pu être confirmée. Vérifiez sa réception auprès de la comptabilité.';
      try {
        // Only the archived, verified PDF reaches the server-configured mailbox.
        await mailer.send({ noteId: note.id, issuerName: note.issuer_name, pdf: bytes });
        status = 'sent'; error = '';
      } catch (failure) {
        if (failure instanceof ExpenseMailError && failure.definite) {
          status = 'failed'; error = failure.message;
        }
        // A disconnected SMTP session may already have delivered the PDF.
        // Preserve every uncertain outcome rather than automatically resending.
      }
      const persisted = await admin.from('expense_notes').update({ delivery_status: status, delivered_at: status === 'sent' ? new Date().toISOString() : null, delivery_error: error || null })
        .eq('id', note.id).eq('delivery_status', 'sending');
      if (persisted.error) return json(502, { ok: false, error: 'Le résultat d’envoi n’a pas pu être enregistré. Vérifiez la réception avant tout nouvel envoi.' });
      return status === 'sent' ? json(200, { ok: true, message: 'Note enregistrée et transmise à la comptabilité.' }) : json(502, { ok: false, error });
    } catch (error) {
      if (error instanceof DriveAccessError || error instanceof ExpensePdfAccessError || error instanceof ExpenseMailError) return json(error.status, { ok: false, error: error.message });
      return json(500, { ok: false, error: 'Transmission indisponible. La note reste dans votre historique.' });
    }
  };
}
