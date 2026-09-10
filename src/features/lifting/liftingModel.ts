import type { RoleKey } from '../permissions/roles';
import { applicableCodes, CONTROL_CODES, type AccessoryItem, type TowingType } from './liftingControls';

export type LiftingKind = 'lifting' | 'towing';
export type CheckValue = 'pending' | 'ok' | 'defect' | 'na';
export type ItemCondition = 'pending' | 'good' | 'repair' | 'withdrawn' | 'not_present';
export const INSPECTOR = 'Antoine MONCEAUX';
export const CHECK_KEYS = CONTROL_CODES;
export type CheckKey = typeof CHECK_KEYS[number] | 'NID';
export const CONDITION_LABELS: Record<ItemCondition, string> = {
  pending: 'À contrôler', good: 'Maintien en service', repair: 'Maintien en service après réparation',
  withdrawn: 'Mise au rebut', not_present: 'Non présenté',
};
export const DECISIONS = ['good', 'repair', 'withdrawn'] as const;
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
  legacy_reference?: string;
  added_on?: string;
  commissioned_on?: string;
  last_control_on?: string | null;
  replaced_on?: string | null;
  service_version?: number;
  inspection_due_on?: string | null;
  towing_type?: TowingType | null;
  source_key?: string | null;
  source_data?: { source_id: string; commissioned_on?: string | null; last_inspected_on?: string | null; valid_until?: string | null; inspection_frequency?: string | null; action?: string | null; control_accredited?: boolean | null; emergency_towing?: boolean | null };
}
export type ItemDraft = Pick<LiftingItem, 'reference' | 'material_type' | 'description' | 'swl_tonnes' | 'serial_number' | 'location' | 'notes' | 'towing_type' | 'commissioned_on'>;
export interface InspectionEntry {
  id: number; inspection_id: number; item_id: number; item_snapshot: LiftingItem;
  condition: ItemCondition; checks: Partial<Record<CheckKey, CheckValue>>; observations: string;
  checklist_version?: number;
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
export function emptyChecks(): Partial<Record<CheckKey, CheckValue>> {
  return Object.fromEntries(CHECK_KEYS.map((key) => [key, 'pending']));
}
export function defaultChecks(item: AccessoryItem): Partial<Record<CheckKey, CheckValue>> {
  const applicable = applicableCodes(item);
  return Object.fromEntries(CHECK_KEYS.map((key) => [key, applicable.includes(key) ? 'ok' : 'na']));
}
export function entryControlKeys(entry: InspectionEntry): CheckKey[] {
  return entry.checklist_version === 1 || (!entry.checks.ID && entry.checks.NID)
    ? ['EG', 'NID', 'V1', 'V2', 'V3', 'V4', 'V5'] : applicableCodes(entry.item_snapshot);
}
export function editableEntry(entry: InspectionEntry): InspectionEntry {
  return { ...entry, condition: DECISIONS.includes(entry.condition as typeof DECISIONS[number]) ? entry.condition : 'good' };
}
export function entryUnsatisfactory(entry: InspectionEntry): boolean {
  return entryControlKeys(entry).some((key) => entry.checks[key] === 'defect');
}
export function blankItem(kind: LiftingKind): ItemDraft {
  return { reference: '', material_type: kind === 'towing' ? 'Remorque' : 'Élingues / Sangles textiles', towing_type: kind === 'towing' ? 'textile_line' : null, description: '', swl_tonnes: null, serial_number: '', location: '', notes: '' };
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
export function liftingDeadline(date?: string | null, today = todayLocal()): 'expired' | 'soon' | '' {
  if (!date) return '';
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  return days < 0 ? 'expired' : days <= 60 ? 'soon' : '';
}
export function entryComplete(entry: InspectionEntry): boolean {
  if (entry.condition === 'pending') return false;
  const historical = entry.checklist_version === 1 || (!entry.checks.ID && entry.checks.NID);
  if (entry.condition === 'not_present') return Boolean(historical && entry.observations.trim());
  const keys = entryControlKeys(entry);
  if (!keys.length || keys.some((key) => !entry.checks[key] || entry.checks[key] === 'pending' || (!historical && entry.checks[key] === 'na'))) return false;
  if (entry.condition === 'good' && keys.some((key) => entry.checks[key] === 'defect')) return false;
  return entry.condition === 'good' || Boolean(entry.observations.trim());
}
