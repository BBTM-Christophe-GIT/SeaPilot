import type { SupabaseClient } from '@supabase/supabase-js';
import { workingTimeIntervalMinutes, type WorkingTimeCalculationWindow, type WorkingTimeInterval, type WorkingTimeViolationCode } from './workingTimeModel';
import { fetchWorkingTimeWorkspace, type WorkingTimeWorkspace } from './workingTimeQueries';

export type ComplianceMetricKey = 'imca' | 'french' | 'non_compliance';

export interface WorkingTimeComplianceFilters {
  end: string;
  metricKeys: ComplianceMetricKey[];
  personIds: number[];
  start: string;
  vesselIds: number[];
  watchGroups: string[];
}

interface HseMethodologyRow {
  id: number;
  name: string;
  version_label: string;
  ltifr_multiplier: number | null;
  trir_multiplier: number | null;
  far_multiplier: number | null;
  fac_rate_multiplier: number | null;
  mtc_rate_multiplier: number | null;
  rwc_rate_multiplier: number | null;
  sofr_multiplier: number | null;
  french_frequency_multiplier: number | null;
  french_severity_multiplier: number | null;
}

interface ExposureRow {
  exposure_date: string;
  exposure_seconds: number;
  person_id: number | null;
  vessel_id: number | null;
  watch_group: string | null;
}

interface SafetyEventRow {
  classification: string;
  lost_days: number;
  occurred_on: string;
  person_id: number | null;
  vessel_id: number | null;
  watch_group: string | null;
}

interface ReportIntervalRow {
  id: number | string;
  register_id: number | string;
  company_id: number | string;
  person_id: number | string;
  local_work_date: string;
  starts_at: string;
  ends_at: string;
  timezone_name: string;
  utc_offset_minutes: number | string;
  vessel_id: number | string | null;
  watch_group: string | null;
  comment: string | null;
  author_user_id: string | null;
  author_person_id: number | string | null;
  source_type: WorkingTimeInterval['sourceType'];
  source_reference: string | null;
  source_record_key: string | null;
}

interface ReportCalculationRow {
  id: number | string;
  company_id: number | string;
  person_id: number | string;
  window_end: string;
  local_window_end_date: string;
  timezone_name: string;
  vessel_id: number | string | null;
  work_rest_policy_id: number | string | null;
  work_24h_seconds: number | string;
  rest_24h_seconds: number | string;
  longest_rest_24h_seconds: number | string;
  rest_period_count_24h: number | string;
  work_7d_seconds: number | string;
  rest_7d_seconds: number | string;
  night_work_24h_seconds: number | string | null;
  is_compliant: boolean | null;
  violation_codes: string[] | null;
  calculation_version: number | string;
  calculated_at: string;
}

export interface ComplianceReportTrendPoint {
  key: string;
  label: string;
  nonCompliantDays: number;
  workHours: number;
}

export interface ComplianceReportBreakdown {
  id: string;
  label: string;
  value: number;
}

export interface WorkingTimeComplianceReportData {
  analysis: string;
  assumptions: string[];
  breakdownByPerson: ComplianceReportBreakdown[];
  breakdownByVessel: ComplianceReportBreakdown[];
  end: string;
  formulas: string[];
  generatedAt: string;
  methodologyLabel: string;
  metricKeys: ComplianceMetricKey[];
  nonCompliantDays: number;
  peopleAffected: number;
  periodLabel: string;
  rates: Record<string, number | null>;
  rawKpis: Record<string, number>;
  start: string;
  trend: ComplianceReportTrendPoint[];
  workHours: number;
}

const METHODOLOGY_SELECT = [
  'id', 'name', 'version_label', 'ltifr_multiplier', 'trir_multiplier', 'far_multiplier',
  'fac_rate_multiplier', 'mtc_rate_multiplier', 'rwc_rate_multiplier', 'sofr_multiplier',
  'french_frequency_multiplier', 'french_severity_multiplier',
].join(',');
const REPORT_INTERVAL_SELECT = 'id,register_id,company_id,person_id,local_work_date,starts_at,ends_at,timezone_name,utc_offset_minutes,vessel_id,watch_group,comment,author_user_id,author_person_id,source_type,source_reference,source_record_key';
const REPORT_CALCULATION_SELECT = 'id,company_id,person_id,window_end,local_window_end_date,timezone_name,vessel_id,work_rest_policy_id,work_24h_seconds,rest_24h_seconds,longest_rest_24h_seconds,rest_period_count_24h,work_7d_seconds,rest_7d_seconds,night_work_24h_seconds,is_compliant,violation_codes,calculation_version,calculated_at';
const REPORT_PAGE_SIZE = 1000;

const pad = (value: number) => String(value).padStart(2, '0');

function dateAtNoon(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function addDays(value: string, amount: number): string {
  const date = dateAtNoon(value);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatPeriod(start: string, end: string): string {
  const formatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  return `${formatter.format(dateAtNoon(start))} – ${formatter.format(dateAtNoon(end))}`;
}

function rowMatchesScope(
  row: { person_id: number | null; vessel_id: number | null; watch_group: string | null },
  filters: WorkingTimeComplianceFilters,
): boolean {
  return (!filters.personIds.length || (row.person_id !== null && filters.personIds.includes(Number(row.person_id))))
    && (!filters.vesselIds.length || (row.vessel_id !== null && filters.vesselIds.includes(Number(row.vessel_id))))
    && (!filters.watchGroups.length || Boolean(row.watch_group && filters.watchGroups.includes(row.watch_group)));
}

function rate(numerator: number, multiplier: number | null, exposureHours: number): number | null {
  return exposureHours > 0 && multiplier !== null ? numerator * Number(multiplier) / exposureHours : null;
}

function dateSpanDays(start: string, end: string): number {
  return Math.round((dateAtNoon(end).getTime() - dateAtNoon(start).getTime()) / 86_400_000) + 1;
}

function bucketKey(date: string, useDailyBuckets: boolean): string {
  return useDailyBuckets ? date : date.slice(0, 7);
}

function bucketLabel(key: string, useDailyBuckets: boolean): string {
  return new Intl.DateTimeFormat('fr-FR', useDailyBuckets
    ? { day: '2-digit', month: 'short' }
    : { month: 'short', year: '2-digit' })
    .format(dateAtNoon(useDailyBuckets ? key : `${key}-15`))
    .replace('.', '');
}

function buildBucketKeys(start: string, end: string, useDailyBuckets: boolean): string[] {
  const keys: string[] = [];
  if (useDailyBuckets) {
    for (let day = start; day <= end; day = addDays(day, 1)) keys.push(day);
    return keys;
  }
  const cursor = dateAtNoon(`${start.slice(0, 7)}-01`);
  const last = dateAtNoon(`${end.slice(0, 7)}-01`);
  while (cursor <= last) {
    keys.push(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`);
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }
  return keys;
}

function assertResult(error: { message?: string } | null, message: string): void {
  if (error) throw new Error(error.message || message);
}

async function fetchAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<unknown>, errorMessage: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += REPORT_PAGE_SIZE) {
    const result = await fetchPage(from, from + REPORT_PAGE_SIZE - 1) as { data: T[] | null; error: { message?: string } | null };
    assertResult(result.error, errorMessage);
    const page = result.data || [];
    rows.push(...page);
    if (page.length < REPORT_PAGE_SIZE) break;
  }
  return rows;
}

async function fetchReportIntervals(client: SupabaseClient, start: string, end: string): Promise<WorkingTimeInterval[]> {
  const rows = await fetchAllPages<ReportIntervalRow>((from, to) => client.from('working_time_intervals')
    .select(REPORT_INTERVAL_SELECT).gte('local_work_date', start).lte('local_work_date', end)
    .is('voided_at', null).order('local_work_date').order('starts_at').range(from, to), 'Impossible de charger toutes les heures du rapport.');
  return rows.map((row) => ({
    id: Number(row.id), registerId: Number(row.register_id), companyId: Number(row.company_id), personId: Number(row.person_id),
    localWorkDate: row.local_work_date, startsAt: row.starts_at, endsAt: row.ends_at, timezoneName: row.timezone_name,
    utcOffsetMinutes: Number(row.utc_offset_minutes), vesselId: row.vessel_id === null ? null : Number(row.vessel_id),
    watchGroup: row.watch_group, comment: row.comment, authorUserId: row.author_user_id,
    authorPersonId: row.author_person_id === null ? null : Number(row.author_person_id), sourceType: row.source_type,
    sourceReference: row.source_reference, sourceRecordKey: row.source_record_key,
  }));
}

async function fetchReportCalculations(client: SupabaseClient, start: string, end: string): Promise<WorkingTimeCalculationWindow[]> {
  const rows = await fetchAllPages<ReportCalculationRow>((from, to) => client.from('working_time_calculation_windows')
    .select(REPORT_CALCULATION_SELECT).gte('local_window_end_date', start).lte('local_window_end_date', end)
    .order('local_window_end_date').order('window_end').range(from, to), 'Impossible de charger tous les calculs de conformité du rapport.');
  return rows.map((row) => ({
    id: Number(row.id), companyId: Number(row.company_id), personId: Number(row.person_id), windowEnd: row.window_end,
    localWindowEndDate: row.local_window_end_date, timezoneName: row.timezone_name,
    vesselId: row.vessel_id === null ? null : Number(row.vessel_id), workRestPolicyId: row.work_rest_policy_id === null ? null : Number(row.work_rest_policy_id),
    work24hSeconds: Number(row.work_24h_seconds), rest24hSeconds: Number(row.rest_24h_seconds),
    longestRest24hSeconds: Number(row.longest_rest_24h_seconds), restPeriodCount24h: Number(row.rest_period_count_24h),
    work7dSeconds: Number(row.work_7d_seconds), rest7dSeconds: Number(row.rest_7d_seconds),
    nightWork24hSeconds: row.night_work_24h_seconds === null ? null : Number(row.night_work_24h_seconds),
    isCompliant: row.is_compliant, violationCodes: (row.violation_codes || []) as WorkingTimeViolationCode[],
    calculationVersion: Number(row.calculation_version), calculatedAt: row.calculated_at,
  }));
}

async function fetchExposureRows(client: SupabaseClient, methodologyId: number, start: string, end: string): Promise<ExposureRow[]> {
  return fetchAllPages<ExposureRow>((from, to) => client.from('hse_exposure_hours')
    .select('exposure_date,exposure_seconds,person_id,vessel_id,watch_group')
    .eq('methodology_id', methodologyId).gte('exposure_date', start).lte('exposure_date', end)
    .order('exposure_date').range(from, to), 'Impossible de charger toutes les heures d’exposition HSE.');
}

async function fetchSafetyEventRows(client: SupabaseClient, start: string, end: string): Promise<SafetyEventRow[]> {
  return fetchAllPages<SafetyEventRow>((from, to) => client.from('hse_safety_events')
    .select('occurred_on,classification,lost_days,person_id,vessel_id,watch_group')
    .gte('occurred_on', start).lte('occurred_on', end).order('occurred_on').range(from, to), 'Impossible de charger tous les événements HSE.');
}

export async function fetchWorkingTimeComplianceOptions(client: SupabaseClient, year: number) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [workspace, intervals] = await Promise.all([
    fetchWorkingTimeWorkspace(client, { start, end }),
    fetchReportIntervals(client, start, end),
  ]);
  const { data, error } = await client.from('hse_exposure_methodologies').select(METHODOLOGY_SELECT)
    .lte('effective_from', `${year}-12-31`).or(`effective_to.is.null,effective_to.gte.${year}-01-01`)
    .order('effective_from', { ascending: false }).limit(1);
  assertResult(error, 'Impossible de charger la méthodologie HSE / IMCA.');
  return { methodology: (((data || []) as unknown[])[0] || null) as HseMethodologyRow | null, workspace: { ...workspace, intervals } };
}

export async function fetchWorkingTimeComplianceReport(
  client: SupabaseClient,
  filters: WorkingTimeComplianceFilters,
): Promise<WorkingTimeComplianceReportData> {
  const workspacePromise = Promise.all([
    fetchWorkingTimeWorkspace(client, { start: filters.start, end: filters.end }),
    fetchReportIntervals(client, filters.start, filters.end),
    fetchReportCalculations(client, filters.start, filters.end),
  ]).then(([workspace, intervals, calculations]) => ({ ...workspace, intervals, calculations }));
  const methodologyPromise = client.from('hse_exposure_methodologies').select(METHODOLOGY_SELECT)
    .lte('effective_from', filters.end).or(`effective_to.is.null,effective_to.gte.${filters.start}`)
    .order('effective_from', { ascending: false }).limit(1);
  const [workspace, methodologyResult] = await Promise.all([workspacePromise, methodologyPromise]);
  assertResult(methodologyResult.error, 'Impossible de charger la méthodologie HSE / IMCA.');
  const methodology = (((methodologyResult.data || []) as unknown[])[0] || null) as HseMethodologyRow | null;

  const [exposureRowsAll, eventRowsAll] = methodology ? await Promise.all([
    fetchExposureRows(client, methodology.id, filters.start, filters.end),
    fetchSafetyEventRows(client, filters.start, filters.end),
  ]) : [[], []];

  const intervals = workspace.intervals.filter((interval) => (
    (!filters.personIds.length || filters.personIds.includes(interval.personId))
    && (!filters.vesselIds.length || (interval.vesselId !== null && filters.vesselIds.includes(interval.vesselId)))
    && (!filters.watchGroups.length || Boolean(interval.watchGroup && filters.watchGroups.includes(interval.watchGroup)))
  ));
  const intervalScopeKeys = new Set(intervals.map((interval) => `${interval.personId}:${interval.localWorkDate}`));
  const calculations = workspace.calculations.filter((calculation) => (
    (!filters.personIds.length || filters.personIds.includes(calculation.personId))
    && (!filters.vesselIds.length || (calculation.vesselId !== null && filters.vesselIds.includes(calculation.vesselId)))
    && (!filters.watchGroups.length || intervalScopeKeys.has(`${calculation.personId}:${calculation.localWindowEndDate}`))
  ));
  const nonComplianceKeys = new Set(calculations
    .filter((calculation) => calculation.isCompliant === false)
    .map((calculation) => `${calculation.personId}:${calculation.localWindowEndDate}`));
  const affectedPersonIds = new Set(Array.from(nonComplianceKeys, (key) => Number(key.split(':')[0])));
  const peopleById = new Map(workspace.readablePeople.map((person) => [person.personId, `${person.firstName} ${person.lastName}`.trim()]));
  const vesselById = new Map(workspace.vessels.map((vessel) => [vessel.id, vessel.name]));

  const breakdownPeople = new Map<number, number>();
  const breakdownVessels = new Map<string, number>();
  nonComplianceKeys.forEach((key) => {
    const [personValue, day] = key.split(':');
    const personId = Number(personValue);
    breakdownPeople.set(personId, (breakdownPeople.get(personId) || 0) + 1);
    const vesselIds = new Set(intervals.filter((interval) => interval.personId === personId && interval.localWorkDate === day)
      .map((interval) => interval.vesselId === null ? 'none' : String(interval.vesselId)));
    (vesselIds.size ? vesselIds : new Set(['none'])).forEach((id) => breakdownVessels.set(id, (breakdownVessels.get(id) || 0) + 1));
  });

  const exposureRows = exposureRowsAll.filter((row) => rowMatchesScope(row, filters));
  const eventRows = eventRowsAll.filter((row) => rowMatchesScope(row, filters));
  const exposureHours = exposureRows.reduce((sum, row) => sum + Number(row.exposure_seconds || 0), 0) / 3600;
  const count = (classification: string) => eventRows.filter((event) => event.classification === classification).length;
  const rawKpis = {
    exposure_hours: exposureHours,
    FAT: count('FAT'), LWDC: count('LWDC'), RWC: count('RWC'), MTC: count('MTC'), FAC: count('FAC'),
    near_miss: count('NEAR_MISS'), safety_observation: count('SAFETY_OBSERVATION'),
    lost_days: eventRows.reduce((sum, event) => sum + Number(event.lost_days || 0), 0),
  };
  const lti = rawKpis.FAT + rawKpis.LWDC;
  const rates: Record<string, number | null> = {
    LTI: lti,
    LTIFR: rate(lti, methodology?.ltifr_multiplier ?? null, exposureHours),
    TRIR: rate(rawKpis.FAT + rawKpis.LWDC + rawKpis.RWC + rawKpis.MTC, methodology?.trir_multiplier ?? null, exposureHours),
    FAR: rate(rawKpis.FAT, methodology?.far_multiplier ?? null, exposureHours),
    FAC_rate: rate(rawKpis.FAC, methodology?.fac_rate_multiplier ?? null, exposureHours),
    MTC_rate: rate(rawKpis.MTC, methodology?.mtc_rate_multiplier ?? null, exposureHours),
    RWC_rate: rate(rawKpis.RWC, methodology?.rwc_rate_multiplier ?? null, exposureHours),
    SOFR: rate(rawKpis.safety_observation, methodology?.sofr_multiplier ?? null, exposureHours),
    french_frequency_rate: rate(lti, methodology?.french_frequency_multiplier ?? null, exposureHours),
    french_severity_rate: rate(rawKpis.lost_days, methodology?.french_severity_multiplier ?? null, exposureHours),
  };

  const useDailyBuckets = dateSpanDays(filters.start, filters.end) <= 45;
  const trendMap = new Map(buildBucketKeys(filters.start, filters.end, useDailyBuckets)
    .map((key) => [key, { key, label: bucketLabel(key, useDailyBuckets), nonCompliantDays: 0, workHours: 0 }]));
  intervals.forEach((interval) => {
    const point = trendMap.get(bucketKey(interval.localWorkDate, useDailyBuckets));
    if (point) point.workHours += workingTimeIntervalMinutes(interval) / 60;
  });
  nonComplianceKeys.forEach((key) => {
    const day = key.split(':')[1];
    const point = trendMap.get(bucketKey(day, useDailyBuckets));
    if (point) point.nonCompliantDays += 1;
  });
  const trend = Array.from(trendMap.values());
  const workHours = intervals.reduce((sum, interval) => sum + workingTimeIntervalMinutes(interval), 0) / 60;
  const peak = [...trend].sort((left, right) => right.nonCompliantDays - left.nonCompliantDays || right.workHours - left.workHours)[0];
  const methodologyLabel = methodology ? `${methodology.name} · ${methodology.version_label}` : 'Aucune méthodologie applicable';
  const analysis = [
    `Sur la période du ${formatPeriod(filters.start, filters.end)}, ${workHours.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} heures de travail ont été enregistrées.`,
    `${nonComplianceKeys.size} journée(s) non conforme(s) concernent ${affectedPersonIds.size} marin(s).${peak ? ` La concentration la plus élevée apparaît sur ${peak.label} (${peak.nonCompliantDays} journée(s)).` : ''}`,
    methodology ? `Les indicateurs HSE / IMCA utilisent ${methodologyLabel} et ${exposureHours.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} heures d’exposition.` : 'Les taux HSE / IMCA ne sont pas calculés car aucune méthodologie datée ne couvre la période.',
    'Les écarts doivent être rapprochés des commentaires opérationnels et des mesures de repos compensateur avant toute décision de prévention.',
  ].join('\n\n');
  const multiplier = (value: number | null | undefined) => value === null || value === undefined ? 'non configuré' : Number(value).toLocaleString('fr-FR');
  const formulas = [
    `LTI = FAT + LWDC.`,
    `LTIFR = LTI × ${multiplier(methodology?.ltifr_multiplier)} / heures d’exposition.`,
    `TRIR = (FAT + LWDC + RWC + MTC) × ${multiplier(methodology?.trir_multiplier)} / heures d’exposition.`,
    `FAR = FAT × ${multiplier(methodology?.far_multiplier)} / heures d’exposition.`,
    `Taux FAC = FAC × ${multiplier(methodology?.fac_rate_multiplier)} / heures d’exposition.`,
    `Taux MTC = MTC × ${multiplier(methodology?.mtc_rate_multiplier)} / heures d’exposition.`,
    `Taux RWC = RWC × ${multiplier(methodology?.rwc_rate_multiplier)} / heures d’exposition.`,
    `SOFR = Safety Observations × ${multiplier(methodology?.sofr_multiplier)} / heures d’exposition.`,
    `Taux de fréquence français = (FAT + LWDC) × ${multiplier(methodology?.french_frequency_multiplier)} / heures d’exposition.`,
    `Taux de gravité français = jours perdus × ${multiplier(methodology?.french_severity_multiplier)} / heures d’exposition.`,
    'Journées non conformes = nombre de couples uniques marin/date pour lesquels au moins une fenêtre serveur est non conforme.',
  ];

  return {
    analysis,
    assumptions: [
      'Les heures de travail proviennent des intervalles horodatés visibles selon les droits du profil connecté.',
      'Les heures d’exposition HSE restent distinctes des heures de travail réelles et conservent la version de méthodologie appliquée.',
      'Une valeur non configurée est laissée vide ; aucune valeur réglementaire implicite n’est ajoutée.',
      'Les journées sans politique ou sans calcul serveur ne sont pas déclarées conformes par défaut.',
    ],
    breakdownByPerson: Array.from(breakdownPeople, ([id, value]) => ({ id: String(id), label: peopleById.get(id) || `Personne ${id}`, value }))
      .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'fr')),
    breakdownByVessel: Array.from(breakdownVessels, ([id, value]) => ({ id, label: id === 'none' ? 'Sans navire' : vesselById.get(Number(id)) || `Navire ${id}`, value }))
      .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'fr')),
    end: filters.end,
    formulas,
    generatedAt: new Date().toISOString(),
    methodologyLabel,
    metricKeys: filters.metricKeys,
    nonCompliantDays: nonComplianceKeys.size,
    peopleAffected: affectedPersonIds.size,
    periodLabel: formatPeriod(filters.start, filters.end),
    rates,
    rawKpis,
    start: filters.start,
    trend,
    workHours,
  };
}

export function reportWorkspaceWatchGroups(workspace: WorkingTimeWorkspace): string[] {
  return Array.from(new Set(workspace.intervals.map((interval) => interval.watchGroup).filter((value): value is string => Boolean(value))))
    .sort((left, right) => left.localeCompare(right, 'fr'));
}
