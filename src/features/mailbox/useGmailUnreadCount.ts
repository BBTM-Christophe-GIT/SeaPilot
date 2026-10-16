import { useLayoutEffect, useMemo, useReducer } from 'react';
import {
  getGmailClientId,
  loadGmailAuthorization,
  type GoogleAuthorizationApi,
  type GoogleTokenResponse,
} from './gmailAuthorization';
import { fetchGmailUnreadCount, GmailUnreadError, GMAIL_COUNTER_SCOPES } from './gmailUnread';

type CounterStatus = 'unavailable' | 'loading_sdk' | 'sdk_error' | 'ready' | 'authorizing'
  | 'loading' | 'connected' | 'expired' | 'error';

interface CounterState {
  status: CounterStatus;
  unreadCount: number | null;
  message: string;
}

const FETCH_TIMEOUT_MS = 12_000;
const AUTHORIZATION_TIMEOUT_MS = 120_000;
const REFRESH_INTERVAL_MS = 60_000;

function hasRequiredScopes(scope: unknown): boolean {
  if (typeof scope !== 'string') return false;
  const scopes = new Set(scope.split(/\s+/).filter(Boolean));
  return scopes.has('openid')
    && (scopes.has('email') || scopes.has('https://www.googleapis.com/auth/userinfo.email'))
    && scopes.has('https://www.googleapis.com/auth/gmail.labels');
}

function createCounter(clientId: string | undefined, email: string, enabled: boolean) {
  const available = Boolean(enabled && clientId && email);
  let state: CounterState = { status: available ? 'loading_sdk' : 'unavailable', unreadCount: null, message: '' };
  let active = false;
  let notify: (() => void) | undefined;
  let api: GoogleAuthorizationApi | undefined;
  let token: string | undefined;
  let expiresAt = 0;
  let nextRefreshAt = 0;
  let authorizationVersion = 0;
  let fetchVersion = 0;
  let fetchController: AbortController | undefined;
  let fetchTimeout: ReturnType<typeof setTimeout> | undefined;
  let authorizationTimeout: ReturnType<typeof setTimeout> | undefined;
  let expiryTimeout: ReturnType<typeof setTimeout> | undefined;
  let refreshInterval: ReturnType<typeof setInterval> | undefined;

  function publish(next: CounterState) {
    if (!active) return;
    state = next;
    notify?.();
  }

  function clearCredentials() {
    authorizationVersion += 1;
    fetchVersion += 1;
    token = undefined;
    expiresAt = 0;
    nextRefreshAt = 0;
    clearTimeout(authorizationTimeout);
    clearTimeout(expiryTimeout);
    clearTimeout(fetchTimeout);
    clearInterval(refreshInterval);
    fetchController?.abort();
    fetchController = undefined;
  }

  function fail(message: string, status: 'error' | 'expired' = 'error') {
    clearCredentials();
    publish({ status, unreadCount: null, message });
  }

  function expire() {
    fail('La connexion au compteur Gmail a expiré. Reconnectez-vous pour actualiser les non-lus.', 'expired');
  }

  async function refresh() {
    if (!active || !token) return;
    const now = Date.now();
    if (now >= expiresAt) { expire(); return; }
    if (document.visibilityState === 'hidden' || fetchController) return;
    // Focus, visibility and manual refresh share the polling limit.
    if (now < nextRefreshAt) return;
    nextRefreshAt = now + REFRESH_INTERVAL_MS;
    const requestVersion = ++fetchVersion;
    const currentToken = token;
    const controller = new AbortController();
    fetchController = controller;
    publish({ status: 'loading', unreadCount: state.unreadCount, message: 'Actualisation du compteur Gmail…' });
    fetchTimeout = setTimeout(() => {
      if (active && fetchVersion === requestVersion) {
        fail('Le compteur Gmail ne répond pas. Reconnectez-vous pour réessayer.');
      }
    }, FETCH_TIMEOUT_MS);
    try {
      const unreadCount = await fetchGmailUnreadCount(currentToken, email, controller.signal);
      if (!active || fetchVersion !== requestVersion) return;
      if (Date.now() >= expiresAt) { expire(); return; }
      publish({ status: 'connected', unreadCount, message: 'Compteur Gmail connecté. Actualisation automatique chaque minute lorsque la page est visible.' });
    } catch (error) {
      if (!active || fetchVersion !== requestVersion) return;
      const message = error instanceof GmailUnreadError
        ? `${error.message} Reconnectez-vous pour réessayer.`
        : 'Le compteur Gmail est indisponible. Reconnectez-vous pour réessayer.';
      fail(message, error instanceof GmailUnreadError && error.code === 'unauthorized' ? 'expired' : 'error');
    } finally {
      if (fetchVersion === requestVersion) {
        clearTimeout(fetchTimeout);
        fetchController = undefined;
      }
    }
  }

  function loadSdk() {
    if (!active || !available) return;
    publish({ status: 'loading_sdk', unreadCount: null, message: 'Chargement de la connexion Google…' });
    void loadGmailAuthorization().then((loadedApi) => {
      if (!active) return;
      api = loadedApi;
      publish({ status: 'ready', unreadCount: null, message: 'Activez le compteur pour afficher les messages non lus de votre boîte de réception Gmail.' });
    }).catch(() => {
      if (active) publish({ status: 'sdk_error', unreadCount: null, message: 'La connexion Google n’a pas pu être chargée. Réessayez.' });
    });
  }

  function authorize() {
    if (!active || !api || !clientId) return;
    clearCredentials();
    const requestVersion = authorizationVersion;
    publish({ status: 'authorizing', unreadCount: null, message: 'Autorisez le compteur dans la fenêtre Google.' });
    authorizationTimeout = setTimeout(() => {
      if (active && authorizationVersion === requestVersion) fail('La connexion Google n’a pas abouti. Réessayez.');
    }, AUTHORIZATION_TIMEOUT_MS);

    function receiveToken(value: unknown) {
      if (!active || authorizationVersion !== requestVersion) return;
      authorizationVersion += 1;
      clearTimeout(authorizationTimeout);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        fail('La connexion au compteur Gmail a échoué. Réessayez.');
        return;
      }
      const response = value as Partial<GoogleTokenResponse>;
      if (response.error) {
        fail(response.error === 'access_denied'
          ? 'L’autorisation du compteur Gmail a été refusée. Vous pouvez réessayer.'
          : 'La connexion au compteur Gmail a échoué. Réessayez.');
        return;
      }
      const lifetimeSeconds = typeof response.expires_in === 'number' || typeof response.expires_in === 'string'
        ? Number(response.expires_in) : Number.NaN;
      if (typeof response.access_token !== 'string' || !response.access_token || !Number.isFinite(lifetimeSeconds) || lifetimeSeconds <= 0 || lifetimeSeconds > 86_400
        || !hasRequiredScopes(response.scope)) {
        fail('Les autorisations du compteur Gmail sont incomplètes. Reconnectez-vous.');
        return;
      }
      token = response.access_token;
      expiresAt = Date.now() + lifetimeSeconds * 1_000;
      expiryTimeout = setTimeout(expire, lifetimeSeconds * 1_000);
      refreshInterval = setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
      publish({ status: 'connected', unreadCount: null, message: 'Compteur Gmail connecté. La lecture reprend lorsque la page est visible.' });
      void refresh();
    }

    try {
      const client = api.initTokenClient({
        client_id: clientId,
        scope: GMAIL_COUNTER_SCOPES,
        include_granted_scopes: false,
        login_hint: email,
        callback: receiveToken,
        error_callback: (error) => {
          if (!active || authorizationVersion !== requestVersion) return;
          const type = error && typeof error === 'object' ? error.type : '';
          fail(type === 'popup_closed'
            ? 'La fenêtre de connexion Google a été fermée. Vous pouvez réessayer.'
            : type === 'popup_failed_to_open'
              ? 'La fenêtre de connexion Google n’a pas pu s’ouvrir. Autorisez les fenêtres puis réessayez.'
              : 'La connexion au compteur Gmail a échoué. Réessayez.');
        },
      });
      // Keep this call synchronous with the user's click: the SDK is already loaded.
      client.requestAccessToken({ prompt: 'consent', login_hint: email, include_granted_scopes: false });
    } catch {
      fail('La connexion au compteur Gmail a échoué. Réessayez.');
    }
  }

  function action() {
    if (!active || !available) return;
    if (state.status === 'sdk_error') { loadSdk(); return; }
    if (state.status === 'loading_sdk' || state.status === 'authorizing' || state.status === 'loading') return;
    if (token && Date.now() < expiresAt) { void refresh(); return; }
    authorize();
  }

  function focus() { void refresh(); }
  function visibilityChanged() { if (document.visibilityState === 'visible') void refresh(); }

  return {
    start(onChange: () => void) {
      active = true;
      notify = onChange;
      if (!available) return;
      window.addEventListener('focus', focus);
      document.addEventListener('visibilitychange', visibilityChanged);
      loadSdk();
    },
    dispose() {
      active = false;
      notify = undefined;
      clearCredentials();
      api = undefined;
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibilityChanged);
    },
    view() {
      const currentState: CounterState = token && Date.now() >= expiresAt
        ? { status: 'expired', unreadCount: null, message: 'La connexion au compteur Gmail a expiré. Reconnectez-vous pour actualiser les non-lus.' }
        : state;
      const busy = currentState.status === 'loading_sdk' || currentState.status === 'authorizing' || currentState.status === 'loading';
      const actionLabel = currentState.status === 'sdk_error' ? 'Réessayer le chargement Gmail'
        : currentState.status === 'connected' ? 'Actualiser le compteur Gmail'
          : currentState.status === 'loading_sdk' ? 'Chargement du compteur Gmail…'
            : currentState.status === 'authorizing' ? 'Connexion à Gmail…'
              : currentState.status === 'loading' ? 'Actualisation du compteur Gmail…'
                : currentState.status === 'error' || currentState.status === 'expired' ? 'Reconnecter le compteur Gmail'
                  : 'Activer le compteur Gmail';
      return { ...currentState, available, canActivate: available && !busy, actionLabel, action };
    },
  };
}

/** OAuth credentials live only inside this identity-scoped controller. */
export function useGmailUnreadCount(userId: string | undefined, email: string | undefined, enabled: boolean) {
  const clientId = getGmailClientId();
  const accountEmail = email?.trim().toLowerCase() || '';
  const [, updateView] = useReducer((revision: number) => revision + 1, 0);
  const counter = useMemo(() => createCounter(clientId, accountEmail, enabled && Boolean(userId)), [clientId, accountEmail, enabled, userId]);

  useLayoutEffect(() => {
    counter.start(updateView);
    return () => counter.dispose();
  }, [counter]);

  // A new identity gets a new empty controller during render, before any effects.
  return counter.view();
}
