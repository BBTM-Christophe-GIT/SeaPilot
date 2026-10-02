import { isPlanningDate } from '../planning/planningDates';

export interface QhsePolicySettings { publicationId: number | null; documentUrl: string; revision: number; updatedAt: string }
export interface QhsePolicyProcess { id: string; name: string; description: string; position: number; archived: boolean; revision: number; updatedAt: string }
export interface QhsePolicyObjective {
  id: string; processId: string; title: string; description: string; ownerLabel: string; dueOn: string | null;
  ownerKind: QhsePolicyOwnerKind; ownerPersonId: number | null; ownerVesselId: number | null;
  progress: number; archived: boolean; revision: number; createdAt: string; updatedAt: string;
}
export interface QhsePolicyObjectiveUpdate {
  id: string; objectiveId: string; kind: 'initial' | 'progress'; progress: number; occurredOn: string;
  note: string; actorName: string; createdAt: string;
  ownerLabel: string;
}
export type QhsePolicyOwnerKind = 'person' | 'vessel' | 'office' | null;
export interface QhsePolicyOwnerOptions { people: Array<{ id: number; label: string }>; vessels: Array<{ id: number; label: string; lengthOverall?: string | number | null }> }
export interface QhsePolicyAttachment { id: string; objectiveId: string; updateId: string; fileName: string; mimeType: string; sizeBytes: number; storageBucket: string; storagePath: string; createdAt: string }
export interface QhsePolicySnapshot {
  settings: QhsePolicySettings | null; processes: QhsePolicyProcess[]; objectives: QhsePolicyObjective[];
  updates: QhsePolicyObjectiveUpdate[]; attachments: QhsePolicyAttachment[]; canEdit: boolean;
}
export interface QhsePolicyProcessDraft { id?: string | null; name: string; description?: string; position?: number; expectedRevision?: number | null }
export interface QhsePolicyObjectiveDraft {
  id?: string | null; processId: string; title: string; description?: string; ownerLabel?: string;
  ownerKind?: QhsePolicyOwnerKind; ownerPersonId?: number | null; ownerVesselId?: number | null;
  dueOn?: string | null; initialProgress?: number | null; expectedRevision?: number | null;
}
export interface QhsePolicyObjectiveUpdateDraft { objectiveId: string; progress: number; occurredOn: string; note: string; expectedRevision: number }
export interface QhsePolicySettingsDraft { publicationId: number | null; documentUrl?: string; expectedRevision?: number | null }

export function isQhsePolicyId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function revision(value: number | null | undefined, required: boolean) {
  if ((value == null && required) || (value != null && (!Number.isSafeInteger(value) || value < 1))) throw new Error('Actualisez cet élément avant de le modifier.');
}
function field(value: string | undefined, maximum: number, required = false): string {
  const result = (value || '').trim();
  if (result.length > maximum || (required && !result)) throw new Error(`Renseignez un texte ${required ? 'non vide ' : ''}de ${maximum} caractères au maximum.`);
  return result;
}
export function validateQhsePolicyProgress(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 100 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) throw new Error('Le pourcentage doit être compris entre 0 et 100, avec deux décimales au maximum.');
  return value;
}
export function todayQhsePolicyDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map((part) => parts.find((item) => item.type === part)!.value).join('-');
}
export function validateQhsePolicyProcessDraft(draft: QhsePolicyProcessDraft) {
  const id = draft.id || null;
  if (id && !isQhsePolicyId(id)) throw new Error('Processus invalide.');
  revision(draft.expectedRevision, !!id);
  const position = draft.position ?? 0;
  if (!Number.isSafeInteger(position) || position < 0 || position > 100000) throw new Error('L’ordre du processus est invalide.');
  return { id, name: field(draft.name, 200, true), description: field(draft.description, 5000), position, expectedRevision: draft.expectedRevision ?? null };
}
export function validateQhsePolicyObjectiveDraft(draft: QhsePolicyObjectiveDraft) {
  const id = draft.id || null;
  if ((id && !isQhsePolicyId(id)) || !isQhsePolicyId(draft.processId)) throw new Error('Objectif ou processus invalide.');
  revision(draft.expectedRevision, !!id);
  const dueOn = draft.dueOn || null;
  if (dueOn && (!isPlanningDate(dueOn) || dueOn < '1900-01-01' || dueOn > '2100-12-31')) throw new Error('La date d’échéance est invalide.');
  if (id && draft.initialProgress != null) throw new Error('Modifiez le pourcentage en ajoutant un suivi à l’historique.');
  const initialProgress = id ? null : validateQhsePolicyProgress(draft.initialProgress ?? 0);
  const ownerKind = draft.ownerKind ?? null;
  const ownerPersonId = draft.ownerPersonId ?? null;
  const ownerVesselId = draft.ownerVesselId ?? null;
  const ownerLabel = field(draft.ownerLabel, 200, ownerKind === 'office');
  const positiveId = (value: number | null) => value !== null && Number.isSafeInteger(value) && value > 0;
  if ((!id && !ownerKind) || ![null, 'person', 'vessel', 'office'].includes(ownerKind)
    || (ownerKind === 'person' && (!positiveId(ownerPersonId) || ownerVesselId !== null))
    || (ownerKind === 'vessel' && (!positiveId(ownerVesselId) || ownerPersonId !== null))
    || ((ownerKind === null || ownerKind === 'office') && (ownerPersonId !== null || ownerVesselId !== null))) throw new Error('Choisissez un responsable parmi le personnel en poste, les navires ou un bureau.');
  return { id, processId: draft.processId, title: field(draft.title, 250, true), description: field(draft.description, 10000), ownerLabel, ownerKind, ownerPersonId, ownerVesselId, dueOn, initialProgress, expectedRevision: draft.expectedRevision ?? null };
}
export function validateQhsePolicyObjectiveUpdateDraft(draft: QhsePolicyObjectiveUpdateDraft, today = todayQhsePolicyDate()) {
  if (!isQhsePolicyId(draft.objectiveId)) throw new Error('Objectif invalide.');
  revision(draft.expectedRevision, true);
  if (!isPlanningDate(draft.occurredOn) || draft.occurredOn < '1900-01-01' || draft.occurredOn > today) throw new Error('La date de suivi doit être valide et ne pas être dans le futur.');
  return { ...draft, progress: validateQhsePolicyProgress(draft.progress), note: field(draft.note, 10000, true) };
}
export function validateQhsePolicySettingsDraft(draft: QhsePolicySettingsDraft) {
  const documentUrl = (draft.documentUrl || '').trim();
  if (draft.publicationId !== null && (!Number.isSafeInteger(draft.publicationId) || draft.publicationId <= 0)) throw new Error('Publication invalide.');
  if (documentUrl) throw new Error('Choisissez un fichier PDF publié dans Procédures.');
  revision(draft.expectedRevision, false);
  return { publicationId: draft.publicationId, documentUrl, expectedRevision: draft.expectedRevision ?? null };
}
