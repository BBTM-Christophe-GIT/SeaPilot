import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchWorkingTimeWorkspace,
  type WorkingTimeRange,
  type WorkingTimeWorkspace,
  workingTimeErrorMessage,
} from './workingTimeQueries';

export function useWorkingTimeWorkspace(
  client: SupabaseClient,
  enabled: boolean,
  range: WorkingTimeRange,
  refreshToken = 0,
  scopeKey = '',
) {
  const [loaded, setLoaded] = useState<{ client: SupabaseClient; start: string; end: string; scopeKey: string; workspace: WorkingTimeWorkspace } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestId = useRef(0);
  const scope = useMemo(() => ({ client, enabled, start: range.start, end: range.end, scopeKey }), [client, enabled, range.end, range.start, scopeKey]);
  const scopeRef = useRef<typeof scope | null>(scope);
  scopeRef.current = scope;

  const reload = useCallback(async () => {
    if (!enabled || scopeRef.current !== scope) return false;
    const currentRequestId = ++requestId.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const nextWorkspace = await fetchWorkingTimeWorkspace(client, range);
      if (requestId.current !== currentRequestId || scopeRef.current !== scope) return false;
      setLoaded({ client, start: range.start, end: range.end, scopeKey, workspace: nextWorkspace });
      return true;
    } catch (error) {
      if (requestId.current === currentRequestId) {
        setLoaded(null);
        setErrorMessage(workingTimeErrorMessage(error));
      }
      return false;
    } finally {
      if (requestId.current === currentRequestId) setIsLoading(false);
    }
  }, [client, enabled, range.end, range.start, scope, scopeKey]);

  useEffect(() => {
    scopeRef.current = scope;
    if (!enabled) {
      setLoaded(null);
      setIsLoading(false);
      setErrorMessage(null);
      return;
    }
    void reload();
    return () => { requestId.current += 1; if (scopeRef.current === scope) scopeRef.current = null; };
  }, [enabled, refreshToken, reload, scope]);

  const workspace = enabled && loaded?.client === client && loaded.start === range.start && loaded.end === range.end && loaded.scopeKey === scopeKey
    ? loaded.workspace : null;
  return { workspace, isLoading, errorMessage, reload };
}
