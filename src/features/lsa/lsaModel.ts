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

export type LsaDraft = Pick<LsaItem, 'category_key' | 'document_title' | 'issued_on' | 'expires_on' | 'planned_on' | 'provider_name' | 'visit_location' | 'notes' | 'renewal_notes'>;

export const blankLsaDraft = (): LsaDraft => ({ category_key: LSA_CATEGORIES[0].key, document_title: '', issued_on: null, expires_on: null, planned_on: null, provider_name: '', visit_location: '', notes: '', renewal_notes: '' });

function searchable(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
}

export function matchesLsaItem(item: LsaItem, query: string, category: string): boolean {
  const text = searchable([
    item.id, item.document_title, item.title, item.category_label, item.provider_name,
    item.visit_location, item.notes, item.renewal_notes,
  ].join(' '));
  return (!category || item.category_key === category) && searchable(query).trim().split(/\s+/).every((word) => text.includes(word));
}

export function lsaVersionStatus(status: string): string {
  return ({ pending_validation: 'À valider', active: 'Validé', rejected: 'Refusé', archived: 'Archivé' } as Record<string, string>)[status] || status;
}
