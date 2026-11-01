import {
  buildHumanResourcesDashboard,
  formatPersonName,
  isHrDocumentRenewalDue,
  isHrDocumentUrgent,
  isPersonEmployedOn,
  isPersonMedicalVisitRequired,
  type HrDocumentRecord,
  type PersonRecord,
} from '../humanResources/peopleQueries';
import type { HrActionRecord } from '../humanResources/hrActionPlanning';
import { derivePurchaseRequestStage, isPurchaseRequestRejected } from '../purchaseRequests/purchaseRequestQueries';
import { getAnnualReviewDueDate } from '../procedures/procedureReview';

export type PerformanceProcessKey = 'humanResources' | 'purchases' | 'internalAudits' | 'fleet' | 'procedures'
  | 'chemicals' | 'emergencyExercises' | 'lsa' | 'pharmacy' | 'lifting' | 'medicalLogbook';
export type PerformanceTaskState = 'overdue' | 'unplanned' | 'in_progress' | 'planned';
export interface ProcessPerformanceTask {
  id: string;
  title: string;
  context: string;
  state: PerformanceTaskState;
  dueOn: string;
  scheduledOn: string;
  location: string;
  to: string;
}
export interface ProcessPerformanceCriterion {
  id: string;
  label: string;
  weight: number;
  score: number | null;
  detail: string;
}
export interface ProcessPerformance {
  key: PerformanceProcessKey;
  label: string;
  shortLabel: string;
  to: string;
  score: number | null;
  summary: string;
  criteria: ProcessPerformanceCriterion[];
  tasks: ProcessPerformanceTask[];
  unavailableSources: string[];
  scopeLabel?: string;
}
export interface ProcessPerformanceOptions {
  includeReviews?: boolean;
  includeAnnualAuditCycles?: boolean;
  includeMedical?: boolean;
  includeDocuments?: boolean;
  /** Only accessible interview participants may be evaluated when RLS hides the rest of a captain's campaign. */
  reviewPersonIds?: number[];
}
export interface PerformanceReview {
  id: number;
  employee_person_id: number;
  employee_name_snapshot: string;
  review_year: number;
  status: string;
  starts_at: string;
  due_on: string | null;
  meeting_location: string | null;
  meeting_mode: string | null;
  video_url: string | null;
  manager_validated_at: string | null;
}
export interface PerformancePurchase {
  id: number;
  request_number: string | null;
  title: string;
  status: string | null;
  approval_status: string | null;
  requested_on: string | null;
  ordered_on: string | null;
  expected_delivery_on: string | null;
  received_on: string | null;
  urgent: boolean | null;
  vessel_name: string | null;
  owner_name: string | null;
  vessel_id?: number | null;
}
export interface PerformanceAuditSite { id: string; name: string; anniversary_on: string | null; vessel_id?: number | null }
export interface PerformanceAudit {
  id: string;
  site_id: string;
  year: number;
  status: string;
  planned_on: string;
  performed_on: string | null;
}
export interface PerformanceFinding { id: string; audit_id: string; description: string; due_on: string; status: string }
export interface PerformanceFleetDocument {
  id: number;
  vessel_name: string | null;
  document_title: string | null;
  title: string | null;
  status: string | null;
  expires_on: string | null;
  planned_on: string | null;
  is_active_fleet: boolean | null;
  vessel_id?: number | null;
}
export interface PerformanceProcedure {
  id: number;
  title: string;
  procedure_code: string | null;
  annual_review: boolean | null;
  diffusion_on: string | null;
  status: string | null;
  vessel_name?: string | null;
}
// null means the source failed. An empty array means it was read successfully.
export interface ProcessPerformanceSources {
  people: PersonRecord[] | null;
  documents: HrDocumentRecord[] | null;
  actions: HrActionRecord[] | null;
  reviews: PerformanceReview[] | null;
  purchases: PerformancePurchase[] | null;
  auditSites: PerformanceAuditSite[] | null;
  audits: PerformanceAudit[] | null;
  findings: PerformanceFinding[] | null;
  fleetDocuments: PerformanceFleetDocument[] | null;
  procedures: PerformanceProcedure[] | null;
}

export const PERFORMANCE_TASK_STATE_LABELS: Record<PerformanceTaskState, string> = {
  overdue: 'En retard', unplanned: 'À planifier', in_progress: 'En traitement', planned: 'Planifié',
};
const DAY = 86_400_000;
const normalized = (value: string | null) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const ratio = (value: number, total: number): number | null => total ? Math.round(100 * value / total) : null;
const average = (values: number[]): number | null => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
export function performanceToday(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date.slice(0, 10)}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY);
}
function isPast(date: string, today: string): boolean { return Boolean(date && date.slice(0, 10) < today); }
function scheduledAction(action: HrActionRecord, today: string, dueOn = ''): boolean {
  return action.status === 'planned' && Boolean(action.location.trim()) && action.scheduledOn >= today
    && (!dueOn || action.scheduledOn <= dueOn);
}
function completedAction(action: HrActionRecord, today: string): boolean {
  return action.status === 'completed' && Boolean(action.completedOn) && action.completedOn <= today;
}
function hrLink(personId: number | null, documentId?: number): string {
  const query = new URLSearchParams({ actions: '1' });
  if (personId !== null) query.set('person', String(personId));
  if (documentId !== undefined) query.set('document', String(documentId));
  return `/modules/humanResources?${query}`;
}
function finish(process: Omit<ProcessPerformance, 'score'>): ProcessPerformance {
  const included = process.criteria.filter((criterion) => criterion.score !== null);
  const weight = included.reduce((sum, criterion) => sum + criterion.weight, 0);
  const score = process.unavailableSources.length || !weight ? null
    : Math.round(included.reduce((sum, criterion) => sum + criterion.score! * criterion.weight, 0) / weight);
  const order: Record<PerformanceTaskState, number> = { overdue: 0, unplanned: 1, in_progress: 2, planned: 3 };
  return { ...process, score, tasks: process.unavailableSources.length ? [] : [...process.tasks].sort((a, b) => order[a.state] - order[b.state]
    || (a.dueOn || '9999').localeCompare(b.dueOn || '9999') || a.title.localeCompare(b.title, 'fr')) };
}
function effectiveHrDocument(document: HrDocumentRecord, today: string): HrDocumentRecord {
  if (document.status === 'missing' || !document.expiresOn) return document;
  const remaining = daysUntil(document.expiresOn, today);
  return { ...document, status: remaining < 0 ? 'expired' : remaining <= 90 ? 'renew_due' : document.status };
}

function humanResources(sources: ProcessPerformanceSources, today: string, options: ProcessPerformanceOptions): ProcessPerformance {
  const year = Number(today.slice(0, 4));
  const unavailableSources = [sources.people === null ? 'Collaborateurs' : '', options.includeDocuments !== false && sources.documents === null ? 'Documents RH' : '',
    options.includeDocuments !== false && sources.actions === null ? 'Planification RH' : '', options.includeReviews !== false && sources.reviews === null ? 'Entretiens' : ''].filter(Boolean);
  const people = (sources.people || []).filter((person) => isPersonEmployedOn(person, today));
  const ids = new Set(people.map((person) => person.id));
  const names = new Map(people.map((person) => [person.id, formatPersonName(person)]));
  const documents = (options.includeDocuments === false ? [] : sources.documents || []).filter((document) => document.personId !== null && ids.has(document.personId)
    && (options.includeMedical !== false || document.categoryKey !== 'medical_visit'))
    .map((document) => effectiveHrDocument(document, today));
  const actions = (options.includeDocuments === false ? [] : sources.actions || []).filter((action) => ids.has(action.personId) && action.status !== 'cancelled'
    && (options.includeMedical !== false || action.kind !== 'medical_visit'));
  const obligations = documents.filter((document) => !['administrative', 'annual_review'].includes(document.categoryKey));
  const dueDocuments = obligations.filter((document) => isHrDocumentRenewalDue(document) || isHrDocumentUrgent(document) || document.medicalUnfit);
  const certificateDocuments = obligations.filter((document) => document.categoryKey !== 'medical_visit');
  const tasks: ProcessPerformanceTask[] = [];
  let bookedDocuments = 0;
  for (const document of dueDocuments) {
    const relevant = actions.filter((action) => action.documentId === document.id);
    const booking = relevant.find((action) => scheduledAction(action, today, document.expiresOn));
    const appointment = booking || relevant.filter((action) => action.status === 'planned').sort((a, b) => b.scheduledOn.localeCompare(a.scheduledOn))[0];
    if (booking) bookedDocuments += 1;
    const expired = isHrDocumentUrgent(document) || document.medicalUnfit;
    tasks.push({ id: `hr-document-${document.id}`, title: document.title,
      context: names.get(document.personId!) || document.personName,
      state: expired || Boolean(appointment && isPast(appointment.scheduledOn, today)) ? 'overdue' : booking ? 'planned' : 'unplanned', dueOn: document.expiresOn,
      scheduledOn: appointment?.scheduledOn || '', location: appointment?.location || '', to: hrLink(document.personId, document.id) });
  }
  for (const person of options.includeMedical === false || options.includeDocuments === false ? [] : people.filter(isPersonMedicalVisitRequired)) {
    if (documents.some((document) => document.personId === person.id && document.categoryKey === 'medical_visit')) continue;
    tasks.push({ id: `hr-missing-medical-${person.id}`, title: 'Visite médicale non renseignée', context: formatPersonName(person),
      state: 'overdue', dueOn: '', scheduledOn: '', location: '', to: hrLink(person.id) });
  }
  // Training actions without a document remain actionable and contribute to planning.
  const independentActions = actions.filter((action) => action.kind !== 'annual_review' && action.documentId === null
    && !completedAction(action, today));
  const relevantActions = independentActions.filter((action) => !action.dueOn || daysUntil(action.dueOn, today) <= 90);
  for (const action of relevantActions) {
    tasks.push({ id: `hr-action-${action.id}`, title: action.title, context: names.get(action.personId) || '',
      state: isPast(action.dueOn, today) || isPast(action.scheduledOn, today) ? 'overdue'
        : scheduledAction(action, today, action.dueOn) ? 'planned' : 'unplanned',
      dueOn: action.dueOn, scheduledOn: action.scheduledOn, location: action.location, to: hrLink(action.personId) });
  }
  const reviews = (sources.reviews || []).filter((review) => review.review_year === year && ids.has(review.employee_person_id));
  const reviewPeople = options.reviewPersonIds === undefined ? people : people.filter((person) => options.reviewPersonIds!.includes(person.id));
  let completedReviews = 0;
  let plannedReviews = 0;
  for (const person of options.includeReviews === false ? [] : reviewPeople) {
    const review = reviews.find((item) => item.employee_person_id === person.id);
    const reviewActions = actions.filter((action) => action.personId === person.id && action.kind === 'annual_review');
    const doneAction = reviewActions.find((action) => completedAction(action, today) && action.completedOn.startsWith(`${year}-`));
    const validated = review && Boolean(review.starts_at) && review.starts_at.slice(0, 10) <= today
      && ((Boolean(review.manager_validated_at) && review.manager_validated_at!.slice(0, 10) <= today) || review.status === 'archived');
    const completed = Boolean(validated || doneAction);
    const annualDocument = documents.find((document) => document.personId === person.id && document.categoryKey === 'annual_review'
      && document.expiresOn.startsWith(`${year}-`));
    const dueOn = review?.due_on || annualDocument?.expiresOn || `${year}-12-31`;
    const plannedAction = reviewActions.find((action) => scheduledAction(action, today, dueOn) && action.scheduledOn.startsWith(`${year}-`));
    const appointment = review && ['scheduled', 'collaborator_submitted', 'awaiting_signature'].includes(review.status)
      && review.starts_at.slice(0, 10) >= today && review.starts_at.startsWith(`${year}-`)
      && Boolean(review.meeting_location?.trim() || review.video_url?.trim() || review.meeting_mode === 'video');
    const booked = appointment && review!.starts_at.slice(0, 10) <= dueOn;
    if (completed) { completedReviews += 1; continue; }
    if (booked || plannedAction) plannedReviews += 1;
    const scheduledOn = appointment ? review!.starts_at.slice(0, 10) : plannedAction?.scheduledOn || '';
    tasks.push({ id: `hr-review-${person.id}`, title: `Entretien ${year}`, context: formatPersonName(person),
      state: isPast(dueOn, today) || Boolean(review && isPast(review.starts_at, today)) ? 'overdue'
        : booked || plannedAction ? 'planned' : 'unplanned', dueOn, scheduledOn,
      location: appointment ? review!.meeting_location || 'Visioconférence' : plannedAction?.location || '',
      to: review ? `/modules/annualReviews?review=${review.id}&person=${person.id}` : `/modules/annualReviews?person=${person.id}` });
  }
  const dashboard = buildHumanResourcesDashboard(people, documents, today);
  const planningTotal = dueDocuments.length + relevantActions.length;
  const planningCovered = bookedDocuments + relevantActions.filter((action) => scheduledAction(action, today, action.dueOn)).length;
  const medicalAvailable = sources.people !== null && sources.documents !== null;
  const planningAvailable = medicalAvailable && sources.actions !== null;
  const reviewsAvailable = sources.people !== null && sources.reviews !== null && (options.includeDocuments === false || sources.actions !== null);
  return finish({ key: 'humanResources', label: 'Ressources humaines', shortLabel: 'RH', to: '/modules/humanResources',
    summary: `${options.includeReviews === false || !reviewPeople.length ? '' : `${options.reviewPersonIds === undefined ? '' : 'Entretiens accessibles : '}${completedReviews} entretien${completedReviews > 1 ? 's' : ''} réalisé${completedReviews > 1 ? 's' : ''} · ${plannedReviews} planifié${plannedReviews > 1 ? 's' : ''} · `}${options.includeDocuments === false ? 'Suivis autorisés uniquement' : `${dueDocuments.length} document${dueDocuments.length > 1 ? 's' : ''} à traiter`}`,
    unavailableSources, tasks,
    criteria: [
      { id: 'medical', label: 'Conformité médicale', weight: 30, score: options.includeMedical !== false && medicalAvailable && dashboard.metrics.seafarerPeople ? dashboard.metrics.medicalComplianceRate : null,
        detail: 'Visite valide et aptitude pour les collaborateurs navigants. Une visite réservée ne remplace pas la conformité.' },
      { id: 'certificates', label: 'Brevets et certificats', weight: 25,
        score: medicalAvailable ? ratio(certificateDocuments.filter((document) => !isHrDocumentRenewalDue(document) && !isHrDocumentUrgent(document)).length, certificateDocuments.length) : null,
        detail: `${certificateDocuments.filter((document) => isHrDocumentRenewalDue(document) || isHrDocumentUrgent(document)).length} à régulariser sur ${certificateDocuments.length} documents ; horizon de 90 jours.` },
      { id: 'planning', label: 'Actions prises en charge', weight: 20, score: planningAvailable ? ratio(planningCovered, planningTotal) : null,
        detail: `${planningCovered} réservation${planningCovered > 1 ? 's' : ''} avec date et lieu avant échéance / ${planningTotal} action${planningTotal > 1 ? 's' : ''} à traiter. Un rendez-vous passé doit être replanifié ou terminé.` },
      { id: 'reviews', label: options.reviewPersonIds === undefined ? `Entretiens ${year}` : `Entretiens accessibles ${year}`, weight: 25, score: options.includeReviews !== false && reviewsAvailable ? ratio(completedReviews + plannedReviews * .5, reviewPeople.length) : null,
        detail: `${options.reviewPersonIds === undefined ? '' : `${reviewPeople.length} suivi(s) accessible(s) ; les entretiens non visibles sont exclus. `}${completedReviews} réalisé${completedReviews > 1 ? 's' : ''} (100 %), ${plannedReviews} planifié${plannedReviews > 1 ? 's' : ''} (50 %), ${Math.max(0, reviewPeople.length - completedReviews - plannedReviews)} à organiser (0 %). Réalisation prouvée par validation du compte rendu ou action terminée.` },
    ].filter((criterion) => (criterion.id !== 'reviews' || options.includeReviews !== false && (options.reviewPersonIds === undefined || reviewPeople.length > 0))
      && (criterion.id !== 'medical' || options.includeMedical !== false && options.includeDocuments !== false)
      && (criterion.id !== 'planning' || options.includeDocuments !== false)
      && (criterion.id !== 'certificates' || options.includeDocuments !== false)) });
}

function purchases(sources: ProcessPerformanceSources, today: string): ProcessPerformance {
  const year = today.slice(0, 4);
  const tasks: ProcessPerformanceTask[] = [];
  let unprocessed = 0;
  let processing = 0;
  const scores: number[] = [];
  for (const row of sources.purchases || []) {
    const stage = derivePurchaseRequestStage({ status: row.status || '', expectedDeliveryOn: row.expected_delivery_on || '',
      orderedOn: row.ordered_on || '', receivedOn: row.received_on || '' });
    const rejected = isPurchaseRequestRejected({ approvalStatus: row.approval_status || '' });
    const closed = stage === 'completed' || rejected;
    if (closed && !(row.requested_on || '').startsWith(`${year}-`)) continue;
    const late = !closed && isPast(row.expected_delivery_on || '', today);
    scores.push(closed ? 100 : late ? 0 : stage === 'to_process' ? 0 : stage === 'receiving' ? 75 : 60);
    if (closed) continue;
    if (stage === 'to_process') unprocessed += 1; else processing += 1;
    tasks.push({ id: `purchase-${row.id}`, title: `${row.request_number ? `#${row.request_number} · ` : ''}${row.title}`,
      context: [row.vessel_name, row.owner_name].filter(Boolean).join(' · '),
      state: late ? 'overdue' : stage === 'to_process' ? 'unplanned' : 'in_progress',
      dueOn: row.expected_delivery_on || '', scheduledOn: stage !== 'to_process' ? row.expected_delivery_on || '' : '',
      location: row.vessel_name || '', to: `/modules/purchaseRequests?requestId=${row.id}&focus=attention` });
  }
  return finish({ key: 'purchases', label: 'Demandes d’achats', shortLabel: 'Achats', to: '/modules/purchaseRequests?focus=attention',
    summary: `${unprocessed} à prendre en charge · ${processing} en traitement`, tasks,
    unavailableSources: sources.purchases === null ? ['Demandes d’achats'] : [],
    criteria: [{ id: 'workflow', label: 'Avancement des demandes', weight: 100, score: average(scores),
      detail: `Demandes ouvertes et demandes clôturées créées en ${year}. Clôturée/refusée : 100 %, réception attendue : 75 %, commandée : 60 %, sans traitement ou livraison en retard : 0 %. Ce score mesure le traitement, pas un délai contractuel.` }] });
}

function auditDue(site: PerformanceAuditSite, year: number): string {
  if (!site.anniversary_on) return `${year}-12-31`;
  const month = Number(site.anniversary_on.slice(5, 7));
  const day = Math.min(Number(site.anniversary_on.slice(8, 10)), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function internalAudits(sources: ProcessPerformanceSources, today: string, options: ProcessPerformanceOptions): ProcessPerformance {
  const year = Number(today.slice(0, 4));
  const tasks: ProcessPerformanceTask[] = [];
  const sites = sources.auditSites || [];
  const audits = sources.audits || [];
  let completed = 0;
  let planned = 0;
  const cycleScores = (options.includeAnnualAuditCycles === false ? [] : sites).map((site) => {
    const audit = audits.find((item) => item.site_id === site.id && item.year === year);
    const dueOn = auditDue(site, year);
    if (audit?.status === 'completed' && audit.performed_on && audit.performed_on <= today
      && audit.performed_on.startsWith(`${year}-`)) { completed += 1; return 100; }
    const booked = Boolean(audit?.planned_on && audit.planned_on >= today && audit.planned_on <= dueOn
      && audit.planned_on.startsWith(`${year}-`));
    if (booked) planned += 1;
    tasks.push({ id: `audit-cycle-${site.id}`, title: `Audit ISM ${year}`, context: site.name,
      state: isPast(dueOn, today) || Boolean(audit?.planned_on && isPast(audit.planned_on, today)) ? 'overdue' : booked ? 'planned' : 'unplanned',
      dueOn, scheduledOn: audit?.planned_on || '', location: site.name,
      to: `/modules/internalAudits?site=${encodeURIComponent(site.id)}${audit ? `&audit=${encodeURIComponent(audit.id)}` : ''}&tab=planning&year=${year}` });
    return booked ? 50 : audit?.status === 'in_progress' && !isPast(dueOn, today) ? 25 : 0;
  });
  const findingScores = (sources.findings || []).filter((finding) => !['resolved', 'closed'].includes(finding.status)
    || audits.some((audit) => audit.id === finding.audit_id && audit.year === year)).map((finding) => {
    if (['resolved', 'closed'].includes(finding.status)) return 100;
    const audit = audits.find((item) => item.id === finding.audit_id);
    const site = sites.find((item) => item.id === audit?.site_id);
    const late = isPast(finding.due_on, today);
    tasks.push({ id: `audit-finding-${finding.id}`, title: finding.description,
      context: site?.name || 'Écart d’audit', state: late ? 'overdue' : finding.status === 'in_progress' ? 'in_progress' : 'unplanned',
      dueOn: finding.due_on, scheduledOn: '', location: site?.name || '',
      to: `/modules/internalAudits?audit=${encodeURIComponent(finding.audit_id)}&finding=${encodeURIComponent(finding.id)}&tab=findings` });
    return late ? 0 : finding.status === 'in_progress' ? 50 : 0;
  });
  return finish({ key: 'internalAudits', label: 'Audits ISM internes', shortLabel: 'Audits ISM', to: `/modules/internalAudits?tab=planning&year=${year}`,
    summary: options.includeAnnualAuditCycles === false ? `${tasks.length} écart${tasks.length > 1 ? 's' : ''} attribué${tasks.length > 1 ? 's' : ''} à suivre` : `${completed} réalisé${completed > 1 ? 's' : ''} · ${planned} planifié${planned > 1 ? 's' : ''} · ${sites.length} site${sites.length > 1 ? 's' : ''}`,
    unavailableSources: [sources.auditSites === null ? 'Sites ISM' : '', sources.audits === null ? 'Audits ISM' : '', sources.findings === null ? 'Écarts ISM' : ''].filter(Boolean), tasks,
    criteria: [
      { id: 'cycles', label: `Campagne ${year}`, weight: 75, score: average(cycleScores),
        detail: 'Un audit attendu par site et par année. Réalisé : 100 %, planifié avant échéance : 50 %, en cours : 25 %, non planifié/en retard : 0 %. La date anniversaire du site fixe l’échéance lorsqu’elle est renseignée.' },
      { id: 'findings', label: 'Traitement des écarts', weight: 25, score: findingScores.length ? average(findingScores) : null,
        detail: 'Écart résolu/clôturé : 100 %, en traitement avant échéance : 50 %, ouvert ou en retard : 0 %. Aucun écart : critère non applicable.' },
    ].filter((criterion) => criterion.id !== 'cycles' || options.includeAnnualAuditCycles !== false) });
}

function fleet(sources: ProcessPerformanceSources, today: string): ProcessPerformance {
  const tasks: ProcessPerformanceTask[] = [];
  const documents = (sources.fleetDocuments || []).filter((row) => row.is_active_fleet !== false);
  const scores = documents.map((row) => {
    const expiry = row.expires_on || '';
    const status = normalized(row.status);
    const missing = /missing|manquant|pending|a valider/.test(status) || (!expiry && !/^(valid|valide)$/.test(status));
    const expired = isPast(expiry, today) || /expired|echu|expire/.test(status);
    const due = Boolean(expiry && daysUntil(expiry, today) <= 90) || /renew|revalid/.test(status);
    if (!missing && !expired && !due) return 100;
    const booked = Boolean(row.planned_on && row.planned_on >= today && (!expiry || row.planned_on <= expiry));
    tasks.push({ id: `fleet-document-${row.id}`, title: row.document_title || row.title || 'Document flotte',
      context: row.vessel_name || 'Navire', state: expired || missing ? 'overdue' : booked ? 'planned' : 'unplanned',
      dueOn: expiry, scheduledOn: row.planned_on || '', location: row.vessel_name || '',
      to: `/modules/certificates?certificate=${row.id}` });
    return expired || missing ? 0 : booked ? 65 : 25;
  });
  return finish({ key: 'fleet', label: 'Conformité de la flotte', shortLabel: 'Flotte', to: '/modules/certificates',
    summary: `${tasks.length} document${tasks.length > 1 ? 's' : ''} à suivre · ${documents.length} contrôlé${documents.length > 1 ? 's' : ''}`, tasks,
    unavailableSources: sources.fleetDocuments === null ? ['Documents flotte'] : [],
    criteria: [{ id: 'documents', label: 'Validité et anticipation', weight: 100, score: average(scores),
      detail: 'Documents de la flotte active. Valide au-delà de 90 jours : 100 %, renouvellement réservé à temps : 65 %, à renouveler sans rendez-vous : 25 %, échu/manquant/à valider : 0 %.' }] });
}

function procedures(sources: ProcessPerformanceSources, today: string): ProcessPerformance {
  const rows = (sources.procedures || []).filter((row) => row.annual_review && !normalized(row.status).includes('archiv'));
  const tasks: ProcessPerformanceTask[] = [];
  const scores = rows.map((row) => {
    const dueOn = getAnnualReviewDueDate(row.diffusion_on || '');
    if (dueOn && daysUntil(dueOn, today) > 90) return 100;
    tasks.push({ id: `procedure-${row.id}`, title: [row.procedure_code, row.title].filter(Boolean).join(' · '),
      context: 'Revue annuelle QHSE', state: isPast(dueOn, today) ? 'overdue' : 'unplanned', dueOn, scheduledOn: '', location: '',
      to: '/modules/procedures' });
    return !dueOn || isPast(dueOn, today) ? 0 : 50;
  });
  return finish({ key: 'procedures', label: 'Procédures QHSE', shortLabel: 'QHSE', to: '/modules/procedures',
    summary: `${tasks.length} revue${tasks.length > 1 ? 's' : ''} à anticiper · ${rows.length} procédure${rows.length > 1 ? 's' : ''}`, tasks,
    unavailableSources: sources.procedures === null ? ['Revues QHSE'] : [],
    criteria: [{ id: 'reviews', label: 'Actualisation documentaire', weight: 100, score: average(scores),
      detail: 'Procédures avec revue annuelle, hors archives. Revue à plus de 90 jours : 100 %, attendue dans les 90 jours : 50 %, échue ou date de diffusion manquante : 0 %.' }] });
}

export function buildProcessPerformance(sources: ProcessPerformanceSources, today = performanceToday(), options: ProcessPerformanceOptions = {}): ProcessPerformance[] {
  return [humanResources(sources, today, options), purchases(sources, today), internalAudits(sources, today, options), fleet(sources, today), procedures(sources, today)];
}

export function prioritizeProcesses(processes: ProcessPerformance[]): ProcessPerformance[] {
  return [...processes].sort((a, b) => (a.score ?? 101) - (b.score ?? 101)
    || b.tasks.filter((task) => task.state === 'overdue').length - a.tasks.filter((task) => task.state === 'overdue').length);
}
