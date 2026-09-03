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
  const startsOn = `${scope.year}-01-01`;
  const endsOn = `${scope.year}-12-31`;
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
    if (scope.vesselId) reportQuery = reportQuery.eq('vessel_id', scope.vesselId);
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
  const [dpr, certificates, visits, people, procedures, hseDashboard] = await Promise.all([
    fetchDprData(client, scope, warnings),
    safeLoad('Certificats flotte', [] as FleetCertificateRecord[], warnings, () => fetchFleetCertificates(client)),
    safeLoad('Planning des visites', [] as PlanningVesselVisit[], warnings, () => fetchPlanningVesselVisits(client)),
    safeLoad('Ressources humaines', [] as PersonRecord[], warnings, () => fetchPeople(client)),
    safeLoad('Procédures QSMS', { procedures: [], publications: [] } as ProceduresData, warnings, () => fetchProceduresData(client)),
    scope.vesselId
      ? safeLoad('Indicateurs HSE', null as ActionPlanHseDashboard | null, warnings, () => fetchActionPlanHseDashboard(client, scope.year, { vesselId: scope.vesselId }))
      : Promise.resolve(seed.hseDashboard?.year === scope.year ? seed.hseDashboard : null),
  ]);
  return {
    scope,
    actions: seed.actions.filter((action) => (!scope.vesselId || action.vesselId === scope.vesselId)),
    actionTypes: seed.actionTypes,
    hseDashboard,
    certificates: certificates.filter((item) => !scope.vesselId || item.vesselId === scope.vesselId),
    visits: visits.filter((item) => !scope.vesselId || item.vesselId === scope.vesselId),
    people,
    procedures,
    warnings,
    ...dpr,
  };
}

function reportMap(snapshot: QhseReportSnapshot): Map<number, DprReportRow> {
  return new Map(snapshot.reports.map((report) => [report.id, report]));
}
function yearActions(snapshot: QhseReportSnapshot): ActionItemRecord[] {
  return snapshot.actions.filter((action) => inYear(action.occurredAt || action.openedOn, snapshot.scope.year));
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
  return `${snapshot.scope.year}${snapshot.scope.vesselName ? ` · ${snapshot.scope.vesselName}` : ' · flotte complète'}`;
}

function buildMenuContent(snapshot: QhseReportSnapshot): QhseReportContent {
  return {
    summary: `Catalogue des 25 pages du rapport QHSE, reconstruites à partir des seules données SeaPilot — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Rapports disponibles', QHSE_REPORT_CATALOG.length, 'Un PDF distinct par page', 'blue'),
      metric('Période', String(snapshot.scope.year), snapshot.scope.vesselName || 'Tous les navires', 'green'),
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
  const totals = safetyTotals(snapshot);
  const actions = yearActions(snapshot).filter((action) => Boolean(actionClassification(action, snapshot)));
  const detailKey = variant === 1 ? 'injuryLocation' : 'victimActivity';
  const details = countBy(actions, (action) => text(action.safetyEventDetails[detailKey]));
  const pyramid: Array<[string, number]> = [
    ['Décès / accidents graves', totals.FAT + totals.LTI],
    ['Soins et travail restreint', totals.RWC + totals.MTC],
    ['Premiers soins', totals.FAC],
    ['Presqu’accidents', totals.nearMiss],
    ['Observations sécurité', totals.safetyObservation],
  ];
  return {
    summary: variant === 1
      ? `Typologie des événements de santé et sécurité — ${reportPeriodLabel(snapshot)}.`
      : `Lecture préventive selon la pyramide de Bird — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Événements classifiés', actions.length, 'Enregistrements SeaPilot de la période', 'blue'),
      metric('Accidents enregistrables', totals.FAT + totals.LTI + totals.RWC + totals.MTC, 'FAT + LTI + RWC + MTC', 'red'),
      metric('Premiers soins', totals.FAC, 'FAC', 'orange'),
      metric('Précurseurs', totals.nearMiss + totals.safetyObservation, 'Near miss + observations', 'green'),
    ],
    charts: variant === 1
      ? [categoricalChart('Événements par classification', countBy(actions, (action) => actionClassification(action, snapshot)), BLUE), categoricalChart('Localisation / activité renseignée', details, PURPLE)]
      : [categoricalChart('Pyramide de Bird — niveaux déclarés', pyramid, ORANGE), categoricalChart('Conséquences renseignées', countBy(actions, (action) => text(action.safetyEventDetails.consequences)), RED)],
    tables: [{
      title: 'Événements de la période', columns: ['Date', 'Classification', 'Navire / lieu', 'Événement', 'Jours perdus'],
      rows: rowsLimited(actions.map((action) => [formatDate(action.occurredAt || action.openedOn), actionClassification(action, snapshot) || '—', action.vesselName || action.locationDetail || '—', action.title, String(action.lostDays)]), 34),
    }],
    notes: hseNotes(snapshot),
    sources: ['Événements HSE et détails structurés du plan d’action', sourceNote()],
  };
}

function buildVesselSafetyContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const totals = safetyTotals(snapshot);
  const exercises = countBy(snapshot.exercises, (item) => item.type);
  const hse = snapshot.hseActions;
  return {
    summary: `Sécurité navire, exercices et prévention déclarés dans les DPR — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Exercices', snapshot.exercises.length, `${exercises.length} type(s)`, 'blue'),
      metric('TBT réalisés', hse.filter((item) => item.tbtPerformed).length, 'Toolbox talks', 'green'),
      metric('Visites / audits HSE', hse.filter((item) => item.hseVisitPerformed).length + hse.filter((item) => item.hseAuditPerformed).length, 'DPR de la période', 'orange'),
      metric('Événements HSE', totals.LTI + totals.RWC + totals.MTC + totals.FAC + totals.nearMiss, 'Événements classifiés', 'red'),
    ],
    charts: [categoricalChart('Exercices par type', exercises, TEAL), categoricalChart('Actions de prévention', [
      ['TBT', hse.filter((item) => item.tbtPerformed).length], ['Visites HSE', hse.filter((item) => item.hseVisitPerformed).length],
      ['Audits HSE', hse.filter((item) => item.hseAuditPerformed).length], ['Bonnes pratiques', hse.reduce((sum, item) => sum + item.goodPractices, 0)],
      ['Situations dangereuses', hse.reduce((sum, item) => sum + item.dangerousSituations, 0)], ['Stop work', hse.reduce((sum, item) => sum + item.stopWork, 0)],
    ], BLUE)],
    tables: [{ title: 'Exercices recensés', columns: ['Type', 'Nombre'], rows: exercises.map(([label, value]) => [label, String(value)]) }],
    notes: [],
    sources: ['DPR soumis/validés · actions HSE et exercices d’urgence', 'Événements HSE SeaPilot', sourceNote()],
  };
}

export function calculateFuelGhgTonnes(fuelM3: number): number {
  return fuelM3 * 0.85 * 3.206;
}

function buildEnvironmentContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const reports = reportMap(snapshot);
  const fuelLiters = snapshot.metrics.reduce((sum, item) => sum + item.fuelConsumedLiters, 0);
  const fuelSupplyM3 = snapshot.supplies.reduce((sum, item) => sum + item.fuelM3, 0);
  const waterM3 = snapshot.supplies.reduce((sum, item) => sum + item.waterM3, 0);
  const wasteKg = snapshot.waste.filter((item) => item.unit === 'kg').reduce((sum, item) => sum + item.quantity, 0);
  const wasteLiters = snapshot.waste.filter((item) => item.unit === 'l').reduce((sum, item) => sum + item.quantity, 0);
  const ghg = calculateFuelGhgTonnes(fuelLiters / 1000);
  return {
    summary: `Consommations et impacts environnementaux déclarés dans les DPR — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Carburant consommé', `${formatNumber(fuelLiters / 1000, 1)} m³`, 'Somme DPR', 'orange'),
      metric('Carburant avitaillé', `${formatNumber(fuelSupplyM3, 1)} m³`, 'Avitaillements DPR', 'blue'),
      metric('Eau avitaillée', `${formatNumber(waterM3, 1)} m³`, 'Avitaillements DPR', 'blue'),
      metric('GES estimés', `${formatNumber(ghg, 1)} tCO₂e`, '0,85 t/m³ × 3,206 tCO₂e/t', 'red'),
    ],
    charts: [{
      title: 'Carburant consommé par mois', kind: 'bar', labels: MONTHS,
      series: [{ label: 'm³', values: monthlyValues(snapshot.metrics, (item) => reports.get(item.dprId)?.reportDate || '', (item) => item.fuelConsumedLiters / 1000), color: ORANGE }], unit: 'm³',
    }, categoricalChart('Déchets par type', countBy(snapshot.waste, (item) => `${item.type} (${item.unit})`).map(([label]) => [label, snapshot.waste.filter((item) => `${item.type} (${item.unit})` === label).reduce((sum, item) => sum + item.quantity, 0)]), TEAL)],
    tables: [{
      title: 'Bilan environnemental', columns: ['Indicateur', 'Valeur', 'Méthode'], rows: [
        ['Déchets solides', `${formatNumber(wasteKg, 1)} kg`, 'Somme des enregistrements DPR en kg'],
        ['Déchets liquides', `${formatNumber(wasteLiters, 1)} l`, 'Somme des enregistrements DPR en litres'],
        ['Scénario -15 % GES', `${formatNumber(ghg * 0.85, 1)} tCO₂e`, 'Scénario comparatif, pas une émission réelle'],
      ],
    }],
    notes: [{ title: 'Facteur d’émission', text: 'La formule reprend le modèle du rapport de référence : volume carburant × densité 0,85 × facteur 3,206. Elle constitue une estimation et non un bilan carbone certifié.' }],
    sources: ['DPR soumis/validés · métriques, avitaillements et déchets', sourceNote()],
  };
}

function employedAt(person: PersonRecord, date: string): boolean {
  return (!person.hiredOn || person.hiredOn <= date) && (!person.departedOn || person.departedOn > date);
}
function buildGovernanceContent(snapshot: QhseReportSnapshot): QhseReportContent {
  const people = snapshot.people.filter((person) => employedAt(person, `${snapshot.scope.year}-12-31`));
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
    .filter((occurrence) => inYear(occurrence.scheduledOn, snapshot.scope.year))
    .map((occurrence) => ({ visit, occurrence })));
}
function technicalStops(snapshot: QhseReportSnapshot) { return visitsInYear(snapshot, (visit) => visit.visitType === 'technical_stop'); }
function downtimeHours(snapshot: QhseReportSnapshot): number {
  const breakdown = snapshot.portCalls.filter((call) => call.reasons.includes('breakdown')).reduce((sum, call) => sum + hoursBetween(call.arrivalAt, call.departureAt), 0);
  const stopGroups = snapshot.visits.filter((visit) => visit.visitType === 'technical_stop').map((visit) => visit.occurrences
    .filter((item) => inYear(item.scheduledOn, snapshot.scope.year)).sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt)));
  const planned = stopGroups.reduce((sum, occurrences) => occurrences.length > 1 ? sum + hoursBetween(occurrences[0].scheduledAt, occurrences.at(-1)!.scheduledAt) : sum + (occurrences.length ? 24 : 0), 0);
  return breakdown + planned;
}
function vesselFactor(snapshot: QhseReportSnapshot): number {
  if (snapshot.scope.vesselId) return 1;
  return Math.max(1, new Set(snapshot.reports.map((report) => report.vesselId).filter(Boolean)).size);
}
function availability(snapshot: QhseReportSnapshot): number {
  const possible = daysInYear(snapshot.scope.year) * 24 * vesselFactor(snapshot);
  return possible ? Math.max(0, Math.min(100, (1 - (downtimeHours(snapshot) / possible)) * 100)) : 0;
}
function coverage(snapshot: QhseReportSnapshot): number {
  const unique = new Set(snapshot.reports.map((report) => `${report.vesselId || 'none'}:${report.reportDate}`)).size;
  const possible = daysInYear(snapshot.scope.year) * vesselFactor(snapshot);
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
      ['Temps calendaire', `${formatNumber(daysInYear(snapshot.scope.year) * 24 * vesselFactor(snapshot))} h`, `${vesselFactor(snapshot)} navire(s) documenté(s)`],
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
  const overdue = actions.filter((action) => !closedAction(action) && action.dueOn && action.dueOn < `${snapshot.scope.year}-12-31`);
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
  const expiring = items.filter((item) => item.expiresOn && item.expiresOn >= `${snapshot.scope.year}-01-01` && item.expiresOn <= `${snapshot.scope.year}-12-31`);
  const missing = items.filter((item) => item.status === 'missing');
  return {
    summary: `${validity ? 'Validité et renouvellement des certificats' : 'Référentiel documentaire de la flotte'} — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Certificats', items.length, `${new Set(items.map((item) => item.vesselName)).size} navire(s)`, 'blue'),
      metric('Échéances dans l’année', expiring.length, String(snapshot.scope.year), 'orange'),
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
  const at = `${snapshot.scope.year}-12-31`;
  const people = snapshot.people.filter((person) => employedAt(person, at));
  const withAge = people.map((person) => ({ person, age: ageAt(person.birthDate, at), gender: genderKey(person.sex) }));
  const known = withAge.filter((item): item is typeof item & { age: number } => item.age !== null);
  const groups = [
    { label: '< 25', min: 0, max: 24 }, { label: '25–34', min: 25, max: 34 }, { label: '35–44', min: 35, max: 44 },
    { label: '45–54', min: 45, max: 54 }, { label: '55+', min: 55, max: 119 },
  ];
  const average = known.length ? known.reduce((sum, item) => sum + item.age, 0) / known.length : 0;
  return {
    summary: `Structure d’âge de l’effectif présent au 31 décembre ${snapshot.scope.year}.`,
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
  const at = `${snapshot.scope.year}-12-31`;
  const people = snapshot.people.filter((person) => employedAt(person, at));
  const hires = people.filter((person) => inYear(person.hiredOn, snapshot.scope.year));
  const departures = snapshot.people.filter((person) => inYear(person.departedOn, snapshot.scope.year));
  return {
    summary: `Vue management de l’effectif au 31 décembre ${snapshot.scope.year}.`,
    metrics: [
      metric('Effectif', people.length, 'Collaborateurs présents', 'blue'),
      metric('Entrées', hires.length, `En ${snapshot.scope.year}`, 'green'),
      metric('Sorties', departures.length, `En ${snapshot.scope.year}`, 'orange'),
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
  const overdue = actions.filter((action) => !closedAction(action) && action.dueOn && action.dueOn < `${snapshot.scope.year}-12-31`);
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
  const fuel = snapshot.metrics.reduce((sum, item) => sum + item.fuelConsumedLiters, 0) / 1000;
  const byProject = new Map<string, { fuel: number; supply: number; water: number }>();
  const ensure = (label: string) => {
    const key = label || 'Projet non renseigné';
    if (!byProject.has(key)) byProject.set(key, { fuel: 0, supply: 0, water: 0 });
    return byProject.get(key)!;
  };
  snapshot.metrics.forEach((item) => { ensure(reports.get(item.dprId)?.projectLabel || '').fuel += item.fuelConsumedLiters / 1000; });
  snapshot.supplies.forEach((item) => { const target = ensure(reports.get(item.dprId)?.projectLabel || ''); target.supply += item.fuelM3; target.water += item.waterM3; });
  const projects = [...byProject.entries()].sort((left, right) => right[1].fuel - left[1].fuel);
  return {
    summary: `Consommations par projet et par mois — ${reportPeriodLabel(snapshot)}.`,
    metrics: [
      metric('Carburant consommé', `${formatNumber(fuel, 1)} m³`, 'DPR de la période', 'orange'),
      metric('Carburant avitaillé', `${formatNumber(snapshot.supplies.reduce((sum, item) => sum + item.fuelM3, 0), 1)} m³`, 'Avitaillements', 'blue'),
      metric('Eau avitaillée', `${formatNumber(snapshot.supplies.reduce((sum, item) => sum + item.waterM3, 0), 1)} m³`, 'Avitaillements', 'blue'),
      metric('Projets', projects.length, 'Projets avec consommation', 'green'),
    ],
    charts: [{ title: 'Carburant consommé par mois', kind: 'bar', labels: MONTHS, series: [{ label: 'm³', values: monthlyValues(snapshot.metrics, (item) => reports.get(item.dprId)?.reportDate || '', (item) => item.fuelConsumedLiters / 1000), color: ORANGE }], unit: 'm³' }, categoricalChart('Carburant par projet', projects.map(([label, values]) => [label, values.fuel]), BLUE)],
    tables: [{ title: 'Bilan par projet', columns: ['Projet', 'Consommé (m³)', 'Avitaillé (m³)', 'Eau (m³)'], rows: rowsLimited(projects.map(([label, values]) => [label, formatNumber(values.fuel, 1), formatNumber(values.supply, 1), formatNumber(values.water, 1)]), 40) }],
    notes: [],
    sources: ['DPR soumis/validés · métriques et avitaillements', sourceNote()],
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
