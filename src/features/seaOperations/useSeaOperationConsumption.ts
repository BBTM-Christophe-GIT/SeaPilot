import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { fetchSeaOperationConsumption, type SeaOperationConsumption } from './seaOperationConsumption';
import type { SeaOperationRecord } from './seaOperationQueries';

export const consumptionErrorMessage = (error: unknown) => error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
  ? error.message : 'La consommation n’a pas pu être chargée ou enregistrée. Réessayez.';

export function hasSeaOperationConsumption(record: SeaOperationRecord) {
  return record.status === 'signed' && record.draft.decision === 'GO';
}

export function useSeaOperationConsumptionContext(client: SupabaseClient, operationId?: string, refresh?: number, accessKey?: string,
  savedConsumption?: SeaOperationConsumption) {
  const [retry, setRetry] = useState(0);
  const request = useMemo(() => ({ client, operationId, refresh, retry, accessKey }), [client, operationId, refresh, retry, accessKey]);
  const [response, setResponse] = useState<{
    request: typeof request; data?: SeaOperationConsumption; error?: string;
  }>();
  useEffect(() => {
    if (!request.operationId) return;
    let active = true;
    void fetchSeaOperationConsumption(request.client, request.operationId).then(data => {
      if (active) setResponse({ request, data });
    }).catch(reason => { if (active) setResponse({ request, error: consumptionErrorMessage(reason) }); });
    return () => { active = false; };
  }, [request]);
  const current = response?.request === request ? response : undefined;
  const saved = savedConsumption?.operationId === operationId ? savedConsumption : undefined;
  const displayed = saved?.record && (current?.data?.record?.version ?? 0) < saved.record.version
    ? { data: saved, error: undefined } : current;
  return { response: displayed, reload: () => setRetry(value => value + 1) };
}
