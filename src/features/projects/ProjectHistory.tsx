import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
interface Entry { id: number; entity_type: string; action: string; changed_at: string; old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null }
export function ProjectHistory({ client, projectId }: { client: SupabaseClient; projectId: number }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setEntries([]); setError('');
    void (async () => {
      const rows: Entry[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await client.from('project_change_log').select('id,entity_type,action,changed_at,old_values,new_values').or(`and(entity_type.eq.projects,entity_id.eq.${projectId}),old_values->>project_id.eq.${projectId},new_values->>project_id.eq.${projectId}`).order('changed_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499);
        if (result.error) throw result.error;
        rows.push(...result.data);
        if (!active || result.data.length < 500) break;
      }
      if (active) setEntries(rows);
    })().catch(() => { if (active) setError('Impossible de charger l’historique du projet.'); });
    return () => { active = false; };
  }, [client, projectId]);
  return <section className="project-history"><h2>Historique du dossier</h2><p>Journal conservé depuis la création et les imports historiques. {entries.length} événement(s).</p>{error ? <p role="alert">{error}</p> : null}{entries.map((entry) => <details key={entry.id}><summary><time>{new Date(entry.changed_at).toLocaleString('fr-FR')}</time> · {({ INSERT: 'Création', UPDATE: 'Modification', DELETE: 'Suppression' } as Record<string, string>)[entry.action.toUpperCase()] || entry.action} · {({ projects: 'Projet', project_contracts: 'Contrat', contract_documents: 'Document contractuel' } as Record<string, string>)[entry.entity_type] || entry.entity_type}</summary><div className="project-history-diff">{Object.keys(entry.new_values || entry.old_values || {}).filter((key) => JSON.stringify(entry.new_values?.[key]) !== JSON.stringify(entry.old_values?.[key])).map((key) => <p key={key}><strong>{key}</strong><span>{JSON.stringify(entry.old_values?.[key] ?? '—')}</span><span>→ {JSON.stringify(entry.new_values?.[key] ?? '—')}</span></p>)}</div></details>)}</section>;
}
