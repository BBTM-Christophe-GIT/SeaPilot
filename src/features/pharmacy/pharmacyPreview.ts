import type { SupabaseClient } from '@supabase/supabase-js';
import { PHARMACY_ALERT_DAYS, blankPharmacyItem, pharmacyDaysUntil, pharmacyToday, type PharmacyCategory, type PharmacyControl, type PharmacyItem, type PharmacyNotification, type PharmacyVessel } from './pharmacyModel';

// Synthetic preview data only. The customer workbooks are imported into the protected database.
export function createPharmacyPreviewClient(): SupabaseClient {
  const vessels: PharmacyVessel[] = [['GOURY', 'GRY'], ['SUROIT', 'SUR'], ['HIRONDELLE DE LA MANCHE', 'HIR']].map(([name, acronym], index) => ({ id: 99001 + index, company_id: 99, name, acronym, can_manage: true }));
  const dateAt = (days: number) => { const date = new Date(`${pharmacyToday()}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  const examples = [
    ['DOTATION CARDIOLOGIQUE — DÉMO', '1. CARDIOLOGIE', '1 boîte', '1 boîte', 90],
    ['DOTATION DIGESTIVE — DÉMO', '2. GASTRO-ENTÉROLOGIE', '1 boîte', '1 boîte', 180],
    ['ANTISEPTIQUE CUTANÉ', '3. PANSEMENTS ET SOINS', '2 flacons', '2', 350],
    ['COMPRESSES STÉRILES', '3. PANSEMENTS ET SOINS', '20', '30', 430],
    ['BANDES DE GAZE', '3. PANSEMENTS ET SOINS', '12', '6', 600],
    ['PANSEMENTS ADHÉSIFS', '3. PANSEMENTS ET SOINS', '40', '20', -20],
    ['SÉRUM PHYSIOLOGIQUE', '3. PANSEMENTS ET SOINS', '10', '10', 15],
    ['GANTS D’EXAMEN', '10. MATÉRIEL MÉDICAL', '100', '50', 720],
    ['COUVERTURE ISOTHERMIQUE', '10. MATÉRIEL MÉDICAL', '2', '2', null],
    ['CISEAUX À PANSEMENT', '10. MATÉRIEL MÉDICAL', '1', '1', null],
    ['THERMOMÈTRE', '10. MATÉRIEL MÉDICAL', '1', '1', null],
    ['SOLUTION DE RINÇAGE OCULAIRE', '3. PANSEMENTS ET SOINS', '2', '2', 210],
    ['BANDES ÉLASTIQUES', '3. PANSEMENTS ET SOINS', '4', '4', 510],
    ['PINCE À ÉCHARDES', '10. MATÉRIEL MÉDICAL', '1', '1', null],
    ['MASQUE DE PROTECTION', '10. MATÉRIEL MÉDICAL', '10', '10', 100],
    ['SACHETS DE FROID', '4. PREMIERS SECOURS', '2', '2', 320],
  ] as const;
  const items: PharmacyItem[] = vessels.flatMap((vessel, vesselIndex) => examples.map(([designation, category, quantity, required, days], index) => ({ ...blankPharmacyItem(), id: vesselIndex * 100 + index + 1, company_id: 99, vessel_id: vessel.id, section: 'DOTATION DE DÉMONSTRATION', category, designation, brand: '', lot_number: days === null ? '' : `DEMO-${index + 1}`, quantity, required_quantity: required, expires_on: days === null ? null : dateAt(days), expiry_text: '', expiry_precision: days === null ? 'unknown' : 'day', notes: 'Article fictif pour présentation de l’interface.', source_file: '', source_sheet: '', source_row: null, revision: 1, updated_at: new Date().toISOString() })));
  const controls: PharmacyControl[] = [];
  const categories: PharmacyCategory[] = vessels.flatMap((vessel, vesselIndex) => [...new Set(items.filter((item) => item.vessel_id === vessel.id).map((item) => item.category))]
    .map((name, index) => ({ id: vesselIndex * 100 + index + 1, company_id: 99, vessel_id: vessel.id, name, revision: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })));
  const files = new Map<string, Blob>();
  const tables = { pharmacy_inventory: items, pharmacy_controls: controls, pharmacy_categories: categories };
  const categoryKey = (name: string) => name.trim().toLocaleLowerCase('fr');
  function registerCategory(vesselId: number, name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return '';
    const existing = categories.find((category) => category.vessel_id === vesselId && categoryKey(category.name) === categoryKey(trimmed));
    if (existing) return existing.name;
    categories.push({ id: Math.max(0, ...categories.map((category) => category.id)) + 1, company_id: 99, vessel_id: vesselId, name: trimmed, revision: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    return trimmed;
  }
  function query(rows: unknown[]) {
    let selected = [...rows] as Record<string, unknown>[];
    const chain = { select: () => chain, eq: (key: string, value: unknown) => { selected = selected.filter((row) => row[key] === value); return chain; }, order: () => chain, then: (resolve: (value: unknown) => void) => Promise.resolve({ data: structuredClone(selected), error: null }).then(resolve) };
    return chain;
  }
  return {
    from: (name: keyof typeof tables) => query(tables[name] || []),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      if (name === 'pharmacy_available_vessels') return { data: vessels, error: null };
      if (name === 'save_pharmacy_category' || name === 'delete_pharmacy_category') {
        const vesselId = Number(args.p_vessel_id);
        if (!vessels.some((vessel) => vessel.id === vesselId)) return { data: null, error: { message: 'Navire introuvable.' } };
        const old = categories.find((category) => category.id === args.p_id && category.vessel_id === vesselId);
        if (args.p_id != null && (!old || old.revision !== args.p_revision)) return { data: null, error: { message: 'Cette catégorie a été modifiée. Actualisez l’inventaire.' } };
        const trimmed = String(args.p_name || '').trim();
        if (name === 'save_pharmacy_category' && (!trimmed || trimmed.length > 200)) return { data: null, error: { message: 'Nom de catégorie invalide.' } };
        if (name === 'save_pharmacy_category' && categories.some((category) => category.vessel_id === vesselId && category.id !== old?.id && categoryKey(category.name) === categoryKey(trimmed))) return { data: null, error: { message: 'Cette catégorie existe déjà pour ce navire.' } };
        if (!old && name === 'save_pharmacy_category') {
          registerCategory(vesselId, trimmed);
          return { data: categories.at(-1)!.id, error: null };
        }
        if (!old) return { data: null, error: { message: 'Catégorie introuvable.' } };
        for (const item of items) {
          if (item.vessel_id === vesselId && item.category === old.name) Object.assign(item, { category: name === 'delete_pharmacy_category' ? '' : trimmed, revision: item.revision + 1, updated_at: new Date().toISOString() });
        }
        if (name === 'delete_pharmacy_category') categories.splice(categories.indexOf(old), 1);
        else Object.assign(old, { name: trimmed, revision: old.revision + 1, updated_at: new Date().toISOString() });
        return { data: name === 'delete_pharmacy_category' ? null : old.id, error: null };
      }
      if (name === 'pharmacy_notifications') {
        const today = pharmacyToday();
        const notifications: PharmacyNotification[] = [];
        for (const item of items) {
          const days = pharmacyDaysUntil(item.expires_on, today);
          if (!item.active || days === null || days > PHARMACY_ALERT_DAYS) continue;
          const vessel = vessels.find((candidate) => candidate.id === item.vessel_id);
          if (vessel) notifications.push({ id: `item-${item.id}`, kind: 'item', vessel_id: vessel.id, vessel_name: vessel.name, title: item.designation, expires_on: item.expires_on!, days_until_expiry: days, item_id: item.id });
        }
        for (const control of controls) {
          const days = pharmacyDaysUntil(control.expires_on, today);
          if (!control.is_current || days === null || days > PHARMACY_ALERT_DAYS) continue;
          const vessel = vessels.find((candidate) => candidate.id === control.vessel_id);
          if (vessel) notifications.push({ id: `control-${control.id}`, kind: 'control', vessel_id: vessel.id, vessel_name: vessel.name, title: 'Contrôle Pharmacie', expires_on: control.expires_on, days_until_expiry: days, item_id: null });
        }
        notifications.sort((a, b) => a.expires_on.localeCompare(b.expires_on) || a.vessel_name.localeCompare(b.vessel_name, 'fr') || a.title.localeCompare(b.title, 'fr'));
        return { data: structuredClone(notifications), error: null };
      }
      if (name === 'save_pharmacy_item') {
        const old = items.find((item) => item.id === args.p_id);
        if (old && old.revision !== args.p_revision) return { data: null, error: { message: 'Cet article a été modifié. Actualisez l’inventaire.' } };
        const vesselId = Number(args.p_vessel_id);
        const input = args.p_item as Partial<PharmacyItem>;
        const draft = { ...input, category: registerCategory(vesselId, input.category || '') };
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
