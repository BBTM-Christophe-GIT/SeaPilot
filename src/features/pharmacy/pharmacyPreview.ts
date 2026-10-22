import type { SupabaseClient } from '@supabase/supabase-js';
import { PHARMACY_ALERT_DAYS, blankPharmacyItem, pharmacyDaysUntil, pharmacyToday, pharmacyDotationKey, pharmacyMedicalSection, type PharmacyCategory, type PharmacyControl, type PharmacyItem, type PharmacyMedicalSection, type PharmacyNotification, type PharmacyVessel } from './pharmacyModel';

// Synthetic preview data only. The customer workbooks are imported into the protected database.
export function createPharmacyPreviewClient(): SupabaseClient {
  const vessels: PharmacyVessel[] = [['GOURY', 'GRY'], ['SUROIT', 'SUR'], ['HIRONDELLE DE LA MANCHE', 'HIR']].map(([name, acronym], index) => ({ id: 99001 + index, company_id: 99, name, acronym, can_manage: true, medical_dotation: index === 0 ? 'Dotation B' : 'Dotation C restreinte' }));
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
  const items: PharmacyItem[] = vessels.flatMap((vessel, vesselIndex) => examples.map(([designation, category, quantity, required, days], index) => ({ ...blankPharmacyItem(), id: vesselIndex * 100 + index + 1, company_id: 99, vessel_id: vessel.id, medical_dotation: vessel.medical_dotation || '', medical_section: index < 3 ? 'medicines' as const : 'equipment' as const, section: 'DOTATION DE DÉMONSTRATION', category, designation, brand: '', lot_number: days === null ? '' : `DEMO-${index + 1}`, quantity, required_quantity: required, expires_on: days === null ? null : dateAt(days), expiry_text: '', expiry_precision: days === null ? 'unknown' : 'day', notes: 'Article fictif pour présentation de l’interface.', source_file: '', source_sheet: '', source_row: null, revision: 1, updated_at: new Date().toISOString() })));
  const controls: PharmacyControl[] = [];
  const categories: PharmacyCategory[] = [];
  const files = new Map<string, Blob>();
  const tables = { pharmacy_inventory: items, pharmacy_controls: controls, pharmacy_categories: categories };
  const categoryKey = (name: string) => name.trim().toLocaleLowerCase('fr');
  function registerCategory(vesselId: number, name: string, medicalDotation: string, medicalSection: PharmacyMedicalSection): PharmacyCategory | undefined {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    const existing = categories.find((category) => pharmacyDotationKey(category.medical_dotation) === pharmacyDotationKey(medicalDotation) && pharmacyMedicalSection(category.medical_section) === medicalSection && categoryKey(category.name) === categoryKey(trimmed));
    if (existing) return existing;
    const created = { id: Math.max(0, ...categories.map((category) => category.id)) + 1, company_id: 99, vessel_id: vesselId, medical_dotation: medicalDotation, medical_section: medicalSection, name: trimmed, revision: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    categories.push(created);
    return created;
  }
  for (const item of items) item.category_id = registerCategory(item.vessel_id, item.category, item.medical_dotation || '', pharmacyMedicalSection(item.medical_section))?.id ?? null;
  const hasParent = (vesselId: number, parent: string) => pharmacyDotationKey(vessels.find((vessel) => vessel.id === vesselId)?.medical_dotation) === pharmacyDotationKey(parent)
    || [...items, ...categories].some((entry) => entry.vessel_id === vesselId && pharmacyDotationKey(entry.medical_dotation) === pharmacyDotationKey(parent));
  const visibleCategories = () => vessels.flatMap((vessel) => categories.filter((category) => hasParent(vessel.id, category.medical_dotation || '')).map((category) => ({ ...category, vessel_id: vessel.id })));
  function query(rows: unknown[]) {
    let selected = [...rows] as Record<string, unknown>[];
    const chain = { select: () => chain, eq: (key: string, value: unknown) => { selected = selected.filter((row) => row[key] === value); return chain; }, order: () => chain, then: (resolve: (value: unknown) => void) => Promise.resolve({ data: structuredClone(selected), error: null }).then(resolve) };
    return chain;
  }
  return {
    from: (name: keyof typeof tables) => query(name === 'pharmacy_categories' ? visibleCategories() : tables[name] || []),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      if (name === 'pharmacy_available_vessels') return { data: vessels, error: null };
      if (name === 'save_pharmacy_category' || name === 'delete_pharmacy_category') {
        const vesselId = Number(args.p_vessel_id);
        if (!vessels.some((vessel) => vessel.id === vesselId)) return { data: null, error: { message: 'Navire introuvable.' } };
        const old = categories.find((category) => category.id === args.p_id && hasParent(vesselId, category.medical_dotation || ''));
        if (args.p_id != null && (!old || old.revision !== args.p_revision)) return { data: null, error: { message: 'Cette catégorie a été modifiée. Actualisez l’inventaire.' } };
        const assigned = (vessels.find((vessel) => vessel.id === vesselId)?.medical_dotation || '').trim();
        const parent = (old?.medical_dotation ?? (args.p_medical_dotation == null ? assigned : String(args.p_medical_dotation))).trim();
        if (old && args.p_medical_dotation != null && pharmacyDotationKey(parent) !== pharmacyDotationKey(String(args.p_medical_dotation))) return { data: null, error: { message: 'Cette catégorie appartient à une autre dotation médicale.' } };
        if (!old && !hasParent(vesselId, parent)) return { data: null, error: { message: 'Dotation médicale inconnue pour ce navire.' } };
        const medicalSection = old ? pharmacyMedicalSection(old.medical_section) : pharmacyMedicalSection(args.p_medical_section == null ? undefined : String(args.p_medical_section));
        if (old && args.p_medical_section != null && args.p_medical_section !== medicalSection) return { data: null, error: { message: 'Cette catégorie appartient à une autre branche.' } };
        const trimmed = String(args.p_name || '').trim();
        if (name === 'save_pharmacy_category' && (!trimmed || trimmed.length > 200)) return { data: null, error: { message: 'Nom de catégorie invalide.' } };
        if (name === 'save_pharmacy_category' && categories.some((category) => pharmacyDotationKey(category.medical_dotation) === pharmacyDotationKey(parent) && pharmacyMedicalSection(category.medical_section) === medicalSection && category.id !== old?.id && categoryKey(category.name) === categoryKey(trimmed))) return { data: null, error: { message: 'Cette catégorie existe déjà pour cette dotation et cette branche.' } };
        if (!old && name === 'save_pharmacy_category') {
          return { data: registerCategory(vesselId, trimmed, parent, medicalSection)!.id, error: null };
        }
        if (!old) return { data: null, error: { message: 'Catégorie introuvable.' } };
        for (const item of items) {
          if (item.category_id === old.id) Object.assign(item, { category: name === 'delete_pharmacy_category' ? '' : trimmed, category_id: name === 'delete_pharmacy_category' ? null : old.id, revision: item.revision + 1, updated_at: new Date().toISOString() });
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
        if (old && old.vessel_id !== vesselId) return { data: null, error: { message: 'Article introuvable sur ce navire.' } };
        const parent = old ? old.medical_dotation || '' : vessels.find((vessel) => vessel.id === vesselId)?.medical_dotation || '';
        if (input.medical_dotation !== undefined && pharmacyDotationKey(input.medical_dotation) !== pharmacyDotationKey(parent)) return { data: null, error: { message: 'La dotation médicale de cet article a changé. Actualisez l’inventaire.' } };
        const medicalSection = pharmacyMedicalSection(input.medical_section ?? old?.medical_section);
        const selectedCategory = registerCategory(vesselId, input.category || '', parent, medicalSection);
        const draft = { ...input, medical_dotation: parent, medical_section: medicalSection, category: selectedCategory?.name || '', category_id: selectedCategory?.id ?? null };
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
