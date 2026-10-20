import type { SupabaseClient } from '@supabase/supabase-js';
import { blankPharmacyItem, pharmacyToday, type PharmacyControl, type PharmacyItem, type PharmacyVessel } from './pharmacyModel';

// Synthetic preview data only. The customer workbooks are imported into the protected database.
export function createPharmacyPreviewClient(): SupabaseClient {
  const vessels: PharmacyVessel[] = ['NAVIRE DÉMONSTRATION A', 'NAVIRE DÉMONSTRATION B', 'NAVIRE DÉMONSTRATION C'].map((name, index) => ({ id: 99001 + index, company_id: 99, name, acronym: `D${index + 1}`, can_manage: true }));
  const dateAt = (days: number) => { const date = new Date(`${pharmacyToday()}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  const examples = [
    ['ANTISEPTIQUE CUTANÉ', 'Soins et pansements', '2 flacons', '2', 350],
    ['COMPRESSES STÉRILES', 'Soins et pansements', '20', '30', 430],
    ['BANDES DE GAZE', 'Soins et pansements', '12', '6', 600],
    ['PANSEMENTS ADHÉSIFS', 'Soins et pansements', '40', '20', -20],
    ['SÉRUM PHYSIOLOGIQUE', 'Soins et pansements', '10', '10', 15],
    ['GANTS D’EXAMEN', 'Matériel médical', '100', '50', 720],
    ['COUVERTURE ISOTHERMIQUE', 'Matériel médical', '2', '2', null],
    ['CISEAUX À PANSEMENT', 'Matériel médical', '1', '1', null],
    ['THERMOMÈTRE', 'Matériel médical', '1', '1', null],
    ['SOLUTION DE RINÇAGE OCULAIRE', 'Soins et pansements', '2', '2', 210],
    ['BANDES ÉLASTIQUES', 'Soins et pansements', '4', '4', 510],
    ['PINCE À ÉCHARDES', 'Matériel médical', '1', '1', null],
    ['MASQUE DE PROTECTION', 'Matériel médical', '10', '10', 100],
    ['SACHETS DE FROID', 'Premiers secours', '2', '2', 320],
  ] as const;
  const items: PharmacyItem[] = vessels.flatMap((vessel, vesselIndex) => examples.map(([designation, category, quantity, required, days], index) => ({ ...blankPharmacyItem(), id: vesselIndex * 100 + index + 1, company_id: 99, vessel_id: vessel.id, section: 'DOTATION DE DÉMONSTRATION', category, designation, brand: '', lot_number: days === null ? '' : `DEMO-${index + 1}`, quantity, required_quantity: required, expires_on: days === null ? null : dateAt(days), expiry_text: '', expiry_precision: days === null ? 'unknown' : 'day', notes: 'Article fictif pour présentation de l’interface.', source_file: '', source_sheet: '', source_row: null, revision: 1, updated_at: new Date().toISOString() })));
  const controls: PharmacyControl[] = [];
  const files = new Map<string, Blob>();
  const tables = { pharmacy_inventory: items, pharmacy_controls: controls };
  function query(rows: unknown[]) {
    let selected = [...rows] as Record<string, unknown>[];
    const chain = { select: () => chain, eq: (key: string, value: unknown) => { selected = selected.filter((row) => row[key] === value); return chain; }, order: () => chain, then: (resolve: (value: unknown) => void) => Promise.resolve({ data: structuredClone(selected), error: null }).then(resolve) };
    return chain;
  }
  return {
    from: (name: keyof typeof tables) => query(tables[name] || []),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      if (name === 'pharmacy_available_vessels') return { data: vessels, error: null };
      if (name === 'save_pharmacy_item') {
        const old = items.find((item) => item.id === args.p_id);
        if (old && old.revision !== args.p_revision) return { data: null, error: { message: 'Cet article a été modifié. Actualisez l’inventaire.' } };
        const draft = args.p_item as Partial<PharmacyItem>;
        if (old) Object.assign(old, draft, { revision: old.revision + 1 });
        else items.push({ ...items[0], ...draft, id: Math.max(...items.map((item) => item.id)) + 1, vessel_id: Number(args.p_vessel_id), source_file: '', source_sheet: '', source_row: null, revision: 1 });
        return { data: old?.id || items.at(-1)?.id, error: null };
      }
      if (name === 'publish_pharmacy_control') {
        const old = controls.find((control) => control.vessel_id === args.p_vessel_id && control.is_current);
        if ((old?.id || null) !== args.p_expected_control_id) return { data: null, error: { message: 'Le contrôle a changé. Actualisez la page.' } };
        if (old) old.is_current = false;
        const control: PharmacyControl = { id: controls.length + 1, company_id: 99, vessel_id: Number(args.p_vessel_id), issued_on: args.p_issued_on ? String(args.p_issued_on) : null, expires_on: String(args.p_expires_on), storage_path: String(args.p_storage_path), file_name: String(args.p_file_name), file_size: Number(args.p_file_size), mime_type: String(args.p_mime_type), created_at: new Date().toISOString(), is_current: true, revision: 1 };
        controls.unshift(control); return { data: control.id, error: null };
      }
      return { data: [], error: null };
    },
    storage: { from: () => ({ upload: async (path: string, file: Blob) => { files.set(path, file); return { data: { path }, error: null }; }, download: async (path: string) => ({ data: files.get(path) || null, error: files.has(path) ? null : { message: 'Ce document de démonstration n’est plus disponible.' } }) }) },
  } as unknown as SupabaseClient;
}
