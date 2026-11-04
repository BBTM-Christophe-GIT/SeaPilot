import type { SupabaseClient } from '@supabase/supabase-js';

/** Synthetic one-pixel image for the demonstration, never a person's signature. */
export function planningPreviewSignature(): Uint8Array {
  return Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
}

export async function downloadPlanningDocumentSignature(client: SupabaseClient): Promise<Uint8Array> {
  const { data, error } = await client.auth.getSession();
  const session = data.session;
  const token = session?.access_token;
  if (error || !token || !session?.user?.id) throw new Error('Connectez-vous pour générer le document signé.');
  const response = await fetch('/api/planning-document-signature', {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', credentials: 'same-origin', redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/png') {
    throw new Error('La signature privée de Benjamin BON est indisponible.');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 1_048_576) throw new Error('La signature privée est invalide.');
  const current = await client.auth.getSession();
  if (current.error || current.data.session?.user.id !== session.user.id) {
    throw new Error('Le compte a changé pendant la génération du document. Reconnectez-vous et réessayez.');
  }
  return bytes;
}
