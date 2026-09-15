import type { SupabaseClient } from '@supabase/supabase-js';
import type { DisciplinaryCase, DisciplinaryLetter } from './disciplinaryModel';

export interface Reviewer { id: string; name: string; function: string; personId: number | null }
export interface Review {
  id: string; case_id: string; author_id: string; author_name: string; kind: 'comment' | 'change';
  target: 'data' | 'letter' | null; field: string | null; before_value: unknown; after_value: unknown;
  comment: string; status: 'pending' | 'accepted' | 'rejected'; created_at: string; decided_at: string | null;
}
export interface WorkflowEvent { id: string; actor_name: string; kind: string; detail: Record<string, string>; created_at: string }
export interface ValidatedLetter { id: string; letter: DisciplinaryLetter; validated_at: string }
export interface Collaboration { letters: ValidatedLetter[]; reviews: Review[]; participants: { user_id: string }[]; events: WorkflowEvent[] }
export const EMPTY_COLLABORATION: Collaboration = { letters: [], reviews: [], participants: [], events: [] };
export const STATUS_LABELS = { draft: 'Brouillon', in_review: 'En relecture', validated: 'Validé' };
export const PROCEDURE_STEPS: Record<string, string> = {
  facts: 'Faits constatés', summons_sent: 'Convocation envoyée', interview: 'Entretien réalisé',
  notification_sent: 'Sanction notifiée', sanction_started: 'Début de la sanction', sanction_ended: 'Fin de la sanction', closed: 'Dossier clôturé',
};
export const FIELD_LABELS: Record<string, string> = {
  employeeName: 'Destinataire', address: 'Adresse', fault: 'Faute', sanction: 'Sanction', reason: 'Motif',
  facts: 'Faits observés', evidence: 'Éléments justificatifs', rules: 'Obligations et consignes applicables',
  factsOn: 'Date des faits', knownOn: 'Date de connaissance des faits', vessel: 'Navire / lieu',
  summonsSentOn: 'Envoi de la convocation', summonsReceivedOn: 'Présentation de la convocation', interviewAt: 'Date de l’entretien',
  interviewPlace: 'Lieu de l’entretien', explanations: 'Explications du collaborateur', notificationOn: 'Date de notification',
  extraHolidays: 'Jours fériés supplémentaires', optionalInterview: 'Entretien prévu', representatives: 'Représentants du personnel',
  advisorAddresses: 'Adresses des conseillers', contractType: 'Contrat', protectedEmployee: 'Salarié protégé',
  sanctionDetails: 'Modalités de la sanction', harmfulIntent: 'Intention de nuire', kind: 'Type de courrier', date: 'Date du courrier', subject: 'Objet', body: 'Corps du courrier',
};
export type WorkflowAction = 'create' | 'save' | 'share' | 'comment' | 'resolve' | 'issuer' | 'validate' | 'procedure' | 'new_letter';
export async function mutateDisciplinaryCase(client: SupabaseClient, record: DisciplinaryCase, action: WorkflowAction, payload: Record<string, unknown> = {}) {
  const { data, error } = action === 'new_letter'
    ? await client.rpc('disciplinary_start_letter', { target_case: record.id, expected_version: record.updated_at })
    : await client.rpc('disciplinary_mutate', { action, target_case: record.id, expected_version: record.updated_at || null, payload });
  if (error) throw error;
  if (!data) throw new Error('Dossier inaccessible. Actualisez la page.');
  window.dispatchEvent(new Event(DISCIPLINARY_NOTIFICATIONS_CHANGED));
  return data as DisciplinaryCase;
}
export async function fetchCollaboration(client: SupabaseClient, id: string): Promise<Collaboration> {
  const [reviews, participants, events, letters] = await Promise.all([
    client.from('disciplinary_reviews').select('*').eq('case_id', id).order('created_at', { ascending: false }),
    client.from('disciplinary_participants').select('user_id').eq('case_id', id),
    client.from('disciplinary_events').select('id,actor_name,kind,detail,created_at').eq('case_id', id).order('created_at', { ascending: false }),
    client.from('disciplinary_validated_letters').select('id,letter,validated_at').eq('case_id', id).order('validated_at', { ascending: false }),
  ]);
  for (const result of [reviews, participants, events, letters]) if (result.error) throw result.error;
  return { letters: letters.data || [], reviews: reviews.data || [], participants: participants.data || [], events: events.data || [] };
}
export const DISCIPLINARY_NOTIFICATIONS_CHANGED = 'seapilot:disciplinary-notifications';
export interface DisciplinaryNotification { id: string; case_id: string; title: string; created_at: string }
export async function fetchDisciplinaryNotifications(client: SupabaseClient): Promise<DisciplinaryNotification[]> {
  const { data, error } = await client.rpc('disciplinary_bell_notifications');
  if (error) throw error;
  return data || [];
}
export async function markDisciplinaryNotificationRead(client: SupabaseClient, id: string) {
  const { error } = await client.from('disciplinary_notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
