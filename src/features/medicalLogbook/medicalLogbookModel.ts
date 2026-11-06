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
export interface MedicalMedicationChoice {
  item_id: number;
  designation: string;
  brand: string;
  lot_number: string;
  stock_unit: string;
  strength: string;
  package_size: number | null;
  stock_quantity: number | null;
}
export interface MedicalMedicationUse {
  item_id: number;
  quantity: number;
  unit: 'unit' | 'package';
}
export interface MedicalMedicationSnapshot extends MedicalMedicationChoice, MedicalMedicationUse {
  stock_quantity: number;
}

export interface MedicalDraft {
  occurred_on: string;
  occurred_time: string;
  patient_name: string;
  injury_illness: string;
  treatment_medicines: string;
  medications?: MedicalMedicationUse[];
  create_request_id?: string;
  first_aider_name: string;
}
export interface MedicalEntry extends MedicalDraft {
  medications?: MedicalMedicationSnapshot[];
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

export function blankMedicalDraft(firstAiderName = ''): Omit<MedicalDraft, 'medications'> {
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

export function validMedicalMedicationUses(medications: MedicalMedicationUse[]): boolean {
  return medications.length <= 50 && new Set(medications.map((item) => item.item_id)).size === medications.length
    && !medications.some((item) => !Number.isSafeInteger(item.item_id) || item.item_id < 1
      || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 1_000_000
      || Math.abs(item.quantity * 1000 - Math.round(item.quantity * 1000)) > 1e-7 || !['unit', 'package'].includes(item.unit)
      || (item.unit === 'package' && !Number.isSafeInteger(item.quantity)));
}

export function validateMedicalDraft(draft: MedicalDraft): string | null {
  if (!validMedicalDate(draft.occurred_on)) return 'Renseignez une date valide.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.occurred_time)) return 'Renseignez une heure valide.';
  const medications = draft.medications ?? [];
  if (!validMedicalMedicationUses(medications)) {
    return 'Indiquez une quantité valide pour chaque article. Les boîtes sont comptées à l’unité.';
  }
  const fields = [
    ['patient_name', 'Le nom du patient', 160], ['injury_illness', 'La blessure ou maladie', 4000],
    ['treatment_medicines', 'Le traitement ou les médicaments', 4000],
    ['first_aider_name', 'Le nom du secouriste', 160],
  ] as const;
  for (const [key, label, limit] of fields) {
    const value = draft[key];
    if (typeof value !== 'string' || (!value.trim() && !(key === 'treatment_medicines' && medications.length))) return `${label} est requis.`;
    if (value.trim().length > limit) return `${label} est limité à ${limit} caractères.`;
  }
  return null;
}

export function normalizedMedicalDraft(draft: MedicalDraft): MedicalDraft {
  return { occurred_on: draft.occurred_on, occurred_time: draft.occurred_time,
    patient_name: draft.patient_name.trim(), injury_illness: draft.injury_illness.trim(),
    treatment_medicines: draft.treatment_medicines.trim(), first_aider_name: draft.first_aider_name.trim(),
    ...(draft.medications ? { medications: draft.medications.map(({ item_id, quantity, unit }) => ({ item_id, quantity, unit })) } : {}),
    };
}

export function medicalMedicationLabel(item: MedicalMedicationChoice): string {
  const label = item.brand && item.brand !== item.designation ? `${item.designation} (${item.brand})` : item.designation;
  return [label, item.strength, item.lot_number ? `lot ${item.lot_number}` : ''].filter(Boolean).join(' · ');
}

const formatQuantity = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
export function medicalTreatmentText(entry: Pick<MedicalEntry, 'medications' | 'treatment_medicines'>): string {
  return [entry.treatment_medicines, ...(entry.medications ?? []).map((item) => {
    const unit = item.unit === 'package'
      ? `${item.quantity === 1 ? 'boîte' : 'boîtes'} de ${formatQuantity.format(item.package_size ?? 0)} ${item.stock_unit}`
      : item.stock_unit;
    return `${medicalMedicationLabel(item)} — ${formatQuantity.format(item.quantity)} ${unit}`;
  })].filter(Boolean).join('\n');
}

export function formatMedicalDate(value: string): string {
  return validMedicalDate(value) ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : '—';
}

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
export function medicalEntryMatches(entry: MedicalEntry, query: string, year: string): boolean {
  return (!year || entry.occurred_on.startsWith(`${year}-`)) && (!query.trim() || normalized([
    entry.patient_name, entry.injury_illness, medicalTreatmentText(entry), entry.first_aider_name,
    entry.signature_name, formatMedicalDate(entry.occurred_on), entry.occurred_time,
  ].join(' ')).includes(normalized(query)));
}
