import type { SupabaseClient } from '@supabase/supabase-js';

export type HrActionKind = 'certificate' | 'medical_visit' | 'training' | 'annual_review';
export type HrActionStatus = 'planned' | 'completed' | 'cancelled';

export interface HrActionRecord {
  id: number;
  personId: number;
  documentId: number | null;
  kind: HrActionKind;
  title: string;
  status: HrActionStatus;
  dueOn: string;
  scheduledOn: string;
  completedOn: string;
  location: string;
  ownerName: string;
  notes: string;
}

export type HrActionInput = Omit<HrActionRecord, 'id'>;

export interface HrReviewAppointment {
  id: number;
  year: number;
  status: string;
  startsAt: string;
  location: string;
  managerValidatedAt: string;
}

/** Read only existing interviews; the dedicated workflow remains authoritative. */
export async function fetchHrReviewAppointments(client: SupabaseClient, personId: number): Promise<HrReviewAppointment[]> {
  const { data, error } = await client.from('annual_reviews')
    .select('id,review_year,status,starts_at,meeting_mode,meeting_location,manager_validated_at')
    .eq('employee_person_id', personId).order('review_year', { ascending: false });
  if (error) throw error;
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id), year: Number(row.review_year), status: String(row.status), startsAt: String(row.starts_at || ''),
    location: row.meeting_mode === 'video' ? 'Visioconférence' : String(row.meeting_location || ''),
    managerValidatedAt: String(row.manager_validated_at || ''),
  }));
}

export const HR_ACTION_KIND_LABELS: Record<HrActionKind, string> = {
  certificate: 'Brevet / certificat', medical_visit: 'Visite médicale',
  training: 'Formation', annual_review: 'Entretien annuel',
};
export const HR_ACTION_STATUS_LABELS: Record<HrActionStatus, string> = {
  planned: 'Planifié', completed: 'Réalisé', cancelled: 'Annulé',
};

export function hrActionToday(date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(date);
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function hrActionIssues(input: HrActionInput, today = hrActionToday()): string[] {
  const issues: string[] = [];
  if (!Number.isSafeInteger(input.personId) || input.personId < 1) issues.push('Choisissez un collaborateur.');
  if (!Object.hasOwn(HR_ACTION_KIND_LABELS, input.kind)) issues.push('Choisissez un type d’action.');
  if (!Object.hasOwn(HR_ACTION_STATUS_LABELS, input.status)) issues.push('Choisissez un état.');
  if (!input.title.trim()) issues.push('Renseignez un intitulé.');
  if (input.title.trim().length > 300) issues.push('Limitez l’intitulé à 300 caractères.');
  for (const value of [input.dueOn, input.scheduledOn, input.completedOn]) {
    if (value && !isDate(value)) issues.push('Saisissez une date valide.');
  }
  if (input.status === 'planned' && !input.scheduledOn) issues.push('Renseignez la date du rendez-vous.');
  if (input.status === 'planned' && !input.location.trim()) issues.push('Renseignez le lieu ou l’organisme.');
  if (input.status === 'completed' && !input.completedOn) issues.push('Renseignez la date de réalisation.');
  if (input.status === 'completed' && input.completedOn > today) issues.push('Une réalisation ne peut pas être datée dans le futur.');
  if (input.documentId !== null && (!Number.isSafeInteger(input.documentId) || input.documentId < 1)) issues.push('Document lié invalide.');
  return [...new Set(issues)];
}

interface HrActionRow {
  id: number; person_id: number; document_id: number | null; kind: HrActionKind;
  title: string; status: HrActionStatus; due_on: string | null; scheduled_on: string | null;
  completed_on: string | null; location: string | null; owner_name: string | null; notes: string | null;
}
const SELECT = 'id,person_id,document_id,kind,title,status,due_on,scheduled_on,completed_on,location,owner_name,notes';

function mapAction(row: HrActionRow): HrActionRecord {
  return { id: row.id, personId: row.person_id, documentId: row.document_id, kind: row.kind,
    title: row.title, status: row.status, dueOn: row.due_on || '', scheduledOn: row.scheduled_on || '',
    completedOn: row.completed_on || '', location: row.location || '', ownerName: row.owner_name || '', notes: row.notes || '' };
}

export async function fetchHrActions(client: SupabaseClient, personId?: number): Promise<HrActionRecord[]> {
  const rows: HrActionRecord[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    let query = client.from('hr_action_plans').select(SELECT).order('id').range(offset, offset + size - 1);
    if (personId !== undefined) query = query.eq('person_id', personId);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data || []) as HrActionRow[];
    rows.push(...page.map(mapAction));
    if (page.length < size) return rows;
  }
}

export async function saveHrAction(client: SupabaseClient, input: HrActionInput, id?: number): Promise<HrActionRecord> {
  const issues = hrActionIssues(input);
  if (issues.length) throw new Error(issues.join(' '));
  const payload = { person_id: input.personId, document_id: input.documentId, kind: input.kind,
    title: input.title.trim(), status: input.status, due_on: input.dueOn || null,
    scheduled_on: input.scheduledOn || null, completed_on: input.status === 'completed' ? input.completedOn : null,
    location: input.location.trim(), owner_name: input.ownerName.trim(), notes: input.notes.trim() };
  const query = id === undefined
    ? client.from('hr_action_plans').insert(payload)
    : client.from('hr_action_plans').update(payload).eq('id', id).eq('person_id', input.personId);
  const { data, error } = await query.select(SELECT).single();
  if (error) throw error;
  return mapAction(data as HrActionRow);
}

export function hrActionIsBooked(action: HrActionRecord, today = hrActionToday()): boolean {
  return action.status === 'planned' && isDate(action.scheduledOn) && action.scheduledOn >= today && Boolean(action.location.trim());
}

export function hrActionIsOverdue(action: HrActionRecord, today = hrActionToday()): boolean {
  if (action.status !== 'planned') return false;
  return Boolean((action.scheduledOn && action.scheduledOn < today) || (action.dueOn && action.dueOn < today));
}
