export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number | string;
  scope: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

export interface GoogleAuthorizationError {
  type: string;
}

export interface GoogleTokenRequestOptions {
  prompt?: string;
  login_hint?: string;
  include_granted_scopes?: false;
}

export interface GoogleTokenClient {
  requestAccessToken(options?: GoogleTokenRequestOptions): void;
}

export interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  login_hint?: string;
  include_granted_scopes: false;
  callback(response: GoogleTokenResponse): void;
  error_callback(error: GoogleAuthorizationError): void;
}

export interface GoogleAuthorizationApi {
  initTokenClient(config: GoogleTokenClientConfig): GoogleTokenClient;
}

const GOOGLE_AUTHORIZATION_SCRIPT = 'https://accounts.google.com/gsi/client';
const SCRIPT_TIMEOUT_MS = 12_000;
let pendingAuthorization: Promise<GoogleAuthorizationApi> | undefined;

/** Public browser OAuth client only; Drive/server secrets are never inspected. */
export function getGmailClientId(source: Record<string, unknown> = import.meta.env): string | undefined {
  const candidate = source.VITE_GMAIL_CLIENT_ID;
  if (typeof candidate !== 'string') return undefined;
  const value = candidate.trim();
  return /^[0-9]{6,30}(?:-[A-Za-z0-9_-]{1,128})?\.apps\.googleusercontent\.com$/.test(value)
    ? value : undefined;
}

function currentAuthorization(): GoogleAuthorizationApi | undefined {
  if (typeof window === 'undefined') return undefined;
  const api = (window as Window & {
    google?: { accounts?: { oauth2?: Partial<GoogleAuthorizationApi> } };
  }).google?.accounts?.oauth2;
  return api && typeof api.initTokenClient === 'function' ? api as GoogleAuthorizationApi : undefined;
}

/** Called explicitly by the mailbox UI; importing this module contacts nobody. */
export function loadGmailAuthorization(): Promise<GoogleAuthorizationApi> {
  const current = currentAuthorization();
  if (current) return Promise.resolve(current);
  if (pendingAuthorization) return pendingAuthorization;
  if (typeof document === 'undefined') return Promise.reject(new Error('La connexion Google est indisponible.'));

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_AUTHORIZATION_SCRIPT}"]`);
  const script = existing ?? document.createElement('script');
  if (!existing) {
    script.src = GOOGLE_AUTHORIZATION_SCRIPT;
    script.async = true;
    script.id = 'seapilot-gmail-authorization';
  }
  const pending = new Promise<GoogleAuthorizationApi>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      reject(new Error('La connexion Google est indisponible. Réessayez.'));
    };
    const complete = () => {
      const api = currentAuthorization();
      if (!api) { fail(); return; }
      if (settled) return;
      settled = true;
      cleanup();
      resolve(api);
    };
    const onLoad = () => complete();
    const onError = () => fail();
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    const timeout = setTimeout(complete, SCRIPT_TIMEOUT_MS);
    // The SDK might have finished loading between the first lookup and these
    // listeners. A successful existing API always wins over another download.
    if (currentAuthorization()) complete();
    else if (!existing) {
      try { document.head.appendChild(script); } catch { fail(); }
    }
  });
  pendingAuthorization = pending;
  void pending.catch(() => {
    if (pendingAuthorization === pending) pendingAuthorization = undefined;
  });
  return pending;
}
