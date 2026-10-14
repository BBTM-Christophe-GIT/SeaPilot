import type { LiftingVessel } from '../lifting/liftingModel';
import type { RoleKey } from '../permissions/roles';

export interface MedicalSignatureSnapshot {
  signature_id: number;
  version_number: number;
  signer_person_id: number;
  signer_user_id: string;
  signer_name: string;
  storage_bucket: 'working-time-signatures';
  storage_path: string;
  mime_type: 'image/png';
  file_size_bytes: number;
  sha256: string;
  valid_from: string;
}
export interface MedicalSigner {
  person_id: number | null;
  signer_name: string;
  signature: MedicalSignatureSnapshot | null;
}
export interface MedicalDraft {
  occurred_on: string;
  occurred_time: string;
  patient_name: string;
  injury_illness: string;
  treatment_medicines: string;
  first_aider_name: string;
}
export interface MedicalEntry extends MedicalDraft {
  signature_name: string;
  signature_version_id: number;
  signature_snapshot: MedicalSignatureSnapshot;
  id: number;
  company_id: number;
  vessel_id: number;
  revision: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}
export interface MedicalVessel extends LiftingVessel { can_write: boolean }
export interface MedicalHistory {
  id: number;
  revision: number;
  action: 'created' | 'updated' | 'archived' | 'restored';
  changed_at: string;
  actor_name: string;
  entry: MedicalEntry;
}

export function canAccessMedicalLogbook(roles: RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'capitaine');
}

export function blankMedicalDraft(firstAiderName = ''): MedicalDraft {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return { occurred_on: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    occurred_time: `${pad(now.getHours())}:${pad(now.getMinutes())}`, patient_name: '', injury_illness: '',
    treatment_medicines: '', first_aider_name: firstAiderName };
}

export function validMedicalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateMedicalDraft(draft: MedicalDraft): string | null {
  if (!validMedicalDate(draft.occurred_on)) return 'Renseignez une date valide.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.occurred_time)) return 'Renseignez une heure valide.';
  const fields: [keyof MedicalDraft, string, number][] = [
    ['patient_name', 'Le nom du patient', 160], ['injury_illness', 'La blessure ou maladie', 4000],
    ['treatment_medicines', 'Le traitement ou les médicaments', 4000],
    ['first_aider_name', 'Le nom du secouriste', 160],
  ];
  for (const [key, label, limit] of fields) {
    const value = draft[key];
    if (typeof value !== 'string' || !value.trim()) return `${label} est requis.`;
    if (value.trim().length > limit) return `${label} est limité à ${limit} caractères.`;
  }
  return null;
}

export function normalizedMedicalDraft(draft: MedicalDraft): MedicalDraft {
  return { occurred_on: draft.occurred_on, occurred_time: draft.occurred_time,
    patient_name: draft.patient_name.trim(), injury_illness: draft.injury_illness.trim(),
    treatment_medicines: draft.treatment_medicines.trim(), first_aider_name: draft.first_aider_name.trim(),
    };
}

export function formatMedicalDate(value: string): string {
  return validMedicalDate(value) ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : '—';
}

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
export function medicalEntryMatches(entry: MedicalEntry, query: string, year: string): boolean {
  return (!year || entry.occurred_on.startsWith(`${year}-`)) && (!query.trim() || normalized([
    entry.patient_name, entry.injury_illness, entry.treatment_medicines, entry.first_aider_name,
    entry.signature_name, formatMedicalDate(entry.occurred_on), entry.occurred_time,
  ].join(' ')).includes(normalized(query)));
}
