import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
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
) {
  const [workspace, setWorkspace] = useState<WorkingTimeWorkspace | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return false;
    const currentRequestId = ++requestId.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const nextWorkspace = await fetchWorkingTimeWorkspace(client, range);
      if (requestId.current === currentRequestId) setWorkspace(nextWorkspace);
      return true;
    } catch (error) {
      if (requestId.current === currentRequestId) setErrorMessage(workingTimeErrorMessage(error));
      return false;
    } finally {
      if (requestId.current === currentRequestId) setIsLoading(false);
    }
  }, [client, enabled, range.end, range.start]);

  useEffect(() => {
    if (!enabled) {
      setWorkspace(null);
      setErrorMessage(null);
      return;
    }
    void reload();
    return () => { requestId.current += 1; };
  }, [enabled, refreshToken, reload]);

  return { workspace, isLoading, errorMessage, reload };
}
