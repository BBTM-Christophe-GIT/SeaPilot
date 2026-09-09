import type { RoleKey } from '../permissions/roles';

export type LiftingKind = 'lifting' | 'towing';
export type CheckValue = 'pending' | 'ok' | 'defect' | 'na';
export type ItemCondition = 'pending' | 'good' | 'repair' | 'withdrawn' | 'not_present';
export const INSPECTOR = 'Antoine MONCEAUX';
export const CHECK_KEYS = ['EG', 'NID', 'V1', 'V2', 'V3', 'V4', 'V5'] as const;
export type CheckKey = typeof CHECK_KEYS[number];
export const CONDITION_LABELS: Record<ItemCondition, string> = {
  pending: 'À contrôler', good: 'Maintien en service', repair: 'Réparation nécessaire',
  withdrawn: 'Retrait du service', not_present: 'Non présenté',
};
export const CHECK_LABELS: Record<CheckValue, string> = { pending: 'À vérifier', ok: 'Satisfaisant', defect: 'Défaut', na: 'Sans objet' };
export const KIND_LABELS: Record<LiftingKind, string> = { lifting: 'Registre des Apparaux de Levage', towing: 'Remorques' };
export interface LiftingVessel {
  id: number; company_id: number; name: string; acronym: string; registration_number: string;
  call_sign: string; registration_port: string;
}
export interface LiftingItem {
  id: number; company_id: number; vessel_id: number; kind: LiftingKind; reference: string;
  material_type: string; description: string; swl_tonnes: number | null; serial_number: string;
  location: string; notes: string; active: boolean; source_label: string; updated_at: string;
}
export type ItemDraft = Pick<LiftingItem, 'reference' | 'material_type' | 'description' | 'swl_tonnes' | 'serial_number' | 'location' | 'notes'>;
export interface InspectionEntry {
  id: number; inspection_id: number; item_id: number; item_snapshot: LiftingItem;
  condition: ItemCondition; checks: Record<CheckKey, CheckValue>; observations: string;
}
export interface LiftingInspection {
  id: number; company_id: number; vessel_id: number; kind: LiftingKind; inspection_year: number;
  issued_on: string; expires_on: string; inspector_name: string; status: 'draft' | 'published';
  vessel_snapshot: LiftingVessel; revision: number; certificate_id: number | null;
  storage_path: string | null; published_at: string | null; notes: string;
  source_label?: string;
}
export function canManageLifting(roles: RoleKey[]): boolean {
  return roles.some((role) => ['admin', 'direction', 'armement'].includes(role));
}
export function emptyChecks(): Record<CheckKey, CheckValue> {
  return { EG: 'pending', NID: 'pending', V1: 'pending', V2: 'pending', V3: 'pending', V4: 'pending', V5: 'pending' };
}
export function blankItem(kind: LiftingKind): ItemDraft {
  return { reference: '', material_type: kind === 'towing' ? 'Remorque' : 'Élingue', description: '', swl_tonnes: null, serial_number: '', location: '', notes: '' };
}
export function annualExpiry(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return '';
  const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  return `${year + 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}
export function todayLocal(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function formatLiftingDate(date: string): string {
  return date ? date.split('-').reverse().join('/') : '—';
}
export function entryComplete(entry: InspectionEntry): boolean {
  if (entry.condition === 'pending') return false;
  if (entry.condition === 'not_present') return Boolean(entry.observations.trim());
  if (CHECK_KEYS.some((key) => !entry.checks[key] || entry.checks[key] === 'pending')) return false;
  if (entry.condition === 'good' && CHECK_KEYS.some((key) => entry.checks[key] === 'defect')) return false;
  return entry.condition === 'good' || Boolean(entry.observations.trim());
}
