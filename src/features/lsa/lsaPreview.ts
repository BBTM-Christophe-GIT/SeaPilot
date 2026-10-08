import type { SupabaseClient } from '@supabase/supabase-js';
import { demoFleetVessels } from '../lifting/liftingPreview';
import { LSA_DEFAULT_DESIGNATIONS, blankLsaDraft, lsaTypeKey, numberedLsaTitle, type LsaCatalog, type LsaItem } from './lsaModel';

// Synthetic inventory only: production records and files are never bundled in previews.
export function createLsaPreviewClient(): SupabaseClient {
  const vessels = demoFleetVessels.filter((vessel) => !vessel.name.startsWith('YARD'));
  const stamp = () => new Date().toISOString();
  const catalog: LsaCatalog = {
    types: LSA_DEFAULT_DESIGNATIONS.map((group, index) => ({ id: index + 1, name: group.name, legacy_key: group.legacy_key, active: true, updated_at: stamp() })),
    designations: LSA_DEFAULT_DESIGNATIONS.flatMap((group, index) => group.designations.map((name, offset) => ({ id: index * 10 + offset + 1, name, equipment_type_id: index + 1, active: true, updated_at: stamp() }))),
  };
  const items: LsaItem[] = vessels.flatMap((vessel, index) => [2, 13, 24, 31].map((id, offset) => {
    const designation = catalog.designations.find((entry) => entry.id === id)!;
    const type = catalog.types.find((entry) => entry.id === designation.equipment_type_id)!;
    return {
      ...blankLsaDraft(), id: 90000 + index * 10 + offset, company_id: 1, vessel_id: vessel.id, vessel_name: vessel.name,
      category_key: lsaTypeKey(type.id), category_label: type.name, title: numberedLsaTitle(designation.name, 1),
      document_title: numberedLsaTitle(designation.name, 1), designation_id: id, item_number: 1, original_designation: null,
      issued_on: null, planned_on: null, provider_name: null, visit_location: null, renewal_notes: null,
      expires_on: offset === 2 ? '2026-10-01' : '2027-01-01', status: 'valid', workflow_status: 'not_started',
      file_name: null, storage_bucket: null, storage_path: null, file_url: null, source_label: 'Démonstration', updated_at: stamp(),
    };
  }));
  const counters = new Map(items.map((item) => [`${item.vessel_id}:${item.designation_id}`, item.item_number!]));
  return {
    from: (table: string) => {
      const source = table === 'lsa_items' ? items : table === 'lsa_equipment_types' ? catalog.types : table === 'lsa_designations' ? catalog.designations : [];
      let selected = [...source] as unknown as Record<string, unknown>[];
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
      if (name === 'lsa_next_item_number') return { data: (counters.get(`${args.p_vessel_id}:${args.p_designation_id}`) || 0) + 1, error: null };
      if (name === 'save_lsa_catalog_entry') {
        const entry = args.p_entry as Record<string, unknown>;
        const collection = args.p_kind === 'type' ? catalog.types : catalog.designations;
        const existing = collection.find((row) => row.id === entry.id);
        if (existing) {
          Object.assign(existing, entry, { updated_at: stamp() });
          if (args.p_kind === 'designation') items.filter((item) => item.designation_id === existing.id).forEach((item) => {
            item.title = item.document_title = numberedLsaTitle(existing.name, item.item_number!);
          });
        } else collection.push({ ...entry, id: Math.max(0, ...collection.map((row) => row.id)) + 1, updated_at: stamp() } as never);
        return { data: null, error: null };
      }
      if (name !== 'save_lsa_item') return { data: null, error: { message: 'Action indisponible en démonstration.' } };
      const vessel = vessels.find((row) => row.id === args.p_vessel_id)!;
      const draft = args.p_item as Record<string, unknown>;
      const existing = items.find((item) => item.id === args.p_id);
      const designation = catalog.designations.find((entry) => entry.id === draft.designation_id)!;
      const type = catalog.types.find((entry) => entry.id === designation?.equipment_type_id);
      const key = `${vessel.id}:${draft.designation_id}`;
      const number = existing?.designation_id === draft.designation_id ? existing?.item_number : (counters.get(key) || 0) + 1;
      const title = existing?.designation_id === draft.designation_id ? existing?.document_title : numberedLsaTitle(designation.name, number!);
      if (number) counters.set(key, Math.max(counters.get(key) || 0, number));
      const changes = { ...draft, item_number: number, title, document_title: title, category_key: type ? lsaTypeKey(type.id) : existing?.category_key, category_label: type?.name || existing?.category_label, updated_at: stamp() };
      if (existing) Object.assign(existing, changes);
      else items.push({ ...items[0], ...changes, id: Math.max(...items.map((item) => item.id)) + 1, vessel_id: vessel.id, vessel_name: vessel.name } as LsaItem);
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
}
