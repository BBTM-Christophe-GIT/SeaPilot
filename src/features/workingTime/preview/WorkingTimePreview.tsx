import type { SupabaseClient } from '@supabase/supabase-js';
import { Activity, AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileDown, Home, Menu, RotateCcw, Search, ShieldCheck, Ship, ShoppingCart, Upload, Users, Wrench } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { AppDialog } from '../../../components/AppDialog';
import { ModuleRibbon, ModuleRibbonCommand, ModuleRibbonGroup } from '../../../components/ModuleRibbon';
import { SeaPilotLogo } from '../../../components/SeaPilotLogo';
import { UserAvatar } from '../../../components/UserAvatar';
import { WorkingTimeEntryBoard, type WorkingTimeEntryGraphPreview } from '../WorkingTimeEntryBoard';
import type { WorkingTimeInterval } from '../workingTimeModel';
import type { WorkingTimePhaseInput } from '../workingTimeQueries';
import { analyzeWorkingTimePreview, PREVIEW_DEMO_POLICY, type PreviewPolicy, type PreviewRuleResult } from './workingTimePreviewProjection';
import { createPreviewIntervals, PREVIEW_DATE, PREVIEW_LEAVE_REST_RATE, PREVIEW_PEOPLE, previewAddDays, previewDateTime, previewDuration, previewInterval, previewMonthDays } from './workingTimePreviewData';
import { WorkingTimeMonthPreview } from './WorkingTimeMonthPreview';

type DayStatus = 'draft' | 'signed' | 'validated' | 'reopened';
interface DayDraft {
  pending: WorkingTimePhaseInput[];
  startsAt: string;
  endsAt: string;
  comment: string;
}
interface DayApproval { status: DayStatus; sailorSignedAt?: string; captainSignedAt?: string; justification?: string[] }
type Dialog = 'crew' | 'rules' | 'hse' | 'report' | 'import' | 'void' | 'justify' | 'reopen' | 'policy' | null;
const JUSTIFICATION_LABELS = ['Catégorie de cause', 'Contexte opérationnel', 'Action immédiate', 'Repos compensateur prévu', 'Commentaire obligatoire'];
const MAIN_RULES = ['max_work_24h', 'min_rest_24h', 'min_continuous_rest', 'max_work_7d', 'max_amplitude'];
const SIDEBAR_ITEMS = [{ label: 'Accueil', icon: Home, module: 'home' }, { label: 'QHSE', icon: ShieldCheck, module: 'qhse' }, { label: 'Opérations', icon: Activity, module: 'dpr' }, { label: 'Achats', icon: ShoppingCart, module: 'purchaseRequests' }, { label: 'Planning', icon: CalendarDays, module: 'planning' }];
const POLICY_FIELDS: Array<{ key: keyof PreviewPolicy; label: string; maximum: number; periods?: boolean }> = [
  { key: 'maxWork24Hours', label: 'Travail / journée de calcul', maximum: 24 },
  { key: 'minRest24Hours', label: 'Repos / 24 h', maximum: 24 },
  { key: 'minContinuousRestHours', label: 'Repos continu', maximum: 24 },
  { key: 'maxWork7DaysHours', label: 'Travail / 7 jours', maximum: 168 },
  { key: 'minRest7DaysHours', label: 'Repos / 7 jours', maximum: 168 },
  { key: 'maxRestPeriods', label: 'Nombre maximal de périodes de repos', maximum: 48, periods: true },
  { key: 'maxIntervalBetweenRestsHours', label: 'Intervalle maximal entre repos', maximum: 24 },
  { key: 'maxAmplitudeHours', label: 'Amplitude maximale', maximum: 24 },
];
const DEMO_COVERAGE = { startsAt: '2026-10-06T00:00', endsAt: '2026-10-14T00:00' };

function blankDraft(day: string): DayDraft { return { pending: [], startsAt: `${day}T00:00`, endsAt: `${day}T00:00`, comment: '' }; }
function draftKey(personId: number, day: string): string { return `${personId}:${day}`; }
function validPhase(phase: WorkingTimePhaseInput): boolean { return Number.isFinite(Date.parse(phase.startsAt)) && Date.parse(phase.endsAt) > Date.parse(phase.startsAt); }
function mergeDraftPhases(phases: WorkingTimePhaseInput[]): WorkingTimePhaseInput[] {
  return phases.filter(validPhase).sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)).reduce<WorkingTimePhaseInput[]>((result, phase) => {
    const previous = result.at(-1);
    if (!previous || Date.parse(phase.startsAt) > Date.parse(previous.endsAt)) result.push({ ...phase });
    else if (Date.parse(phase.endsAt) > Date.parse(previous.endsAt)) previous.endsAt = phase.endsAt;
    return result;
  }, []);
}
function localMinute(instant: number, day: string): number {
  if (instant <= Date.parse(`${day}T00:00`)) return 0;
  if (instant >= Date.parse(`${previewAddDays(day, 1)}T00:00`)) return 1440;
  // The grid follows the local clock, even on a 23-hour or 25-hour day.
  const clock = new Date(instant);
  return clock.getHours() * 60 + clock.getMinutes();
}
function ruleValue(rule: PreviewRuleResult): string { return rule.unit === 'periods' ? `${rule.actual} périodes` : previewDuration(rule.actual); }
function ruleLimit(rule: PreviewRuleResult): string { return `${rule.direction === 'maximum' ? 'maximum' : 'minimum'} ${rule.unit === 'periods' ? `${rule.limit} périodes` : `${rule.limit} h`}`; }
function segmentBounds(segment: { startsAt: string; endsAt: string }): string {
  return segment.startsAt.slice(0, 10) === segment.endsAt.slice(0, 10)
    ? `${segment.startsAt.slice(11, 16)}–${segment.endsAt.slice(11, 16)}`
    : `${previewDateTime(segment.startsAt)} → ${previewDateTime(segment.endsAt)}`;
}

export function WorkingTimePreview() {
  const [personId, setPersonId] = useState<number>(9301);
  const [selectedDay, setSelectedDay] = useState(PREVIEW_DATE);
  const selectedDayRef = useRef(PREVIEW_DATE);
  const ignoreNavigationEdits = useRef(false);
  const nextIntervalId = useRef(1000);
  const [intervals, setIntervals] = useState(createPreviewIntervals);
  const [drafts, setDrafts] = useState<Record<string, DayDraft>>(() => ({
    [draftKey(9301, PREVIEW_DATE)]: { pending: [{ startsAt: `${PREVIEW_DATE}T13:00`, endsAt: `${PREVIEW_DATE}T20:00` }], startsAt: `${PREVIEW_DATE}T13:00`, endsAt: `${PREVIEW_DATE}T20:00`, comment: 'Opération prolongée — retour à quai.' },
  }));
  const [approvals, setApprovals] = useState<Record<string, DayApproval>>({});
  const [editingIntervalId, setEditingIntervalId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [view, setView] = useState<'day' | 'month'>('day');
  const [sideTab, setSideTab] = useState<'rules' | 'approval'>('rules');
  const [crewSearch, setCrewSearch] = useState('');
  const [showFormer, setShowFormer] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [voidInterval, setVoidInterval] = useState<WorkingTimeInterval | null>(null);
  const [reason, setReason] = useState('');
  const [justification, setJustification] = useState<string[]>(Array(5).fill(''));
  const [submitPhases, setSubmitPhases] = useState<WorkingTimePhaseInput[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [archivedApprovals, setArchivedApprovals] = useState<Array<{ personId: number; day: string; approval: DayApproval; reason: string }>>([]);
  const [archivedIntervals, setArchivedIntervals] = useState<Array<{ interval: WorkingTimeInterval; reason: string }>>([]);
  const [policy, setPolicy] = useState<PreviewPolicy>({ ...PREVIEW_DEMO_POLICY });
  const [editablePolicy, setEditablePolicy] = useState<PreviewPolicy>({ ...PREVIEW_DEMO_POLICY });
  const [policyError, setPolicyError] = useState('');
  const [draftBeforeCorrection, setDraftBeforeCorrection] = useState<DayDraft | null>(null);
  const [justificationIntent, setJustificationIntent] = useState<'submit' | 'approve'>('submit');
  const [importRows, setImportRows] = useState<Array<{ date: string; phases: WorkingTimePhaseInput[]; comment: string }>>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const person = PREVIEW_PEOPLE.find((candidate) => candidate.id === personId)!;
  const key = draftKey(personId, selectedDay);
  const draft = drafts[key] || blankDraft(selectedDay);
  const approval = approvals[key] || { status: 'draft' as const };
  const canEdit = person.active && approval.status !== 'signed' && approval.status !== 'validated';
  const personIntervals = useMemo(() => intervals.filter((interval) => interval.personId === personId), [intervals, personId]);
  const monthPendingPhases = useMemo(() => Object.entries(drafts)
    .filter(([draftId]) => draftId.startsWith(`${personId}:`))
    .flatMap(([draftId, dayDraft]) => {
      const phase = { startsAt: dayDraft.startsAt, endsAt: dayDraft.endsAt };
      if (editingIntervalId && draftId === draftKey(personId, selectedDay)) return validPhase(phase) ? [phase] : [];
      return [...dayDraft.pending, ...(validPhase(phase) ? [phase] : [])];
    }), [drafts, personId, selectedDay, editingIntervalId]);
  const activePhase = { startsAt: draft.startsAt, endsAt: draft.endsAt };
  const projectedPhases = editingIntervalId ? (validPhase(activePhase) ? [activePhase] : []) : [...draft.pending, ...(validPhase(activePhase) ? [activePhase] : [])];
  const projection = analyzeWorkingTimePreview({ selectedDate: selectedDay, history: personIntervals.filter((interval) => interval.id !== editingIntervalId), phases: projectedPhases, policy, coverage: DEMO_COVERAGE });
  const deviations = projection.rules.filter((rule) => rule.status === 'deviation');
  const analysisConfirmed = projection.rules.every((rule) => rule.status !== 'unknown');
  const amplitude = projection.maximumAmplitudeSequence;
  const amplitudeBounds = amplitude ? segmentBounds(amplitude) : '';
  const workDayBounds = projection.maximumCalculationDay ? segmentBounds(projection.maximumCalculationDay) : '';
  const workDeviation = deviations.find((rule) => rule.key === 'max_work_24h');
  const windowLabel = `${previewDateTime(projection.window24.startsAt)} → ${previewDateTime(projection.window24.endsAt)}`;
  const calculationDay = projection.latestCalculationDay;
  const dayStart = Date.parse(`${selectedDay}T00:00`);
  const dayEnd = Date.parse(`${previewAddDays(selectedDay, 1)}T00:00`);
  const firstExcess = projection.excessWorkSegments.find((segment) => segment.startMs >= dayStart && segment.startMs < dayEnd);
  function phaseLabel(phase: WorkingTimePhaseInput, isPending: boolean) {
    const startMinute = localMinute(Date.parse(phase.startsAt), selectedDay);
    const endMinute = localMinute(Date.parse(phase.endsAt), selectedDay);
    const clockLabel = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    return { startMinute, endMinute, label: `${clockLabel(startMinute)}–${clockLabel(endMinute)}`, isPending };
  }
  const graph: WorkingTimeEntryGraphPreview = {
    ruleAlerts: deviations.filter((rule) => rule.key !== 'max_work_24h').map((rule) => `${rule.label} : ${ruleValue(rule)} (${ruleLimit(rule)})`),
    phaseLabels: [
      ...personIntervals.filter((interval) => interval.id !== editingIntervalId && Date.parse(interval.startsAt) < dayEnd && Date.parse(interval.endsAt) > dayStart).map((interval) => phaseLabel(interval, false)),
      ...mergeDraftPhases(projectedPhases).filter((phase) => Date.parse(phase.startsAt) < dayEnd && Date.parse(phase.endsAt) > dayStart).map((phase) => phaseLabel(phase, true)),
    ],
    workLimitMarkerMinute: firstExcess && firstExcess.startMs >= dayStart ? localMinute(firstExcess.startMs, selectedDay) : null,
    excessRanges: projection.excessWorkSegments.filter((segment) => segment.endMs > Date.parse(`${selectedDay}T00:00`) && segment.startMs < Date.parse(`${previewAddDays(selectedDay, 1)}T00:00`)).map((segment) => ({ startMinute: localMinute(segment.startMs, selectedDay), endMinute: localMinute(segment.endMs, selectedDay) })),
    windowLabel: calculationDay
      ? `Journée de calcul : ${previewDateTime(calculationDay.startsAt)} → ${previewDateTime(calculationDay.endsAt)}`
      : 'Journée de calcul : début à confirmer',
    workTotalLabel: `Cumul : ${previewDuration(calculationDay?.workHours ?? 0)}`,
    excessLabel: workDeviation ? `Dépassement +${previewDuration(workDeviation.deviation)}` : null,
    summaryLabel: calculationDay ? undefined : 'Aucune journée de calcul identifiable pour ce jour.',
    contextNotes: calculationDay ? [
      ...projection.calculationDays.filter((day) => day.status === 'closed').map((day) => `Journée clôturée : ${previewDateTime(day.startsAt)} → ${previewDateTime(day.endsAt)} · ${previewDuration(day.workHours)} de travail`),
      ...(calculationDay.precedingRest ? [`Repos au départ : ${segmentBounds(calculationDay.precedingRest)} (${previewDuration(calculationDay.precedingRest.hours)})`] : []),
      `Repère de 24 h : ${previewDateTime(calculationDay.horizonEndsAt)}${calculationDay.remainingHours > 0 ? ' · bilan en cours' : ' · repère atteint'}`,
      `Travail sur 24 h glissantes : ${previewDuration(projection.window24.workHours)}`,
      ...(!calculationDay.historyCovered ? ['Historique incomplet · début et valeurs à confirmer.'] : []),
    ] : [],
    isProjected: projectedPhases.length > 0,
  };
  const client = useMemo(() => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== 'working_time_phases_recommendation') return { data: null, error: { message: 'Opération indisponible dans cette préversion.' } };
      const phases = (args.p_phases as Array<{ starts_at: string; ends_at: string }>).map((phase) => ({ startsAt: phase.starts_at, endsAt: phase.ends_at }));
      const result = analyzeWorkingTimePreview({ selectedDate: selectedDay, history: personIntervals.filter((interval) => interval.id !== args.p_exclude_interval_id), phases, policy, coverage: DEMO_COVERAGE });
      const failures = result.rules.filter((rule) => rule.status === 'deviation');
      const currentWork = result.latestCalculationDay?.workHours ?? 0;
      return { error: null, data: { status: failures.length ? 'non_conforme' : result.rules.every((rule) => rule.status === 'ok') ? 'conforme' : 'sans_politique', policy_id: 1, policy_name: 'Règles de démonstration', already_non_compliant: failures.length > 0, work_24h_seconds: currentWork * 3600, work_7d_seconds: result.window7.workHours * 3600, rest_24h_seconds: result.window24.restHours * 3600, longest_rest_24h_seconds: result.window24.longestRestHours * 3600, available_24h_seconds: Math.max(0, policy.maxWork24Hours - currentWork) * 3600, available_7d_seconds: Math.max(0, policy.maxWork7DaysHours - result.window7.workHours) * 3600, max_additional_seconds: Math.max(0, Math.min(policy.maxWork24Hours - currentWork, policy.maxWork7DaysHours - result.window7.workHours)) * 3600, violation_codes: failures.map((rule) => rule.key) } };
    },
  }) as unknown as SupabaseClient, [personIntervals, selectedDay, policy]);

  function updateDraft(change: Partial<DayDraft>, day = selectedDayRef.current) {
    const nextKey = draftKey(personId, day);
    setDrafts((current) => ({ ...current, [nextKey]: { ...(current[nextKey] || blankDraft(day)), ...change } }));
  }
  function chooseDay(day: string) {
    if (editingIntervalId && draftBeforeCorrection) updateDraft(draftBeforeCorrection, selectedDay);
    selectedDayRef.current = day;
    ignoreNavigationEdits.current = true;
    queueMicrotask(() => { ignoreNavigationEdits.current = false; });
    setSelectedDay(day); setEditingIntervalId(null); setDraftBeforeCorrection(null); setMessage(''); setView('day');
  }
  function choosePerson(id: number) { if (editingIntervalId && draftBeforeCorrection) updateDraft(draftBeforeCorrection); setPersonId(id); setEditingIntervalId(null); setDraftBeforeCorrection(null); setDialog(null); setMessage(''); }
  function recordEvent(label: string) { setHistory((current) => [`${person.name} · ${selectedDay} · ${label}`, ...current]); }
  function savePhases(phases: WorkingTimePhaseInput[], status: DayStatus, fullJustification?: string[]) {
    const baseId = nextIntervalId.current;
    nextIntervalId.current += phases.length;
    const saved = phases.map((phase, index) => previewInterval(personId, baseId + index, phase, draft.comment));
    setIntervals((current) => [...current.filter((interval) => interval.id !== editingIntervalId), ...saved]);
    updateDraft(editingIntervalId && draftBeforeCorrection ? draftBeforeCorrection : { ...blankDraft(selectedDay), comment: draft.comment });
    setApprovals((current) => ({ ...current, [key]: { status, ...(status === 'signed' ? { sailorSignedAt: new Date().toISOString() } : {}), ...(fullJustification ? { justification: fullJustification } : {}) } }));
    setEditingIntervalId(null); setDraftBeforeCorrection(null);
    recordEvent(status === 'signed' ? 'Journée signée et soumise (démonstration)' : 'Périodes enregistrées au brouillon');
    setMessage(status === 'signed' ? 'Journée signée et soumise dans la préversion.' : 'Brouillon enregistré dans la préversion.');
  }
  function submit(phases: WorkingTimePhaseInput[], intent: 'save-correction' | 'save-draft' | 'submit-day' | 'validate-day') {
    if (intent === 'validate-day') { approveDay(); return; }
    if (!canEdit) return;
    const selectedPhases = mergeDraftPhases(projectedPhases.length ? projectedPhases : phases);
    if (selectedPhases.some((phase) => personIntervals.some((interval) => interval.id !== editingIntervalId && Date.parse(phase.startsAt) < Date.parse(interval.endsAt) && Date.parse(phase.endsAt) > Date.parse(interval.startsAt)))) { setMessage('Une sélection recouvre une période déjà enregistrée. Corrigez la sélection.'); return; }
    if (deviations.length && !draft.comment.trim()) { setMessage('Un commentaire est nécessaire pour enregistrer cette journée.'); return; }
    if (intent === 'submit-day' && deviations.length) { setSubmitPhases(selectedPhases); setJustificationIntent('submit'); setJustification(['', '', '', '', draft.comment]); setDialog('justify'); return; }
    savePhases(selectedPhases, intent === 'submit-day' ? 'signed' : 'draft');
  }
  function approveDay() {
    if (approval.status !== 'signed' || !projection.coverageComplete) return;
    if (deviations.length && !approval.justification?.every((value) => value.trim())) { setJustificationIntent('approve'); setJustification(['', '', '', '', draft.comment]); setDialog('justify'); return; }
    setApprovals((current) => ({ ...current, [key]: { ...approval, status: 'validated', captainSignedAt: new Date().toISOString() } }));
    recordEvent('Approbation du capitaine (démonstration)'); setMessage('Journée approuvée dans la préversion.');
  }
  function changeMonth(direction: number) {
    const date = new Date(`${selectedDay.slice(0, 7)}-01T12:00:00`); date.setMonth(date.getMonth() + direction);
    chooseDay(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`);
    setView(view);
  }
  async function exportPdf(kind: 'register' | 'report') {
    setIsBusy(true);
    try {
      const { buildWorkingTimePreviewPdf } = await import('./workingTimePreviewPdf');
      const days = previewMonthDays(selectedDay).map((date) => {
        const dayKey = draftKey(personId, date);
        const dayStart = Date.parse(`${date}T00:00`);
        const dayEnd = Date.parse(`${previewAddDays(date, 1)}T00:00`);
        const saved = personIntervals.filter((interval) => Date.parse(interval.startsAt) < dayEnd && Date.parse(interval.endsAt) > dayStart);
        return { date, phases: saved.map((interval) => ({ startsAt: interval.startsAt, endsAt: interval.endsAt, comment: interval.comment || undefined })), comment: [...new Set(saved.map((interval) => interval.comment).filter(Boolean))].join(' · '), approval: approvals[dayKey] ? { ...approvals[dayKey], sailorName: person.name, captainName: 'Camille DEMO' } : undefined };
      });
      const result = buildWorkingTimePreviewPdf({ kind, personName: person.name, vesselName: 'GOURY', periodLabel: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(`${selectedDay}T12:00`)), days });
      result.document.save(result.filename);
      setMessage('PDF factuel exporté avec les périodes enregistrées. Les sélections en attente restent au brouillon.');
    } catch { setMessage('Le PDF n’a pas pu être créé. Réessayez.'); }
    finally { setIsBusy(false); }
  }
  async function readImport(file: File) {
    setIsBusy(true); setImportRows([]); setMessage('');
    try {
      const { parseWorkingTimeXlsm } = await import('../workingTimeExcelImport');
      const workbook = await parseWorkingTimeXlsm(await file.arrayBuffer(), file.name);
      setImportWarnings([...workbook.warnings, ...workbook.rows.filter((row) => row.issues.length).map((row) => `${row.date} : ${row.issues.join(', ')}`)]);
      setImportRows(workbook.rows.filter((row) => !row.issues.length && row.detectedPhases.length).map((row) => ({
        date: row.date, comment: row.sourceComment,
        phases: row.detectedPhases.map((phase) => ({ startsAt: `${row.date}T${String(Math.floor(phase.startMinute / 60)).padStart(2, '0')}:${String(phase.startMinute % 60).padStart(2, '0')}`, endsAt: phase.endMinute === 1440 ? `${previewAddDays(row.date, 1)}T00:00` : `${row.date}T${String(Math.floor(phase.endMinute / 60)).padStart(2, '0')}:${String(phase.endMinute % 60).padStart(2, '0')}` })),
      })));
    } catch (error) { setImportWarnings([error instanceof Error ? error.message : 'Lecture impossible.']); }
    finally { setIsBusy(false); }
  }
  const monthDays = previewMonthDays(selectedDay);
  const weekStart = previewAddDays(selectedDay, -((new Date(`${selectedDay}T12:00`).getDay() + 6) % 7));
  const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${selectedDay}T12:00`));
  const shownPeople = PREVIEW_PEOPLE.filter((candidate) => candidate.active !== showFormer && `${candidate.name} ${candidate.function}`.toLocaleLowerCase('fr').includes(crewSearch.toLocaleLowerCase('fr')));
  const stateLabel = { draft: 'Brouillon', signed: 'Soumise au capitaine', validated: 'Approuvée', reopened: 'Rouverte' }[approval.status];
  function openPolicy() { setEditablePolicy({ ...policy }); setPolicyError(''); setDialog('policy'); }
  function resetExample() {
    nextIntervalId.current = 1000;
    setIntervals(createPreviewIntervals());
    setDrafts({ [draftKey(9301, PREVIEW_DATE)]: { pending: [{ startsAt: `${PREVIEW_DATE}T13:00`, endsAt: `${PREVIEW_DATE}T20:00` }], startsAt: `${PREVIEW_DATE}T13:00`, endsAt: `${PREVIEW_DATE}T20:00`, comment: 'Opération prolongée — retour à quai.' } });
    setApprovals({}); setHistory([]); setArchivedApprovals([]); setArchivedIntervals([]);
    setPolicy({ ...PREVIEW_DEMO_POLICY }); setPersonId(9301);
    selectedDayRef.current = PREVIEW_DATE;
    setSelectedDay(PREVIEW_DATE); setEditingIntervalId(null); setDraftBeforeCorrection(null);
    setDialog(null); setSideTab('rules'); setView('day'); setMessage('Exemple réinitialisé.');
  }

  return (
    <div className={`wtp ${sidebarOpen ? 'is-sidebar-open' : ''}`}>
      <aside className="wtp-sidebar" aria-label="Navigation SeaPilot">
        <div className="wtp-logo"><SeaPilotLogo /></div>
        {SIDEBAR_ITEMS.map(({ label, icon: Icon, module }) => <a href={`/modules/${module}`} key={label}><Icon size={21} />{label}<ChevronRight size={14} /></a>)}
        <div className="wtp-sidebar-group"><Users size={21} />Ressources Humaines</div>
        <a href="/modules/humanResources"><Users size={18} />RH / Brevets</a>
        <a className="is-active" aria-current="page" href="/previews/working-time.html"><Clock3 size={19} />Suivi du temps de travail</a>
        <a href="/modules/maintenance"><Wrench size={21} />Maintenance</a>
        <div className="wtp-sidebar-bottom"><span>Préversion de saisie</span><button onClick={resetExample} type="button"><RotateCcw size={15} />Réinitialiser l’exemple</button></div>
      </aside>
      <div className="wtp-content">
        <header className="wtp-topbar"><button className="wtp-menu-toggle" aria-label="Afficher la navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)} type="button"><Menu size={21} /></button><span>Ressources humaines <ChevronRight size={13} /> <strong>Suivi du temps de travail</strong></span><span className="wtp-demo-badge">Préversion · données fictives</span><span className="wtp-demo-user"><UserAvatar initials="AD" /><span>Arthur DEMO<small>Compte de démonstration</small></span></span></header>
        <main className="wtp-main">
          <h1 className="sr-only">Préversion de saisie du temps de travail</h1>
          <ModuleRibbon ariaLabel="Commandes du temps de travail" singleRow><ModuleRibbonGroup label="Analyse"><ModuleRibbonCommand icon={<ShieldCheck />} label="Exposition HSE / IMCA" onClick={() => setDialog('hse')} /><ModuleRibbonCommand icon={<Clock3 />} label="Contrôles travail et repos" onClick={() => setDialog('rules')} /></ModuleRibbonGroup><ModuleRibbonGroup label="Registre"><ModuleRibbonCommand icon={<Upload />} label="Import" onClick={() => { setImportRows([]); setImportWarnings([]); setDialog('import'); }} /><ModuleRibbonCommand icon={<FileDown />} label="Export PDF" disabled={isBusy} onClick={() => void exportPdf('register')} /><ModuleRibbonCommand icon={<BarChart3 />} label="Rapport de conformité" onClick={() => setDialog('report')} /></ModuleRibbonGroup></ModuleRibbon>
          <div className="wtp-filters">
            <button className="sp-button" onClick={() => setDialog('crew')} type="button"><Users size={20} /><strong>{person.name}</strong> · {person.function}<ChevronRight size={14} /></button>
            <button className="sp-button" onClick={() => setDialog('crew')} type="button"><Users size={20} />Équipage</button>
            <span className="wtp-assignment"><Ship size={19} /><strong>GOURY · Bordée 1</strong></span>
            <div className="wtp-month-nav"><button aria-label="Mois précédent" onClick={() => changeMonth(-1)} type="button"><ChevronLeft size={18} /></button><strong>{new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(`${selectedDay}T12:00`))}</strong><button aria-label="Mois suivant" onClick={() => changeMonth(1)} type="button"><ChevronRight size={18} /></button></div>
            <div className="wtp-view-switch" aria-label="Vue du registre"><button aria-pressed={view === 'day'} onClick={() => setView('day')} type="button">Jour</button><button aria-pressed={view === 'month'} onClick={() => setView('month')} type="button">Mois</button></div>
          </div>
          {message ? <div className="wtp-feedback" role="status">{message}</div> : null}
          <div className={`wtp-workspace${view === 'month' ? ' is-month' : ''}`}>
            <section className="wtp-editor sp-panel">
              <header className="wtp-day-heading"><h2>{view === 'month' ? new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(`${selectedDay}T12:00`)) : dateLabel}</h2>{view === 'day' ? <div><small>Journée : {previewDuration(projection.dailyWorkHours)}</small><span>{stateLabel}</span></div> : null}</header>
              {view === 'month' ? <WorkingTimeMonthPreview days={monthDays} recorded={personIntervals.filter((interval) => interval.id !== editingIntervalId)} pending={monthPendingPhases} selectedDay={selectedDay} onChooseDay={chooseDay} /> : <WorkingTimeEntryBoard
                key={`${personId}:${selectedDay}`}
                client={client} personId={personId} periodStart={weekStart < monthDays[0] ? monthDays[0] : weekStart} periodEnd={previewAddDays(weekStart, 6) > monthDays.at(-1)! ? monthDays.at(-1)! : previewAddDays(weekStart, 6)}
                intervals={personIntervals} canEdit={canEdit} isSaving={false} startsAt={draft.startsAt} endsAt={draft.endsAt} planningVesselId={1} planningWatchGroup="Bordée 1" comment={draft.comment} editingIntervalId={editingIntervalId} pendingPhases={draft.pending} selectedDay={selectedDay} approverName="Camille DEMO" hasRecordedPeriods={personIntervals.some((interval) => interval.localWorkDate === selectedDay)} showSaveDraft showSubmitToCaptain={canEdit}
                allowPhaseResize previewGraph={graph} analysisStatus={deviations.length ? 'non_conforme' : analysisConfirmed ? 'conforme' : 'sans_politique'} nonCompliantDates={deviations.length ? [selectedDay] : []}
                onStartsAtChange={(value) => { if (!ignoreNavigationEdits.current) updateDraft({ startsAt: value }); }} onEndsAtChange={(value) => { if (!ignoreNavigationEdits.current) updateDraft({ endsAt: value }); }} onCommentChange={(value) => updateDraft({ comment: value })} onPendingPhasesChange={(pending) => updateDraft({ pending })} onSelectedDayChange={chooseDay} onSubmit={submit}
                onCancelEdit={() => { setEditingIntervalId(null); updateDraft(draftBeforeCorrection || blankDraft(selectedDay)); setDraftBeforeCorrection(null); }}
                onEditInterval={(interval) => { setDraftBeforeCorrection({ ...draft, pending: [...draft.pending] }); setEditingIntervalId(interval.id); updateDraft({ startsAt: interval.startsAt, endsAt: interval.endsAt, pending: [], comment: interval.comment || '' }); }}
                onRequestVoid={(interval) => { setVoidInterval(interval); setReason(''); setDialog('void'); }}
              />}
              <small className="wtp-memory-note">Données d’essai conservées jusqu’au rechargement de la page · congés/repos : {PREVIEW_LEAVE_REST_RATE.toLocaleString('fr-FR')}</small>
            </section>
            <aside className="wtp-analysis sp-panel" aria-label="Analyse de la saisie">
              <div className="wtp-side-tabs"><button aria-pressed={sideTab === 'rules'} onClick={() => setSideTab('rules')} type="button">Conformité</button><button aria-pressed={sideTab === 'approval'} onClick={() => setSideTab('approval')} type="button">Approbation{approval.status === 'signed' ? <b>1</b> : null}</button></div>
              {sideTab === 'rules' ? <>
                {deviations.length ? deviations.map((rule) => <article className="wtp-deviation" key={rule.key}><AlertTriangle size={20} /><div><h3>{rule.label}</h3><strong>{ruleValue(rule)}</strong>{rule.key === 'max_amplitude' && amplitudeBounds ? <span>{amplitudeBounds}</span> : rule.key === 'max_work_24h' && workDayBounds ? <span>{workDayBounds}</span> : null}<span>{ruleLimit(rule)}</span><b>{rule.direction === 'maximum' ? '+' : 'Manque '}{rule.unit === 'periods' ? rule.deviation : previewDuration(rule.deviation)}</b><button onClick={() => setDialog('rules')} type="button">Voir la fenêtre analysée <ChevronRight size={14} /></button></div></article>) : <div className={`wtp-status ${analysisConfirmed ? 'is-ok' : ''}`}><CheckCircle2 size={20} />{analysisConfirmed ? 'Aucun écart dans la fenêtre analysée' : 'Historique incomplet — analyse à confirmer'}</div>}
                <div className="wtp-policy-edit"><h4>Seuils de la règle de démonstration</h4><button onClick={openPolicy} type="button">Modifier les seuils</button></div>
                {projection.rules.filter((rule) => MAIN_RULES.includes(rule.key) && rule.status !== 'deviation').map((rule) => <div className="wtp-rule" key={rule.key}>{rule.status === 'ok' ? <CheckCircle2 size={20} /> : <Clock3 size={20} />}<span>{rule.label}</span><strong>{ruleValue(rule)}{rule.key === 'max_amplitude' && amplitudeBounds ? <small>{amplitudeBounds}</small> : rule.key === 'max_work_24h' && workDayBounds ? <small>{workDayBounds}</small> : null}<small>{ruleLimit(rule)}</small></strong></div>)}
                <button className="wtp-details sp-button" onClick={() => setDialog('rules')} type="button">Détails des règles<ChevronRight size={16} /></button>
                <small className="wtp-analysis-note">{projectedPhases.length ? 'Projection de la saisie · ' : ''}Les règles illustrées ne remplacent pas la politique applicable au navire et au personnel.</small>
              </> : <div className="wtp-approval"><h3>{stateLabel}</h3><p>Marin : {person.name}</p><p>{approval.sailorSignedAt ? 'Signature de démonstration apposée' : 'Signature en attente'}</p><hr /><p>Approbateur : Camille DEMO</p><p>{approval.captainSignedAt ? 'Approbation de démonstration apposée' : 'Approbation en attente'}</p>{approval.status === 'signed' ? <button className="sp-button sp-button--primary" disabled={!projection.coverageComplete} onClick={approveDay} type="button">Valider la journée</button> : null}{deviations.length && approval.status === 'signed' ? <p>La justification ne rend pas la journée conforme. Les écarts restent à examiner.</p> : null}{approval.status === 'signed' || approval.status === 'validated' ? <button className="sp-button" onClick={() => { setReason(''); setDialog('reopen'); }} type="button">Réouvrir pour correction</button> : null}<details><summary>Historique des actions</summary>{history.length ? history.map((event, index) => <p key={index}>{event}</p>) : <p>Aucune action enregistrée.</p>}{archivedApprovals.filter((entry) => entry.personId === personId).map((entry, index) => <p key={`approval-${index}`}>Signature historisée · {entry.day} · marin : {entry.approval.sailorSignedAt || '—'} · capitaine : {entry.approval.captainSignedAt || '—'} · motif : {entry.reason}</p>)}{archivedIntervals.filter((entry) => entry.interval.personId === personId).map((entry) => <p key={`removed-${entry.interval.id}`}>Période retirée : {entry.interval.startsAt.slice(11, 16)}–{entry.interval.endsAt.slice(11, 16)} · {entry.interval.comment || ''} · motif : {entry.reason}</p>)}</details></div>}
            </aside>
          </div>
        </main>
      </div>
      {dialog === 'policy' ? <AppDialog title="Modifier les seuils" onClose={() => setDialog(null)} description="Les seuils de cet essai modifient immédiatement l’analyse à l’écran. Les heures saisies et le coefficient congés/repos de 1,05 sont conservés." onSubmit={(event) => {
        event.preventDefault();
        const invalid = POLICY_FIELDS.some((field) => !Number.isFinite(editablePolicy[field.key]) || editablePolicy[field.key] <= 0 || editablePolicy[field.key] > field.maximum || (field.periods && !Number.isInteger(editablePolicy[field.key])));
        if (invalid) { setPolicyError('Renseignez des seuils positifs et un nombre entier de périodes.'); return; }
        setPolicy({ ...editablePolicy }); setDialog(null); setMessage('Seuils de démonstration appliqués. Les heures restent inchangées.');
      }} footer={<><button className="sp-button" onClick={() => setEditablePolicy({ ...PREVIEW_DEMO_POLICY })} type="button">Rétablir les seuils initiaux</button><button className="sp-button sp-button--primary" type="submit">Appliquer les seuils</button></>}>
        <div className="wtp-policy-fields">{POLICY_FIELDS.map((field) => <label className="wtp-field" key={field.key}>{field.label}<input type="number" min={field.periods ? 1 : 0.5} max={field.maximum} step={field.periods ? 1 : 0.5} required value={Number.isFinite(editablePolicy[field.key]) ? editablePolicy[field.key] : ''} onChange={(event) => setEditablePolicy((current) => ({ ...current, [field.key]: event.target.valueAsNumber }))} /><small>{field.periods ? 'périodes au maximum' : field.key.startsWith('min') ? 'heures au minimum' : 'heures au maximum'}</small></label>)}</div>
        <p>Un repos atteignant le minimum continu clôture la journée de calcul à son début. La journée suivante commence à ce même instant. Le repos sur 24 h et les cumuls sur 7 jours restent contrôlés séparément.</p>
        {policyError ? <p role="alert">{policyError}</p> : null}
      </AppDialog> : null}
      {dialog === 'crew' ? <AppDialog title="Équipage" onClose={() => setDialog(null)}><label className="wtp-search"><Search size={18} /><input aria-label="Rechercher un marin" placeholder="Rechercher un marin…" value={crewSearch} onChange={(event) => setCrewSearch(event.target.value)} /></label><div className="wtp-view-switch"><button aria-pressed={!showFormer} onClick={() => setShowFormer(false)} type="button">Personnel en poste</button><button aria-pressed={showFormer} onClick={() => setShowFormer(true)} type="button">Personnel ancien</button></div><div className="wtp-crew-list">{shownPeople.map((candidate) => <button key={candidate.id} onClick={() => choosePerson(candidate.id)} type="button"><UserAvatar initials={candidate.name.slice(0, 1) + 'D'} /><span><strong>{candidate.name}</strong><small>{candidate.function}</small></span></button>)}{!shownPeople.length ? <p>Aucun marin correspondant.</p> : null}</div></AppDialog> : null}
      {dialog === 'rules' || dialog === 'hse' || dialog === 'report' ? <AppDialog title={dialog === 'hse' ? 'Exposition HSE / IMCA' : dialog === 'report' ? 'Rapport de conformité' : 'Contrôles travail et repos'} onClose={() => setDialog(null)} size="lg" description={`24 h : ${windowLabel} · 7 jours : ${previewDateTime(projection.window7.startsAt)} → ${previewDateTime(projection.window7.endsAt)}`}>
        <p>Analyse indicative des données fictives. Le repos total, le repos continu et le fractionnement sont contrôlés séparément.</p>
        <div className="wtp-rule-table"><table><thead><tr><th>Contrôle</th><th>Valeur</th><th>Seuil</th><th>Résultat</th></tr></thead><tbody>{projection.rules.map((rule) => <tr key={rule.key}><td>{rule.label}</td><td>{ruleValue(rule)}{rule.key === 'max_amplitude' && amplitudeBounds ? <small className="wtp-amplitude-bounds">{amplitudeBounds}</small> : rule.key === 'max_work_24h' && workDayBounds ? <small className="wtp-amplitude-bounds">{workDayBounds}</small> : null}</td><td>{ruleLimit(rule)}</td><td>{rule.status === 'deviation' ? 'Écart' : rule.status === 'unknown' ? 'À confirmer' : 'Respecté'}</td></tr>)}</tbody></table></div>
        <p>L’amplitude affichée est la plus longue séquence touchant la fenêtre de 24 h, séparée de la suivante par au moins {policy.minContinuousRestHours} h de repos continu. Un passage à minuit ne remet pas le compteur à zéro.</p>
        <p>La moyenne de 11 h nécessite un cycle défini ; cette préversion ne l’assimile pas à un plafond quotidien.</p>
        {dialog === 'report' ? <button className="sp-button sp-button--primary" disabled={isBusy} onClick={() => void exportPdf('report')} type="button"><FileDown size={18} />Exporter les données factuelles en PDF</button> : null}
      </AppDialog> : null}
      {dialog === 'void' || dialog === 'reopen' ? <AppDialog title={dialog === 'void' ? 'Motif du retrait' : 'Motif de réouverture'} onClose={() => setDialog(null)} onSubmit={(event) => { event.preventDefault(); if (!reason.trim()) return; if (dialog === 'void' && voidInterval) { setArchivedIntervals((current) => [...current, { interval: { ...voidInterval }, reason }]); setIntervals((current) => current.filter((interval) => interval.id !== voidInterval.id)); recordEvent(`Retrait historisé : ${reason}`); setMessage('Période retirée ; motif conservé dans l’historique de démonstration.'); } else { setArchivedApprovals((current) => [...current, { personId, day: selectedDay, approval: { ...approval }, reason }]); setApprovals((current) => ({ ...current, [key]: { status: 'reopened' } })); recordEvent(`Réouverture : ${reason} · signatures précédentes historisées`); setMessage('Journée rouverte ; signatures précédentes conservées dans l’historique de démonstration.'); } setDialog(null); }} footer={<button className="sp-button sp-button--primary" type="submit">Confirmer</button>}><label className="wtp-field">Motif<input required value={reason} onChange={(event) => setReason(event.target.value)} /></label></AppDialog> : null}
      {dialog === 'justify' ? <AppDialog title="Justifier la journée" onClose={() => setDialog(null)} onSubmit={(event) => { event.preventDefault(); if (justification.some((value) => !value.trim())) return; if (justificationIntent === 'approve') { setApprovals((current) => ({ ...current, [key]: { ...approval, status: 'validated', captainSignedAt: new Date().toISOString(), justification: [...justification] } })); } else { savePhases(submitPhases, 'signed', [...justification]); } recordEvent(`Justification : ${justification.join(' · ')}`); setDialog(null); setSideTab('approval'); }} description="La justification accompagne les heures réellement effectuées. Elle ne supprime pas les écarts." footer={<button className="sp-button sp-button--primary" type="submit">Valider la saisie des heures et la justification</button>}><div className="wtp-fields">{JUSTIFICATION_LABELS.map((label, index) => <label className="wtp-field" key={label}>{label}<input required value={justification[index]} onChange={(event) => setJustification((current) => current.map((value, position) => position === index ? event.target.value : value))} /></label>)}</div></AppDialog> : null}
      {dialog === 'import' ? <AppDialog title="Import du registre XLSM" onClose={() => setDialog(null)} description="Lecture locale du classeur avec le parseur SeaPilot. Les lignes valides sont ajoutées au brouillon d’essai ; les journées signées restent verrouillées." footer={<button className="sp-button sp-button--primary" disabled={isBusy || !importRows.length} onClick={() => { setDrafts((current) => { const next = { ...current }; importRows.forEach((row) => { const rowKey = draftKey(personId, row.date); if (approvals[rowKey]?.status === 'signed' || approvals[rowKey]?.status === 'validated') return; next[rowKey] = { ...blankDraft(row.date), pending: row.phases, comment: row.comment }; }); return next; }); recordEvent(`${importRows.length} journées proposées par import`); setMessage('Journées proposées au brouillon. Les chevauchements devront être corrigés avant enregistrement.'); setDialog(null); }} type="button">Proposer les lignes au brouillon</button>}><label className="wtp-field">Classeur annuel<input type="file" accept=".xlsm" disabled={isBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImport(file); }} /></label><p role="status">{isBusy ? 'Lecture…' : `${importRows.length} journées valides détectées`}</p>{importWarnings.map((warning, index) => <p key={index}>{warning}</p>)}</AppDialog> : null}
    </div>
  );
}
