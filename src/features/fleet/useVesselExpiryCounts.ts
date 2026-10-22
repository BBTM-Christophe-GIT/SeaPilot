import { useCallback, useEffect, useRef, useState } from 'react';
import { vesselExpiryToday, type VesselExpiryCounts } from './vesselExpiryAlerts';

type Counts = Record<number, VesselExpiryCounts>;
type Loader = (today: string) => Promise<Counts>;

export function useVesselExpiryCounts(loader: Loader, refreshKey?: unknown) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const pendingRequest = useRef<number | null>(null);
  const refreshCounts = useCallback(async () => {
    const request = ++requestId.current;
    pendingRequest.current = request;
    setLoading(true);
    try {
      const loaded = await loader(vesselExpiryToday());
      if (request === requestId.current) { setCounts(loaded); setError(''); }
    } catch (reason) {
      if (request === requestId.current) {
        setCounts(null);
        setError(reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : 'Impossible de charger les compteurs d’échéance.');
      }
    } finally {
      if (request === requestId.current) { pendingRequest.current = null; setLoading(false); }
    }
  }, [loader]);

  useEffect(() => {
    setCounts(null); setError('');
    const refresh = () => { void refreshCounts(); };
    const refreshVisible = () => { if (document.visibilityState === 'visible' && pendingRequest.current === null) refresh(); };
    refresh();
    const timer = window.setInterval(refreshVisible, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      requestId.current += 1;
      pendingRequest.current = null;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [refreshCounts, refreshKey]);

  return { counts, loading, error, refreshCounts };
}
