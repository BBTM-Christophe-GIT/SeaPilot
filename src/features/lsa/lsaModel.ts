export const LSA_CATEGORIES = [
  { key: '07-2-life-jacket', label: '07.2 - Life Jacket' },
  { key: '07-4-gmdss', label: '07.4 - GMDSS' },
  { key: '07-6-pyrotechnie', label: '07.6 - Pyrotechnie' },
  { key: '07-8-bouee-feux-retournement-mob', label: '07.8 - Bouée, Feux à retournement et MOB' },
] as const;

export function isLsaCategory(key: string): boolean {
  return LSA_CATEGORIES.some((category) => category.key === key);
}

export interface LsaItem {
  id: number; company_id: number; vessel_id: number; vessel_name: string;
  category_key: string; category_label: string; document_title: string; title: string;
  issued_on: string | null; expires_on: string | null; planned_on: string | null;
  provider_name: string | null; visit_location: string | null; notes: string | null;
  renewal_notes: string | null; status: string; workflow_status: string;
  file_name: string | null; storage_bucket: string | null; storage_path: string | null;
  file_url: string | null; source_label: string | null; updated_at: string;
  designation_id: number | null; item_number: number | null;
  brand: string | null; model: string | null; serial_number: string | null;
  original_designation: string | null;
}

export interface LsaVersion {
  id: number; certificate_id: number; version_no: number; status: string;
  original_file_name: string; normalized_file_name: string; storage_bucket: string;
  storage_path: string; issued_on: string | null; expires_on: string | null;
  created_at: string; is_current: boolean;
}

export interface LsaEvent {
  id: number; certificate_id: number; event_type: string; created_at: string;
  planned_on: string | null; provider_name: string | null; visit_location: string | null; notes: string | null;
}

export interface LsaEquipmentType { id: number; name: string; legacy_key: string | null; active: boolean; updated_at: string }
export interface LsaDesignation { id: number; equipment_type_id: number; name: string; active: boolean; updated_at: string }
export interface LsaCatalog { types: LsaEquipmentType[]; designations: LsaDesignation[] }
export type LsaDraft = Pick<LsaItem, 'designation_id' | 'brand' | 'model' | 'serial_number' | 'expires_on' | 'notes'>;

export const blankLsaDraft = (): LsaDraft => ({ designation_id: null, brand: '', model: '', serial_number: '', expires_on: null, notes: '' });

export const LSA_DEFAULT_DESIGNATIONS = [
  { name: 'GMDSS', legacy_key: '07-4-gmdss', designations: ['Batterie VHF GMDSS', 'EPIRB', 'SART'] },
  { name: 'Pyrotechnie', legacy_key: '07-6-pyrotechnie', designations: ['Fusée à parachute', 'Fusée du lance amarre', 'Feu à main', 'Fumigène flottant'] },
  { name: 'Survie', legacy_key: '07-8-bouee-feux-retournement-mob', designations: ['Combinaison d’immersion', 'Feu à retournement', 'Lampe flash', 'Lampe à éclat', 'Couverture de survie'] },
  { name: 'Gilets de Sauvetage', legacy_key: '07-2-life-jacket', designations: ['VFI - 150N', 'VFI - 250N', 'VFI - 300N'] },
  { name: 'Navigation', legacy_key: null, designations: ['Bloc Marine'] },
];
export const compareLsaNames = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true });
export const lsaTypeKey = (id: number) => `lsa-type-${id}`;
export const numberedLsaTitle = (name: string, number: number) => `${name} - ${String(number).padStart(2, '0')}`;

// Imported titles and document provenance remain intact until the user edits a designation.
export function categorizeLsaItems(items: LsaItem[], catalog: LsaCatalog): LsaItem[] {
  return items.map((item) => {
    const designation = catalog.designations.find((entry) => entry.id === item.designation_id);
    const type = catalog.types.find((entry) => designation ? entry.id === designation.equipment_type_id : entry.legacy_key === item.category_key || lsaTypeKey(entry.id) === item.category_key);
    return type ? { ...item, category_key: lsaTypeKey(type.id), category_label: type.name } : item;
  });
}

function searchable(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
}

export function matchesLsaItem(item: LsaItem, query: string, category: string): boolean {
  const text = searchable([
    item.id, item.document_title, item.title, item.category_label, item.provider_name,
    item.visit_location, item.notes, item.renewal_notes, item.brand, item.model, item.serial_number, item.original_designation,
  ].join(' '));
  return (!category || item.category_key === category) && searchable(query).trim().split(/\s+/).every((word) => text.includes(word));
}

export function lsaVersionStatus(status: string): string {
  return ({ pending_validation: 'À valider', active: 'Validé', rejected: 'Refusé', archived: 'Archivé' } as Record<string, string>)[status] || status;
}
