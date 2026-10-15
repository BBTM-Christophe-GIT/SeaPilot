export const GMAIL_COUNTER_SCOPES = 'openid email https://www.googleapis.com/auth/gmail.labels';

export type GmailUnreadErrorCode = 'unauthorized' | 'forbidden' | 'wrong_account' | 'invalid_response'
  | 'invalid_count' | 'network_error' | 'aborted' | 'invalid_token' | 'invalid_email';

const ERROR_MESSAGES: Record<GmailUnreadErrorCode, string> = {
  unauthorized: 'La connexion à Gmail a expiré.',
  forbidden: 'Le compteur Gmail n’est pas autorisé.',
  wrong_account: 'Le compte Google ne correspond pas au compte SeaPilot.',
  invalid_response: 'La réponse du compteur Gmail est indisponible.',
  invalid_count: 'Le compteur Gmail est indisponible.',
  network_error: 'Le compteur Gmail est momentanément indisponible.',
  aborted: 'La lecture du compteur Gmail a été annulée.',
  invalid_token: 'La connexion à Gmail est indisponible.',
  invalid_email: 'L’adresse du compte SeaPilot est indisponible.',
};

export class GmailUnreadError extends Error {
  readonly code: GmailUnreadErrorCode;
  readonly status?: number;

  constructor(code: GmailUnreadErrorCode, status?: number) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GmailUnreadError';
    this.code = code;
    this.status = status;
  }
}

function checkCancellation(signal?: AbortSignal) {
  if (signal?.aborted) throw new GmailUnreadError('aborted');
}

/** Reads only an account-verified inbox count; credentials never leave memory. */
export async function fetchGmailUnreadCount(token: string, email: string, signal?: AbortSignal): Promise<number> {
  checkCancellation(signal);
  // Reject malformed values before constructing an Authorization header.
  if (typeof token !== 'string' || token.length > 16384 || !/^[A-Za-z0-9._~+/-]+=*$/.test(token)) {
    throw new GmailUnreadError('invalid_token');
  }
  const accountEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (accountEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) {
    throw new GmailUnreadError('invalid_email');
  }

  const readObject = async (url: string): Promise<Record<string, unknown>> => {
    checkCancellation(signal);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store', credentials: 'omit', redirect: 'error', signal,
      });
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new GmailUnreadError('aborted');
      }
      throw new GmailUnreadError('network_error');
    }
    checkCancellation(signal);
    if (!response.ok) {
      throw new GmailUnreadError(response.status === 401 ? 'unauthorized'
        : response.status === 403 ? 'forbidden' : 'invalid_response', response.status);
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      checkCancellation(signal);
      throw new GmailUnreadError('invalid_response');
    }
    checkCancellation(signal);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new GmailUnreadError('invalid_response');
    }
    return value as Record<string, unknown>;
  };

  const identity = await readObject('https://openidconnect.googleapis.com/v1/userinfo');
  if (identity.email_verified !== true || typeof identity.email !== 'string'
    || identity.email.toLowerCase() !== accountEmail) {
    throw new GmailUnreadError('wrong_account');
  }
  const inbox = await readObject(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(accountEmail)}/labels/INBOX?fields=messagesUnread`);
  const count = inbox.messagesUnread;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new GmailUnreadError('invalid_count');
  }
  return count;
}
