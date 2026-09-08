import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoleKey } from '../permissions/roles';
import { getAnnualReviewAlert } from '../procedures/procedureReview';

export type ManagerHomeGroupKey = 'purchases' | 'workingTime' | 'procedures' | 'fleetDocuments' | 'humanResources';
export type ManagerHomeTone = 'danger' | 'warning' | 'success';
export type ManagerHomeFilter = 'all' | 'urgent' | 'week' | 'purchases' | 'documents' | 'fleet' | 'workingTime' | 'humanResources';

export interface ManagerHomeItem {
  id: string;
  group: ManagerHomeGroupKey;
  tags: ManagerHomeFilter[];
  title: string;
  context: string;
  deadline: string;
  action: string;
  to: string;
  dueDate: string;
  visibleDates: string[];
  queueVisibleDates: string[];
  tone: ManagerHomeTone;
  queueTone: ManagerHomeTone;
  urgent: boolean;
  thisWeek: boolean;
}

export interface ManagerHomeDashboardResult {
  items: ManagerHomeItem[];
  unavailableSources: string[];
  scopeLabel: string | null;
}

interface PurchaseRequestRow {
  id: number;
  request_number: string | number | null;
  title: string | null;
  requested_on: string | null;
  requester_name: string | null;
  project_code: string | null;
  vessel_id?: number | null;
  vessel_name: string | null;
  status: string | null;
  urgent: boolean | null;
  approval_status: string | null;
  ordered_on: string | null;
  expected_delivery_on: string | null;
  received_on: string | null;
}

interface FleetCertificateRow {
  id: number;
  vessel_id?: number | null;
  vessel_name: string | null;
  document_title: string | null;
  title: string | null;
  status: string | null;
  expires_on: string | null;
  planned_on: string | null;
  workflow_status: string | null;
  is_active_fleet: boolean | null;
}

interface ProcedureReviewRow {
  id: number;
  procedure_code: string | null;
  title: string;
  diffusion_on: string | null;
  annual_review: boolean | null;
  vessel_name: string | null;
  project_name: string | null;
  status: string | null;
}

interface PersonRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  function_label: string | null;
  departed_on: string | null;
  active: boolean | null;
}

interface HrDocumentRow {
  id: number;
  person_id: number | null;
  person_name: string | null;
  category_key: string | null;
  title: string | null;
  status: string | null;
  expires_on: string | null;
  medical_unfit: boolean | null;
}

interface WorkingTimeCalculationRow {
  id: number;
  person_id: number;
  local_window_end_date: string;
  rest_24h_seconds: number | string | null;
  longest_rest_24h_seconds: number | string | null;
  is_compliant: boolean | null;
  violation_codes: string[] | null;
  calculated_at: string | null;
}

export interface ManagerHomeAssignmentRow {
  vessel_id: number;
  crew_person_id: number;
  captain_person_id: number | null;
  watch_group: string | null;
  vessels: { name?: string | null } | Array<{ name?: string | null }> | null;
}

export interface ManagerHomeAssignmentScope {
  vesselIds: number[];
  vesselNames: string[];
  personIds: number[];
  watchGroups: string[];
}

export interface ManagerHomeSourceRows {
  purchases: PurchaseRequestRow[];
  procedures: ProcedureReviewRow[];
  fleetCertificates: FleetCertificateRow[];
  people: PersonRow[];
  hrDocuments: HrDocumentRow[];
  workingTimeCalculations: WorkingTimeCalculationRow[];
}

const DAY_MS = 86_400_000;
const UPCOMING_HORIZON_DAYS = 90;

function normalize(value: string | null | undefined): string {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizeVesselName(value: string | null | undefined): string {
  return normalize(value)
    .replace(/^(?:m\s*\/?\s*v|mv)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function toLocalIsoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function daysFromToday(dateKey: string, today: Date): number {
  const parsed = parseIsoDate(dateKey);
  if (!parsed) return 0;
  return Math.round((parsed.getTime() - startOfDay(today).getTime()) / DAY_MS);
}

function formatShortDate(dateKey: string): string {
  const date = parseIsoDate(dateKey);
  if (!date) return 'Date à confirmer';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date).replace('.', '');
}

function toneForDueDate(dateKey: string, today: Date, forceDanger = false): ManagerHomeTone {
  if (forceDanger) return 'danger';
  const remainingDays = daysFromToday(dateKey, today);
  if (remainingDays <= 3) return 'danger';
  if (remainingDays <= 30) return 'warning';
  return 'success';
}

function queueToneForDueDate(dateKey: string, today: Date, forceDanger = false): ManagerHomeTone {
  if (forceDanger) return 'danger';
  const remainingDays = daysFromToday(dateKey, today);
  if (remainingDays < 0) return 'danger';
  if (remainingDays <= UPCOMING_HORIZON_DAYS) return 'warning';
  return 'success';
}

function deadlineForDate(dateKey: string, today: Date, prefix = 'Échéance'): string {
  const remainingDays = daysFromToday(dateKey, today);
  if (remainingDays < 0) return `Expiré depuis ${Math.abs(remainingDays)} j`;
  if (remainingDays === 0) return "Aujourd'hui";
  if (remainingDays === 1) return 'Demain';
  return `${prefix} le ${formatShortDate(dateKey)} · J-${remainingDays}`;
}

function visibleDatesFor(dueDate: string, today: Date, urgent: boolean): string[] {
  const todayKey = toLocalIsoDate(today);
  const remainingDays = daysFromToday(dueDate, today);
  const dates = new Set([dueDate]);
  if (urgent || remainingDays < 0 || remainingDays <= 7) dates.add(todayKey);
  return [...dates];
}

function queueVisibleDatesFor(dueDate: string, alarmDate: string, today: Date, queueTone: ManagerHomeTone): string[] {
  const dates = new Set([dueDate]);
  const remainingDays = daysFromToday(alarmDate, today);
  if (queueTone === 'danger' || remainingDays <= UPCOMING_HORIZON_DAYS) dates.add(toLocalIsoDate(today));
  return [...dates];
}

function personName(person: PersonRow | undefined, fallback = 'Personne non renseignée'): string {
  if (!person) return fallback;
  return `${person.first_name || ''} ${person.last_name || ''}`.trim() || fallback;
}

function normalizedPersonLabel(value: string | null | undefined): string {
  return normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function personAliases(person: PersonRow): string[] {
  const firstName = person.first_name?.trim() || '';
  const lastName = person.last_name?.trim() || '';
  return [
    normalizedPersonLabel(`${firstName} ${lastName}`),
    normalizedPersonLabel(`${lastName} ${firstName}`),
  ].filter((alias, index, aliases) => Boolean(alias) && aliases.indexOf(alias) === index);
}

function buildPeopleByUniqueAlias(people: PersonRow[]): Map<string, PersonRow> {
  const uniquePeople = new Map<string, PersonRow>();
  const ambiguousAliases = new Set<string>();

  people.forEach((person) => {
    personAliases(person).forEach((alias) => {
      const existing = uniquePeople.get(alias);
      if (existing && existing.id !== person.id) {
        uniquePeople.delete(alias);
        ambiguousAliases.add(alias);
      } else if (!ambiguousAliases.has(alias)) {
        uniquePeople.set(alias, person);
      }
    });
  });

  return uniquePeople;
}

function assignmentVesselName(assignment: ManagerHomeAssignmentRow): string {
  const relation = Array.isArray(assignment.vessels) ? assignment.vessels[0] : assignment.vessels;
  return relation?.name?.trim() || '';
}

function assignmentWatchKey(assignment: ManagerHomeAssignmentRow): string {
  return `${assignment.vessel_id}:${normalize(assignment.watch_group).trim()}`;
}

export function buildManagerHomeAssignmentScope(
  assignments: ManagerHomeAssignmentRow[],
  personId: number,
): ManagerHomeAssignmentScope {
  const actorAssignments = assignments.filter((assignment) =>
    assignment.crew_person_id === personId || assignment.captain_person_id === personId,
  );
  const vesselIds = [...new Set(actorAssignments.map((assignment) => assignment.vessel_id))];
  const actorWatchKeys = new Set(actorAssignments
    .filter((assignment) => normalize(assignment.watch_group).trim())
    .map(assignmentWatchKey));
  const vesselsWithoutWatch = new Set(actorAssignments
    .filter((assignment) => !normalize(assignment.watch_group).trim())
    .map((assignment) => assignment.vessel_id));
  const scopedAssignments = assignments.filter((assignment) =>
    vesselIds.includes(assignment.vessel_id)
    && (vesselsWithoutWatch.has(assignment.vessel_id) || actorWatchKeys.has(assignmentWatchKey(assignment))),
  );

  return {
    vesselIds,
    vesselNames: [...new Set(actorAssignments.map(assignmentVesselName).filter(Boolean))],
    personIds: [...new Set([
      personId,
      ...scopedAssignments.flatMap((assignment) => [assignment.crew_person_id, assignment.captain_person_id || 0]),
    ].filter((id) => id > 0))],
    watchGroups: [...new Set(actorAssignments.map((assignment) => assignment.watch_group?.trim() || '').filter(Boolean))],
  };
}

function rowMatchesVesselScope(
  vesselId: number | null | undefined,
  vesselName: string | null,
  scope: ManagerHomeAssignmentScope,
): boolean {
  if (vesselId != null && scope.vesselIds.includes(vesselId)) return true;
  const normalizedName = normalizeVesselName(vesselName);
  return Boolean(normalizedName) && scope.vesselNames.some((name) => normalizeVesselName(name) === normalizedName);
}

export function filterManagerHomeSourcesForScope(
  sources: ManagerHomeSourceRows,
  scope: ManagerHomeAssignmentScope,
): ManagerHomeSourceRows {
  const personIds = new Set(scope.personIds);
  const scopedPeople = sources.people.filter((person) => personIds.has(person.id));
  const scopedPeopleByAlias = buildPeopleByUniqueAlias(scopedPeople);

  return {
    purchases: sources.purchases.filter((row) => rowMatchesVesselScope(row.vessel_id, row.vessel_name, scope)),
    procedures: sources.procedures.filter((row) => rowMatchesVesselScope(null, row.vessel_name, scope)),
    fleetCertificates: sources.fleetCertificates.filter((row) => rowMatchesVesselScope(row.vessel_id, row.vessel_name, scope)),
    people: scopedPeople,
    hrDocuments: sources.hrDocuments.filter((row) => {
      if (row.person_id !== null) return personIds.has(row.person_id);
      const personNameAlias = normalizedPersonLabel(row.person_name);
      if (personNameAlias && scopedPeopleByAlias.has(personNameAlias)) return true;
      const titleAlias = normalizedPersonLabel(row.title);
      return Boolean(titleAlias) && [...scopedPeopleByAlias.keys()].some((alias) =>
        titleAlias === alias || titleAlias.startsWith(`${alias} `),
      );
    }),
    workingTimeCalculations: sources.workingTimeCalculations.filter((row) => personIds.has(row.person_id)),
  };
}

function resolveHrDocumentPerson(
  row: HrDocumentRow,
  peopleById: Map<number, PersonRow>,
  peopleByUniqueAlias: Map<string, PersonRow>,
): PersonRow | undefined {
  const linkedPerson = row.person_id ? peopleById.get(row.person_id) : undefined;
  if (linkedPerson) return linkedPerson;

  const importedName = normalizedPersonLabel(row.person_name);
  if (importedName) {
    const namedPerson = peopleByUniqueAlias.get(importedName);
    if (namedPerson) return namedPerson;
  }

  const normalizedTitle = normalizedPersonLabel(row.title);
  if (!normalizedTitle) return undefined;
  return [...peopleByUniqueAlias.entries()]
    .sort(([left], [right]) => right.length - left.length)
    .find(([alias]) => normalizedTitle === alias || normalizedTitle.startsWith(`${alias} `))?.[1];
}

function personDepartedBeforeToday(person: PersonRow | undefined, today: Date): boolean {
  const departedOn = person?.departed_on?.slice(0, 10) || '';
  return Boolean(departedOn) && daysFromToday(departedOn, today) < 0;
}

function documentTitleWithPerson(name: string, documentTitle: string): string {
  const cleanTitle = documentTitle.trim() || 'Document RH';
  const normalizedName = normalize(name);
  const normalizedTitle = normalize(cleanTitle);
  if (normalizedTitle === normalizedName || normalizedTitle.startsWith(`${normalizedName} -`)) return cleanTitle;
  return `${name} - ${cleanTitle}`;
}

function formatRequestNumber(row: PurchaseRequestRow): string {
  const raw = String(row.request_number || row.id).trim();
  if (/^DA-/i.test(raw)) return raw.toUpperCase();
  const year = (row.requested_on || '').slice(0, 4) || new Date().getFullYear();
  return `DA-${year}-${raw.padStart(3, '0')}`;
}

function purchaseStage(row: PurchaseRequestRow): 'to_process' | 'ordered' | 'receiving' | 'completed' {
  const status = normalize(row.status);
  if (row.received_on || status.includes('traitee') || status.includes('recu') || status.includes('termine')) return 'completed';
  if (status.includes('reception') || (row.expected_delivery_on && !row.received_on)) return 'receiving';
  if (row.ordered_on || status.includes('commande') || status.includes('cours')) return 'ordered';
  return 'to_process';
}

function purchaseItems(rows: PurchaseRequestRow[], today: Date): ManagerHomeItem[] {
  const todayKey = toLocalIsoDate(today);
  return rows.flatMap((row) => {
    const stage = purchaseStage(row);
    const approval = normalize(row.approval_status);
    if (stage === 'completed' || approval.includes('refuse')) return [];

    const expectedDate = row.expected_delivery_on?.slice(0, 10) || '';
    const expectedIsFuture = expectedDate && daysFromToday(expectedDate, today) > 0;
    const dueDate = stage === 'to_process' || !expectedIsFuture ? todayKey : expectedDate;
    const requestAge = row.requested_on ? Math.max(0, -daysFromToday(row.requested_on.slice(0, 10), today)) : 0;
    const explicitlyUrgent = Boolean(row.urgent) || (stage === 'to_process' && requestAge >= 2);
    const tone = explicitlyUrgent ? 'danger' : toneForDueDate(dueDate, today);
    const queueTone = queueToneForDueDate(dueDate, today, explicitlyUrgent);
    const urgent = queueTone === 'danger';
    const action = stage === 'to_process'
      ? 'Valider la demande'
      : stage === 'ordered'
        ? 'Suivre la commande'
        : 'Contrôler la réception';
    const deadline = stage === 'to_process'
      ? requestAge > 0 ? `En attente depuis ${requestAge} j` : "Aujourd'hui"
      : deadlineForDate(dueDate, today, 'Livraison');
    const contextEntity = row.vessel_name || row.project_code || row.requester_name || 'Demande interne';

    return [{
      id: `purchase-${row.id}`,
      group: 'purchases',
      tags: ['purchases'],
      title: `${formatRequestNumber(row)} · ${row.title || 'Demande d’achat'}`,
      context: `Achats · ${contextEntity}`,
      deadline,
      action,
      to: '/modules/purchaseRequests',
      dueDate,
      visibleDates: visibleDatesFor(dueDate, today, urgent),
      queueVisibleDates: queueVisibleDatesFor(dueDate, dueDate, today, queueTone),
      tone,
      queueTone,
      urgent,
      thisWeek: daysFromToday(dueDate, today) >= 0 && daysFromToday(dueDate, today) <= 7,
    } satisfies ManagerHomeItem];
  });
}

function effectiveFleetStatus(row: FleetCertificateRow, today: Date): string {
  const status = normalize(row.status);
  if (['missing', 'manquant', 'pending_validation', 'a valider'].some((value) => status.includes(value))) return status;
  const expiry = row.expires_on?.slice(0, 10) || '';
  if (!expiry) return status || 'valid';
  const remainingDays = daysFromToday(expiry, today);
  if (remainingDays < 0) return 'expired';
  if (remainingDays <= UPCOMING_HORIZON_DAYS) return 'renew_due';
  return status || 'valid';
}

function fleetCertificateItems(rows: FleetCertificateRow[], today: Date): ManagerHomeItem[] {
  const todayKey = toLocalIsoDate(today);
  return rows.flatMap((row) => {
    if (row.is_active_fleet === false) return [];
    const status = effectiveFleetStatus(row, today);
    if (status === 'valid' || status === 'valide') return [];

    const expiry = row.expires_on?.slice(0, 10) || '';
    const planned = row.planned_on?.slice(0, 10) || '';
    const plannedIsUpcoming = planned && daysFromToday(planned, today) >= 0;
    const expiryIsUpcoming = expiry && daysFromToday(expiry, today) >= 0;
    const dueDate = plannedIsUpcoming ? planned : expiryIsUpcoming ? expiry : todayKey;
    const forceDanger = status.includes('expired') || status.includes('missing') || status.includes('manquant') || status.includes('pending');
    const alarmDate = expiry || dueDate;
    const tone = toneForDueDate(alarmDate, today, forceDanger);
    const queueTone = queueToneForDueDate(alarmDate, today, forceDanger);
    const urgent = queueTone === 'danger';
    const action = status.includes('pending')
      ? 'Valider le document'
      : status.includes('missing') || status.includes('manquant')
        ? 'Planifier la régularisation'
        : 'Ouvrir le certificat';
    const deadline = plannedIsUpcoming
      ? `Visite le ${formatShortDate(planned)}`
      : expiry ? deadlineForDate(expiry, today, 'Expire') : 'Document manquant';

    return [{
      id: `fleet-${row.id}`,
      group: 'fleetDocuments',
      tags: ['documents', 'fleet'],
      title: row.document_title || row.title || 'Document flotte',
      context: `Flotte · ${row.vessel_name || 'Navire non renseigné'}`,
      deadline,
      action,
      to: '/modules/certificates',
      dueDate,
      visibleDates: visibleDatesFor(dueDate, today, urgent),
      queueVisibleDates: queueVisibleDatesFor(dueDate, alarmDate, today, queueTone),
      tone,
      queueTone,
      urgent,
      thisWeek: daysFromToday(dueDate, today) >= 0 && daysFromToday(dueDate, today) <= 7,
    } satisfies ManagerHomeItem];
  });
}

function procedureReviewItems(rows: ProcedureReviewRow[], today: Date): ManagerHomeItem[] {
  const todayKey = toLocalIsoDate(today);
  return rows.flatMap((row) => {
    if (normalize(row.status).includes('archive')) return [];
    const alert = getAnnualReviewAlert(Boolean(row.annual_review), row.diffusion_on || '', today);
    if (!alert) return [];
    const scope = row.vessel_name || row.project_name || 'Portée générale';
    const queueTone = queueToneForDueDate(alert.dueDate, today);
    return [{
      id: `procedure-review-${row.id}`,
      group: 'procedures',
      tags: ['documents'],
      title: `${row.procedure_code ? `${row.procedure_code} · ` : ''}${row.title}`,
      context: `Procédures QHSE · ${scope}`,
      deadline: alert.daysUntilDue < 0
        ? `Revue échue depuis ${Math.abs(alert.daysUntilDue)} j`
        : `Revue le ${formatShortDate(alert.dueDate)} · J-${alert.daysUntilDue}`,
      action: 'Ouvrir la fiche information',
      to: '/modules/procedures',
      dueDate: alert.dueDate,
      visibleDates: [...new Set([todayKey, alert.dueDate])],
      queueVisibleDates: [...new Set([todayKey, alert.dueDate])],
      tone: alert.tone,
      queueTone,
      urgent: queueTone === 'danger',
      thisWeek: alert.daysUntilDue >= 0 && alert.daysUntilDue <= 7,
    } satisfies ManagerHomeItem];
  });
}

function hrDocumentItems(rows: HrDocumentRow[], people: PersonRow[], today: Date): ManagerHomeItem[] {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const peopleByUniqueAlias = buildPeopleByUniqueAlias(people);
  const todayKey = toLocalIsoDate(today);
  return rows.flatMap((row) => {
    const person = resolveHrDocumentPerson(row, peopleById, peopleByUniqueAlias);
    if (personDepartedBeforeToday(person, today)) return [];

    const status = normalize(row.status);
    const expiry = row.expires_on?.slice(0, 10) || '';
    const remainingDays = expiry ? daysFromToday(expiry, today) : null;
    const actionableStatus = ['expired', 'expire', 'renew_due', 'renouvel', 'missing', 'manquant', 'pending'].some((value) => status.includes(value));
    if (!row.medical_unfit && !actionableStatus && (remainingDays === null || remainingDays > UPCOMING_HORIZON_DAYS)) return [];

    const dueDate = expiry && remainingDays !== null && remainingDays >= 0 ? expiry : todayKey;
    const forceDanger = Boolean(row.medical_unfit) || remainingDays === null || (remainingDays !== null && remainingDays < 0) || status.includes('missing') || status.includes('manquant');
    const alarmDate = expiry || dueDate;
    const tone = toneForDueDate(alarmDate, today, forceDanger);
    const queueTone = queueToneForDueDate(alarmDate, today, forceDanger);
    const urgent = queueTone === 'danger';
    const name = person ? personName(person) : (row.person_name || personName(undefined));
    const medical = normalize(row.category_key).includes('medical') || normalize(row.title).includes('medical');
    const documentTitle = row.title || (medical ? 'Visite médicale' : 'Document RH');
    const title = documentTitleWithPerson(name, documentTitle);
    const deadline = row.medical_unfit ? 'Inaptitude déclarée' : expiry ? deadlineForDate(expiry, today, medical ? 'Visite' : 'Expire') : 'Document manquant';

    return [{
      id: `hr-document-${row.id}`,
      group: 'humanResources',
      tags: ['documents', 'humanResources'],
      title,
      context: `Ressources humaines${person?.function_label ? ` · ${person.function_label}` : ''}`,
      deadline,
      action: 'Voir le dossier',
      to: '/modules/humanResources',
      dueDate,
      visibleDates: visibleDatesFor(dueDate, today, urgent),
      queueVisibleDates: queueVisibleDatesFor(dueDate, alarmDate, today, queueTone),
      tone,
      queueTone,
      urgent,
      thisWeek: daysFromToday(dueDate, today) >= 0 && daysFromToday(dueDate, today) <= 7,
    } satisfies ManagerHomeItem];
  });
}

function contractItems(rows: PersonRow[], today: Date): ManagerHomeItem[] {
  return rows.flatMap((person) => {
    const departedOn = person.departed_on?.slice(0, 10) || '';
    if (!departedOn || person.active === false) return [];
    const remainingDays = daysFromToday(departedOn, today);
    if (remainingDays < 0 || remainingDays > UPCOMING_HORIZON_DAYS) return [];
    const tone: ManagerHomeTone = remainingDays <= 7 ? 'warning' : 'success';
    const queueTone = queueToneForDueDate(departedOn, today);
    const name = personName(person);

    return [{
      id: `contract-${person.id}`,
      group: 'humanResources',
      tags: ['humanResources'],
      title: `Contrat ${name}`,
      context: `Ressources humaines${person.function_label ? ` · ${person.function_label}` : ''}`,
      deadline: remainingDays === 0 ? "Fin aujourd'hui" : `Fin le ${formatShortDate(departedOn)}`,
      action: 'Préparer le renouvellement',
      to: '/modules/humanResources',
      dueDate: departedOn,
      visibleDates: visibleDatesFor(departedOn, today, false),
      queueVisibleDates: queueVisibleDatesFor(departedOn, departedOn, today, queueTone),
      tone,
      queueTone,
      urgent: false,
      thisWeek: remainingDays <= 7,
    } satisfies ManagerHomeItem];
  });
}

function workingTimeTitle(codes: string[]): string {
  if (codes.includes('consecutive_rest')) return 'Repos consécutif insuffisant';
  if (codes.includes('rest_24h') || codes.includes('rest_7d')) return 'Repos insuffisant détecté';
  if (codes.includes('work_24h') || codes.includes('work_7d')) return 'Dépassement du temps de travail';
  if (codes.includes('night_work')) return 'Dépassement du travail de nuit';
  return 'Non-conformité du temps de travail';
}

function workingTimeItems(rows: WorkingTimeCalculationRow[], people: PersonRow[], today: Date): ManagerHomeItem[] {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const latestByPerson = new Map<number, WorkingTimeCalculationRow>();
  [...rows]
    .filter((row) => row.is_compliant === false)
    .sort((left, right) => String(right.calculated_at || '').localeCompare(String(left.calculated_at || '')))
    .forEach((row) => {
      if (!latestByPerson.has(row.person_id)) latestByPerson.set(row.person_id, row);
    });

  return [...latestByPerson.values()].flatMap((row) => {
    const dueDate = row.local_window_end_date.slice(0, 10);
    const person = peopleById.get(row.person_id);
    if (personDepartedBeforeToday(person, today)) return [];

    const name = personName(person, `Personne ${row.person_id}`);
    const restHours = Number(row.longest_rest_24h_seconds || row.rest_24h_seconds || 0) / 3600;
    const deadline = restHours > 0 ? `Repos continu limité à ${restHours.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h` : 'Non-conformité détectée';

    return [{
      id: `working-time-${row.id}`,
      group: 'workingTime',
      tags: ['workingTime'],
      title: workingTimeTitle(row.violation_codes || []),
      context: `Temps de travail · ${name}`,
      deadline,
      action: "Examiner l'alerte",
      to: '/modules/workingTime',
      dueDate,
      visibleDates: visibleDatesFor(dueDate, today, true),
      queueVisibleDates: queueVisibleDatesFor(dueDate, dueDate, today, 'danger'),
      tone: 'danger',
      queueTone: 'danger',
      urgent: true,
      thisWeek: daysFromToday(dueDate, today) >= -7 && daysFromToday(dueDate, today) <= 7,
    } satisfies ManagerHomeItem];
  });
}

const GROUP_ORDER: ManagerHomeGroupKey[] = ['purchases', 'workingTime', 'procedures', 'fleetDocuments', 'humanResources'];
const TONE_ORDER: ManagerHomeTone[] = ['danger', 'warning', 'success'];

export function buildManagerHomeItems(sources: ManagerHomeSourceRows, today = new Date()): ManagerHomeItem[] {
  return [
    ...purchaseItems(sources.purchases, today),
    ...workingTimeItems(sources.workingTimeCalculations, sources.people, today),
    ...procedureReviewItems(sources.procedures, today),
    ...fleetCertificateItems(sources.fleetCertificates, today),
    ...hrDocumentItems(sources.hrDocuments, sources.people, today),
    ...contractItems(sources.people, today),
  ].sort((left, right) =>
    GROUP_ORDER.indexOf(left.group) - GROUP_ORDER.indexOf(right.group)
    || TONE_ORDER.indexOf(left.queueTone) - TONE_ORDER.indexOf(right.queueTone)
    || left.dueDate.localeCompare(right.dueDate)
    || left.title.localeCompare(right.title, 'fr'),
  );
}

async function loadRows<T>(label: string, loader: () => Promise<{ data: unknown[] | null; error: { message?: string } | null }>): Promise<{ label: string; rows: T[]; error: boolean }> {
  try {
    const result = await loader();
    if (result.error) throw new Error(result.error.message || `Impossible de charger ${label}.`);
    return { label, rows: (result.data || []) as T[], error: false };
  } catch {
    return { label, rows: [], error: true };
  }
}

export interface ManagerHomeViewer {
  roles: RoleKey[];
  personId: number | null;
}

function isAssignmentScopedViewer(roles: RoleKey[]): boolean {
  const hasOfficeRole = roles.some((role) => ['admin', 'direction', 'armement'].includes(role));
  return !hasOfficeRole && roles.some((role) => role === 'capitaine' || role === 'marin');
}

function assignmentScopeLabel(scope: ManagerHomeAssignmentScope): string {
  const vesselLabels = scope.vesselNames.length
    ? scope.vesselNames
    : scope.vesselIds.map((vesselId) => `Navire #${vesselId}`);
  return [...scope.watchGroups, ...vesselLabels].join(' · ') || 'Aucune affectation active';
}

export async function fetchManagerHomeDashboard(
  client: SupabaseClient,
  today = new Date(),
  viewer: ManagerHomeViewer = { roles: [], personId: null },
): Promise<ManagerHomeDashboardResult> {
  const todayKey = toLocalIsoDate(today);
  const windowStart = toLocalIsoDate(addDays(today, -31));
  const windowEnd = toLocalIsoDate(addDays(today, UPCOMING_HORIZON_DAYS));
  const assignmentScoped = isAssignmentScopedViewer(viewer.roles);
  let scope: ManagerHomeAssignmentScope | null = null;

  if (assignmentScoped) {
    if (!viewer.personId) {
      return { items: [], unavailableSources: [], scopeLabel: 'Aucune fiche RH liée au profil' };
    }

    const assignments = await loadRows<ManagerHomeAssignmentRow>('les affectations Planning', async () => client
      .from('planning_assignments')
      .select('vessel_id,crew_person_id,captain_person_id,watch_group,vessels(name)')
      .lte('starts_on', todayKey)
      .gte('ends_on', todayKey)
      .neq('confirmation_status', 'cancelled'));
    if (assignments.error) {
      return { items: [], unavailableSources: [assignments.label], scopeLabel: 'Affectation indisponible' };
    }

    scope = buildManagerHomeAssignmentScope(assignments.rows, viewer.personId);
    if (!scope.vesselIds.length) {
      return { items: [], unavailableSources: [], scopeLabel: 'Aucune affectation active' };
    }
  }

  const assignmentScope = scope;
  const procedureTable = viewer.roles.some((role) => role === 'admin' || role === 'direction')
    ? 'procedures'
    : 'published_procedures';

  const [purchases, procedures, fleetCertificates, people, hrDocuments, workingTimeCalculations] = await Promise.all([
    loadRows<PurchaseRequestRow>('les achats', async () => {
      let query = client.from('purchase_requests')
        .select('id,request_number,title,requested_on,requester_name,project_code,vessel_id,vessel_name,status,urgent,approval_status,ordered_on,expected_delivery_on,received_on')
        .order('requested_on', { ascending: false });
      if (assignmentScope) query = query.in('vessel_id', assignmentScope.vesselIds);
      return query;
    }),
    loadRows<ProcedureReviewRow>('les revues annuelles QHSE', async () => {
      if (assignmentScope && !assignmentScope.vesselNames.length) return { data: [], error: null };
      let query = client.from(procedureTable)
        .select('id,procedure_code,title,diffusion_on,annual_review,vessel_name,project_name,status')
        .eq('annual_review', true)
        .order('diffusion_on', { ascending: true, nullsFirst: false });
      if (assignmentScope) query = query.in('vessel_name', assignmentScope.vesselNames);
      return query;
    }),
    loadRows<FleetCertificateRow>('les documents flotte', async () => {
      let query = client.from('fleet_certificates')
        .select('id,vessel_id,vessel_name,document_title,title,status,expires_on,planned_on,workflow_status,is_active_fleet')
        .order('expires_on', { ascending: true, nullsFirst: false });
      if (assignmentScope) query = query.in('vessel_id', assignmentScope.vesselIds);
      return query;
    }),
    loadRows<PersonRow>('les ressources humaines', async () => {
      let query = client.from('people')
        .select('id,first_name,last_name,function_label,departed_on,active')
        .order('last_name', { ascending: true });
      if (assignmentScope) query = query.in('id', assignmentScope.personIds);
      return query;
    }),
    loadRows<HrDocumentRow>('les documents RH', async () => {
      let query = client.from('hr_documents')
        .select('id,person_id,person_name,category_key,title,status,expires_on,medical_unfit')
        .order('expires_on', { ascending: true, nullsFirst: false });
      if (assignmentScope) query = query.in('person_id', assignmentScope.personIds);
      return query;
    }),
    loadRows<WorkingTimeCalculationRow>('les alertes de temps de travail', async () => {
      let query = client.from('working_time_calculation_windows')
        .select('id,person_id,local_window_end_date,rest_24h_seconds,longest_rest_24h_seconds,is_compliant,violation_codes,calculated_at')
        .eq('is_compliant', false)
        .gte('local_window_end_date', windowStart)
        .lte('local_window_end_date', windowEnd)
        .order('calculated_at', { ascending: false })
        .limit(500);
      if (assignmentScope) query = query.in('person_id', assignmentScope.personIds);
      return query;
    }),
  ]);

  const results = [purchases, procedures, fleetCertificates, people, hrDocuments, workingTimeCalculations];
  const sources: ManagerHomeSourceRows = {
    purchases: purchases.rows,
    procedures: procedures.rows,
    fleetCertificates: fleetCertificates.rows,
    people: people.rows,
    hrDocuments: hrDocuments.rows,
    workingTimeCalculations: workingTimeCalculations.rows,
  };
  const filteredSources = assignmentScope ? filterManagerHomeSourcesForScope(sources, assignmentScope) : sources;
  const items = buildManagerHomeItems(filteredSources, parseIsoDate(todayKey) || today);

  return {
    items,
    unavailableSources: results.filter((result) => result.error).map((result) => result.label),
    scopeLabel: assignmentScope ? assignmentScopeLabel(assignmentScope) : null,
  };
}
