import type { SupabaseClient } from '@supabase/supabase-js';

export type ManagerHomeGroupKey = 'purchases' | 'workingTime' | 'fleetDocuments' | 'humanResources';
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
  tone: ManagerHomeTone;
  urgent: boolean;
  thisWeek: boolean;
}

export interface ManagerHomeDashboardResult {
  items: ManagerHomeItem[];
  unavailableSources: string[];
}

interface PurchaseRequestRow {
  id: number;
  request_number: string | number | null;
  title: string | null;
  requested_on: string | null;
  requester_name: string | null;
  project_code: string | null;
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
  vessel_name: string | null;
  document_title: string | null;
  title: string | null;
  status: string | null;
  expires_on: string | null;
  planned_on: string | null;
  workflow_status: string | null;
  is_active_fleet: boolean | null;
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

export interface ManagerHomeSourceRows {
  purchases: PurchaseRequestRow[];
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

function personName(person: PersonRow | undefined, fallback = 'Personne non renseignée'): string {
  if (!person) return fallback;
  return `${person.first_name || ''} ${person.last_name || ''}`.trim() || fallback;
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
    const urgent = tone === 'danger';
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
      tone,
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
    const tone = toneForDueDate(expiry || dueDate, today, forceDanger);
    const urgent = tone === 'danger';
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
      tone,
      urgent,
      thisWeek: daysFromToday(dueDate, today) >= 0 && daysFromToday(dueDate, today) <= 7,
    } satisfies ManagerHomeItem];
  });
}

function hrDocumentItems(rows: HrDocumentRow[], people: PersonRow[], today: Date): ManagerHomeItem[] {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const todayKey = toLocalIsoDate(today);
  return rows.flatMap((row) => {
    const person = row.person_id ? peopleById.get(row.person_id) : undefined;
    if (personDepartedBeforeToday(person, today)) return [];

    const status = normalize(row.status);
    const expiry = row.expires_on?.slice(0, 10) || '';
    const remainingDays = expiry ? daysFromToday(expiry, today) : null;
    const actionableStatus = ['expired', 'expire', 'renew_due', 'renouvel', 'missing', 'manquant', 'pending'].some((value) => status.includes(value));
    if (!row.medical_unfit && !actionableStatus && (remainingDays === null || remainingDays > UPCOMING_HORIZON_DAYS)) return [];

    const dueDate = expiry && remainingDays !== null && remainingDays >= 0 ? expiry : todayKey;
    const forceDanger = Boolean(row.medical_unfit) || remainingDays === null || (remainingDays !== null && remainingDays < 0) || status.includes('missing') || status.includes('manquant');
    const tone = toneForDueDate(expiry || dueDate, today, forceDanger);
    const urgent = tone === 'danger';
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
      tone,
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
      tone,
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
      tone: 'danger',
      urgent: true,
      thisWeek: daysFromToday(dueDate, today) >= -7 && daysFromToday(dueDate, today) <= 7,
    } satisfies ManagerHomeItem];
  });
}

const GROUP_ORDER: ManagerHomeGroupKey[] = ['purchases', 'workingTime', 'fleetDocuments', 'humanResources'];
const TONE_ORDER: ManagerHomeTone[] = ['danger', 'warning', 'success'];

export function buildManagerHomeItems(sources: ManagerHomeSourceRows, today = new Date()): ManagerHomeItem[] {
  return [
    ...purchaseItems(sources.purchases, today),
    ...workingTimeItems(sources.workingTimeCalculations, sources.people, today),
    ...fleetCertificateItems(sources.fleetCertificates, today),
    ...hrDocumentItems(sources.hrDocuments, sources.people, today),
    ...contractItems(sources.people, today),
  ].sort((left, right) =>
    GROUP_ORDER.indexOf(left.group) - GROUP_ORDER.indexOf(right.group)
    || TONE_ORDER.indexOf(left.tone) - TONE_ORDER.indexOf(right.tone)
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

export async function fetchManagerHomeDashboard(client: SupabaseClient, today = new Date()): Promise<ManagerHomeDashboardResult> {
  const todayKey = toLocalIsoDate(today);
  const windowStart = toLocalIsoDate(addDays(today, -31));
  const windowEnd = toLocalIsoDate(addDays(today, UPCOMING_HORIZON_DAYS));

  const [purchases, fleetCertificates, people, hrDocuments, workingTimeCalculations] = await Promise.all([
    loadRows<PurchaseRequestRow>('les achats', async () => client.from('purchase_requests')
      .select('id,request_number,title,requested_on,requester_name,project_code,vessel_name,status,urgent,approval_status,ordered_on,expected_delivery_on,received_on')
      .order('requested_on', { ascending: false })),
    loadRows<FleetCertificateRow>('les documents flotte', async () => client.from('fleet_certificates')
      .select('id,vessel_name,document_title,title,status,expires_on,planned_on,workflow_status,is_active_fleet')
      .order('expires_on', { ascending: true, nullsFirst: false })),
    loadRows<PersonRow>('les ressources humaines', async () => client.from('people')
      .select('id,first_name,last_name,function_label,departed_on,active')
      .order('last_name', { ascending: true })),
    loadRows<HrDocumentRow>('les documents RH', async () => client.from('hr_documents')
      .select('id,person_id,person_name,category_key,title,status,expires_on,medical_unfit')
      .order('expires_on', { ascending: true, nullsFirst: false })),
    loadRows<WorkingTimeCalculationRow>('les alertes de temps de travail', async () => client.from('working_time_calculation_windows')
      .select('id,person_id,local_window_end_date,rest_24h_seconds,longest_rest_24h_seconds,is_compliant,violation_codes,calculated_at')
      .eq('is_compliant', false)
      .gte('local_window_end_date', windowStart)
      .lte('local_window_end_date', windowEnd)
      .order('calculated_at', { ascending: false })
      .limit(500)),
  ]);

  const results = [purchases, fleetCertificates, people, hrDocuments, workingTimeCalculations];
  const items = buildManagerHomeItems({
    purchases: purchases.rows,
    fleetCertificates: fleetCertificates.rows,
    people: people.rows,
    hrDocuments: hrDocuments.rows,
    workingTimeCalculations: workingTimeCalculations.rows,
  }, parseIsoDate(todayKey) || today);

  return {
    items,
    unavailableSources: results.filter((result) => result.error).map((result) => result.label),
  };
}
