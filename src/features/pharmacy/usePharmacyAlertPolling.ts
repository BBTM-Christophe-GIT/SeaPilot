import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';

export const PHARMACY_NOTIFICATIONS_CHANGED = 'pharmacy:changed';
export const PHARMACY_ALERT_REFRESH_MS = 120_000;
export const PHARMACY_ALERT_FOCUS_MS = 30_000;

type AlertSnapshot<T> = {
  data: T | null;
  error: string;
  loading: boolean;
};

export type PharmacyAlertPolling<T> = AlertSnapshot<T> & { refresh: () => void };

export function usePharmacyAlertPolling<T>(
  client: SupabaseClient,
  scope: string | undefined,
  load: (client: SupabaseClient) => Promise<T>,
): PharmacyAlertPolling<T> {
  const [snapshot, setSnapshot] = useState<AlertSnapshot<T> & { client: SupabaseClient; scope: string }>();
  const refreshRef = useRef<{ client: SupabaseClient; scope: string; refresh: () => void } | null>(null);
  const current = snapshot?.client === client && snapshot.scope === scope ? snapshot : undefined;

  useEffect(() => {
    if (scope === undefined) {
      setSnapshot(undefined);
      return;
    }
    const activeScope = scope;
    let live = true;
    let inFlight = false;
    let refreshAfterFlight = false;
    let lastStarted = -Infinity;
    let timer: number | undefined;

    function request() {
      if (!live || inFlight) return;
      window.clearTimeout(timer);
      inFlight = true;
      lastStarted = Date.now();
      setSnapshot(previous => ({
        client, scope: activeScope, loading: true, error: '',
        data: previous?.client === client && previous.scope === activeScope ? previous.data : null,
      }));
      void load(client).then(
        data => {
          if (live && !refreshAfterFlight) setSnapshot({ client, scope: activeScope, data, error: '', loading: false });
        },
        reason => {
          if (live && !refreshAfterFlight) {
            const error = reason && typeof reason === 'object' && 'message' in reason
              ? String(reason.message) : 'Impossible de charger les alertes Pharmacie.';
            setSnapshot({ client, scope: activeScope, data: null, error, loading: false });
          }
        },
      ).finally(() => {
        inFlight = false;
        if (!live) return;
        if (refreshAfterFlight) {
          refreshAfterFlight = false;
          request();
        } else {
          timer = window.setTimeout(refreshWhenVisible, PHARMACY_ALERT_REFRESH_MS);
        }
      });
    }

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') request();
    }

    function refreshIfDue() {
      if (Date.now() - lastStarted >= PHARMACY_ALERT_FOCUS_MS) refreshWhenVisible();
    }

    function refreshAfterChange() {
      if (inFlight) refreshAfterFlight = true;
      else request();
    }

    refreshRef.current = { client, scope: activeScope, refresh: request };
    request();
    window.addEventListener('focus', refreshIfDue);
    window.addEventListener(PHARMACY_NOTIFICATIONS_CHANGED, refreshAfterChange);
    document.addEventListener('visibilitychange', refreshIfDue);
    return () => {
      live = false;
      refreshRef.current = null;
      window.clearTimeout(timer);
      window.removeEventListener('focus', refreshIfDue);
      window.removeEventListener(PHARMACY_NOTIFICATIONS_CHANGED, refreshAfterChange);
      document.removeEventListener('visibilitychange', refreshIfDue);
    };
  }, [client, load, scope]);

  return {
    data: current?.data ?? null,
    error: current?.error ?? '',
    loading: current?.loading ?? scope !== undefined,
    refresh: () => {
      const controller = refreshRef.current;
      if (controller?.client === client && controller.scope === scope) controller.refresh();
    },
  };
}
