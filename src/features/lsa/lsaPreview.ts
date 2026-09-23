import type { SupabaseClient } from '@supabase/supabase-js';
import { demoFleetVessels } from '../lifting/liftingPreview';
import { LSA_CATEGORIES, blankLsaDraft, type LsaItem } from './lsaModel';

// Synthetic inventory only: production records and files are never bundled in previews.
export function createLsaPreviewClient(): SupabaseClient {
  const vessels = demoFleetVessels.filter((vessel) => !vessel.name.startsWith('YARD'));
  const items: LsaItem[] = vessels.flatMap((vessel, index) => LSA_CATEGORIES.map((category, offset) => ({
    ...blankLsaDraft(), id: 90000 + index * 10 + offset, company_id: 1, vessel_id: vessel.id, vessel_name: vessel.name,
    category_key: category.key, category_label: category.label, title: `${category.label} — Démonstration`,
    document_title: ['Gilet de sauvetage — DÉMO 01', 'Balise de détresse — DÉMO 02', 'Fusée de détresse — DÉMO 03', 'Bouée lumineuse — DÉMO 04'][offset],
    issued_on: '2026-01-01', expires_on: offset === 2 ? '2026-10-01' : '2027-01-01', status: 'valid', workflow_status: 'not_started',
    file_name: null, storage_bucket: null, storage_path: null, file_url: null, source_label: 'Démonstration', updated_at: '2026-01-01T00:00:00Z',
  })));
  return {
    from: (table: string) => {
      let selected = table === 'lsa_items' ? [...items] as unknown as Record<string, unknown>[] : [];
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => { selected = selected.filter((row) => row[key] === value); return chain; },
        in: (key: string, values: unknown[]) => { selected = selected.filter((row) => values.includes(row[key])); return chain; },
        order: () => chain,
        then: (resolve: (value: unknown) => void) => Promise.resolve({ data: structuredClone(selected), error: null }).then(resolve),
      };
      return chain;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'lsa_available_vessels') return { data: vessels, error: null };
      if (name !== 'save_lsa_item') return { data: null, error: { message: 'Action indisponible en démonstration.' } };
      const vessel = demoFleetVessels.find((row) => row.id === args.p_vessel_id)!;
      const draft = args.p_item as Record<string, unknown>;
      const changes = { ...draft, title: draft.document_title, category_label: LSA_CATEGORIES.find((category) => category.key === draft.category_key)?.label, updated_at: new Date().toISOString() };
      if (args.p_id) Object.assign(items.find((item) => item.id === args.p_id)!, changes);
      else items.push({ ...items[0], ...changes, id: Math.max(...items.map((item) => item.id)) + 1, vessel_id: vessel.id, vessel_name: vessel.name } as LsaItem);
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
}
