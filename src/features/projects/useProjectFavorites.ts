import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export function useProjectFavorites(client: SupabaseClient) {
  const [ids, setIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const locks = useRef(new Set<number>());

  useEffect(() => {
    let userId: string | null | undefined;
    const listener = client.auth?.onAuthStateChange?.((_event, session) => {
      const nextId = session?.user.id ?? null;
      if (userId !== undefined && nextId !== userId) {
        generation.current += 1;
        setIds(new Set()); setAttempt((value) => value + 1);
      }
      userId = nextId;
    });
    return () => listener?.data.subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    const current = ++generation.current;
    setIds(new Set()); setLoading(true); setError(''); setPending(new Set()); locks.current.clear();
    void (async () => {
      const { data, error } = await client.from('project_favorites').select('project_id');
      if (error) throw error;
      if (generation.current === current) setIds(new Set((data || []).map((row) => Number(row.project_id))));
    })().catch(() => {
      if (generation.current === current) setError('Vos favoris n’ont pas pu être chargés.');
    }).finally(() => { if (generation.current === current) setLoading(false); });
    return () => { generation.current += 1; };
  }, [client, attempt]);

  async function toggle(projectId: number) {
    if (loading || locks.current.has(projectId)) return;
    const current = generation.current;
    const favorite = !ids.has(projectId);
    locks.current.add(projectId); setPending(new Set(locks.current)); setError('');
    try {
      const { error } = await client.rpc('projects_set_favorite', { target_project: projectId, favorite });
      if (error) throw error;
      if (generation.current === current) setIds((previous) => {
        const next = new Set(previous);
        if (favorite) next.add(projectId); else next.delete(projectId);
        return next;
      });
    } catch {
      if (generation.current === current) setError('Le favori n’a pas pu être enregistré. Votre sélection est conservée.');
    } finally {
      if (generation.current === current) { locks.current.delete(projectId); setPending(new Set(locks.current)); }
    }
  }
  return { ids, loading, error, pending, toggle, retry: () => setAttempt((value) => value + 1) };
}
