import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ActionItemRecord, ActionPlanHseDashboard, ActionTypeCatalogRecord,
} from '../actionPlan/actionPlanQueries';
import { fetchActionPlanHseDashboard } from '../actionPlan/actionPlanQueries';
import { fetchFleetCertificates, type FleetCertificateRecord } from '../fleetCertificates/fleetCertificateQueries';
import { fetchPeople, type PersonRecord } from '../humanResources/peopleQueries';
import {
  fetchPlanningVesselVisits, planningVisitTypeLabel, type PlanningVesselVisit,
} from '../planning/planningVisitQueries';
import { fetchProceduresData, type ProceduresData } from '../procedures/procedureQueries';
import { QHSE_REPORT_CATALOG, type QhseReportDefinition, type QhseReportId } from './qhseReportCatalog';

export interface QhseReportScope {
  year: number;
  vesselId: number | null;
  vesselName: string;
  years?: number[];
  vesselIds?: number[];
  vesselNames?: string[];
}

export interface QhseAnnualReferenceMetric {
  year: number;
  vesselId: number | null;
  workedHours: number;
  personDays: number;
  sourceLabel: string;
}

export interface QhseExposureRecord {
  date: string;
  hours: number;
  personId: number | null;
  population: string;
  vesselId: number | null;
}

export interface QhseEnvironmentParameter {
  density: number;
  emissionFactor: number;
  directCombustionFactor: number;
  xbeeReductionRate: number;
  effectiveFrom: string;
  effectiveTo: string;
}

export interface QhseContractTarget {
  projectId: number;
  vesselId: number;
  year: number;
  maintenanceDaysLimit: number;
  portCall24hLimit: number;
  validUntil: string;
}

export interface QhseReportMetric {
  label: string;
  value: string;
  detail?: string;
  tone?: 'blue' | 'green' | 'orange' | 'red';
}

export interface QhseReportChart {
  title: string;
  kind: 'bar' | 'line';
  labels: string[];
  series: Array<{ label: string; values: Array<number | null>; color: [number, number, number]; axis?: 'left' | 'right' }>;
  unit?: string;
  showValueLabels?: boolean;
}

export interface QhseReportTable {
  title: string;
  columns: string[];
  rows: string[][];
}

export interface QhseReportNote {
  title: string;
  text: string;
  tone?: 'info' | 'warning';
}

export interface QhseReportContent {
  summary: string;
  metrics: QhseReportMetric[];
  charts: QhseReportChart[];
  tables: QhseReportTable[];
  notes: QhseReportNote[];
  sources: string[];
}

interface DprReportRow {
  id: number;
  reportDate: string;
  projectId: number | null;
  projectLabel: string;
  vesselId: number | null;
  vesselName: string;
}

interface DprMetricRow { dprId: number; fuelConsumedLiters: number; fuelOnBoardLiters: number }
interface DprHseRow {
  dprId: number;
  tbtPerformed: boolean;
  hseVisitPerformed: boolean;
  hseAuditPerformed: boolean;
  goodPractices: number;
  dangerousSituations: number;
  stopWork: number;
}
interface DprExerciseRow { dprId: number; type: string }
interface DprPortCallRow { id: number; dprId: number; portName: string; arrivalAt: string; departureAt: string; reasons: string[] }
interface DprSupplyRow { dprId: number; fuelM3: number; oilLiters: number; waterM3: number }
interface DprWasteRow { dprId: number; type: string; quantity: number; unit: string }
interface DprIncidentRow { dprId: number; category: string; level: string }

export interface QhseReportSnapshot {
  scope: QhseReportScope;
  actions: ActionItemRecord[];
  actionTypes: ActionTypeCatalogRecord[];
  hseDashboard: ActionPlanHseDashboard | null;
  reports: DprReportRow[];
  metrics: DprMetricRow[];
  hseActions: DprHseRow[];
  exercises: DprExerciseRow[];
  portCalls: DprPortCallRow[];
  supplies: DprSupplyRow[];
  waste: DprWasteRow[];
  incidents: DprIncidentRow[];
  certificates: FleetCertificateRecord[];
  visits: PlanningVesselVisit[];
  people: PersonRecord[];
  procedures: ProceduresData;
  annualReferences?: QhseAnnualReferenceMetric[];
  exposureRecords?: QhseExposureRecord[];
  environmentParameters?: QhseEnvironmentParameter[];
  contractTargets?: QhseContractTarget[];
  warnings: string[];
}

export interface QhseReportSeed {
  actions: ActionItemRecord[];
  actionTypes: ActionTypeCatalogRecord[];
  hseDashboard: ActionPlanHseDashboard | null;
}

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const BLUE: [number, number, number] = [24, 96, 174];
const TEAL: [number, number, number] = [22, 151, 135];
const GREEN: [number, number, number] = [11, 153, 73];
const ORANGE: [number, number, number] = [220, 112, 48];
const RED: [number, number, number] = [194, 57, 68];
const PURPLE: [number, number, number] = [113, 82, 172];

function text(value: unknown): string { return value === null || value === undefined ? '' : String(value); }
function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value);
}
function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fr-FR').format(date);
}
function percent(value: number): string { return `${formatNumber(value, 1)} %`; }
function hoursBetween(start: string, end: string): number {
  const first = new Date(start).getTime();
  const last = new Date(end).getTime();
  return Number.isFinite(first) && Number.isFinite(last) && last >= first ? (last - first) / 3_600_000 : 0;
}
function monthOf(date: string): number {
  const month = Number(date.slice(5, 7));
  return month >= 1 && month <= 12 ? month - 1 : -1;
}
function daysInYear(year: number): number { return new Date(year, 1, 29).getMonth() === 1 ? 366 : 365; }
function inYear(value: string, year: number): boolean { return value.slice(0, 4) === String(year); }
function scopeYears(scope: QhseReportScope): number[] {
  return [...new Set((scope.years?.length ? scope.years : [scope.year]).filter((year) => Number.isInteger(year)))].sort((left, right) => left - right);
}
function scopeVesselIds(scope: QhseReportScope): number[] {
  return [...new Set((scope.vesselIds?.length ? scope.vesselIds : scope.vesselId ? [scope.vesselId] : []).filter((id) => Number.isInteger(id)))];
}
function inScope(value: string, scope: QhseReportScope): boolean { return scopeYears(scope).includes(Number(value.slice(0, 4))); }
function scopeStart(scope: QhseReportScope): string { return `${scopeYears(scope)[0]}-01-01`; }
function scopeEnd(scope: QhseReportScope): string { return `${scopeYears(scope).at(-1)}-12-31`; }
function scopeCalendarDays(scope: QhseReportScope): number { return scopeYears(scope).reduce((sum, year) => sum + daysInYear(year), 0); }
function metric(label: string, value: string | number, detail = '', tone: QhseReportMetric['tone'] = 'blue'): QhseReportMetric {
  return { label, value: typeof value === 'number' ? formatNumber(value) : value, detail, tone };
}
function sourceNote(): string { return 'Données SeaPilot accessibles à l’utilisateur au moment de la génération.'; }
function unavailable(title: string, textValue: string): QhseReportNote { return { title, text: textValue, tone: 'warning' }; }
function rowsLimited(rows: string[][], limit = 48): string[][] { return rows.slice(0, limit); }

async function safeLoad<T>(label: string, fallback: T, warnings: string[], work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch {
    warnings.push(`${label} : source inaccessible ou indisponible pour ce profil.`);
    return fallback;
  }
}

async function fetchDprData(client: SupabaseClient, scope: QhseReportScope, warnings: string[]) {
  const years = scopeYears(scope);
  const startsOn = `${years[0]}-01-01`;
  const endsOn = `${years.at(-1)}-12-31`;
  return safeLoad('DPR', {
    reports: [] as DprReportRow[], metrics: [] as DprMetricRow[], hseActions: [] as DprHseRow[],
    exercises: [] as DprExerciseRow[], portCalls: [] as DprPortCallRow[], supplies: [] as DprSupplyRow[],
    waste: [] as DprWasteRow[], incidents: [] as DprIncidentRow[],
  }, warnings, async () => {
    const [projectResult, vesselResult] = await Promise.all([
      client.from('projects').select('id,project_code,title').order('project_code'),
      client.from('vessels').select('id,name').order('name'),
    ]);
    if (projectResult.error) throw projectResult.error;
    if (vesselResult.error) throw vesselResult.error;
    const projects = new Map((projectResult.data || []).map((row) => [Number(row.id), [text(row.project_code), text(row.title)].filter(Boolean).join(' · ')]));
    const vessels = new Map((vesselResult.data || []).map((row) => [Number(row.id), text(row.name)]));

    let reportQuery = client.from('dpr_reports')
      .select('id,report_date,project_id,unlisted_project_name,vessel_id,status')
      .gte('report_date', startsOn).lte('report_date', endsOn)
      .is('deleted_at', null).in('status', ['submitted', 'validated']);
    const vesselIds = scopeVesselIds(scope);
    if (vesselIds.length) reportQuery = reportQuery.in('vessel_id', vesselIds);
    const reportResult = await reportQuery.order('report_date', { ascending: true }).limit(1000);
    if (reportResult.error) throw reportResult.error;
    const reports: DprReportRow[] = (reportResult.data || []).map((row) => ({
      id: Number(row.id), reportDate: text(row.report_date), projectId: nullableNumber(row.project_id),
      projectLabel: row.project_id ? projects.get(Number(row.project_id)) || '' : text(row.unlisted_project_name),
      vesselId: nullableNumber(row.vessel_id), vesselName: row.vessel_id ? vessels.get(Number(row.vessel_id)) || '' : '',
    }));
    const ids = reports.map((report) => report.id);
    if (!ids.length) return { reports, metrics: [], hseActions: [], exercises: [], portCalls: [], supplies: [], waste: [], incidents: [] };

    const [metricResult, hseResult, exerciseResult, callResult, supplyResult, wasteResult, incidentResult] = await Promise.all([
      client.from('dpr_daily_metrics').select('dpr_id,fuel_consumed_liters,fuel_on_board_liters').in('dpr_id', ids),
      client.from('dpr_hse_actions').select('dpr_id,tbt_performed,hse_visit_performed,hse_audit_performed,good_practices_count,dangerous_situations_count,stop_work_count').in('dpr_id', ids),
      client.from('dpr_emergency_exercises').select('dpr_id,exercise_type_key').in('dpr_id', ids),
      client.from('dpr_port_calls').select('id,dpr_id,port_name,arrival_at,departure_at,reasons:dpr_port_call_reasons(reason_type_key)').in('dpr_id', ids).order('arrival_at'),
      client.from('dpr_supplies').select('dpr_id,fuel_m3,oil_liters,water_m3').in('dpr_id', ids),
      client.from('dpr_waste_records').select('dpr_id,waste_type_key,quantity,unit').in('dpr_id', ids),
      client.from('dpr_incidents').select('dpr_id,category,level').in('dpr_id', ids),
    ]);
    const errorResult = [metricResult, hseResult, exerciseResult, callResult, supplyResult, wasteResult, incidentResult].find((result) => result.error);
    if (errorResult?.error) throw errorResult.error;
    return {
      reports,
      metrics: (metricResult.data || []).map((row) => ({ dprId: Number(row.dpr_id), fuelConsumedLiters: numeric(row.fuel_consumed_liters), fuelOnBoardLiters: numeric(row.fuel_on_board_liters) })),
      hseActions: (hseResult.data || []).map((row) => ({ dprId: Number(row.dpr_id), tbtPerformed: Boolean(row.tbt_performed), hseVisitPerformed: Boolean(row.hse_visit_performed), hseAuditPerformed: Boolean(row.hse_audit_performed), goodPractices: numeric(row.good_practices_count), dangerousSituations: numeric(row.dangerous_situations_count), stopWork: numeric(row.stop_work_count) })),
      exercises: (exerciseResult.data || []).map((row) => ({ dprId: Number(row.dpr_id), type: text(row.exercise_type_key) })),
      portCalls: (callResult.data || []).map((row) => ({
        id: Number(row.id), dprId: Number(row.dpr_id), portName: text(row.port_name), arrivalAt: text(row.arrival_at), departureAt: text(row.departure_at),
        reasons: ((row.reasons || []) as Array<Record<string, unknown>>).map((reason) => text(reason.reason_type_key)),
      })),
      supplies: (supplyResult.data || []).map((row) => ({ dprId: Number(row.dpr_id), fuelM3: numeric(row.fuel_m3), oilLiters: numeric(row.oil_liters), waterM3: numeric(row.water_m3) })),
      waste: (wasteResult.data || []).map((row) => ({ dprId: Number(row.dpr_id), type: text(row.waste_type_key), quantity: numeric(row.quantity), unit: text(row.unit) })),
      incidents: (incidentResult.data || []).map((row) => ({ dprId: Number(row.dpr_id), category: text(row.category), level: text(row.level) })),
    };
  });
}

export async function fetchQhseReportSnapshot(
  client: SupabaseClient,
  scope: QhseReportScope,
  seed: QhseReportSeed,
): Promise<QhseReportSnapshot> {
  const warnings: string[] = [];
  const years = scopeYears(scope);
  const vesselIds = scopeVesselIds(scope);
  const startsOn = `${years[0]}-01-01`;
  const endsOn = `${years.at(-1)}-12-31`;
  const [dpr, certificates, visits, people, procedures, hseDashboard, annualReferences, exposureRecords, environmentParameters, contractTargets] = await Promise.all([
    fetchDprData(client, scope, warnings),
    safeLoad('Certificats flotte', [] as FleetCertificateRecord[], warnings, () => fetchFleetCertificates(client)),
    safeLoad('Planning des visites', [] as PlanningVesselVisit[], warnings, () => fetchPlanningVesselVisits(client)),
    safeLoad('Ressources humaines', [] as PersonRecord[], warnings, () => fetchPeople(client)),
    safeLoad('Procédures QSMS', { procedures: [], publications: [] } as ProceduresData, warnings, () => fetchProceduresData(client)),
    years.length === 1 && scope.vesselId
      ? safeLoad('Indicateurs HSE', null as ActionPlanHseDashboard | null, warnings, () => fetchActionPlanHseDashboard(client, scope.year, { vesselId: scope.vesselId }))
      : Promise.resolve(years.length === 1 && seed.hseDashboard?.year === scope.year ? seed.hseDashboard : null),
    safeLoad('Historiques annuels officiels', [] as QhseAnnualReferenceMetric[], warnings, async () => {
      const result = await client.from('qhse_annual_reference_metrics').select('report_year,vessel_id,worked_hours,person_days,source_label').in('report_year', years).order('report_year');
      if (result.error) throw result.error;
      return (result.data || []).map((row) => ({ year: Number(row.report_year), vesselId: nullableNumber(row.vessel_id), workedHours: numeric(row.worked_hours), personDays: numeric(row.person_days), sourceLabel: text(row.source_label) }));
    }),
    safeLoad('Registre d’exposition HSE', [] as QhseExposureRecord[], warnings, async () => {
      let query = client.from('hse_exposure_hours').select('exposure_date,exposure_hours,person_id,population,vessel_id').gte('exposure_date', startsOn).lte('exposure_date', endsOn);
      if (vesselIds.length) query = query.in('vessel_id', vesselIds);
      const result = await query.order('exposure_date');
      if (result.error) throw result.error;
      return (result.data || []).map((row) => ({ date: text(row.exposure_date), hours: numeric(row.exposure_hours), personId: nullableNumber(row.person_id), population: text(row.population), vesselId: nullableNumber(row.vessel_id) }));
    }),
    safeLoad('Paramètres environnementaux', [] as QhseEnvironmentParameter[], warnings, async () => {
      const result = await client.from('qhse_environment_parameters').select('fuel_density_tonnes_per_m3,emission_factor_tco2_per_tonne,direct_combustion_factor_tco2e_per_m3,xbee_reduction_rate,effective_from,effective_to').order('effective_from');
      if (result.error) throw result.error;
      return (result.data || []).map((row) => ({
        density: numeric(row.fuel_density_tonnes_per_m3),
        emissionFactor: numeric(row.emission_factor_tco2_per_tonne),
        directCombustionFactor: numeric(row.direct_combustion_factor_tco2e_per_m3),
        xbeeReductionRate: numeric(row.xbee_reduction_rate),
        effectiveFrom: text(row.effective_from),
        effectiveTo: text(row.effective_to),
      }));
    }),
    safeLoad('Objectifs contractuels', [] as QhseContractTarget[], warnings, async () => {
      const result = await client.from('qhse_contract_targets').select('project_id,vessel_id,report_year,maintenance_days_limit,port_call_24h_limit,valid_until').in('report_year', years).order('report_year');
      if (result.error) throw result.error;
      return (result.data || []).map((row) => ({ projectId: Number(row.project_id), vesselId: Number(row.vessel_id), year: Number(row.report_year), maintenanceDaysLimit: numeric(row.maintenance_days_limit), portCall24hLimit: numeric(row.port_call_24h_limit), validUntil: text(row.valid_until) }));
    }),
  ]);
  return {
    scope,
    actions: seed.actions.filter((action) => !vesselIds.length || (action.vesselId !== null && vesselIds.includes(action.vesselId))),
    actionTypes: seed.actionTypes,
    hseDashboard,
    certificates: certificates.filter((item) => !vesselIds.length || (item.vesselId !== null && vesselIds.includes(item.vesselId))),
    visits: visits.filter((item) => !vesselIds.length || vesselIds.includes(item.vesselId)),
    people,
    procedures,
    annualReferences,
    exposureRecords,
    environmentParameters,
    contractTargets,
    warnings,
    ...dpr,
  };
}

function reportMap(snapshot: QhseReportSnapshot): Map<number, DprReportRow> {
  return new Map(snapshot.reports.map((report) => [report.id, report]));
}
function yearActions(snapshot: QhseReportSnapshot): ActionItemRecord[] {
  return snapshot.actions.filter((action) => inScope(action.occurredAt || action.openedOn, snapshot.scope));
}
function closedAction(action: ActionItemRecord): boolean {
  return Boolean(action.closedOn) || ['closed', 'solde', 'soldé', 'cloture', 'clôturé'].includes(normalize(action.status));
}
function actionClassification(action: ActionItemRecord, snapshot: QhseReportSnapshot): string {
  const catalog = snapshot.actionTypes.find((item) => item.key === action.actionTypeKey)?.hseClassification;
  if (catalog) return catalog.toUpperCase();
  const label = normalize(`${action.actionTypeKey} ${action.actionType}`);
  if (label.includes('fatal')) return 'FAT';
  if (label.includes('lost') || label.includes('lwdc') || label.includes('arret')) return 'LWDC';
  if (label.includes('restricted') || label.includes('rwc')) return 'RWC';
  if (label.includes('medical') || label.includes('mtc')) return 'MTC';
  if (label.includes('first') || label.includes('fac')) return 'FAC';
  if (label.includes('near') || label.includes('presqu')) return 'NEAR_MISS';
  if (label.includes('observation')) return 'SAFETY_OBSERVATION';
  return '';
}
function countBy<T>(items: T[], key: (item: T) => string): Array<[string, number]> {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const label = key(item).trim() || 'Non renseigné';
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'fr'));
}
function categoricalChart(title: string, entries: Array<[string, number]>, color = BLUE): QhseReportChart {
  const values = entries.slice(0, 10);
  return { title, kind: 'bar', labels: values.map(([label]) => label), series: [{ label: 'Nombre', values: values.map(([, value]) => value), color }] };
}
function monthlyValues<T>(items: T[], date: (item: T) => string, value: (item: T) => number): number[] {
  const totals = Array.from({ length: 12 }, () => 0);
  items.forEach((item) => { const month = monthOf(date(item)); if (month >= 0) totals[month] += value(item); });
  return totals;
}
function periodValues<T>(scope: QhseReportScope, items: T[], date: (item: T) => string, value: (item: T) => number) {
  const years = scopeYears(scope);
  const labels = years.flatMap((year) => MONTHS.map((month) => `${month} ${year}`));
  const values = labels.map(() => 0);
  items.forEach((item) => {
    const raw = date(item);
    const yearIndex = years.indexOf(Number(raw.slice(0, 4)));
    const month = monthOf(raw);
    if (yearIndex >= 0 && month >= 0) values[(yearIndex * 12) + month] += value(item);
  });
  return { labels, values };
}

function eventClassification(action: ActionItemRecord, snapshot: QhseReportSnapshot): string {
  const key = normalize(`${action.actionTypeKey} ${action.actionType}`);
  if (key.includes('commuting')) return 'COMMUTING';
  return actionClassification(action, snapshot);
}

interface AnnualSafetySummary {
  year: number;
  dataAvailable: boolean;
  workedHours: number | null;
  personDays: number | null;
  sedentary: number | null;
  mariners: number | null;
  employees: number | null;
  FAT: number;
  LWDC: number;
  LTI: number;
  RWC: number;
  MTC: number;
  FAC: number;
  nearMiss: number;
  commuting: number;
  lostDays: number;
  frequencyRate: number | null;
  severityRate: number | null;
}

function annualSafety(snapshot: QhseReportSnapshot): AnnualSafetySummary[] {
  const vesselScoped = scopeVesselIds(snapshot.scope).length > 0;
  return scopeYears(snapshot.scope).map((year) => {
    const actions = snapshot.actions.filter((action) => inYear(action.occurredAt || action.openedOn, year));
    const classified = actions.map((action) => ({ action, classification: eventClassification(action, snapshot) })).filter((item) => Boolean(item.classification));
    const count = (classification: string) => classified.filter((item) => item.classification === classification).length;
    const reference = !vesselScoped ? snapshot.annualReferences?.find((item) => item.year === year && item.vesselId === null) : undefined;
    const exposure = (snapshot.exposureRecords || []).filter((item) => inYear(item.date, year));
    const workedHours = reference?.workedHours || exposure.reduce((sum, item) => sum + item.hours, 0) || null;
    const personDays = reference?.personDays || new Set(exposure.filter((item) => item.personId !== null).map((item) => `${item.personId}:${item.date}`)).size || null;
    const people = vesselScoped ? [] : snapshot.people.filter((person) => Boolean(person.hiredOn) && employedAt(person, `${year}-12-31`));
    const sedentary = vesselScoped ? null : people.filter((person) => normalize(person.gradeLabel).includes('sedentaire')).length;
    const mariners = vesselScoped ? null : people.length - (sedentary || 0);
    const FAT = count('FAT');
    const LWDC = count('LWDC');
    const LTI = FAT + LWDC;
    const lostDays = classified.reduce((sum, item) => sum + (['FAT', 'LWDC'].includes(item.classification) ? item.action.lostDays : 0), 0);
    return {
      year, dataAvailable: classified.length > 0, workedHours, personDays, sedentary, mariners, employees: vesselScoped ? null : people.length,
      FAT, LWDC, LTI, RWC: count('RWC'), MTC: count('MTC'), FAC: count('FAC'), nearMiss: count('NEAR_MISS'), commuting: count('COMMUTING'), lostDays,
      frequencyRate: workedHours ? (LTI * 1_000_000) / workedHours : null,
      severityRate: workedHours ? (lostDays * 1_000) / workedHours : null,
    };
  });
}
function safetyTotals(snapshot: QhseReportSnapshot) {
  const totals = snapshot.hseDashboard?.totals;
  return {
    FAT: totals?.FAT || 0, LWDC: totals?.LWDC || 0, LTI: totals?.LTI || 0,
    RWC: totals?.RWC || 0, MTC: totals?.MTC || 0, FAC: totals?.FAC || 0,
    nearMiss: totals?.nearMiss || 0, safetyObservation: totals?.safetyObservation || 0,
    lostDays: totals?.lostDays || 0, exposureHours: totals?.exposureHours || 0,
  };
}
function hseNotes(snapshot: QhseReportSnapshot): QhseReportNote[] {
  const notes: QhseReportNote[] = [{
    title: 'Méthodologie',
    text: snapshot.hseDashboard
      ? `Calcul SeaPilot ${snapshot.hseDashboard.methodologyVersion || 'versionné'} : heures réelles lorsqu’elles existent, sinon repli planifié configuré.`
      : 'Aucune méthodologie HSE disponible pour la période sélectionnée.',
    tone: snapshot.hseDashboard ? 'info' : 'warning',
  }];
  return notes;
}
function reportPeriodLabel(snapshot: QhseReportSnapshot): string {
  const years = scopeYears(snapshot.scope);
  const period = years.length === 1 ? String(years[0]) : `${years[0]}–${years.at(-1)}`;
  const vessels = snapshot.scope.vesselNames?.length ? snapshot.scope.vesselNames.join(', ') : snapshot.scope.vesselName;
  return `${period}${vessels ? ` · ${vessels}` : ' · flotte complète'}`;
}

function buildMenuContent(snapshot: QhseReportSnapshot): QhseReportContent {
  return {
    summary: `Catalogue des ${QHSE_REPORT_CATALOG.length} rapports QHSE retenus, reconstruits à partir des seules données SeaPilot — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Rapports disponibles', QHSE_REPORT_CATALOG.length, 'Un PDF distinct par page', 'blue'),
      metric('Période', scopeYears(snapshot.scope).join(', '), snapshot.scope.vesselNames?.join(', ') || snapshot.scope.vesselName || 'Tous les navires', 'green'),
      metric('Couverture complète', QHSE_REPORT_CATALOG.filter((report) => report.coverage === 'complete').length, 'Rapports alimentés sans source manquante', 'green'),
      metric('Couverture partielle', QHSE_REPORT_CATALOG.filter((report) => report.coverage === 'partial').length, 'Lacunes identifiées dans le PDF', 'orange'),
    ],
    charts: [],
    tables: [{
      title: 'Correspondance des pages',
      columns: ['Page', 'Rapport SeaPilot', 'Famille', 'Couverture'],
      rows: QHSE_REPORT_CATALOG.slice(1).map((report) => [String(report.sourcePage), report.title, report.family, report.coverage === 'complete' ? 'Complète' : 'Partielle']),
    }],
    notes: [
      { title: 'Principe de reprise', text: 'La structure métier du fichier Power BI est conservée. Les calculs s’appuient sur le modèle SeaPilot et non sur les valeurs embarquées dans le PBIX.' },
      unavailable('Données non inventées', 'Les pages partielles restent générables et signalent précisément les champs non structurés dans SeaPilot.'),
    ],
    sources: [sourceNote()],
  };
}

function buildPortCallContent(snapshot: QhseReportSnapshot, detailed: boolean): QhseReportContent {
  const calls = snapshot.portCalls.map((call) => ({ ...call, duration: hoursBetween(call.arrivalAt, call.departureAt), report: reportMap(snapshot).get(call.dprId) }));
  if (detailed) {
    const target = (snapshot.contractTargets || []).find((item) => scopeYears(snapshot.scope).includes(item.year)
      && (!scopeVesselIds(snapshot.scope).length || scopeVesselIds(snapshot.scope).includes(item.vesselId)));
    const p144Calls = calls.filter((call) => normalize(call.report?.projectLabel || '').includes('p144') && (!target || call.report?.vesselId === target.vesselId));
    const categoryCalls = (key: string) => p144Calls.filter((call) => call.reasons.includes(key));
    const sortedDates = [...new Set(p144Calls.map((call) => call.arrivalAt.slice(0, 10)).filter(Boolean))].sort();
    const durationSeries = (key: string) => sortedDates.map((date) => categoryCalls(key).filter((call) => call.arrivalAt.startsWith(date)).reduce((sum, call) => sum + call.duration, 0) || null);
    const maintenanceDays = new Set(categoryCalls('breakdown').map((call) => call.arrivalAt.slice(0, 10)).filter(Boolean)).size;
    const portCall24h = categoryCalls('port-call-24h').length;
    const unqualifiedCrewChanges = categoryCalls('crew-change').filter((call) => !call.reasons.some((reason) => ['port-call-14h', 'port-call-24h'].includes(reason))).length;
    return {
      summary: `KPI opérations P144 / GOURY — durée réelle entre accostage et appareillage, sans ajout de 1 h 30 — ${reportPeriodLabel(snapshot)}.`,
      metrics: [
        metric('Moyenne 14h Port Call', `${formatNumber(average(categoryCalls('port-call-14h').map((call) => call.duration)), 1)} h`, `${categoryCalls('port-call-14h').length} escale(s) qualifiée(s)`, 'blue'),
        metric('Moyenne 24h Port Call', `${formatNumber(average(categoryCalls('port-call-24h').map((call) => call.duration)), 1)} h`, `${portCall24h} / ${target?.portCall24hLimit ?? '—'} en ${target?.year ?? snapshot.scope.year}`, 'blue'),
        metric('Moyenne Weather Stand-by', `${formatNumber(average(categoryCalls('weather-standby').map((call) => call.duration)), 1)} h`, `${categoryCalls('weather-standby').length} période(s)`, 'orange'),
        metric('Jours de maintenance', target ? `${maintenanceDays} / ${target.maintenanceDaysLimit}` : '—', target ? `Échéance ${formatDate(target.validUntil)}` : 'Objectif Supabase absent', 'green'),
      ],
      charts: [
        { title: '1.1 14h Port Call', kind: 'line', labels: sortedDates.map(formatDate), series: [{ label: 'Durée réelle', values: durationSeries('port-call-14h'), color: BLUE }], unit: 'h' },
        { title: '1.2 24h Port Call', kind: 'line', labels: sortedDates.map(formatDate), series: [{ label: 'Durée réelle', values: durationSeries('port-call-24h'), color: BLUE }], unit: 'h' },
        { title: '1.3 Weather Stand-by', kind: 'line', labels: sortedDates.map(formatDate), series: [{ label: 'Durée réelle', values: durationSeries('weather-standby'), color: BLUE }], unit: 'h' },
      ],
      tables: [{ title: '2. Suivi des escales', columns: ['Date', 'Navire', 'Projet', 'Qualification', 'Durée'], rows: p144Calls.map((call) => [formatDate(call.arrivalAt), call.report?.vesselName || '—', call.report?.projectLabel || '—', call.reasons.includes('port-call-24h') ? '24h Port Call' : call.reasons.includes('port-call-14h') ? '14h Port Call' : call.reasons.includes('weather-standby') ? 'Weather Stand-by' : 'Non qualifiée', call.duration ? `${formatNumber(call.duration, 1)} h` : 'Incomplète']) }],
      notes: [
        ...(unqualifiedCrewChanges ? [unavailable('Historique à qualifier', `${unqualifiedCrewChanges} Crew Change historique(s) ne possède(nt) pas encore la qualification 14h/24h dans Supabase ; aucune répartition n’a été déduite.`)] : []),
        ...(target ? [{ title: 'Objectifs contractuels', text: `${target.maintenanceDaysLimit} jours de maintenance Avarie et ${target.portCall24hLimit} escales 24h Port Call pour ${target.year}, échéance ${formatDate(target.validUntil)}.` } as QhseReportNote] : [unavailable('Objectifs contractuels absents', 'Aucun objectif P144 / GOURY n’est disponible dans Supabase pour la période sélectionnée.')]),
      ],
      sources: ['DPR soumis/validés · escales et motifs', 'Supabase · objectifs contractuels P144 / GOURY', sourceNote()],
    };
  }
  const total = calls.reduce((sum, call) => sum + call.duration, 0);
  const completed = calls.filter((call) => call.duration > 0);
  const monthly = monthlyValues(completed, (call) => call.arrivalAt, (call) => call.duration);
  const byPort = countBy(completed, (call) => call.portName).map(([label]) => [label, completed.filter((call) => (call.portName || 'Non renseigné') === label).reduce((sum, call) => sum + call.duration, 0)] as [string, number]);
  return {
    summary: `Analyse des escales renseignées dans les DPR soumis ou validés — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Escales', calls.length, `${completed.length} avec durée complète`, 'blue'),
      metric('Durée cumulée', `${formatNumber(total, 1)} h`, 'Arrivée à départ', 'orange'),
      metric('Durée moyenne', `${formatNumber(completed.length ? total / completed.length : 0, 1)} h`, 'Escales complètes', 'green'),
      metric('Ports distincts', new Set(calls.map((call) => call.portName).filter(Boolean)).size, 'Ports nommés', 'blue'),
    ],
    charts: detailed
      ? [{ title: 'Durée mensuelle des escales', kind: 'bar', labels: MONTHS, series: [{ label: 'Heures', values: monthly, color: ORANGE }], unit: 'h' }, categoricalChart('Durée cumulée par port', byPort, TEAL)]
      : [{ title: 'Durée mensuelle des escales', kind: 'line', labels: MONTHS, series: [{ label: 'Heures', values: monthly, color: BLUE }], unit: 'h' }],
    tables: [{
      title: 'Détail des escales',
      columns: ['Arrivée', 'Navire', 'Port', 'Durée', 'Motif(s)'],
      rows: rowsLimited(calls.map((call) => [formatDate(call.arrivalAt), call.report?.vesselName || '—', call.portName || '—', call.duration ? `${formatNumber(call.duration, 1)} h` : 'Incomplète', call.reasons.join(', ') || 'Non renseigné']), detailed ? 54 : 36),
    }],
    notes: calls.length ? [] : [unavailable('Aucune escale', 'Aucune escale DPR n’est disponible sur le périmètre sélectionné.')],
    sources: ['DPR soumis/validés · escales et motifs', sourceNote()],
  };
}

function average(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }

function buildTfTgContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const totals = safetyTotals(snapshot);
  const monthly = snapshot.hseDashboard?.monthly || [];
  return {
    summary: `Performance sécurité cumulée et exposition au travail — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Heures travaillées', `${formatNumber(totals.exposureHours)} h`, 'Registre d’exposition HSE', 'blue'),
      metric('LTI', totals.LTI, 'FAT + LWDC', totals.LTI ? 'red' : 'green'),
      metric('Taux de fréquence', snapshot.hseDashboard?.totals.frequencyRate === null ? '—' : formatNumber(snapshot.hseDashboard?.totals.frequencyRate || 0, 2), 'Par million d’heures', 'orange'),
      metric('Taux de gravité', snapshot.hseDashboard?.totals.severityRate === null ? '—' : formatNumber(snapshot.hseDashboard?.totals.severityRate || 0, 2), 'Par millier d’heures', 'red'),
    ],
    charts: [{
      title: 'Évolution cumulée TF / TG', kind: 'line', labels: monthly.map((point) => point.monthLabel),
      series: [
        { label: 'TF', values: monthly.map((point) => point.frequencyRate), color: BLUE },
        { label: 'TG', values: monthly.map((point) => point.severityRate), color: ORANGE, axis: 'right' },
      ],
    }],
    tables: [{
      title: 'Synthèse annuelle', columns: ['FAT', 'LWDC', 'RWC', 'MTC', 'FAC', 'Near miss', 'Jours perdus'],
      rows: [[totals.FAT, totals.LWDC, totals.RWC, totals.MTC, totals.FAC, totals.nearMiss, totals.lostDays].map(String)],
    }],
    notes: hseNotes(snapshot),
    sources: ['Registre versionné des heures d’exposition', 'Événements HSE synchronisés depuis le plan d’action', sourceNote()],
  };
}

function buildSocialSafetyContent(snapshot: QhseReportSnapshot, variant: 1 | 2): QhseReportContent {
  if (variant === 1) {
    const annual = annualSafety(snapshot);
    const missingYears = annual.filter((row) => !row.dataAvailable).map((row) => row.year);
    const cumulativeLabels = scopeYears(snapshot.scope).flatMap((year) => MONTHS.map((month) => `${month} ${year}`));
    const classifications = ['LWDC', 'RWC', 'MTC', 'FAC', 'COMMUTING', 'NEAR_MISS'] as const;
    const series = classifications.map((classification, index) => {
      let running = 0;
      return {
        label: classification === 'COMMUTING' ? 'Commuting' : classification === 'NEAR_MISS' ? 'Near Miss' : classification,
        values: cumulativeLabels.map((label) => {
          const [monthLabel, yearLabel] = label.split(' ');
          const month = MONTHS.indexOf(monthLabel);
          running += snapshot.actions.filter((action) => Number((action.occurredAt || action.openedOn).slice(0, 4)) === Number(yearLabel)
            && monthOf(action.occurredAt || action.openedOn) === month && eventClassification(action, snapshot) === classification).length;
          return running;
        }),
        color: [RED, PURPLE, ORANGE, [222, 184, 19] as [number, number, number], [224, 126, 156] as [number, number, number], [15, 174, 80] as [number, number, number]][index],
      };
    });
    return {
      summary: `Effectifs et accidentologie annuels — ${reportPeriodLabel(snapshot)}.`,
      metrics: annual.slice(-1).flatMap((row) => [
        metric('Heures travaillées', row.workedHours === null ? '—' : `${formatNumber(row.workedHours)} h`, `Année ${row.year}`, 'blue'),
        metric('Hommes-jours', row.personDays === null ? '—' : formatNumber(row.personDays), `Année ${row.year}`, 'blue'),
        metric('Taux de fréquence', row.frequencyRate === null ? '—' : formatNumber(row.frequencyRate, 2), 'LTI × 1 000 000 / h', 'orange'),
        metric('Taux de gravité', row.severityRate === null ? '—' : formatNumber(row.severityRate, 2), 'Jours perdus × 1 000 / h', 'red'),
      ]),
      charts: [
        { title: 'Taux de fréquence annuel', kind: 'line', labels: annual.map((row) => String(row.year)), series: [{ label: 'TF', values: annual.map((row) => row.dataAvailable ? row.frequencyRate : null), color: BLUE }] },
        { title: 'Taux de gravité annuel', kind: 'line', labels: annual.map((row) => String(row.year)), series: [{ label: 'TG', values: annual.map((row) => row.dataAvailable ? row.severityRate : null), color: BLUE }] },
        { title: "Nombre d'accidents / incidents cumulés", kind: 'bar', labels: cumulativeLabels, series },
      ],
      tables: [
        { title: '1. Effectifs', columns: ['Année', "Nb d'heures travaillées", "Nb d'hommes/jour", 'Nb sédentaires', 'Nb marins', 'Nb salariés'], rows: annual.map((row) => [String(row.year), row.workedHours === null ? '—' : formatNumber(row.workedHours), row.personDays === null ? '—' : formatNumber(row.personDays), row.sedentary === null ? '—' : String(row.sedentary), row.mariners === null ? '—' : String(row.mariners), row.employees === null ? '—' : String(row.employees)]) },
        { title: '2. Indicateurs accidents', columns: ['Année', 'Nb LTI', "Nb jours d'arrêt", 'Nb RWC', 'Nb MTC', 'Nb FAC', 'Nb Near Miss', 'Nb Commuting', 'TF', 'TG'], rows: annual.map((row) => {
          if (!row.dataAvailable) return [String(row.year), ...Array.from({ length: 9 }, () => '—')];
          return [String(row.year), String(row.LTI), String(row.lostDays), String(row.RWC), String(row.MTC), String(row.FAC), String(row.nearMiss), String(row.commuting), row.frequencyRate === null ? '—' : formatNumber(row.frequencyRate, 2), row.severityRate === null ? '—' : formatNumber(row.severityRate, 2)];
        }) },
      ],
      notes: missingYears.length ? [unavailable('Historique accidentologique incomplet', `Aucune donnée d’événement structurée n’est disponible dans Supabase pour ${missingYears.join(', ')} ; les valeurs sont volontairement affichées « — » et non zéro.`)] : [],
      sources: ['Supabase · historiques annuels officiels', 'Supabase · Fiche RH / Grade', 'Supabase · événements HSE', sourceNote()],
    };
  }
  const totals = safetyTotals(snapshot);
  const actions = yearActions(snapshot).filter((action) => Boolean(actionClassification(action, snapshot)));
  const pyramid: Array<[string, number]> = [
    ['Décès / accidents graves', totals.FAT + totals.LTI],
    ['Soins et travail restreint', totals.RWC + totals.MTC],
    ['Premiers soins', totals.FAC],
    ['Presqu’accidents', totals.nearMiss],
    ['Observations sécurité', totals.safetyObservation],
  ];
  return {
    summary: `Lecture préventive selon la pyramide de Bird — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Événements classifiés', actions.length, 'Enregistrements SeaPilot de la période', 'blue'),
      metric('Accidents enregistrables', totals.FAT + totals.LTI + totals.RWC + totals.MTC, 'FAT + LTI + RWC + MTC', 'red'),
      metric('Premiers soins', totals.FAC, 'FAC', 'orange'),
      metric('Précurseurs', totals.nearMiss + totals.safetyObservation, 'Near miss + observations', 'green'),
    ],
    charts: [categoricalChart('Pyramide de Bird — niveaux déclarés', pyramid, ORANGE), categoricalChart('Conséquences renseignées', countBy(actions, (action) => text(action.safetyEventDetails.consequences)), RED)],
    tables: [{
      title: 'Événements de la période', columns: ['Date', 'Classification', 'Navire / lieu', 'Événement', 'Jours perdus'],
      rows: rowsLimited(actions.map((action) => [formatDate(action.occurredAt || action.openedOn), actionClassification(action, snapshot) || '—', action.vesselName || action.locationDetail || '—', action.title, String(action.lostDays)]), 34),
    }],
    notes: hseNotes(snapshot),
    sources: ['Événements HSE et détails structurés du plan d’action', sourceNote()],
  };
}

function buildVesselSafetyContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const annual = annualSafety(snapshot);
  const totals = safetyTotals(snapshot);
  const exercises = countBy(snapshot.exercises, (item) => item.type);
  const hse = snapshot.hseActions;
  const reportById = reportMap(snapshot);
  const exercisePeriod = periodValues(snapshot.scope, snapshot.exercises, (item) => reportById.get(item.dprId)?.reportDate || '', () => 1);
  const classifiedActions = yearActions(snapshot).filter((action) => Boolean(eventClassification(action, snapshot)));
  const eventPeriod = periodValues(snapshot.scope, classifiedActions, (action) => action.occurredAt || action.openedOn, () => 1);
  let eventRunning = 0;
  return {
    summary: `Sécurité navire, exercices et prévention déclarés dans les DPR — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Exercices', snapshot.exercises.length, `${exercises.length} type(s)`, 'blue'),
      metric('TBT réalisés', hse.filter((item) => item.tbtPerformed).length, 'Toolbox talks', 'green'),
      metric('Visites / audits HSE', hse.filter((item) => item.hseVisitPerformed).length + hse.filter((item) => item.hseAuditPerformed).length, 'DPR de la période', 'orange'),
      metric('Événements HSE', totals.LTI + totals.RWC + totals.MTC + totals.FAC + totals.nearMiss, 'Événements classifiés', 'red'),
    ],
    charts: [
      { title: "Nombre d'accidents / incidents cumulés", kind: 'line', labels: eventPeriod.labels, series: [{ label: 'Événements', values: eventPeriod.values.map((value) => { eventRunning += value; return eventRunning; }), color: PURPLE }] },
      { title: "Exercices d'urgence", kind: 'bar', labels: exercisePeriod.labels, series: [{ label: 'Nombre', values: exercisePeriod.values, color: BLUE }] },
    ],
    tables: [{ title: '1. Accidentologie', columns: ['Année', 'LTI', "Jours d'arrêt", 'RWC', 'MTC', 'FAC', 'Near Miss', 'Commuting'], rows: annual.map((row) => row.dataAvailable
      ? [String(row.year), String(row.LTI), String(row.lostDays), String(row.RWC), String(row.MTC), String(row.FAC), String(row.nearMiss), String(row.commuting)]
      : [String(row.year), ...Array.from({ length: 7 }, () => '—')]) }],
    notes: annual.some((row) => !row.dataAvailable) ? [unavailable('Historique accidentologique incomplet', `Données absentes pour ${annual.filter((row) => !row.dataAvailable).map((row) => row.year).join(', ')}.`)] : [],
    sources: ['DPR soumis/validés · actions HSE et exercices d’urgence', 'Événements HSE SeaPilot', sourceNote()],
  };
}

export function calculateFuelGhgTonnes(fuelM3: number, density = 0.85, emissionFactor = 3.206): number {
  return fuelM3 * density * emissionFactor;
}

export function calculateDirectFuelCo2eTonnes(fuelM3: number, factorTco2ePerM3: number): number {
  return fuelM3 * factorTco2ePerM3;
}

function buildEnvironmentContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const reports = reportMap(snapshot);
  const fuelLiters = snapshot.metrics.reduce((sum, item) => sum + item.fuelConsumedLiters, 0);
  const fuelSupplyM3 = snapshot.supplies.reduce((sum, item) => sum + item.fuelM3, 0);
  const waterM3 = snapshot.supplies.reduce((sum, item) => sum + item.waterM3, 0);
  const wasteKg = snapshot.waste.filter((item) => item.unit === 'kg').reduce((sum, item) => sum + item.quantity, 0);
  const wasteLiters = snapshot.waste.filter((item) => item.unit === 'l').reduce((sum, item) => sum + item.quantity, 0);
  const parameter = snapshot.environmentParameters?.at(-1);
  const density = parameter?.density || 0;
  const emissionFactor = parameter?.emissionFactor || 0;
  const reduction = parameter?.xbeeReductionRate || 0;
  const ghgWithoutXbee = density && emissionFactor ? calculateFuelGhgTonnes(fuelLiters / 1000, density, emissionFactor) : 0;
  const ghgWithXbee = ghgWithoutXbee * (1 - reduction);
  const fuelPeriod = periodValues(snapshot.scope, snapshot.metrics, (item) => reports.get(item.dprId)?.reportDate || '', (item) => item.fuelConsumedLiters / 1000);
  const waterPeriod = periodValues(snapshot.scope, snapshot.supplies, (item) => reports.get(item.dprId)?.reportDate || '', (item) => item.waterM3);
  return {
    summary: `Consommations et impacts environnementaux déclarés dans les DPR — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Carburant consommé', `${formatNumber(fuelLiters / 1000, 1)} m³`, 'Somme DPR', 'orange'),
      metric('Carburant avitaillé', `${formatNumber(fuelSupplyM3, 1)} m³`, 'Avitaillements DPR', 'blue'),
      metric('Eau avitaillée', `${formatNumber(waterM3, 1)} m³`, 'Avitaillements DPR', 'blue'),
      metric('GES avec xBee', parameter ? `${formatNumber(ghgWithXbee, 2)} tCO₂e` : '—', parameter ? `Réduction ${formatNumber(reduction * 100)} %` : 'Paramètre Supabase absent', 'green'),
    ],
    charts: [
      { title: 'Eau avitaillée mensuelle', kind: 'line', labels: waterPeriod.labels, series: [{ label: 'Eau avitaillée', values: waterPeriod.values, color: BLUE }], unit: 'm³' },
      { title: 'Consommation de fuel mensuelle', kind: 'line', labels: fuelPeriod.labels, series: [{ label: 'Fuel consommé', values: fuelPeriod.values, color: BLUE }], unit: 'm³' },
      { title: 'Émissions de GES', kind: 'line', labels: ['Sans xBee', 'Avec xBee'], series: [{ label: 'tCO₂e', values: [parameter ? ghgWithoutXbee : null, parameter ? ghgWithXbee : null], color: TEAL }] },
    ],
    tables: [{
      title: 'Bilan environnemental', columns: ['Indicateur', 'Valeur', 'Méthode'], rows: [
        ['Déchets solides', `${formatNumber(wasteKg, 1)} kg`, 'Somme des enregistrements DPR en kg'],
        ['Déchets liquides', `${formatNumber(wasteLiters, 1)} l`, 'Somme des enregistrements DPR en litres'],
        ['GES sans xBee', parameter ? `${formatNumber(ghgWithoutXbee, 2)} tCO₂e` : '—', parameter ? `${density} t/m³ × ${emissionFactor} tCO₂e/t` : 'Paramètres absents'],
        ['GES avec xBee', parameter ? `${formatNumber(ghgWithXbee, 2)} tCO₂e` : '—', parameter ? `Tous navires · réduction ${formatNumber(reduction * 100)} %` : 'Paramètres absents'],
        ['GES évités', parameter ? `${formatNumber(ghgWithoutXbee - ghgWithXbee, 2)} tCO₂e` : '—', 'Écart sans xBee / avec xBee'],
      ],
    }],
    notes: parameter ? [{ title: 'Méthode environnementale', text: `Tous les navires utilisent xBee sur toute la période. Calcul Supabase : volume consommé × densité ${density} × facteur ${emissionFactor}, puis réduction de ${formatNumber(reduction * 100)} %.` }] : [unavailable('Paramètres environnementaux absents', 'La densité, le facteur d’émission et le taux xBee doivent être configurés dans Supabase ; aucune valeur n’est inventée.')],
    sources: ['DPR soumis/validés · métriques, avitaillements et déchets', sourceNote()],
  };
}

function employedAt(person: PersonRecord, date: string): boolean {
  return (!person.hiredOn || person.hiredOn <= date) && (!person.departedOn || person.departedOn > date);
}
function buildGovernanceContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const people = snapshot.people.filter((person) => employedAt(person, scopeEnd(snapshot.scope)));
  const improvementActions = yearActions(snapshot).filter((action) => normalize(`${action.deviationType} ${action.categoryKey} ${action.title}`).includes('amelior'));
  return {
    summary: `Indicateurs sociaux et démarches d’amélioration disponibles — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Effectif en fin de période', people.length, 'Contrats présents au 31 décembre', 'blue'),
      metric('Propositions d’amélioration', improvementActions.length, 'Actions explicitement qualifiées', 'green'),
      metric('Propositions soldées', improvementActions.filter(closedAction).length, 'Clôture enregistrée', 'green'),
      metric('Entretiens annuels', '—', 'Aucune source structurée SeaPilot', 'orange'),
    ],
    charts: [categoricalChart('Effectif par type de contrat', countBy(people, (person) => person.contractType), BLUE), categoricalChart('Propositions par statut', countBy(improvementActions, (action) => action.status), TEAL)],
    tables: [{ title: 'Propositions d’amélioration', columns: ['Date', 'Proposition', 'Responsable', 'Statut'], rows: rowsLimited(improvementActions.map((action) => [formatDate(action.openedOn), action.title, action.ownerName || '—', action.status || '—']), 36) }],
    notes: [
      unavailable('Entretiens annuels', 'SeaPilot ne dispose pas encore d’un registre structuré des campagnes et scores d’entretien annuel.'),
      unavailable('Discrimination et droits humains', 'Aucun registre dédié n’est présent ; aucune valeur n’est déduite des actions génériques.'),
    ],
    sources: ['Référentiel RH SeaPilot', 'Plan d’action QHSE', sourceNote()],
  };
}

function visitsInYear(snapshot: QhseReportSnapshot, predicate: (visit: PlanningVesselVisit) => boolean = () => true) {
  return snapshot.visits.filter(predicate).flatMap((visit) => visit.occurrences
    .filter((occurrence) => inScope(occurrence.scheduledOn, snapshot.scope))
    .map((occurrence) => ({ visit, occurrence })));
}
function technicalStops(snapshot: QhseReportSnapshot) { return visitsInYear(snapshot, (visit) => visit.visitType === 'technical_stop'); }
function downtimeHours(snapshot: QhseReportSnapshot): number {
  const breakdown = snapshot.portCalls.filter((call) => call.reasons.includes('breakdown')).reduce((sum, call) => sum + hoursBetween(call.arrivalAt, call.departureAt), 0);
  const stopGroups = snapshot.visits.filter((visit) => visit.visitType === 'technical_stop').map((visit) => visit.occurrences
    .filter((item) => inScope(item.scheduledOn, snapshot.scope)).sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt)));
  const planned = stopGroups.reduce((sum, occurrences) => occurrences.length > 1 ? sum + hoursBetween(occurrences[0].scheduledAt, occurrences.at(-1)!.scheduledAt) : sum + (occurrences.length ? 24 : 0), 0);
  return breakdown + planned;
}
function vesselFactor(snapshot: QhseReportSnapshot): number {
  if (scopeVesselIds(snapshot.scope).length) return scopeVesselIds(snapshot.scope).length;
  return Math.max(1, new Set(snapshot.reports.map((report) => report.vesselId).filter(Boolean)).size);
}
function availability(snapshot: QhseReportSnapshot): number {
  const possible = scopeCalendarDays(snapshot.scope) * 24 * vesselFactor(snapshot);
  return possible ? Math.max(0, Math.min(100, (1 - (downtimeHours(snapshot) / possible)) * 100)) : 0;
}
function coverage(snapshot: QhseReportSnapshot): number {
  const unique = new Set(snapshot.reports.map((report) => `${report.vesselId || 'none'}:${report.reportDate}`)).size;
  const possible = scopeCalendarDays(snapshot.scope) * vesselFactor(snapshot);
  return possible ? Math.min(100, (unique / possible) * 100) : 0;
}
function buildMaintenanceContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const stops = technicalStops(snapshot);
  const allVisits = visitsInYear(snapshot);
  return {
    summary: `Maintenance et visites planifiées dans SeaPilot — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Arrêts techniques', stops.length, 'Occurrences planifiées', 'orange'),
      metric('Visites et audits', allVisits.length, 'Toutes catégories planifiées', 'blue'),
      metric('Prestataires', new Set(allVisits.map((item) => item.visit.provider.name).filter(Boolean)).size, 'Prestataires distincts', 'green'),
      metric('Heures moteur', '—', 'Non structurées dans SeaPilot', 'orange'),
    ],
    charts: [categoricalChart('Visites par type', countBy(allVisits, (item) => planningVisitTypeLabel(item.visit.visitType)), BLUE), categoricalChart('Visites par mois', MONTHS.map((label, month) => [label, allVisits.filter((item) => monthOf(item.occurrence.scheduledOn) === month).length]), TEAL)],
    tables: [{ title: 'Planning maintenance et visites', columns: ['Date', 'Type', 'Prestataire', 'Commentaire'], rows: rowsLimited(allVisits.map((item) => [formatDate(item.occurrence.scheduledOn), planningVisitTypeLabel(item.visit.visitType), item.visit.provider.name || '—', item.visit.comments || '—']), 44) }],
    notes: [unavailable('Heures de fonctionnement', 'Les heures des moteurs principaux présentes dans le rapport de référence ne sont pas stockées sous forme structurée dans SeaPilot.')],
    sources: ['Planning SeaPilot · visites et arrêts techniques', sourceNote()],
  };
}

function buildAvailabilityContent(snapshot: QhseReportSnapshot, operations: boolean): QhseReportContent {
  const rate = availability(snapshot);
  const downtime = downtimeHours(snapshot);
  const reportCoverage = coverage(snapshot);
  const reasons = countBy(snapshot.portCalls.flatMap((call) => call.reasons.map((reason) => ({ reason }))), (item) => item.reason);
  return {
    summary: `${operations ? 'Disponibilité opérationnelle' : 'Disponibilité technique'} documentée — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Disponibilité documentée', percent(rate), 'Temps calendaire moins indisponibilités enregistrées', rate >= 95 ? 'green' : 'orange'),
      metric('Indisponibilité recensée', `${formatNumber(downtime, 1)} h`, 'Avaries + arrêts techniques', 'red'),
      metric('Couverture DPR', percent(reportCoverage), 'Jours-navire avec DPR soumis/validé', reportCoverage >= 90 ? 'green' : 'orange'),
      metric('DPR retenus', snapshot.reports.length, 'Période et navire sélectionnés', 'blue'),
    ],
    charts: [categoricalChart('Motifs des escales', reasons, operations ? BLUE : ORANGE), categoricalChart('Incidents DPR par niveau', countBy(snapshot.incidents, (item) => item.level), RED)],
    tables: [{ title: 'Composantes du calcul', columns: ['Composante', 'Valeur', 'Règle'], rows: [
      ['Temps calendaire', `${formatNumber(scopeCalendarDays(snapshot.scope) * 24 * vesselFactor(snapshot))} h`, `${vesselFactor(snapshot)} navire(s) documenté(s)`],
      ['Avaries en escale', `${formatNumber(snapshot.portCalls.filter((call) => call.reasons.includes('breakdown')).reduce((sum, call) => sum + hoursBetween(call.arrivalAt, call.departureAt), 0), 1)} h`, 'Escales avec motif breakdown'],
      ['Arrêts techniques', String(technicalStops(snapshot).length), 'Occurrences du planning'],
    ] }],
    notes: [{ title: 'Périmètre du taux', text: 'Ce taux mesure uniquement les indisponibilités structurées dans SeaPilot. Une période non saisie ne peut pas être considérée comme une disponibilité prouvée ; la couverture DPR est donc affichée séparément.', tone: 'warning' }],
    sources: ['Planning des arrêts techniques', 'DPR soumis/validés · escales, motifs et incidents', sourceNote()],
  };
}

function buildActionPlanContent(snapshot: QhseReportSnapshot, policyOnly: boolean): QhseReportContent {
  const all = yearActions(snapshot);
  const actions = policyOnly ? all.filter((action) => normalize(`${action.categoryKey} ${action.actionType} ${action.title}`).match(/politique|objectif|amelior|rse/)) : all;
  const overdue = actions.filter((action) => !closedAction(action) && action.dueOn && action.dueOn < scopeEnd(snapshot.scope));
  const byDeviation = countBy(actions, (action) => action.deviationType || action.actionType);
  return {
    summary: `${policyOnly ? 'Suivi des politiques et améliorations QHSE' : 'Pilotage global du plan d’action'} — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Actions', actions.length, 'Ouvertes sur la période', 'blue'),
      metric('Soldées', actions.filter(closedAction).length, percent(actions.length ? (actions.filter(closedAction).length / actions.length) * 100 : 0), 'green'),
      metric('Non soldées', actions.filter((action) => !closedAction(action)).length, 'À traiter', 'orange'),
      metric('Échues non soldées', overdue.length, 'Échéance au plus tard le 31/12', 'red'),
    ],
    charts: [categoricalChart('Actions par statut', countBy(actions, (action) => action.status), BLUE), categoricalChart('Actions par type d’écart', byDeviation, ORANGE)],
    tables: [{ title: 'Liste des actions', columns: ['Ouverture', 'Échéance', 'Action', 'Responsable', 'Statut'], rows: rowsLimited(actions.map((action) => [formatDate(action.openedOn), formatDate(action.dueOn), action.title, action.ownerName || '—', action.status || '—']), 54) }],
    notes: policyOnly && !actions.length ? [unavailable('Aucune action qualifiée', 'Aucune action de la période ne porte une qualification explicite politique, objectif, RSE ou amélioration.')] : [],
    sources: ['Plan d’action QHSE SeaPilot', sourceNote()],
  };
}

function buildVisitPlanningContent(snapshot: QhseReportSnapshot, clientVersion: boolean): QhseReportContent {
  const items = visitsInYear(snapshot, clientVersion ? (visit) => ['client_audit', 'annual_classification_society', 'annual_maritime_affairs', 'anfr_visit'].includes(visit.visitType) : () => true);
  return {
    summary: `${clientVersion ? 'Planning partageable des visites réglementaires et client' : 'Planning interne des visites, audits et arrêts'} — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Occurrences', items.length, 'Dates de la période', 'blue'),
      metric('Types de visite', new Set(items.map((item) => item.visit.visitType)).size, 'Catégories distinctes', 'green'),
      metric('Prestataires', new Set(items.map((item) => item.visit.providerId)).size, 'Intervenants planifiés', 'blue'),
      metric('Pièces jointes', items.reduce((sum, item) => sum + item.visit.attachments.length, 0), clientVersion ? 'Non listées dans le détail client' : 'Rattachées aux visites', 'orange'),
    ],
    charts: [categoricalChart('Planning mensuel', MONTHS.map((label, month) => [label, items.filter((item) => monthOf(item.occurrence.scheduledOn) === month).length]), TEAL), categoricalChart('Répartition par type', countBy(items, (item) => planningVisitTypeLabel(item.visit.visitType)), BLUE)],
    tables: [{
      title: clientVersion ? 'Calendrier partageable' : 'Calendrier interne',
      columns: clientVersion ? ['Date', 'Visite', 'Prestataire'] : ['Date', 'Visite', 'Prestataire', 'Commentaire'],
      rows: rowsLimited(items.map((item) => clientVersion
        ? [formatDate(item.occurrence.scheduledOn), planningVisitTypeLabel(item.visit.visitType), item.visit.provider.name || 'À définir']
        : [formatDate(item.occurrence.scheduledOn), planningVisitTypeLabel(item.visit.visitType), item.visit.provider.name || 'À définir', item.visit.comments || '—']), 56),
    }],
    notes: items.length ? [] : [unavailable('Planning vide', 'Aucune occurrence de visite ne correspond à la période et au périmètre sélectionnés.')],
    sources: ['Planning SeaPilot · visites de navire', sourceNote()],
  };
}

function certificateStatusAt(certificate: FleetCertificateRecord, year: number): string {
  if (!certificate.expiresOn) return certificate.status === 'missing' ? 'Manquant' : 'Sans échéance';
  if (certificate.expiresOn < `${year}-01-01`) return 'Expiré avant période';
  if (certificate.expiresOn <= `${year}-12-31`) return 'Échéance dans la période';
  return 'Valide après période';
}
function buildCertificateContent(snapshot: QhseReportSnapshot, validity: boolean): QhseReportContent {
  const items = snapshot.certificates.filter((item) => item.isActiveFleet);
  const statusEntries = countBy(items, (item) => validity ? certificateStatusAt(item, snapshot.scope.year) : item.categoryLabel);
  const expiring = items.filter((item) => item.expiresOn && item.expiresOn >= scopeStart(snapshot.scope) && item.expiresOn <= scopeEnd(snapshot.scope));
  const missing = items.filter((item) => item.status === 'missing');
  return {
    summary: `${validity ? 'Validité et renouvellement des certificats' : 'Référentiel documentaire de la flotte'} — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Certificats', items.length, `${new Set(items.map((item) => item.vesselName)).size} navire(s)`, 'blue'),
      metric('Échéances sur la période', expiring.length, scopeYears(snapshot.scope).join(', '), 'orange'),
      metric('Manquants', missing.length, 'Statut SeaPilot', missing.length ? 'red' : 'green'),
      metric('Renouvellements planifiés', items.filter((item) => Boolean(item.plannedOn)).length, 'Date planifiée renseignée', 'green'),
    ],
    charts: [categoricalChart(validity ? 'Statut à l’échelle de la période' : 'Certificats par catégorie', statusEntries, validity ? ORANGE : BLUE)],
    tables: [{
      title: validity ? 'Échéancier des certificats' : 'Liste des certificats',
      columns: validity ? ['Navire', 'Document', 'Échéance', 'Statut période', 'Renouvellement'] : ['Navire', 'Catégorie', 'Document', 'Émission', 'Échéance'],
      rows: rowsLimited(items.map((item) => validity
        ? [item.vesselName || '—', item.documentTitle || item.title, formatDate(item.expiresOn), certificateStatusAt(item, snapshot.scope.year), formatDate(item.plannedOn)]
        : [item.vesselName || '—', item.categoryLabel || '—', item.documentTitle || item.title, formatDate(item.issuedOn), formatDate(item.expiresOn)]), 60),
    }],
    notes: [],
    sources: ['Référentiel Certificats flotte SeaPilot', sourceNote()],
  };
}

function ageAt(dateOfBirth: string, at: string): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(`${dateOfBirth.slice(0, 10)}T12:00:00`);
  const target = new Date(`${at}T12:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(target.getTime())) return null;
  let age = target.getFullYear() - birth.getFullYear();
  if (target.getMonth() < birth.getMonth() || (target.getMonth() === birth.getMonth() && target.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}
function genderKey(value: string): 'Femmes' | 'Hommes' | 'Non renseigné' {
  const normalized = normalize(value);
  if (['f', 'femme', 'feminin', 'female'].some((item) => normalized === item || normalized.startsWith(item))) return 'Femmes';
  if (['m', 'h', 'homme', 'masculin', 'male'].some((item) => normalized === item || normalized.startsWith(item))) return 'Hommes';
  return 'Non renseigné';
}
function buildAgeContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const at = scopeEnd(snapshot.scope);
  const people = snapshot.people.filter((person) => employedAt(person, at));
  const withAge = people.map((person) => ({ person, age: ageAt(person.birthDate, at), gender: genderKey(person.sex) }));
  const known = withAge.filter((item): item is typeof item & { age: number } => item.age !== null);
  const groups = [
    { label: '< 25', min: 0, max: 24 }, { label: '25–34', min: 25, max: 34 }, { label: '35–44', min: 35, max: 44 },
    { label: '45–54', min: 45, max: 54 }, { label: '55+', min: 55, max: 119 },
  ];
  const average = known.length ? known.reduce((sum, item) => sum + item.age, 0) / known.length : 0;
  return {
    summary: `Structure d’âge de l’effectif présent au ${formatDate(scopeEnd(snapshot.scope))}.`,
    metrics: [
      metric('Effectif', people.length, 'Présents en fin de période', 'blue'),
      metric('Âge renseigné', known.length, percent(people.length ? (known.length / people.length) * 100 : 0), 'green'),
      metric('Âge moyen', known.length ? `${formatNumber(average, 1)} ans` : '—', 'Dates de naissance connues', 'blue'),
      metric('Genre non renseigné', withAge.filter((item) => item.gender === 'Non renseigné').length, 'Aucune extrapolation', 'orange'),
    ],
    charts: [{
      title: 'Pyramide des âges', kind: 'bar', labels: groups.map((group) => group.label), series: [
        { label: 'Femmes', values: groups.map((group) => known.filter((item) => item.gender === 'Femmes' && item.age >= group.min && item.age <= group.max).length), color: PURPLE },
        { label: 'Hommes', values: groups.map((group) => known.filter((item) => item.gender === 'Hommes' && item.age >= group.min && item.age <= group.max).length), color: BLUE },
        { label: 'Non renseigné', values: groups.map((group) => known.filter((item) => item.gender === 'Non renseigné' && item.age >= group.min && item.age <= group.max).length), color: ORANGE },
      ],
    }],
    tables: [{ title: 'Répartition par tranche', columns: ['Tranche', 'Femmes', 'Hommes', 'Non renseigné', 'Total'], rows: groups.map((group) => {
      const values = ['Femmes', 'Hommes', 'Non renseigné'].map((gender) => known.filter((item) => item.gender === gender && item.age >= group.min && item.age <= group.max).length);
      return [group.label, ...values.map(String), String(values.reduce((sum, value) => sum + value, 0))];
    }) }],
    notes: known.length < people.length ? [unavailable('Données incomplètes', `${people.length - known.length} personne(s) sans date de naissance exploitable.`)] : [],
    sources: ['Référentiel RH SeaPilot', sourceNote()],
  };
}

function buildManagementContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const at = scopeEnd(snapshot.scope);
  const people = snapshot.people.filter((person) => employedAt(person, at));
  const hires = people.filter((person) => inScope(person.hiredOn, snapshot.scope));
  const departures = snapshot.people.filter((person) => inScope(person.departedOn, snapshot.scope));
  return {
    summary: `Vue management de l’effectif au ${formatDate(scopeEnd(snapshot.scope))}.`,
    metrics: [
      metric('Effectif', people.length, 'Collaborateurs présents', 'blue'),
      metric('Entrées', hires.length, `Période ${scopeYears(snapshot.scope).join(', ')}`, 'green'),
      metric('Sorties', departures.length, `Période ${scopeYears(snapshot.scope).join(', ')}`, 'orange'),
      metric('Fonctions', new Set(people.map((person) => person.functionLabel).filter(Boolean)).size, 'Fonctions distinctes', 'blue'),
    ],
    charts: [categoricalChart('Effectif par fonction', countBy(people, (person) => person.functionLabel), BLUE), categoricalChart('Effectif par contrat', countBy(people, (person) => person.contractType), TEAL)],
    tables: [{ title: 'Annuaire management', columns: ['Collaborateur', 'Fonction', 'Grade', 'Contrat', 'Ancienneté'], rows: rowsLimited(people.map((person) => {
      const years = person.hiredOn ? Math.max(0, snapshot.scope.year - Number(person.hiredOn.slice(0, 4))) : null;
      return [`${person.firstName} ${person.lastName}`.trim(), person.functionLabel || '—', person.gradeLabel || '—', person.contractType || '—', years === null ? '—' : `${years} an(s)`];
    }), 56) }],
    notes: [],
    sources: ['Référentiel RH SeaPilot', sourceNote()],
  };
}

function buildHseKpiContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const totals = safetyTotals(snapshot);
  const hse = snapshot.hseActions;
  return {
    summary: `Tableau de bord QHSE projet / navire — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Heures travaillées', `${formatNumber(totals.exposureHours)} h`, 'Registre HSE versionné', 'blue'),
      metric('Exercices', snapshot.exercises.length, 'DPR soumis/validés', 'green'),
      metric('TBT', hse.filter((item) => item.tbtPerformed).length, 'DPR avec TBT', 'green'),
      metric('Visites HSE', hse.filter((item) => item.hseVisitPerformed).length, 'DPR avec visite', 'blue'),
      metric('Audits HSE', hse.filter((item) => item.hseAuditPerformed).length, 'DPR avec audit', 'orange'),
      metric('Near miss', totals.nearMiss, 'Événements classifiés', 'orange'),
      metric('LTI', totals.LTI, 'Accidents avec arrêt', totals.LTI ? 'red' : 'green'),
      metric('Jours perdus', totals.lostDays, 'Événements HSE', totals.lostDays ? 'red' : 'green'),
    ],
    charts: [{
      title: 'Activités HSE mensuelles', kind: 'bar', labels: MONTHS, series: [
        { label: 'TBT', values: monthlyValues(hse, (item) => reportMap(snapshot).get(item.dprId)?.reportDate || '', (item) => item.tbtPerformed ? 1 : 0), color: TEAL },
        { label: 'Visites', values: monthlyValues(hse, (item) => reportMap(snapshot).get(item.dprId)?.reportDate || '', (item) => item.hseVisitPerformed ? 1 : 0), color: BLUE },
        { label: 'Audits', values: monthlyValues(hse, (item) => reportMap(snapshot).get(item.dprId)?.reportDate || '', (item) => item.hseAuditPerformed ? 1 : 0), color: ORANGE },
      ],
    }],
    tables: [{ title: 'Indicateurs de prévention', columns: ['Bonnes pratiques', 'Situations dangereuses', 'Stop work', 'Safety observations'], rows: [[
      String(hse.reduce((sum, item) => sum + item.goodPractices, 0)), String(hse.reduce((sum, item) => sum + item.dangerousSituations, 0)),
      String(hse.reduce((sum, item) => sum + item.stopWork, 0)), String(totals.safetyObservation),
    ]] }],
    notes: hseNotes(snapshot),
    sources: ['Registre HSE SeaPilot', 'DPR soumis/validés · prévention et exercices', sourceNote()],
  };
}

function buildAuditDeviationsContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const actions = yearActions(snapshot).filter((action) => normalize(`${action.actionTypeKey} ${action.actionType} ${action.auditType}`).includes('audit'));
  const overdue = actions.filter((action) => !closedAction(action) && action.dueOn && action.dueOn < scopeEnd(snapshot.scope));
  return {
    summary: `Suivi des écarts issus des audits — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Écarts', actions.length, 'Actions liées à un audit', 'blue'),
      metric('Soldés', actions.filter(closedAction).length, percent(actions.length ? (actions.filter(closedAction).length / actions.length) * 100 : 0), 'green'),
      metric('Non soldés', actions.filter((action) => !closedAction(action)).length, 'Actions ouvertes', 'orange'),
      metric('En retard', overdue.length, 'Échéance dépassée', 'red'),
    ],
    charts: [categoricalChart('Écarts par type', countBy(actions, (action) => action.deviationType), ORANGE), categoricalChart('Écarts par audit', countBy(actions, (action) => action.auditType || action.actionType), BLUE)],
    tables: [{ title: 'Registre des écarts', columns: ['Date', 'Type', 'Écart', 'Échéance', 'Statut'], rows: rowsLimited(actions.map((action) => [formatDate(action.openedOn), action.deviationType || '—', action.title, formatDate(action.dueOn), action.status || '—']), 56) }],
    notes: actions.length ? [] : [unavailable('Aucun écart', 'Aucune action explicitement liée à un audit n’est disponible sur la période.')],
    sources: ['Plan d’action QHSE SeaPilot', sourceNote()],
  };
}

function buildDocumentsContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const sources = snapshot.procedures.procedures;
  const publications = snapshot.procedures.publications;
  return {
    summary: `Référentiel des procédures QSMS et publications contrôlées — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Procédures sources', sources.length, 'Bibliothèque de travail', 'blue'),
      metric('Publications', publications.length, 'Versions publiées', 'green'),
      metric('Approuvées', sources.filter((item) => item.status === 'approved').length, 'Statut source', 'green'),
      metric('À revoir', sources.filter((item) => item.status === 'review').length, 'Statut en revue', 'orange'),
    ],
    charts: [categoricalChart('Documents par statut', countBy(sources, (item) => item.status), BLUE), categoricalChart('Documents par chapitre ISM', countBy(publications, (item) => item.ismChapter), TEAL)],
    tables: [{ title: 'Documents publiés', columns: ['Code', 'Titre', 'Révision', 'Publication', 'Chapitre ISM'], rows: rowsLimited(publications.map((item) => [item.procedureCode || item.documentNumber || '—', item.title, item.versionLabel || item.revisionLabel || '—', formatDate(item.publishedOn), item.ismChapter || '—']), 58) }],
    notes: [],
    sources: ['Bibliothèque QSMS SeaPilot · procédures et publications', sourceNote()],
  };
}

function buildConsumptionContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const reports = reportMap(snapshot);
  const years = scopeYears(snapshot.scope);
  const asMonthlyResetCurve = (period: { labels: string[]; values: number[] }) => ({
    labels: period.labels.flatMap((label) => [label, '']),
    values: period.values.flatMap((value) => [0, value]),
  });
  const waterPeriod = asMonthlyResetCurve(periodValues(snapshot.scope, snapshot.supplies, (item) => reports.get(item.dprId)?.reportDate || '', (item) => item.waterM3));
  const fuelConsumptionPeriod = asMonthlyResetCurve(periodValues(snapshot.scope, snapshot.metrics, (item) => reports.get(item.dprId)?.reportDate || '', (item) => item.fuelConsumedLiters / 1000));
  const parameters = snapshot.environmentParameters || [];
  const annual = years.map((year) => {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const parameter = parameters.filter((item) => item.effectiveFrom <= yearEnd && (!item.effectiveTo || item.effectiveTo >= yearStart)).at(-1);
    const metrics = snapshot.metrics.filter((item) => inYear(reports.get(item.dprId)?.reportDate || '', year));
    const supplies = snapshot.supplies.filter((item) => inYear(reports.get(item.dprId)?.reportDate || '', year));
    const fuelConsumedM3 = metrics.reduce((sum, item) => sum + item.fuelConsumedLiters, 0) / 1000;
    const waterM3 = supplies.reduce((sum, item) => sum + item.waterM3, 0);
    const monthlyFuelM3 = monthlyValues(metrics, (item) => reports.get(item.dprId)?.reportDate || '', (item) => item.fuelConsumedLiters / 1000);
    const ghg = parameter ? calculateDirectFuelCo2eTonnes(fuelConsumedM3, parameter.directCombustionFactor) : null;
    const withXbee = ghg === null || !parameter ? null : ghg * (1 - parameter.xbeeReductionRate);
    let cumulativeFuelM3 = 0;
    const cumulativeGhg = monthlyFuelM3.map((value) => {
      cumulativeFuelM3 += value;
      return parameter ? calculateDirectFuelCo2eTonnes(cumulativeFuelM3, parameter.directCombustionFactor) : null;
    });
    const cumulativeWithXbee = cumulativeGhg.map((value) => value === null || !parameter ? null : value * (1 - parameter.xbeeReductionRate));
    return {
      year, waterM3, fuelConsumedM3, ghg, withXbee,
      avoided: ghg === null || withXbee === null ? null : ghg - withXbee,
      factor: parameter?.directCombustionFactor || null,
      reduction: parameter?.xbeeReductionRate || null,
      cumulativeGhg, cumulativeWithXbee,
    };
  });
  const total = (value: (row: typeof annual[number]) => number) => annual.reduce((sum, row) => sum + value(row), 0);
  const emissionsAvailable = annual.every((row) => row.ghg !== null && row.withXbee !== null);
  const totalGhg = emissionsAvailable ? total((row) => row.ghg || 0) : null;
  const totalAvoided = emissionsAvailable ? total((row) => row.avoided || 0) : null;
  return {
    summary: `Eau avitaillée, consommation mensuelle de fuel et émissions cumulées calculées depuis les DPR — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Eau avitaillée', `${formatNumber(total((row) => row.waterM3), 1)} m³`, 'Cumul de la période', 'blue'),
      metric('Fuel consommé', `${formatNumber(total((row) => row.fuelConsumedM3), 1)} m³`, 'Champ DPR « Consommation de carburant en L »', 'blue'),
      metric('GES / CO₂e émis', totalGhg === null ? '—' : `${formatNumber(totalGhg, 2)} tCO₂e`, emissionsAvailable ? 'Facteur direct MDO : 2,85 tCO₂e/m³' : 'Paramètre Supabase absent', 'orange'),
      metric('Réduction xBee', totalAvoided === null ? '—' : `${formatNumber(totalAvoided, 2)} tCO₂e`, emissionsAvailable ? 'Baisse appliquée : 15 %' : 'Paramètre Supabase absent', 'green'),
    ],
    charts: [
      { title: 'Eau avitaillée mensuelle', kind: 'line', labels: waterPeriod.labels, series: [{ label: 'Eau avitaillée', values: waterPeriod.values, color: BLUE }], unit: 'm³', showValueLabels: true },
      { title: 'Consommation de fuel mensuelle', kind: 'line', labels: fuelConsumptionPeriod.labels, series: [{ label: 'Fuel consommé', values: fuelConsumptionPeriod.values, color: BLUE }], unit: 'm³', showValueLabels: true },
      {
        title: 'GES / CO₂e cumulés par an', kind: 'line', labels: years.flatMap((year) => MONTHS.map((month) => `${month} ${year}`)),
        series: [
          { label: 'GES / CO₂e sans xBee', values: annual.flatMap((row) => row.cumulativeGhg), color: [128, 128, 128] },
          { label: 'GES / CO₂e avec xBee (-15 %)', values: annual.flatMap((row) => row.cumulativeWithXbee), color: GREEN },
        ],
        unit: 'tCO₂e',
      },
    ],
    tables: [{ title: 'Cumuls annuels', columns: ['Année', 'Eau avitaillée', 'Fuel consommé', 'GES / CO₂e', 'Avec xBee', 'Réduction xBee'], rows: annual.map((row) => [
      String(row.year), `${formatNumber(row.waterM3, 1)} m³`, `${formatNumber(row.fuelConsumedM3, 1)} m³`,
      row.ghg === null ? '—' : `${formatNumber(row.ghg, 2)} tCO₂e`, row.withXbee === null ? '—' : `${formatNumber(row.withXbee, 2)} tCO₂e`,
      row.avoided === null ? '—' : `${formatNumber(row.avoided, 2)} tCO₂e`,
    ]) }],
    notes: emissionsAvailable ? [{
      title: 'Méthode de calcul',
      text: `Fuel consommé = somme du champ DPR « Consommation de carburant en L » ÷ 1 000. GES / CO₂e = volume MDO × ${formatNumber(annual[0]?.factor || 0, 2)} tCO₂e/m³. La courbe verte applique une réduction xBee de ${formatNumber((annual[0]?.reduction || 0) * 100)} %.`,
    }] : [unavailable('Paramètres environnementaux absents', 'Le facteur direct MDO et le taux xBee doivent être renseignés dans Supabase ; aucune émission n’est inventée.')],
    sources: ['DPR soumis/validés · consommation de carburant et eau avitaillée', 'Paramètres environnementaux Supabase versionnés', sourceNote()],
  };
}

export function buildQhseReportContent(report: QhseReportDefinition, snapshot: QhseReportSnapshot): QhseReportContent {
  let content: QhseReportContent;
  switch (report.id as QhseReportId) {
    case 'menu': content = buildMenuContent(snapshot); break;
    case 'port-call-duration': content = buildPortCallContent(snapshot, false); break;
    case 'hse-tf-tg': content = buildTfTgContent(snapshot); break;
    case 'social-safety-1': content = buildSocialSafetyContent(snapshot, 1); break;
    case 'social-safety-2': content = buildSocialSafetyContent(snapshot, 2); break;
    case 'social-safety-vessel': content = buildVesselSafetyContent(snapshot); break;
    case 'environment': content = buildEnvironmentContent(snapshot); break;
    case 'social-governance': content = buildGovernanceContent(snapshot); break;
    case 'planned-maintenance': content = buildMaintenanceContent(snapshot); break;
    case 'technical-availability': content = buildAvailabilityContent(snapshot, false); break;
    case 'port-call-tracking': content = buildPortCallContent(snapshot, false); break;
    case 'port-call-tracking-v2': content = buildPortCallContent(snapshot, true); break;
    case 'operations-availability': content = buildAvailabilityContent(snapshot, true); break;
    case 'action-plan-global': content = buildActionPlanContent(snapshot, false); break;
    case 'action-plan-policy': content = buildActionPlanContent(snapshot, true); break;
    case 'visit-planning-internal': content = buildVisitPlanningContent(snapshot, false); break;
    case 'certificate-list': content = buildCertificateContent(snapshot, false); break;
    case 'certificate-validity': content = buildCertificateContent(snapshot, true); break;
    case 'visit-planning-client': content = buildVisitPlanningContent(snapshot, true); break;
    case 'hr-age-pyramid': content = buildAgeContent(snapshot); break;
    case 'hr-management': content = buildManagementContent(snapshot); break;
    case 'hse-kpi-lems': content = buildHseKpiContent(snapshot); break;
    case 'hse-audit-deviations-lems': content = buildAuditDeviationsContent(snapshot); break;
    case 'documents-list': content = buildDocumentsContent(snapshot); break;
    case 'consumption': content = buildConsumptionContent(snapshot); break;
  }
  if (snapshot.warnings.length) content.notes.push(unavailable('Accès partiel', snapshot.warnings.join(' ')));
  return content;
}
