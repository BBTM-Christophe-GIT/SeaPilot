import type { SupabaseClient } from '@supabase/supabase-js';

const RELAY_URL = 'https://bbtm-ndfv2.netlify.app/.netlify/functions/send';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface Dependencies {
  userClient: (authorization: string) => SupabaseClient;
  admin: SupabaseClient;
  fetch: typeof fetch;
}

export function createExpenseSendHandler({ userClient, admin, fetch: send }: Dependencies) {
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
      const pdf = await client.storage.from('expense-note-pdfs').download(note.pdf_path);
      if (pdf.error || !pdf.data) return json(422, { ok: false, error: 'PDF de la note indisponible.' });
      if (pdf.data.size > 4_000_000) return json(413, { ok: false, error: 'Le PDF dépasse la limite d’envoi de 4 Mo.' });
      const bytes = new Uint8Array(await pdf.data.arrayBuffer());
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return json(422, { ok: false, error: 'Le document enregistré est invalide.' });
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      const claim = await admin.from('expense_notes').update({ delivery_status: 'sending', delivery_attempted_at: new Date().toISOString(), delivery_error: null })
        .eq('id', note.id).in('delivery_status', ['pending', 'failed']).select('id').maybeSingle();
      if (claim.error) return json(500, { ok: false, error: 'Transmission non démarrée. Réessayez.' });
      if (!claim.data) return json(409, { ok: false, error: 'Cette note est déjà en cours de transmission.' });
      let status: 'sent' | 'failed' | 'unknown' = 'unknown';
      let error = 'La transmission n’a pas pu être confirmée. Vérifiez sa réception auprès de la comptabilité.';
      try {
        // Reuse the user's existing NDF/Inexweb route. No client-chosen URL, recipient or PDF.
        const response = await send(RELAY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: btoa(binary), name: `${note.issuer_name} [NDF ${note.id.slice(0, 8)}]` }),
          signal: AbortSignal.timeout(35_000) });
        const result = await response.json().catch(() => null);
        if (response.ok && result?.ok === true) { status = 'sent'; error = ''; }
        else if ([400, 404, 405, 413].includes(response.status) || result?.error === 'Configuration email manquante.') {
          status = 'failed'; error = 'Le service NDF n’a pas accepté la transmission. La note est conservée ; réessayez après correction du service.';
        }
        // SMTP/network failures can occur after acceptance: never automatically resend.
      } catch { /* Preserve unknown outcome to avoid duplicate accounting entries. */ }
      const persisted = await admin.from('expense_notes').update({ delivery_status: status, delivered_at: status === 'sent' ? new Date().toISOString() : null, delivery_error: error || null })
        .eq('id', note.id).eq('delivery_status', 'sending');
      if (persisted.error) return json(502, { ok: false, error: 'Le résultat d’envoi n’a pas pu être enregistré. Vérifiez la réception avant tout nouvel envoi.' });
      return status === 'sent' ? json(200, { ok: true, message: 'Note enregistrée et transmise à la comptabilité.' }) : json(502, { ok: false, error });
    } catch { return json(500, { ok: false, error: 'Transmission indisponible. La note reste dans votre historique.' }); }
  };
}
