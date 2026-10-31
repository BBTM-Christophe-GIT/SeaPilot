import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAppEnv } from '../../lib/env';

export const DRIVE_MODULES = { procedures: 'Procedures', procedurePdfs: 'Procedures PDF', disciplinary: 'Sanctions Disciplinaires', chemicals: 'Produits Chimiques', humanResources: 'Ressources Humaines', projects: 'Projet' } as const;
export type DriveModule = keyof typeof DRIVE_MODULES;
export const LOCAL_DRIVE_DOWNLOAD_VERSION = '2.7.0';
export interface LocalDriveConnection { url: string; expiresAt: number; version?: string }
export interface LocalDriveStatus { root: string | null; version: string; collaborators?: number; exists?: boolean; cancelled?: boolean }
let connection: LocalDriveConnection | null = null;
let connecting: Promise<LocalDriveConnection> | null = null;

/** Compatible updates keep the same major API and provide at least the required features. */
export function supportsLocalDriveVersion(version: unknown, minimum: string): boolean {
  const installed = typeof version === 'string' ? /^(\d+)\.(\d+)\.(\d+)$/.exec(version) : null;
  const required = /^(\d+)\.(\d+)\.(\d+)$/.exec(minimum);
  if (!installed || !required) return false;
  const [major, minor, patch] = installed.slice(1).map(Number);
  const [requiredMajor, requiredMinor, requiredPatch] = required.slice(1).map(Number);
  return major === requiredMajor && (minor > requiredMinor || (minor === requiredMinor && patch >= requiredPatch));
}

// Matches SeaPilotDriveBridge.ConnectionPort. Spreading the candidates avoids
// Windows reservations that cover whole consecutive port ranges.
export function localDrivePorts(firstPort: number): number[] {
  return Array.from({ length: 16 }, (_, attempt) => 49152 + (firstPort - 49152 + attempt * 1019) % 16384);
}

async function findLocalDrive(firstPort: number, nonce: string): Promise<{ url: string; version: string }> {
  const controller = new AbortController();
  try {
    return await Promise.any(localDrivePorts(firstPort).map(async (port, index) => {
      const url = `http://127.0.0.1:${port}/${nonce}`;
      const response = await fetch(`${url}/health`, {
        cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(1000)]),
      });
      if (!response.ok) throw new Error('Connexion locale indisponible');
      const health = await response.json();
      // Older launchers can still connect on the original port while the update
      // is installed. New launchers also prove which random session they serve.
      if ((supportsLocalDriveVersion(health.version, '2.1.0') && health.nonce === nonce) || (health.version === '2.0.0' && index === 0)) return { url, version: health.version };
      throw new Error('Session locale incompatible');
    }));
  } finally { controller.abort(); }
}

export function launcherOpenUri(module: DriveModule, relativePath: string): string {
  const payload = btoa(Array.from(new TextEncoder().encode(`${DRIVE_MODULES[module]}/${relativePath}`), (byte) => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `seapilot-drive://root/open/${payload}`;
}

/** Share discovery. Interactive callers should invoke this before awaiting to
 * retain browser activation; automatic checks use existing protocol permissions. */
export function connectLocalDrive(options: { fresh?: boolean } = {}): Promise<LocalDriveConnection> {
  if (options.fresh) connection = null;
  if (connection && connection.expiresAt > Date.now()) return Promise.resolve(connection);
  if (connecting) return connecting;
  const port = 49152 + crypto.getRandomValues(new Uint16Array(1))[0] % 16384;
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const anchor = document.createElement('a'); anchor.href = `seapilot-drive://connect/${port}/${nonce}`; anchor.click();
  connecting = (async () => {
    for (let attempt = 0; attempt < 35; attempt++) {
      try {
        const found = await findLocalDrive(port, nonce);
        connection = { ...found, expiresAt: Date.now() + 100_000 };
        return connection;
      } catch { /* Wait for Windows to start the user-authorized launcher. */ }
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    throw new Error('La connexion locale au lanceur SeaPilot est indisponible. Installez sa dernière version depuis Administration → Documents et Google Drive : le dossier déjà configuré sera conservé. Autorisez son ouverture et la connexion locale si le navigateur le demande.');
  })().finally(() => { connecting = null; });
  return connecting;
}

/** Cancel one reader's wait without cancelling shared connection discovery. */
export function abortableLocalDrive<T>(operation: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(operation);
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    // Always observe the original promise, including after cancellation.
    Promise.resolve(operation).then((value) => { cleanup(); resolve(value); }, (error: unknown) => { cleanup(); reject(error); });
  });
}

export async function localDriveRequest<T>(client: SupabaseClient, session: LocalDriveConnection, data: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const { data: auth, error } = await abortableLocalDrive(client.auth.getSession(), signal);
  signal?.throwIfAborted();
  if (error || !auth.session) throw new Error('Reconnectez-vous à SeaPilot pour utiliser le dossier synchronisé.');
  const env = loadAppEnv();
  if (env.supabaseUrl.replace(/\/$/, '') !== 'https://szlvyrrmvdvhzixilymh.supabase.co') throw new Error('Ce lanceur est configuré pour l’instance SeaPilot BBTM.');
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(data.action === 'select-root' ? 180_000 : 90_000);
    response = await abortableLocalDrive(fetch(`${session.url}/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.session.access_token}`, 'X-SeaPilot-Key': env.supabaseAnonKey },
      body: JSON.stringify(data), signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    }), signal);
  } catch {
    // A page/context cancellation says nothing about the shared launcher's health.
    signal?.throwIfAborted();
    connection = null;
    if (['status', 'configure', 'select-root'].includes(String(data.action))) throw new Error('La connexion au lanceur a été interrompue. Relancez-le pour vérifier automatiquement la configuration du dossier.');
    throw new Error('La connexion au lanceur a été interrompue. Vérifiez le dossier avant de réessayer : un fichier peut avoir été écrit.');
  }
  signal?.throwIfAborted();
  const result = await abortableLocalDrive(response.json(), signal);
  signal?.throwIfAborted();
  if (!response.ok) throw new Error(result.error || 'Le lanceur a refusé cette opération.');
  return result as T;
}

export async function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Lecture du fichier impossible.')); reader.readAsDataURL(blob);
  });
}
