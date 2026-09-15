import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAppEnv } from '../../lib/env';

export const DRIVE_MODULES = { procedures: 'Procedures', disciplinary: 'Sanctions Disciplinaires' } as const;
export type DriveModule = keyof typeof DRIVE_MODULES;
export interface LocalDriveConnection { url: string; expiresAt: number }
export interface LocalDriveStatus { root: string | null; version: string; collaborators?: number }
let connection: LocalDriveConnection | null = null;
let connecting: Promise<LocalDriveConnection> | null = null;

export function launcherOpenUri(module: DriveModule, relativePath: string): string {
  const payload = btoa(Array.from(new TextEncoder().encode(`${DRIVE_MODULES[module]}/${relativePath}`), (byte) => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `seapilot-drive://root/open/${payload}`;
}

/** Call directly from the button action, before awaiting other work, to preserve the user gesture. */
export function connectLocalDrive(): Promise<LocalDriveConnection> {
  if (connection && connection.expiresAt > Date.now()) return Promise.resolve(connection);
  if (connecting) return connecting;
  const port = 49152 + crypto.getRandomValues(new Uint16Array(1))[0] % 16384;
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const url = `http://127.0.0.1:${port}/${nonce}`;
  const anchor = document.createElement('a'); anchor.href = `seapilot-drive://connect/${port}/${nonce}`; anchor.click();
  connecting = (async () => {
    for (let attempt = 0; attempt < 35; attempt++) {
      try {
        const response = await fetch(`${url}/health`, { cache: 'no-store', signal: AbortSignal.timeout(1000) });
        if (response.ok && (await response.json()).version === '2.0.0') {
          connection = { url, expiresAt: Date.now() + 100_000 };
          return connection;
        }
      } catch { /* Wait for Windows to start the user-authorized launcher. */ }
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    throw new Error('Le lanceur SeaPilot ne répond pas. Faites configurer ce PC dans Administration → Documents et Google Drive, puis autorisez son ouverture et la connexion locale si le navigateur le demande.');
  })().finally(() => { connecting = null; });
  return connecting;
}

export async function localDriveRequest<T>(client: SupabaseClient, session: LocalDriveConnection, data: Record<string, unknown>): Promise<T> {
  const { data: auth, error } = await client.auth.getSession();
  if (error || !auth.session) throw new Error('Reconnectez-vous à SeaPilot pour utiliser le dossier synchronisé.');
  const env = loadAppEnv();
  if (env.supabaseUrl.replace(/\/$/, '') !== 'https://szlvyrrmvdvhzixilymh.supabase.co') throw new Error('Ce lanceur est configuré pour l’instance SeaPilot BBTM.');
  let response: Response;
  try {
    response = await fetch(`${session.url}/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.session.access_token}`, 'X-SeaPilot-Key': env.supabaseAnonKey },
      body: JSON.stringify(data), signal: AbortSignal.timeout(90_000),
    });
  } catch {
    connection = null;
    throw new Error('La connexion au lanceur a été interrompue. Vérifiez le dossier avant de réessayer : un fichier peut avoir été écrit.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Le lanceur a refusé cette opération.');
  return result as T;
}

export async function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Lecture du fichier impossible.')); reader.readAsDataURL(blob);
  });
}
