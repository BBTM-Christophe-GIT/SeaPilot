import { cloneElement, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AlertTriangle, Anchor, ArrowLeft, CheckCircle2, ChevronRight, ClipboardCheck, Compass, Eye, FileDown, FileText, Map, Pencil, Plus, Printer, Save, Search, Ship, Trash2 } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { ModuleRibbon, ModuleRibbonCommand, ModuleRibbonGroup } from '../../components/ModuleRibbon';
import type { AppShellOutletContext } from '../shell/AppShell';
import { DIVING_MEDICAL_KIT, SEA_OPERATION_CHECKS, SEA_OPERATION_SECTIONS, SEA_OPERATION_SUPPLY_ITEMS, emptySeaOperation, newSeaOperation, createTransitSeaOperation, seaOperationContextDate, getSeaOperationAssessment, isSeaOperationPayload, validateSeaOperation, seaOperationToday, type SeaOperationPayload, type SeaOperationAnswer as Answer } from './seaOperationModel';
import { fetchSeaOperationData, fetchSeaOperationDetail, fetchSeaOperationCaptainSignature, fetchSeaOperationVesselContext, fetchSeaOperationVesselCaptainSignature, fetchSeaOperationWeatherObservations, loadSeaOperationSignature, saveSeaOperation, signSeaOperation, reviseSeaOperation, deleteSeaOperation, type SeaOperationData, type SeaOperationRecord, type SeaOperationPlanningChoice, type SeaOperationVesselContext } from './seaOperationQueries';
import { fetchSeaOperationPlanningWindow, seaOperationPlanningChoiceKey, seaOperationPlanningChoiceLabel, type SeaOperationPlanningWindow } from './seaOperationPlanningWindow';
import './seaOperations.css';
import { SeaOperationPrint } from './SeaOperationPrint';
import { SeaOperationPreview } from './SeaOperationDocumentPreview';
import { exportSeaOperationPdf } from './seaOperationPdf';
import { SeaOperationProjectDocuments } from './SeaOperationProjectDocuments';
import { SeaOperationRadioPanel } from './SeaOperationRadioPanel';
import { SeaOperationWeatherPanel } from './SeaOperationWeatherPanel';
import { SeaOperationHydroSources } from './SeaOperationHydroSources';
import { SeaOperationChartsPanel } from './SeaOperationChartsPanel';
import { captureSeaOperationRadios, invalidateSeaOperationUkc, retainSeaOperationUkc, retainSeaOperationWeather, seaOperationUkcReference, seaOperationWeatherReference,
  updateSeaOperationWaypoint, waypointUkcSnapshot, waypointWeatherSnapshot } from './seaOperationWaypointSnapshots';
import type { SeaOperationUkcCaptureContext, SeaOperationWeatherCaptureContext } from './seaOperationWaypointSnapshots';
import type { SeaOperationWaypointWeather } from './seaOperationWeatherModel';
import type { SupabaseClient } from '@supabase/supabase-js';
import { passagePlanCellData } from './seaOperationPassagePlan';
import { cloneVesselWeatherMatrix, type VesselWeatherMatrix } from '../fleet/vesselWeatherMatrix';
import { SeaOperationWeatherCard } from './SeaOperationWeatherCard';
import { SeaOperationRecordedWeather } from './SeaOperationRecordedWeather';
import { SeaOperationRouteMap } from './SeaOperationRouteMap';
import { SeaOperationWaypointMapEditor } from './SeaOperationWaypointMapEditor';
import { SeaOperationEtaPicker } from './SeaOperationEtaPicker';
import { captureSeaOperationValidationWeather } from './seaOperationValidationWeather';
import type { SeaPosition } from './seaOperationNavigation';
import { initialSeaOperationWeatherStatus, weatherRequestKey, type WeatherRequestStatus } from './seaOperationWeatherStatus';
import { isVesselDraftMeters } from './seaOperationUkc';
import { SeaOperationCoordinateInput } from './SeaOperationCoordinateInput';
import type { SeaOperationCopernicusEstimate } from './seaOperationCopernicusModel';
import { SeaOperationUkcField } from './SeaOperationUkcField';
import { SeaOperationUkcPanel } from './SeaOperationUkcPanel';
import { captureSeaOperationValidationUkc, ukcRequestKey, type SeaOperationUkcRequestStatus } from './seaOperationValidationUkc';
import { updateSeaOperationRouteEtas } from './seaOperationRouteEta';
import { seaOperationRouteArrivalEta } from './seaOperationVoyageSummary';
import { captureSeaOperationWaypointDescriptions, seaOperationWaypointDescription } from './seaOperationWaypointDescription';
import { copyProjectLocationToSeaOperation } from './seaOperationProjectLocation';
import { ProjectLocationOverlayFields } from '../projects/ProjectLocationOverlayFields';
import type { ProjectLocationOverlay } from '../projects/projectLocation';
import { compareFleetAssets } from '../fleet/fleetDisplay';

const STEPS = ['Armement', 'Contrôles avant appareillage', 'Passage Plan', 'Décision du Capitaine'];
const STEP_DETAILS = ['Mission, client et voyage', 'Préparation et sécurité du navire', 'Cartes et points de route', 'GO / NO GO et signature'];
const STEP_ICONS = [FileText, ClipboardCheck, Compass, Anchor];
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Non renseignée';
const planningDateLabel = (value: string) => value.split('-').reverse().join('/');
const errorMessage = (error: unknown) => error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Une erreur est survenue. Réessayez.';
const recoveryKey = (data: SeaOperationData) => `seapilot:sea-operation-draft:v1:${data.companyId}:${data.actorId}`;
interface DraftRecovery { draft: SeaOperationPayload; recordId: string | null; version: number | null; step: number }
interface RecordAction { kind: 'revise' | 'delete'; record: SeaOperationRecord; client: SupabaseClient; account: string }
function readRecovery(data: SeaOperationData): DraftRecovery | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(recoveryKey(data)) || 'null');
    if (!value || typeof value !== 'object') return null;
    const saved = value as Partial<DraftRecovery>;
    if (!isSeaOperationPayload(saved.draft) || !Number.isInteger(saved.step) || saved.step! < 0 || saved.step! >= STEPS.length
      || !(saved.recordId === null && saved.version === null || typeof saved.recordId === 'string' && Number.isInteger(saved.version) && saved.version! > 0)) return null;
    return saved as DraftRecovery;
  } catch { return null; }
}
function clearRecovery(data: SeaOperationData | null) {
  try { if (data) sessionStorage.removeItem(recoveryKey(data)); } catch { /* Storage can be unavailable. */ }
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  const id = useId();
  const nativeControl = isValidElement(children) && typeof children.type === 'string';
  return <div className={wide ? 'so-field so-wide' : 'so-field'}>{nativeControl ? <label htmlFor={id}>{label}</label> : <span className="so-field-label">{label}</span>}{isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}</div>;
}

interface ChoiceOption { value: string; label: string; disabled?: boolean }

/** Checkbox choices remain exclusive and can be cleared back to unanswered. */
function ChoiceControl({ label, value, onChange, options, id }: {
  label: string; value: string; onChange: (value: string) => void; options: readonly ChoiceOption[]; id?: string;
}) {
  return <div id={id} className="so-answer-options" role="group" aria-label={label}>{options.map((option) => <label className="so-answer-option" key={option.value}>
    <input type="checkbox" checked={value === option.value} disabled={option.disabled} onChange={(event) => onChange(event.target.checked ? option.value : '')} /><span>{option.label}</span>
  </label>)}</div>;
}

function AnswerControl({ label, value, onChange, id }: { label: string; value: Answer; onChange: (value: Answer) => void; id?: string }) {
  return <div className="so-answer-switches"><button id={id} type="button" role="switch" aria-label={label} aria-checked={value === 'yes'} className="so-answer-switch" onClick={() => onChange(value === 'yes' ? 'no' : 'yes')}><span className="so-answer-switch-track" aria-hidden="true" /><span className="so-answer-switch-label">{value === 'yes' ? 'Oui' : value === 'no' ? 'Non' : 'À vérifier'}</span></button></div>;
}

/** A change of mission must never inherit the previous mission's safety approvals. */
function draftForPlanningChoice(choice: SeaOperationPlanningChoice, date: string, maxSpeedKnots?: number | null): SeaOperationPayload {
  const draft = newSeaOperation();
  const captain = choice.captains.length === 1 ? choice.captains[0] : null;
  return copyProjectLocationToSeaOperation({ ...draft, planning: { date, operationId: choice.operationId, projectId: choice.projectId, captainPersonId: captain?.personId || '' },
    project: choice.project, client: choice.client, ...(choice.clientId ? { clientId: choice.clientId } : {}), clientContact: choice.clientContact, description: choice.description,
    vessel: { ...draft.vessel, ...choice.vessel, id: String(choice.vessel.id), captainName: captain?.name || '',
      ...(choice.vessel.weatherMatrix === undefined ? {} : { weatherMatrix: structuredClone(choice.vessel.weatherMatrix) }) },
    signature: { ...draft.signature, captainName: captain?.name || '', place: choice.vessel.departurePort } }, choice.locationPlan, maxSpeedKnots);
}

function sameClientContext(left: SeaOperationPayload, right: SeaOperationPayload): boolean {
  if (left.transit || right.transit) return Boolean(left.transit && right.transit);
  if (left.planning?.projectId || right.planning?.projectId) return Boolean(left.planning?.projectId && left.planning.projectId === right.planning?.projectId);
  if (left.planning?.operationId || right.planning?.operationId) return Boolean(left.planning?.operationId
    && left.planning.operationId.split(':')[0] === right.planning?.operationId.split(':')[0]);
  return left.project === right.project;
}

function retainedPlanningLabel(draft: SeaOperationPayload): string {
  const fallback = `${draft.project} · ${draft.vessel.name}`;
  if (!draft.planning) return fallback;
  try { return seaOperationPlanningChoiceLabel({ date: draft.planning.date, project: draft.project, vessel: draft.vessel }); }
  catch { return fallback; } // Legacy snapshots may contain a free-text planning date.
}

/** Undefined means an older/unloaded source; null explicitly records a vessel without a configured matrix. */
function captureVesselMatrix(payload: SeaOperationPayload, source?: { id: string | number; weatherMatrix?: VesselWeatherMatrix | null }): SeaOperationPayload {
  const fingerprint = (matrix: VesselWeatherMatrix | null | undefined) => JSON.stringify(matrix ? cloneVesselWeatherMatrix(matrix) : matrix);
  if (!source || String(source.id) !== payload.vessel.id || source.weatherMatrix === undefined
    || fingerprint(payload.vessel.weatherMatrix) === fingerprint(source.weatherMatrix)) return payload;
  return { ...payload, vessel: { ...payload.vessel, weatherMatrix: structuredClone(source.weatherMatrix) } };
}

/** A known null clears a previous vessel's reference; an unloaded source preserves its snapshot. */
function captureVesselDraft(payload: SeaOperationPayload, source?: { id: string | number; draftMeters?: number | null }): SeaOperationPayload {
  if (!source || String(source.id) !== payload.vessel.id || source.draftMeters === undefined) return invalidateSeaOperationUkc(payload);
  const draftMeters = isVesselDraftMeters(source.draftMeters) ? source.draftMeters : null;
  return invalidateSeaOperationUkc(payload.vessel.draftMeters === draftMeters ? payload : { ...payload, vessel: { ...payload.vessel, draftMeters } });
}

function captureRouteEtas(payload: SeaOperationPayload, vessels: SeaOperationData['vessels'] | undefined): SeaOperationPayload {
  if (vessels === undefined) return payload;
  const vessel = vessels?.find(source => String(source.id) === payload.vessel.id);
  // Unknown vessel/speed invalidates automatic slots; historical/manual times are retained.
  return updateSeaOperationRouteEtas(payload, vessel?.maxSpeedKnots ?? null);
}

export function SeaOperationsPage() {
  const { client, previewMode = false } = useOutletContext<AppShellOutletContext>();
  const [data, setData] = useState<SeaOperationData | null>(null);
  const [record, setRecord] = useState<SeaOperationRecord | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [draft, setDraft] = useState<SeaOperationPayload>(newSeaOperation);
  const latestDraft = useRef(draft);
  const [editing, setEditing] = useState(false);
  const [planningDate, setPlanningDate] = useState(seaOperationToday);
  const [planning, setPlanning] = useState<SeaOperationPlanningWindow | null>(null);
  const planningStartDate = seaOperationToday();
  const [planningLoading, setPlanningLoading] = useState(false);
  const [planningError, setPlanningError] = useState('');
  const [captainSignature, setCaptainSignature] = useState<Awaited<ReturnType<typeof fetchSeaOperationCaptainSignature>> | null>(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [signatureError, setSignatureError] = useState('');
  const [vesselContext, setVesselContext] = useState<{ client: SupabaseClient; context: SeaOperationVesselContext } | null>(null);
  const [vesselContextLoading, setVesselContextLoading] = useState(false);
  const [vesselContextError, setVesselContextError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [weatherRequests, setWeatherRequests] = useState<{ client: SupabaseClient; statuses: Record<string, WeatherRequestStatus> }>({ client, statuses: {} });
  const [ukcRequests, setUkcRequests] = useState<{ client: SupabaseClient; statuses: Record<string, SeaOperationUkcRequestStatus> }>({ client, statuses: {} });
  const pendingUkc = useRef(new globalThis.Map<string, { capture: SeaOperationCopernicusEstimate; context: SeaOperationUkcCaptureContext; sourceClient: SupabaseClient }>());
  const [recordAction, setRecordAction] = useState<RecordAction | null>(null);
  const [recordActionError, setRecordActionError] = useState('');
  const [compactLayout, setCompactLayout] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1100px)').matches);
  const [mobilePane, setMobilePane] = useState<'form' | 'preview'>('form');
  const formPane = useRef<HTMLDivElement>(null);
  const editorOpener = useRef<HTMLElement | null>(null);
  const editRevision = useRef(0);
  const allowAutomaticMission = useRef(false);
  const loadSequence = useRef(0);
  const loadedAccount = useRef('');
  const currentClient = useRef(client);
  const mutationRunning = useRef(false);
  const recordActionSequence = useRef(0);
  const actionContext = useRef({ client, account: '' });
  actionContext.current = { client, account: data ? recoveryKey(data) : '' };
  const selectedWindowMission = planning?.choices.find(choice => choice.operationId === draft.planning?.operationId && choice.date === draft.planning?.date);
  const selectedMission = selectedWindowMission ?? (planning?.selectedContext?.date === draft.planning?.date
    ? planning?.selectedContext?.choices.find(choice => choice.operationId === draft.planning?.operationId) : undefined);
  const linkedToPlanning = Boolean(draft.planning?.operationId);
  const linkedToCaptainContext = Boolean(draft.transit || linkedToPlanning);
  const contextDate = seaOperationContextDate(draft);
  const usesVesselContext = Boolean(draft.transit || linkedToPlanning && (!selectedMission || selectedMission.vessel.id !== draft.vessel.id));
  const matchingVesselContext = vesselContext?.client === client && vesselContext.context.date === contextDate
    && vesselContext.context.vesselId === draft.vessel.id ? vesselContext.context : null;
  const captains = usesVesselContext ? matchingVesselContext?.captains : selectedMission?.vessel.id === draft.vessel.id ? selectedMission.captains : undefined;
  const captainPersonId = draft.transit?.captainPersonId ?? draft.planning?.captainPersonId;
  const selectedCaptain = captains?.find(captain => captain.personId === captainPersonId);
  const sortedVessels = useMemo(() => [...(data?.vessels ?? [])].sort(compareFleetAssets), [data?.vessels]);
  const recordedClientLocked = Boolean(record?.draft.client.trim() && sameClientContext(record.draft, draft));
  const clientLocked = recordedClientLocked || Boolean(selectedMission?.client.trim());
  const selectedClientValue = clientLocked && draft.client ? '__retained' : draft.clientId || (draft.client ? '__existing' : '');
  useEffect(() => { latestDraft.current = draft; }, [draft]);
  const applyData = useCallback((result: SeaOperationData) => {
    setData(result);
    const account = recoveryKey(result);
    if (loadedAccount.current === account) return;
    ++recordActionSequence.current;
    mutationRunning.current = false;
    setRecordAction(null); setRecordActionError(''); setBusy(false);
    loadedAccount.current = account;
    pendingUkc.current.clear(); setUkcRequests({ client: currentClient.current, statuses: {} });
    setRecord(null); setDraft(emptySeaOperation()); setEditing(false); setDirty(false); setStep(0);
    const recovery = readRecovery(result);
    if (!recovery) return;
    const existing = recovery.recordId ? result.records.find((item) => item.id === recovery.recordId) : null;
    if (recovery.recordId && (!existing || existing.status === 'signed' || !existing.canEdit)) {
      clearRecovery(result);
      setNotice('La préparation locale ne peut pas être reprise : la fiche est signée, inaccessible ou vos droits ont changé.');
      return;
    }
    setRecord(existing ? { ...existing, version: recovery.version! } : null);
    const vessel = result.vessels.find((source) => String(source.id) === recovery.draft.vessel.id);
    setDraft(captureSeaOperationWaypointDescriptions(captureRouteEtas(captureVesselDraft(captureVesselMatrix(recovery.draft, vessel), vessel), result.vessels))); setPlanningDate(seaOperationContextDate(recovery.draft) || recovery.draft.vessel.etd.slice(0, 10) || seaOperationToday()); setStep(recovery.step); setEditing(true); setDirty(true);
    setNotice('Votre préparation non enregistrée a été récupérée dans cet onglet. Vérifiez-la avant de l’enregistrer.');
  }, []);

  useEffect(() => {
    if (currentClient.current === client) return;
    currentClient.current = client;
    ++loadSequence.current; ++recordActionSequence.current;
    mutationRunning.current = false;
    loadedAccount.current = '';
    setRecordAction(null); setRecordActionError(''); setBusy(false); setExporting(false); setHistoryLoading(false);
    setWeatherRequests({ client, statuses: {} });
    pendingUkc.current.clear(); setUkcRequests({ client, statuses: {} });
    setData(null); setRecord(null); setEditing(false); setDirty(false); setNotice(''); setError('');
  }, [client]);

  useEffect(() => {
    let active = true;
    fetchSeaOperationData(client).then((result) => { if (active) applyData(result); }).catch((reason: unknown) => { if (active) setError(errorMessage(reason)); });
    return () => { active = false; };
  }, [client, applyData]);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 1100px)');
    const change = () => setCompactLayout(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!editing) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [editing]);
  useEffect(() => { if (formPane.current) formPane.current.scrollTop = 0; }, [step]);
  useEffect(() => {
    if (!data || !dirty) return;
    try { sessionStorage.setItem(recoveryKey(data), JSON.stringify({ draft, recordId: record?.id ?? null, version: record?.version ?? null, step })); }
    catch { /* Editing and server saves remain available when local storage is unavailable. */ }
  }, [data, dirty, draft, record, step]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    const beforeNavigation = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (!window.confirm('Quitter cette fiche sans enregistrer les modifications ?')) { event.preventDefault(); event.stopPropagation(); }
      else { clearRecovery(data); setDirty(false); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', beforeNavigation, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', beforeNavigation, true); };
  }, [dirty, data]);

  useEffect(() => {
    if (!editing || record?.status === 'signed') return;
    let active = true;
    const revision = editRevision.current;
    setPlanning(null); setPlanningLoading(true); setPlanningError('');
    fetchSeaOperationPlanningWindow(client, planningStartDate, planningDate).then((result) => {
      if (!active) return;
      setPlanning(result);
      const current = latestDraft.current;
      const datedMission = result.choices.find((choice) => choice.operationId === current.planning?.operationId && choice.date === current.planning?.date);
      const selectedContext = result.selectedContext?.date === current.planning?.date ? result.selectedContext : null;
      const mission = datedMission ?? selectedContext?.choices.find(choice => choice.operationId === current.planning?.operationId);
      const missionDate = datedMission?.date ?? selectedContext?.date;
      if (mission && record?.canEdit !== false && current.planning?.date === missionDate && !weatherEditor.current.busy && !weatherEditor.current.signed) {
        const vessel = data?.vessels.find((source) => String(source.id) === current.vessel.id);
        const source = mission.vessel.id !== current.vessel.id || mission.vessel.weatherMatrix === undefined ? vessel : mission.vessel;
        if (captureRouteEtas(captureVesselDraft(captureVesselMatrix(current, source), vessel), data?.vessels) !== current) {
          setDraft((value) => value.planning?.operationId === mission.operationId && value.planning.date === missionDate ? captureRouteEtas(captureVesselDraft(captureVesselMatrix(value, source), vessel), data?.vessels) : value);
          setDirty(true);
        }
      }
      const captain = mission?.captains.find((person) => person.personId === current.planning?.captainPersonId)
        || (!current.planning?.captainPersonId && mission?.captains.length === 1 ? mission.captains[0] : undefined);
      // Repair missing draft identity only; signed decisions and existing names remain historical.
      if (captain && mission?.vessel.id === current.vessel.id && record?.canEdit !== false && current.planning?.date === missionDate && (!current.signature.captainName.trim() || !current.vessel.captainName.trim())) {
        setDraft((draft) => draft.planning && mission && draft.vessel.id === mission.vessel.id && draft.planning.operationId === mission.operationId && draft.planning.date === missionDate && draft.planning.captainPersonId === current.planning?.captainPersonId ? {
          ...draft, planning: { ...draft.planning, captainPersonId: draft.planning.captainPersonId || captain.personId },
          vessel: { ...draft.vessel, captainName: draft.vessel.captainName.trim() ? draft.vessel.captainName : captain.name },
          signature: { ...draft.signature, captainName: draft.signature.captainName.trim() ? draft.signature.captainName : captain.name, acknowledged: draft.signature.captainName.trim() ? draft.signature.acknowledged : false },
        } : draft);
        setDirty(true);
      }
      // A unique planned mission can be selected directly. Multiple missions always require a choice.
      if (allowAutomaticMission.current && editRevision.current === revision && !latestDraft.current.project && !latestDraft.current.planning?.operationId && result.choices.length === 1) {
        allowAutomaticMission.current = false;
        const selected = draftForPlanningChoice(result.choices[0], result.choices[0].date,
          data?.vessels.find(source => String(source.id) === result.choices[0].vessel.id)?.maxSpeedKnots);
        const vessel = data?.vessels.find((source) => String(source.id) === selected.vessel.id);
        setPlanningDate(result.choices[0].date);
        setDraft(captureVesselDraft(result.choices[0].vessel.weatherMatrix === undefined ? captureVesselMatrix(selected, vessel) : selected, vessel));
        setDirty(true);
      }
    }).catch((reason: unknown) => { if (active) setPlanningError(errorMessage(reason)); })
      .finally(() => { if (active) setPlanningLoading(false); });
    return () => { active = false; };
  }, [client, editing, planningDate, planningStartDate, record?.id, record?.status, record?.canEdit, data?.vessels]);
  useEffect(() => {
    setVesselContext(null); setVesselContextLoading(false); setVesselContextError('');
    if (!editing || record?.status === 'signed' || !usesVesselContext || !contextDate || !draft.vessel.id) return;
    if (linkedToPlanning && !planning && !planningError) return;
    let active = true;
    setVesselContextLoading(true);
    fetchSeaOperationVesselContext(client, contextDate, draft.vessel.id)
      .then(context => { if (active) setVesselContext({ client, context }); })
      .catch((reason: unknown) => { if (active) setVesselContextError(errorMessage(reason)); })
      .finally(() => { if (active) setVesselContextLoading(false); });
    return () => { active = false; };
  }, [client, editing, record?.status, usesVesselContext, contextDate, draft.vessel.id, linkedToPlanning, planning, planningError]);
  useEffect(() => {
    setCaptainSignature(null); setSignatureError(''); setSignatureLoading(false);
    if (!editing || record?.status === 'signed' || !contextDate || !captainPersonId
      || !usesVesselContext && !selectedMission || usesVesselContext && !selectedCaptain) return;
    let active = true;
    setSignatureLoading(true);
    const request = usesVesselContext
      ? fetchSeaOperationVesselCaptainSignature(client, contextDate, draft.vessel.id, captainPersonId)
      : fetchSeaOperationCaptainSignature(client, contextDate, draft.planning!.operationId, captainPersonId);
    request
      .then((result) => { if (active) setCaptainSignature(result); })
      .catch((reason: unknown) => { if (active) setSignatureError(errorMessage(reason)); })
      .finally(() => { if (active) setSignatureLoading(false); });
    return () => { active = false; };
  }, [client, editing, record?.status, contextDate, draft.planning?.operationId, captainPersonId, draft.vessel.id, usesVesselContext, selectedMission, selectedCaptain]);

  const update = (patch: Partial<SeaOperationPayload> | ((current: SeaOperationPayload) => Partial<SeaOperationPayload>)) => {
    allowAutomaticMission.current = false; editRevision.current += 1;
    setDraft(current => invalidateSeaOperationUkc(captureRouteEtas({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }, data?.vessels)));
    setDirty(true); setNotice(''); setIssues([]);
  };
  const vesselUpdate = (patch: Partial<SeaOperationPayload['vessel']>) => {
    const changed = patch.id !== undefined && patch.id !== draft.vessel.id;
    const source = data?.vessels.find(vessel => String(vessel.id) === (patch.id ?? draft.vessel.id));
    if (changed) { setCaptainSignature(null); setVesselContext(null); setSignatureError(''); setVesselContextError(''); }
    update(current => {
      const next = { ...current, vessel: { ...current.vessel, ...patch,
        ...(changed ? { captainName: '', draftMeters: source?.draftMeters ?? null, weatherMatrix: structuredClone(source?.weatherMatrix ?? null) } : {}) } };
      if (changed && source?.draftMeters === undefined) delete next.vessel.draftMeters;
      const vessel = captureVesselDraft(next, source).vessel;
      return { vessel, ...(changed ? { signature: { ...current.signature, captainName: '', acknowledged: false },
        ...(current.transit ? { transit: { ...current.transit, captainPersonId: '' } } : current.planning ? { planning: { ...current.planning, captainPersonId: '' } } : {}) } : {}) };
    });
  };
  const waypointUpdate = (index: number, patch: Partial<SeaOperationPayload['waypoints'][number]>) => update(current => ({ waypoints: current.waypoints.map((point, i) => i === index ? updateSeaOperationWaypoint(point, patch.eta !== undefined ? { ...patch, etaMode: patch.etaMode ?? 'manual' } : patch) : point) }));
  const editable = !record || record.canEdit;
  const signed = record?.status === 'signed';
  const weatherEditor = useRef({ client, draft, editing, editable, signed, busy, exporting });
  const pendingWeather = useRef(new globalThis.Map<string, { weather: SeaOperationWaypointWeather; context: SeaOperationWeatherCaptureContext; sourceClient: SupabaseClient }>());
  weatherEditor.current = { client, draft, editing, editable, signed, busy, exporting };
  useEffect(() => {
    const current = weatherEditor.current;
    if (!usesVesselContext || !matchingVesselContext || !current.editing || !current.editable || current.signed || current.busy || current.exporting) return;
    const captain = matchingVesselContext.captains.find(person => person.personId === captainPersonId)
      ?? (matchingVesselContext.captains.length === 1 ? matchingVesselContext.captains[0] : undefined);
    // An unavailable assignment must not rewrite an existing saved identity merely by opening it.
    // Explicit vessel/date changes already clear the previous identity before this request.
    if (!captain) return;
    const personId = captain?.personId || '', name = captain?.name || '';
    if (captainPersonId === personId && draft.vessel.captainName === name && draft.signature.captainName === name) return;
    editRevision.current += 1;
    setDraft(value => seaOperationContextDate(value) === matchingVesselContext.date && value.vessel.id === matchingVesselContext.vesselId
      && (value.transit?.captainPersonId ?? value.planning?.captainPersonId) === captainPersonId ? {
      ...value, ...(value.transit ? { transit: { ...value.transit, captainPersonId: personId } }
        : value.planning ? { planning: { ...value.planning, captainPersonId: personId } } : {}),
      vessel: { ...value.vessel, captainName: name }, signature: { ...value.signature, captainName: name, acknowledged: false },
    } : value);
    setDirty(true);
  }, [usesVesselContext, matchingVesselContext, captainPersonId, draft.vessel.captainName, draft.signature.captainName, busy, exporting, editing, editable, signed]);
  useEffect(() => {
    const current = weatherEditor.current;
    if (!data || loadedAccount.current !== recoveryKey(data) || current.client !== client
      || !current.editing || !current.editable || current.signed || current.busy || current.exporting) return;
    if (captureRouteEtas(current.draft, data.vessels) === current.draft) return;
    const sequence = loadSequence.current;
    setDraft(value => sequence === loadSequence.current && weatherEditor.current.client === client
      ? captureRouteEtas(value, data.vessels) : value);
    editRevision.current += 1;
    setDirty(true); setIssues([]);
  }, [client, data, editing, editable, signed, busy, exporting, draft.vessel.id]);
  // A gesture belongs to the open account/record/mission, even after a context switch.
  const mapEditSequence = loadSequence.current;
  const mapOperationId = draft.planning?.operationId;
  const mapOperationDate = seaOperationContextDate(draft);
  const mapVesselId = draft.vessel.id;
  const mapAccount = actionContext.current.account;
  const canEditMap = () => {
    const current = weatherEditor.current;
    return mapEditSequence === loadSequence.current && current.client === client
      && actionContext.current.account === mapAccount
      && current.draft.planning?.operationId === mapOperationId && seaOperationContextDate(current.draft) === mapOperationDate
      && current.draft.vessel.id === mapVesselId && current.editing
      && current.editable && !current.signed && !current.busy && !current.exporting;
  };
  const updateLocationOverlay = (change: (overlay: ProjectLocationOverlay) => ProjectLocationOverlay) => {
    if (!canEditMap() || !latestDraft.current.locationOverlay) return;
    update(current => current.locationOverlay ? { locationOverlay: change(current.locationOverlay) } : {});
  };
  const validMapPosition = (position: SeaPosition) => Number.isFinite(position.latitude) && Number.isFinite(position.longitude)
    && Math.abs(position.latitude) <= 90 && Math.abs(position.longitude) <= 180;
  const moveIsolatedPoint = (id: string, position: SeaPosition) => {
    if (!validMapPosition(position)) return;
    updateLocationOverlay(overlay => ({ ...overlay, points: overlay.points.map(point => point.id === id
      ? updateSeaOperationWaypoint(point, { latitude: String(Number(position.latitude.toFixed(6))), longitude: String(Number(position.longitude.toFixed(6))) }) : point) }));
  };
  const deleteIsolatedPoint = (id: string) => updateLocationOverlay(overlay => ({ ...overlay, points: overlay.points.filter(point => point.id !== id) }));
  const moveZoneVertex = (zoneId: string, index: number, position: SeaPosition) => {
    if (!Number.isInteger(index) || index < 0 || !validMapPosition(position)) return;
    updateLocationOverlay(overlay => ({ ...overlay, zones: overlay.zones.map(zone => zone.id === zoneId
      ? { ...zone, vertices: zone.vertices.map((vertex, vertexIndex) => vertexIndex === index ? { latitude: String(Number(position.latitude.toFixed(6))), longitude: String(Number(position.longitude.toFixed(6))) } : vertex) } : zone) }));
  };
  const deleteZoneVertex = (zoneId: string, index: number) => {
    if (!Number.isInteger(index) || index < 0) return;
    updateLocationOverlay(overlay => ({ ...overlay, zones: overlay.zones.map(zone => zone.id === zoneId ? { ...zone, vertices: zone.vertices.filter((_, vertexIndex) => vertexIndex !== index) } : zone) }));
  };
  const addWaypoint = (position?: SeaPosition, port?: { name: string; portKey?: string }) => {
    if (!canEditMap()) return;
    if (position && (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude) || Math.abs(position.latitude) > 90 || Math.abs(position.longitude) > 180)) return;
    const id = crypto.randomUUID();
    allowAutomaticMission.current = false; editRevision.current += 1;
    setDraft((value) => {
      if (!canEditMap()) return value;
      const used = new Set(value.waypoints.map((point) => point.number.trim()));
      let number = value.waypoints.length + 1;
      while (used.has(String(number))) number += 1;
      const point = { id, number: String(number), descriptionVhf: port?.name.trim() || `Waypoint ${number}`, latitude: position ? String(Number(position.latitude.toFixed(6))) : '', longitude: position ? String(Number(position.longitude.toFixed(6))) : '', ukc: '', ukcMode: 'automatic' as const, eta: '', denseTraffic: false };
      return captureRouteEtas({ ...value, waypoints: [...value.waypoints, point] }, data?.vessels);
    });
    setDirty(true); setNotice(''); setIssues([]);
  };
  const moveWaypoint = (id: string, position: SeaPosition) => {
    if (!canEditMap() || !weatherEditor.current.draft.waypoints.some(point => point.id === id)
      || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)
      || Math.abs(position.latitude) > 90 || Math.abs(position.longitude) > 180) return;
    const patch = { latitude: String(Number(position.latitude.toFixed(6))), longitude: String(Number(position.longitude.toFixed(6))) };
    update(current => canEditMap() ? { waypoints: current.waypoints.map(point => point.id === id ? updateSeaOperationWaypoint(point, patch) : point) } : {});
  };
  const removeWaypoint = (id: string) => {
    if (!canEditMap() || !weatherEditor.current.draft.waypoints.some(point => point.id === id)) return;
    update(current => canEditMap() ? { waypoints: current.waypoints.filter(point => point.id !== id) } : {});
  };
  const retainWeather = useCallback((weather: SeaOperationWaypointWeather, context: SeaOperationWeatherCaptureContext, sourceClient: SupabaseClient) => {
    const current = weatherEditor.current;
    if (sourceClient !== current.client || !current.editing || !current.editable || current.signed
      || retainSeaOperationWeather(current.draft, weather, context) === current.draft) return;
    if (current.busy) {
      const key = JSON.stringify([context.projectId, context.transit?.date, context.transit?.vesselId, context.pointId]);
      if (!pendingWeather.current.has(key) && pendingWeather.current.size >= 64) pendingWeather.current.delete(pendingWeather.current.keys().next().value!);
      pendingWeather.current.set(key, { weather, context, sourceClient });
      return;
    }
    setDraft((value) => retainSeaOperationWeather(value, weather, context));
    setDirty(true); setNotice('');
  }, []);
  const receiveWeatherStatuses = useCallback((statuses: Record<string, WeatherRequestStatus>, sourceClient: SupabaseClient) => {
    const current = weatherEditor.current;
    if (sourceClient !== current.client || !current.editing || current.signed) return;
    const reference = seaOperationWeatherReference(current.draft);
    const keys = new Set(current.draft.waypoints.map(point => weatherRequestKey(reference, point)));
    const entries = Object.entries(statuses).filter(([key]) => keys.has(key));
    if (Object.keys(statuses).length && !entries.length) return;
    setWeatherRequests((previous) => {
      const next = Object.fromEntries(entries);
      const previousEntries = Object.entries(previous.statuses);
      if (previous.client === sourceClient && previousEntries.length === entries.length
        && entries.every(([key, status]) => previous.statuses[key]?.loading === status.loading && previous.statuses[key]?.error === status.error)) return previous;
      return { client: sourceClient, statuses: next };
    });
  }, []);
  const retainUkc = useCallback((capture: SeaOperationCopernicusEstimate, context: SeaOperationUkcCaptureContext, sourceClient: SupabaseClient) => {
    const current = weatherEditor.current;
    if (sourceClient !== current.client || !current.editing || !current.editable || current.signed
      || retainSeaOperationUkc(current.draft, capture, context) === current.draft) return;
    if (current.busy) {
      const key = JSON.stringify([context.projectId, context.transit?.date, context.vesselId, context.pointId]);
      if (!pendingUkc.current.has(key) && pendingUkc.current.size >= 64) pendingUkc.current.delete(pendingUkc.current.keys().next().value!);
      pendingUkc.current.set(key, { capture, context, sourceClient }); return;
    }
    setDraft(value => retainSeaOperationUkc(value, capture, context)); setDirty(true); setNotice('');
  }, []);
  const receiveUkcStatuses = useCallback((statuses: Record<string, SeaOperationUkcRequestStatus>, sourceClient: SupabaseClient) => {
    const current = weatherEditor.current;
    if (sourceClient !== current.client || !current.editing || current.signed) return;
    const reference = seaOperationUkcReference(current.draft);
    const keys = new Set(current.draft.waypoints.filter(point => point.ukcMode === 'automatic').map(point => ukcRequestKey(reference, point)));
    const entries = Object.entries(statuses).filter(([key]) => keys.has(key));
    if (Object.keys(statuses).length && !entries.length) return;
    setUkcRequests(previous => {
      if (previous.client === sourceClient && Object.keys(previous.statuses).length === entries.length
        && entries.every(([key, status]) => previous.statuses[key]?.loading === status.loading && previous.statuses[key]?.error === status.error)) return previous;
      return { client: sourceClient, statuses: Object.fromEntries(entries) };
    });
  }, []);
  useEffect(() => {
    if (busy) return;
    const pending = [...pendingWeather.current.values()];
    pendingWeather.current.clear();
    if (editing && editable && !signed) for (const entry of pending) retainWeather(entry.weather, entry.context, entry.sourceClient);
  }, [busy, client, editing, editable, signed, retainWeather]);
  useEffect(() => {
    if (busy) return;
    const pending = [...pendingUkc.current.values()]; pendingUkc.current.clear();
    if (editing && editable && !signed) for (const entry of pending) retainUkc(entry.capture, entry.context, entry.sourceClient);
  }, [busy, client, editing, editable, signed, retainUkc]);
  const assessment = getSeaOperationAssessment(draft);
  const referenceDraft = draft.vessel.draftMeters;
  const canSign = linkedToCaptainContext ? selectedCaptain?.canSign === true : record?.canSign || (!record && data?.vessels.some((vessel) => String(vessel.id) === draft.vessel.id && vessel.canSign));
  function selectMission(choiceKey: string) {
    if (choiceKey === '__existing') return;
    allowAutomaticMission.current = false;
    editRevision.current += 1;
    const choice = planning?.choices.find(item => seaOperationPlanningChoiceKey(item) === choiceKey);
    let next = choice ? draftForPlanningChoice(choice, choice.date, data?.vessels.find(source => String(source.id) === choice.vessel.id)?.maxSpeedKnots)
      : choiceKey === '__transit' ? createTransitSeaOperation(planningDate || seaOperationToday()) : newSeaOperation();
    if (record?.draft.client.trim() && sameClientContext(record.draft, next)) next = { ...next, client: record.draft.client,
      clientId: record.draft.clientId, clientContact: record.draft.clientContact };
    const vessel = data?.vessels.find((source) => String(source.id) === next.vessel.id);
    if (choice) setPlanningDate(choice.date);
    setCaptainSignature(null); setVesselContext(null); setSignatureError(''); setVesselContextError('');
    setDraft(captureVesselDraft(choice?.vessel.weatherMatrix === undefined ? captureVesselMatrix(next, vessel) : next, vessel));
    setDirty(true); setIssues([]); setNotice(''); setError('');
  }
  function changePlanningDate(value: string) {
    allowAutomaticMission.current = false;
    editRevision.current += 1;
    setPlanningDate(value); setPlanning(null); setCaptainSignature(null); setVesselContext(null);
    setDraft(current => current.transit ? invalidateSeaOperationUkc({ ...current, transit: { date: value, captainPersonId: '' },
      vessel: { ...current.vessel, captainName: '' }, signature: { ...current.signature, captainName: '', acknowledged: false } }) : newSeaOperation());
    setDirty(true); setIssues([]); setNotice('');
  }
  function selectCaptain(personId: string) {
    const captain = captains?.find(item => item.personId === personId);
    setCaptainSignature(null);
    update({ ...(draft.transit ? { transit: { ...draft.transit, captainPersonId: captain?.personId || '' } }
      : draft.planning ? { planning: { ...draft.planning, captainPersonId: captain?.personId || '' } } : {}),
    vessel: { ...draft.vessel, captainName: captain?.name || '' }, signature: { ...draft.signature, captainName: captain?.name || '', acknowledged: false } });
  }
  function selectClient(id: string) {
    if (clientLocked) return;
    const selected = data?.clients?.find(item => item.id === id);
    update({ clientId: selected?.id || '', client: selected?.name || '', clientContact: selected?.contact || '' });
  }
  const confirmLeave = () => !dirty || window.confirm('Quitter cette fiche sans enregistrer les modifications ?');
  function closeEditor() {
    if (busy || exporting || !confirmLeave()) return;
    pendingUkc.current.clear(); clearRecovery(data); setEditing(false); setDirty(false); setNotice(''); setIssues([]); setError('');
    window.requestAnimationFrame(() => { if (editorOpener.current?.isConnected) editorOpener.current.focus(); });
  }
  function changeStep(index: number) {
    setStep(index); setMobilePane('form');
    window.requestAnimationFrame(() => formPane.current?.querySelector<HTMLElement>(`#sea-operation-step-${index} h2`)?.focus());
  }
  function revealFormFeedback() {
    setMobilePane('form');
    window.requestAnimationFrame(() => formPane.current?.querySelector<HTMLElement>('[role="alert"]')?.focus());
  }
  const remember = (saved: SeaOperationRecord) => {
    clearRecovery(data);
    setRecord(saved); setDraft(saved.draft); setDirty(false);
    setData((current) => current ? { ...current, records: [ ...(saved.supersededById ? [] : [saved]), ...current.records.filter((item) => item.id !== saved.id)] } : current);
  };
  async function open(item: Pick<SeaOperationRecord, 'id'>) {
    if (!confirmLeave()) return;
    allowAutomaticMission.current = false;
    editorOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const request = ++loadSequence.current;
    setBusy(true); setError(''); setNotice(''); setIssues([]);
    try { const loaded = await fetchSeaOperationDetail(client, item.id); if (request === loadSequence.current && actionContext.current.client === client) {
      setWeatherRequests({ client, statuses: {} });
      pendingUkc.current.clear(); setUkcRequests({ client, statuses: {} });
      remember(loaded);
      if (loaded.status !== 'signed' && loaded.canEdit) {
        const vessel = data?.vessels.find((source) => String(source.id) === loaded.draft.vessel.id);
        const prepared = captureSeaOperationWaypointDescriptions(captureRouteEtas(captureVesselDraft(captureVesselMatrix(loaded.draft, vessel), vessel), data?.vessels));
        if (prepared !== loaded.draft) { setDraft(prepared); setDirty(true); setNotice('Les données du navire ont été actualisées pour cette préparation. Enregistrez pour les conserver.'); }
      }
      setPlanning(null); setPlanningDate(seaOperationContextDate(loaded.draft) || loaded.draft.vessel.etd.slice(0, 10) || seaOperationToday()); setEditing(true); setStep(0); setMobilePane('form');
    } }
    catch (reason) { if (request === loadSequence.current && actionContext.current.client === client) setError(errorMessage(reason)); }
    finally { if (request === loadSequence.current && actionContext.current.client === client) setBusy(false); }
  }
  function create() {
    if (!confirmLeave()) return;
    allowAutomaticMission.current = true;
    editorOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    clearRecovery(data);
    ++loadSequence.current;
    setWeatherRequests({ client, statuses: {} });
    pendingUkc.current.clear(); setUkcRequests({ client, statuses: {} });
    setRecord(null); setDraft(newSeaOperation()); setPlanningDate(seaOperationToday()); setPlanning(null); setDirty(false); setEditing(true); setStep(0); setMobilePane('form'); setError(''); setNotice(''); setIssues([]);
  }
  function requestRecordAction(kind: RecordAction['kind'], item: SeaOperationRecord) {
    if (!data || busy || exporting || mutationRunning.current || recordAction
      || (kind === 'revise' ? item.status !== 'signed' || !item.canRevise : !item.canDelete)) return;
    if (!confirmLeave()) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    editorOpener.current = opener?.closest('.so-record-entry')?.querySelector<HTMLButtonElement>('.so-record') || editorOpener.current;
    setRecordActionError(''); setRecordAction({ kind, record: item, client, account: recoveryKey(data) });
  }
  async function confirmRecordAction() {
    const action = recordAction;
    if (!action || mutationRunning.current || busy || exporting || action.client !== client
      || action.account !== actionContext.current.account
      || (action.kind === 'revise' ? !action.record.canRevise : !action.record.canDelete)) return;
    mutationRunning.current = true;
    const request = ++recordActionSequence.current;
    ++loadSequence.current;
    pendingWeather.current.clear();
    pendingUkc.current.clear();
    setBusy(true); setRecordActionError('');
    const isCurrent = () => request === recordActionSequence.current && actionContext.current.client === action.client
      && actionContext.current.account === action.account;
    try {
      if (action.kind === 'revise') {
        const revised = await reviseSeaOperation(action.client, { id: action.record.id, version: action.record.version });
        if (!isCurrent()) return;
        remember(revised);
        setData((current) => current ? { ...current, records: current.records.filter((item) => item.id !== action.record.id) } : current);
        setPlanningDate(seaOperationContextDate(revised.draft) || revised.draft.vessel.etd.slice(0, 10) || seaOperationToday());
        allowAutomaticMission.current = false;
        setPlanning(null); setEditing(true); setStep(0); setMobilePane('form'); setIssues([]); setError('');
        setNotice('Nouvelle préparation créée. La version signée précédente reste conservée. Le Capitaine devra signer cette nouvelle fiche.');
      } else {
        await deleteSeaOperation(action.client, { id: action.record.id, version: action.record.version });
        if (!isCurrent()) return;
        setData((current) => current ? { ...current, records: current.records.filter((item) => item.id !== action.record.id) } : current);
        if (record?.id === action.record.id) {
          clearRecovery(data); setRecord(null); setEditing(false); setDirty(false); setIssues([]);
        }
        setError(''); setNotice('Opération supprimée du registre.');
      }
      setRecordAction(null);
    } catch (reason) {
      if (isCurrent()) setRecordActionError(errorMessage(reason));
    } finally {
      if (isCurrent()) { mutationRunning.current = false; setBusy(false); }
    }
  }
  async function save(sign = false) {
    if (busy) return;
    const matrixSource = selectedMission?.vessel.id !== draft.vessel.id || selectedMission?.vessel.weatherMatrix === undefined
      ? data?.vessels.find(vessel => String(vessel.id) === draft.vessel.id) : selectedMission.vessel;
    const prepared = captureSeaOperationRadios(captureSeaOperationWaypointDescriptions(captureRouteEtas(captureVesselDraft(captureVesselMatrix(draft, matrixSource), data?.vessels.find((vessel) => String(vessel.id) === draft.vessel.id)), data?.vessels)));
    const automaticUkcErrors = new Set(prepared.waypoints.flatMap((point, index) => point.ukcMode === 'automatic' ? [`L’UKC du point n° ${index + 1} est obligatoire.`] : []));
    const validation = validateSeaOperation(prepared, sign ? prepared.decision || 'GO' : 'DRAFT').filter(message => !automaticUkcErrors.has(message));
    if (validation.length) { setIssues(validation); setStep(sign ? 3 : step); revealFormFeedback(); return; }
    setBusy(true); setError(''); setIssues([]); setNotice('');
    const sequence = loadSequence.current;
    try {
      const weatherCaptured = await captureSeaOperationValidationWeather(client, prepared, { preview: previewMode, missingOnly: !sign });
      if (sequence !== loadSequence.current || weatherEditor.current.client !== client || !weatherEditor.current.editing) return;
      const ukcErrors: string[] = [];
      let captured = await captureSeaOperationValidationUkc(client, weatherCaptured, { preview: previewMode, missingOnly: !sign,
        onError: (point, message) => {
          ukcErrors.push(`Point ${point.number || point.id} : ${message}`);
          if (sequence !== loadSequence.current || weatherEditor.current.client !== client || !weatherEditor.current.editing) return;
          const key = ukcRequestKey(seaOperationUkcReference(weatherCaptured), point);
          setUkcRequests(previous => ({ client, statuses: { ...(previous.client === client ? previous.statuses : {}), [key]: { loading: false, error: message } } }));
        } });
      if (sequence !== loadSequence.current || weatherEditor.current.client !== client || !weatherEditor.current.editing) return;
      // A silent request may finish while save-time requests are busy. Preserve its compatible result.
      const queued = [...pendingUkc.current.values()]; pendingUkc.current.clear();
      for (const entry of queued) if (entry.sourceClient === client) captured = retainSeaOperationUkc(captured, entry.capture, entry.context);
      const beforeSave = sign ? validateSeaOperation(captured, captured.decision || 'GO') : [];
      if (beforeSave.length) {
        setDraft(captured); setDirty(true); setIssues([...beforeSave, ...ukcErrors]); setStep(3); revealFormFeedback(); return;
      }
      const saved = await saveSeaOperation(client, captured, record || undefined);
      if (sequence !== loadSequence.current || weatherEditor.current.client !== client || !weatherEditor.current.editing) return;
      const recordedWeatherKeys = new Set(saved.draft.waypoints.filter((point) => waypointWeatherSnapshot(point))
        .map(point => weatherRequestKey(seaOperationWeatherReference(saved.draft), point)));
      setWeatherRequests((previous) => {
        if (previous.client !== client) return previous;
        const entries = Object.entries(previous.statuses).filter(([key]) => !recordedWeatherKeys.has(key));
        return entries.length === Object.keys(previous.statuses).length ? previous : { client, statuses: Object.fromEntries(entries) };
      });
      const savedUkcReference = seaOperationUkcReference(saved.draft);
      const recordedUkcKeys = new Set(saved.draft.waypoints.filter(point => waypointUkcSnapshot(point, savedUkcReference)?.status === 'available')
        .map(point => ukcRequestKey(savedUkcReference, point)));
      setUkcRequests(previous => previous.client === client ? { client, statuses: Object.fromEntries(Object.entries(previous.statuses).filter(([key]) => !recordedUkcKeys.has(key))) } : previous);
      remember(saved);
      // The server owns the vessel draught. Reuse its canonical value on the next calculation/save.
      if (saved.status === 'draft' && saved.draft.vessel.draftMeters !== undefined) setData(current => current ? { ...current,
        vessels: current.vessels.map(vessel => String(vessel.id) === saved.draft.vessel.id ? { ...vessel, draftMeters: saved.draft.vessel.draftMeters } : vessel) } : current);
      if (sign) {
        const afterSave = validateSeaOperation(saved.draft, saved.draft.decision || 'GO');
        if (afterSave.length) {
          setIssues(afterSave); setStep(3); setNotice('Le brouillon est enregistré. Complétez les données signalées avant de signer.');
          revealFormFeedback(); return;
        }
        const finalized = await signSeaOperation(client, saved, saved.draft.signature.captainName, saved.draft.signature.acknowledged);
        if (sequence !== loadSequence.current || weatherEditor.current.client !== client || !weatherEditor.current.editing) return;
        remember(finalized); setNotice('Décision du Capitaine signée et enregistrée. La fiche est figée.');
      } else setNotice('Brouillon enregistré.');
    } catch (reason) { if (sequence === loadSequence.current && weatherEditor.current.client === client) { setError(errorMessage(reason)); revealFormFeedback(); } }
    finally { if (sequence === loadSequence.current && weatherEditor.current.client === client) setBusy(false); }
  }
  async function refreshWeatherHistory() {
    if (!record || record.status !== 'signed' || historyLoading) return;
    const operationId = record.id;
    const sequence = loadSequence.current;
    setHistoryLoading(true);
    try {
      const points = await fetchSeaOperationWeatherObservations(client, operationId);
      if (sequence === loadSequence.current && weatherEditor.current.client === client) setRecord((value) =>
        value?.id === operationId ? { ...value, weatherObservations: points, weatherHistoryError: undefined } : value);
    } catch {
      if (sequence === loadSequence.current && weatherEditor.current.client === client) setRecord((value) =>
        value?.id === operationId ? { ...value, weatherHistoryError: 'Les mesures météo enregistrées sont temporairement indisponibles. Réessayez leur lecture.' } : value);
    } finally { setHistoryLoading(false); }
  }
  async function exportPdf() {
    if (!record || dirty || exporting) return;
    setExporting(true); setError('');
    try {
      const signatureImage = await loadSeaOperationSignature(client, record);
      await exportSeaOperationPdf(record, { signatureImage });
    } catch (reason) { setError(errorMessage(reason)); revealFormFeedback(); }
    finally { setExporting(false); }
  }
  const records = (data?.records || []).filter((item) => {
    const matches = `${item.draft.project} ${item.draft.client} ${item.draft.vessel.name}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'));
    return matches && (status === 'all' || (status === 'draft' ? item.status === 'draft' : item.status === 'signed' && item.draft.decision === status));
  });

  return <div className="so-page"><div className="so-screen" inert={recordAction ? true : undefined} aria-hidden={recordAction ? true : undefined}>
    <header className="so-heading sp-module-header"><div className="so-title"><span className="so-icon"><Map size={26} /></span><div><span className="so-eyebrow">OPÉRATIONS · OPE-FOR-10-C</span><h1>Opération en Mer</h1><p>Préparer la mission, vérifier les conditions et consigner la décision du Capitaine.</p></div></div></header>
    <ModuleRibbon ariaLabel="Commandes Opération en Mer" singleRow><ModuleRibbonGroup label="Opérations"><ModuleRibbonCommand disabled={busy || !data} icon={<Plus size={22} />} label="Nouvelle opération" onClick={create} /></ModuleRibbonGroup></ModuleRibbon>
    {!editing && error && <div className="so-alert so-danger" tabIndex={-1} role="alert"><AlertTriangle size={19} /><span>{error}</span>{!data && <button onClick={() => { setError(''); void fetchSeaOperationData(client).then(applyData).catch((reason: unknown) => setError(errorMessage(reason))); }}>Réessayer</button>}</div>}
    {!editing && notice && <div className="so-alert so-success" role="status"><CheckCircle2 size={18} />{notice}</div>}
    {!data && !error && <p role="status">Chargement des opérations en mer…</p>}
    {data && <>
      <div className="so-metrics">{[['Fiches enregistrées', data.records.length], ['En préparation', data.records.filter((item) => item.status === 'draft').length], ['Décisions GO', data.records.filter((item) => item.status === 'signed' && item.draft.decision === 'GO').length], ['Décisions NO GO', data.records.filter((item) => item.status === 'signed' && item.draft.decision === 'NO_GO').length]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
      <section className="so-register sp-panel"><header><div><h2>Registre des opérations</h2><p>Les préparations et décisions de votre société.</p></div><div className="so-filters sp-filters"><label className="so-search"><Search size={17} /><input aria-label="Rechercher une opération" placeholder="Projet, client ou navire…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filtrer par état" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tous les états</option><option value="draft">Brouillons</option><option value="GO">GO signés</option><option value="NO_GO">NO GO signés</option></select></div></header>
      {records.length ? <div className="so-records">{records.map((item) => <div className="so-record-entry" key={item.id}>
        <button className="so-record" disabled={busy || exporting} onClick={() => void open(item)}><span className="so-record-icon"><Ship size={21} /></span><span><strong>{item.draft.project || 'Opération sans titre'}</strong><small>{item.draft.vessel.name || 'Navire à renseigner'} · {item.draft.client || 'Client à renseigner'}</small></span><span className={`so-badge ${item.status === 'draft' ? '' : item.draft.decision === 'GO' ? 'is-go' : 'is-nogo'}`}>{item.status === 'draft' ? 'Brouillon' : item.draft.decision === 'NO_GO' ? 'NO GO' : 'GO'}</span><span className="so-record-date">{formatDate(item.updatedAt)}<small>{item.updatedByName}</small></span><ChevronRight size={18} /></button>
        {((item.status === 'draft' && item.canEdit) || item.canRevise || item.canDelete) && <div className="so-record-actions" role="group" aria-label={`Actions pour ${item.draft.project || 'Opération sans titre'}`}>
          {((item.status === 'draft' && item.canEdit) || item.canRevise) && <button type="button" className="sp-button sp-button--secondary so-secondary" disabled={busy || exporting} onClick={() => item.status === 'draft' ? void open(item) : requestRecordAction('revise', item)}><Pencil size={16} />Modifier</button>}
          {item.canDelete && <button type="button" className="sp-button sp-button--secondary so-secondary so-delete-record" disabled={busy || exporting} onClick={() => requestRecordAction('delete', item)}><Trash2 size={16} />Supprimer</button>}
        </div>}
      </div>)}</div> : <div className="so-empty"><Compass size={42} /><h3>{search || status !== 'all' ? 'Aucune opération correspondante' : 'Préparez votre première opération en mer'}</h3><p>Renseignez la mission puis les contrôles du formulaire GO / NO GO.</p>{!search && status === 'all' && <button onClick={create}><Plus size={16} />Créer une opération</button>}</div>}</section>
      <p className="so-source">Référence : formulaire « GO / NO GO – Opération en Mer », OPE-FOR-10-C.</p>
    </>}

    {editing && <div className="so-editor-modal"><AppDialog
      size="fullscreen"
      title={record ? 'Fiche Opération en Mer' : 'Nouvelle opération en mer'}
      eyebrow={signed ? 'CONSULTATION' : record ? 'PRÉPARATION' : 'CRÉATION'}
      description={`${draft.project || 'Opération sans titre'} · OPE-FOR-10-C`}
      isBusy={busy || exporting}
      onClose={closeEditor}
      footer={<div className="so-dialog-footer">
        <div className="so-footer-state">{step > 0 && <button className="sp-button sp-button--secondary so-secondary" disabled={busy} onClick={() => changeStep(step - 1)}><ArrowLeft size={16} />Précédent</button>}<span>{exporting ? 'Export du PDF…' : busy ? 'Enregistrement…' : dirty ? 'Modifications non enregistrées' : signed ? 'Décision signée et figée' : record ? `Version ${record.version} enregistrée` : 'Brouillon à compléter'}</span></div>
        <div className="so-footer-actions"><button className="sp-button sp-button--secondary so-secondary so-footer-cancel" disabled={busy} onClick={closeEditor}>{signed || !editable ? 'Fermer' : 'Annuler'}</button>
          {record?.canRevise && signed && <button type="button" className="sp-button sp-button--secondary so-secondary" disabled={busy || exporting} onClick={() => requestRecordAction('revise', record)}><Pencil size={16} />Modifier cette fiche</button>}
          {record?.canDelete && !dirty && <button type="button" className="sp-button sp-button--secondary so-secondary so-delete-record" disabled={busy || exporting} onClick={() => requestRecordAction('delete', record)}><Trash2 size={16} />Supprimer cette fiche</button>}
          {record && !dirty && <button className="sp-button sp-button--secondary so-secondary" disabled={busy || exporting} onClick={() => void exportPdf()}><FileDown size={16} />Exporter le PDF</button>}
          {record && !dirty && <button className="sp-button sp-button--secondary so-secondary so-footer-print" disabled={busy || exporting} onClick={() => window.print()}><Printer size={16} />Imprimer la fiche</button>}
          {editable && !signed && <button className="sp-button sp-button--secondary so-secondary" disabled={busy} onClick={() => void save()}><Save size={16} />Enregistrer le brouillon</button>}
          {step < STEPS.length - 1 ? <button className="sp-button sp-button--primary" disabled={busy} onClick={() => changeStep(step + 1)}>Suivant<ChevronRight size={16} /></button> : !signed && <button className="sp-button sp-button--primary" disabled={busy || !editable || !canSign || !draft.decision} onClick={() => void save(true)}><CheckCircle2 size={17} />Signer la décision {draft.decision === 'NO_GO' ? 'NO GO' : draft.decision}</button>}
        </div>
      </div>}
    >
      <div className="so-editor-workspace">
        <aside className="so-wizard-sidebar" aria-label="Parcours de l’opération"><span className="so-wizard-eyebrow">PARCOURS OPÉRATION</span><strong>{draft.vessel.name || 'Opération en Mer'}</strong><small>Préparation GO / NO GO</small>
          <nav className="so-wizard-steps" aria-label="Étapes de la préparation">{STEPS.map((label, index) => { const Icon = STEP_ICONS[index]; return <button type="button" key={label} aria-controls={`sea-operation-step-${index}`} aria-current={step === index ? 'step' : undefined} className={step === index ? 'is-active' : ''} onClick={() => changeStep(index)}><b>{index + 1}</b><Icon aria-hidden="true" size={20} /><span><strong>{label}</strong><small>{STEP_DETAILS[index]}</small></span></button>; })}</nav>
          <p className="so-wizard-note"><Anchor aria-hidden="true" size={17} /><span>La décision est signée par le Capitaine affecté au navire.</span></p>
        </aside>
        <div className="so-mobile-switch" hidden={!compactLayout} role="group" aria-label="Affichage de la fiche"><button aria-pressed={mobilePane === 'form'} onClick={() => setMobilePane('form')}><FileText size={16} />Saisie</button><button aria-pressed={mobilePane === 'preview'} onClick={() => setMobilePane('preview')}><Eye size={16} />Aperçu et complétude</button></div>
        <div className="so-editor-form-pane" hidden={compactLayout && mobilePane === 'preview'} ref={formPane}>
          <div className="so-editor-summary"><strong>{draft.project || 'Opération sans titre'}</strong><span>{draft.client || 'Client à renseigner'}</span><div><span className={`so-badge ${signed ? draft.decision === 'GO' ? 'is-go' : 'is-nogo' : ''}`}>{signed ? draft.decision === 'GO' ? 'GO signé' : 'NO GO signé' : 'Brouillon'}</span>{record && <small>Version {record.version} · {formatDate(record.updatedAt)}</small>}</div></div>
          {record?.previousRevisionId && <button type="button" className="sp-button sp-button--secondary so-secondary so-revision-link" disabled={busy || exporting} onClick={() => void open({ id: record.previousRevisionId! })}>Version précédente signée</button>}
          {record?.supersededById && <div className="so-revision-history"><p>Cette version signée est conservée dans l’historique.</p><button type="button" className="sp-button sp-button--secondary so-secondary" disabled={busy || exporting} onClick={() => void open({ id: record.supersededById! })}>Version suivante</button></div>}
          {error && <div className="so-alert so-danger" tabIndex={-1} role="alert"><AlertTriangle size={18} /><span>{error}</span></div>}
          {notice && <div className="so-alert so-success" role="status"><CheckCircle2 size={18} />{notice}</div>}
          {issues.length > 0 && <div className="so-alert so-danger" tabIndex={-1} role="alert"><div><strong>La fiche doit être complétée</strong><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div></div>}
          {step === 0 && <SeaOperationProjectDocuments client={client} projectId={draft.planning?.projectId || ''} disabled={busy || exporting} />}
      <fieldset className="so-form" disabled={!editable || busy || signed}>
        <section id="sea-operation-step-0" hidden={step !== 0} className={`so-panel so-armament-panel ${step === 0 ? 'is-active' : ''}`} aria-label="Préparation de l’Armement">
          <div className="so-section-title"><b aria-hidden="true">1</b><div><h2 tabIndex={-1}>Préparation de l’Armement</h2><p>Informations opérationnelles et organisation de la mission.</p></div></div>
          <div className="so-grid so-armament-grid">
            <Field label="Date de l’opération"><input type="date" autoFocus={!record} value={planningDate} onChange={(event) => changePlanningDate(event.target.value)} /></Field>
            <Field label="Projet"><select value={draft.transit ? '__transit' : draft.planning?.operationId ? seaOperationPlanningChoiceKey(draft.planning) : draft.project ? '__existing' : ''} disabled={planningLoading} onChange={(event) => selectMission(event.target.value)}><option value="">{planningLoading ? 'Chargement du planning…' : 'Choisir un projet du planning'}</option><option value="__transit">Transit</option>{draft.project && !draft.planning?.operationId && !draft.transit && <option value="__existing">{draft.project}</option>}{draft.planning?.operationId && !selectedWindowMission && <option value={seaOperationPlanningChoiceKey(draft.planning)}>{retainedPlanningLabel(draft)}</option>}{planning?.choices.map((choice) => <option key={seaOperationPlanningChoiceKey(choice)} value={seaOperationPlanningChoiceKey(choice)}>{seaOperationPlanningChoiceLabel(choice)}</option>)}</select></Field>
            {planning && <p className="so-help so-wide">Projets planifiés du {planningDateLabel(planning.startDate)} au {planningDateLabel(planning.endDate)} inclus.</p>}
            {planningError && <p className="so-planning-status so-wide" role="alert">{planningError}</p>}
            {!planningLoading && !planningError && planning?.choices.length === 0 && <p className="so-planning-status so-wide" role="status">Aucun projet planifié entre aujourd’hui et J+3 inclus.</p>}
            <Field label="Client" wide><select value={selectedClientValue} disabled={clientLocked} onChange={event => selectClient(event.target.value)}><option value="">Choisir un client</option>{clientLocked && draft.client && <option value="__retained">{draft.client}</option>}{!clientLocked && draft.client && !draft.clientId && <option value="__existing">{draft.client}</option>}{!clientLocked && draft.clientId && !data?.clients?.some(item => item.id === draft.clientId) && <option value={draft.clientId}>{draft.client}</option>}{data?.clients?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            {clientLocked && <p className="so-help so-wide">{recordedClientLocked ? 'Client conservé avec la fiche.' : 'Client défini par le projet sélectionné.'}</p>}
            <Field label="Coordonnées du client" wide><input value={draft.clientContact} onChange={(event) => update({ clientContact: event.target.value })} /></Field>
            <Field label="Description de l’opération" wide><textarea rows={2} value={draft.description} onChange={(event) => update({ description: event.target.value })} /></Field>
          </div>
          {linkedToPlanning && <p className="so-help">Données du projet et du planning sélectionnés. Les informations du voyage restent modifiables. Un changement de mission réinitialise les contrôles et la décision.</p>}
          {draft.transit && <p className="so-help">Transit : renseignez librement le client, le navire et le voyage.</p>}
          <div className="so-armament-personnel-heading"><h3>Personnel spécial à embarquer</h3><button className="so-secondary sp-button sp-button--secondary" onClick={() => update({ specialPersonnel: [...draft.specialPersonnel, { name: '', phone: '' }] })}><Plus size={15} />Ajouter une personne</button></div>{draft.specialPersonnel.map((person, index) => <div className="so-contact" key={index}><Field label={`Prénom NOM ${index + 1}`}><input value={person.name} onChange={(event) => update({ specialPersonnel: draft.specialPersonnel.map((row, i) => i === index ? { ...row, name: event.target.value } : row) })} /></Field><Field label={`Téléphone ${index + 1}`}><input type="tel" value={person.phone} onChange={(event) => update({ specialPersonnel: draft.specialPersonnel.map((row, i) => i === index ? { ...row, phone: event.target.value } : row) })} /></Field><button type="button" className="so-secondary sp-button sp-button--secondary" aria-label={`Retirer la personne ${index + 1}`} onClick={() => update({ specialPersonnel: draft.specialPersonnel.filter((_, i) => i !== index) })}><Trash2 size={16} /></button></div>)}
          <h3>Demande d’attribution de poste à quai (DAPAQ)</h3><details className="so-armament-help"><summary>Consignes DAPAQ</summary><p className="so-help">Caen, Le Havre, Dieppe et Rouen : préparation dans NOMADE par l’Armement ou le Capitaine. Autres ports : transmission par mail à la Capitainerie.</p></details><div className="so-grid so-armament-grid"><Field label="Mode de déclaration"><ChoiceControl label="Mode de déclaration" value={draft.dapaq.method} onChange={(method) => update({ dapaq: { ...draft.dapaq, method: method as SeaOperationPayload['dapaq']['method'], preparedBy: method === 'nomade' && draft.dapaq.preparedBy === 'agent' ? '' : draft.dapaq.preparedBy } })} options={[{ value: 'nomade', label: 'NOMADE' }, { value: 'email', label: 'Mail à la Capitainerie' }]} /></Field><Field label="Préparée par"><ChoiceControl label="Préparée par" value={draft.dapaq.preparedBy} onChange={(preparedBy) => update({ dapaq: { ...draft.dapaq, preparedBy: preparedBy as SeaOperationPayload['dapaq']['preparedBy'] } })} options={[{ value: 'armament', label: 'Armement' }, { value: 'captain', label: 'Capitaine' }, ...(draft.dapaq.method !== 'nomade' ? [{ value: 'agent', label: 'Agent consignataire' }] : [])]} /></Field>{draft.dapaq.preparedBy === 'agent' && <><Field label="Nom de l’agent consignataire"><input value={draft.dapaq.agentName} onChange={(event) => update({ dapaq: { ...draft.dapaq, agentName: event.target.value } })} /></Field><Field label="Coordonnées de l’agent"><input value={draft.dapaq.agentContact} onChange={(event) => update({ dapaq: { ...draft.dapaq, agentContact: event.target.value } })} /></Field></>}</div>
          <h3>Navire et voyage</h3><div className="so-grid so-armament-grid">
            <Field label="Navire"><select value={draft.vessel.id ?? ''} onChange={event => { const vessel = data?.vessels.find(item => String(item.id) === event.target.value); vesselUpdate({ id: vessel ? String(vessel.id) : '', name: vessel?.name || '', registrationImo: vessel?.registrationImo || '' }); }}><option value="">Choisir un navire</option>{sortedVessels.map(vessel => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></Field>
            <Field label="Immatriculation / IMO"><input readOnly={Boolean(draft.vessel.id && data?.vessels.some(item => String(item.id) === draft.vessel.id))} value={draft.vessel.registrationImo} onChange={event => vesselUpdate({ registrationImo: event.target.value })} /></Field>
            <Field label="Prénom NOM du Capitaine" wide>{linkedToCaptainContext && (captains?.length || 0) > 1 ? <select value={captainPersonId || ''} onChange={event => selectCaptain(event.target.value)}><option value="">Choisir le Capitaine affecté</option>{captains?.map(captain => <option value={captain.personId} key={captain.personId}>{captain.name} · {captain.functionLabel}</option>)}</select> : <input readOnly={linkedToCaptainContext} value={draft.vessel.captainName} onChange={event => vesselUpdate({ captainName: event.target.value })} />}</Field>
            {linkedToCaptainContext && contextDate && <p className="so-help so-wide">Capitaine affecté au navire le {planningDateLabel(contextDate)} · fonctions temporaires prises en compte.</p>}
            {usesVesselContext && vesselContextLoading && <p className="so-help so-wide" role="status">Recherche du Capitaine affecté à ce navire…</p>}
            {usesVesselContext && vesselContextError && <p className="so-help so-wide" role="alert">{vesselContextError}</p>}
            {linkedToCaptainContext && draft.vessel.id && captains?.length === 0 && <p className="so-help so-wide" role="status">Aucun Capitaine confirmé n’est affecté à ce navire à cette date.</p>}
            <Field label="Port de départ"><input value={draft.vessel.departurePort} onChange={event => vesselUpdate({ departurePort: event.target.value })} /></Field>
            <Field label="Quai de départ"><input value={draft.vessel.departureQuay} onChange={event => vesselUpdate({ departureQuay: event.target.value })} /></Field>
            <Field label="Port d’arrivée"><input value={draft.vessel.arrivalPort} onChange={event => vesselUpdate({ arrivalPort: event.target.value })} /></Field>
            <Field label="Quai d’arrivée"><input value={draft.vessel.arrivalQuay} onChange={event => vesselUpdate({ arrivalQuay: event.target.value })} /></Field>
            <Field label="ETD · date et heure de départ"><input type="datetime-local" value={draft.vessel.etd} onChange={event => vesselUpdate({ etd: event.target.value })} /></Field>
            <Field label="ETA · date et heure d’arrivée"><input type="datetime-local" value={draft.vessel.eta} onChange={event => vesselUpdate({ eta: event.target.value })} /></Field>
          </div><p className="so-help">Les horaires sont saisis dans l’heure locale de l’opération.</p>
        </section>
        <section id="sea-operation-step-1" hidden={step !== 1} className={`so-panel ${step === 1 ? 'is-active' : ''}`} aria-label="Contrôles du Capitaine">
          <div className="so-section-title"><b aria-hidden="true">2</b><div><h2 tabIndex={-1}>Contrôles avant appareillage</h2><p>Réponses préremplies : à vérifier avant signature. Toute réponse bloquante impose un NO GO.</p></div></div>
          {SEA_OPERATION_SECTIONS.map((section) => <section className="so-check-section" key={section.id}><h3>{section.title}</h3>{section.applicability && <Field label="Cette rubrique est-elle applicable ?"><AnswerControl label={`${section.title} applicable`} value={draft.applicability[section.applicability]} onChange={(value) => update({ applicability: { ...draft.applicability, [section.applicability!]: value } })} /></Field>}{(!section.applicability || draft.applicability[section.applicability] === 'yes') && <>
            {SEA_OPERATION_CHECKS.filter((check) => check.section === section.id).map((check) => <div className={`so-check ${check.blocking && draft.checks[check.id] === 'no' ? 'is-blocking' : ''}`} key={check.id}>
              <div className="so-check-question"><span id={`check-question-${check.id}`}>{check.label}</span>{check.blocking && <small className="so-block-label" title="Une réponse Non impose un NO GO">Non = NO GO</small>}</div>
              <AnswerControl id={`check-${check.id}`} label={check.label} value={draft.checks[check.id]} onChange={(value) => update({ checks: { ...draft.checks, [check.id]: value } })} />
              {(check.help || check.yesLabel) && <div className="so-check-detail so-wide">{check.help && <p className="so-help">{check.help}</p>}{check.yesLabel && <p className="so-help">{check.yesLabel}</p>}</div>}
              {draft.checks[check.id] === 'no' && (check.justifyNo || check.blocking) && <Field label={`Justification — ${check.label}`} wide><textarea rows={2} value={draft.justifications[check.id] || ''} onChange={(event) => update({ justifications: { ...draft.justifications, [check.id]: event.target.value } })} /></Field>}
            </div>)}
            {section.id === '2.4' && <details className="so-kit"><summary>Kit médical plongée prévu par le formulaire</summary><p>En complément de la dotation médicale réglementaire :</p><ul>{DIVING_MEDICAL_KIT.map((item) => <li key={item.article}>{item.quantity} × {item.article}. {item.detail}</li>)}</ul></details>}
            {section.id === '2.5' && draft.applicability.towing === 'yes' && <div className="so-grid"><Field label="Des marins doivent-ils aller sur le navire remorqué ?"><AnswerControl label="Embarquement sur le remorqué" value={draft.towedVesselBoarding.required} onChange={(value) => update({ towedVesselBoarding: { ...draft.towedVesselBoarding, required: value } })} /></Field>{draft.towedVesselBoarding.required === 'yes' && <><Field label="Mesures de sécurité sur le remorqué"><ChoiceControl label="Mesures de sécurité sur le remorqué" value={draft.towedVesselBoarding.measures} onChange={(measures) => update({ towedVesselBoarding: { ...draft.towedVesselBoarding, measures: measures as SeaOperationPayload['towedVesselBoarding']['measures'] } })} options={[{ value: 'sms', label: 'Pas de mesures autres que le SMS' }, { value: 'specific', label: 'Mesures spécifiques prises' }]} /></Field>{draft.towedVesselBoarding.measures === 'specific' && <Field label="Ronde de sécurité, zones dangereuses et mesures prises" wide><textarea value={draft.towedVesselBoarding.details} onChange={(event) => update({ towedVesselBoarding: { ...draft.towedVesselBoarding, details: event.target.value } })} /></Field>}</>}</div>}
            {section.id === '2.7' && <><h4>Services à l’arrivée</h4><div className="so-checkboxes">{([['towing', 'Remorquage'], ['pilotage', 'Pilotage'], ['mooring', 'Lamanage'], ['none', 'Le règlement n’exige pas ces services']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={draft.portServices.includes(key)} onChange={(event) => update({ portServices: event.target.checked ? key === 'none' ? ['none'] : [...draft.portServices.filter((item) => item !== 'none'), key] : draft.portServices.filter((item) => item !== key) })} />{label}</label>)}</div><label className="so-checkbox"><input type="checkbox" checked={draft.mandatoryServicesNotified} onChange={(event) => update({ mandatoryServicesNotified: event.target.checked })} />Les services obligatoires sont identifiés et prévenus au besoin.</label></>}
            {section.id === '2.8' && <><div className="so-grid"><Field label="Escale déléguée à un shipchandler ?"><AnswerControl label="Shipchandler" value={draft.supplies.delegated} onChange={(value) => update({ supplies: { ...draft.supplies, delegated: value } })} /></Field>{draft.supplies.delegated === 'yes' && <><Field label="Nom du shipchandler"><input value={draft.supplies.shipchandlerName} onChange={(event) => update({ supplies: { ...draft.supplies, shipchandlerName: event.target.value } })} /></Field><Field label="Coordonnées du shipchandler"><input value={draft.supplies.shipchandlerContact} onChange={(event) => update({ supplies: { ...draft.supplies, shipchandlerContact: event.target.value } })} /></Field></>}{draft.supplies.delegated === 'no' && <p className="so-help">Le Capitaine gère l’escale avec l’appui de l’Armement.</p>}</div><div className="so-checkboxes">{SEA_OPERATION_SUPPLY_ITEMS.map((item) => <label key={item.id}><input type="checkbox" checked={draft.supplies.items.includes(item.id)} onChange={(event) => update({ supplies: { ...draft.supplies, items: event.target.checked ? [...draft.supplies.items, item.id] : draft.supplies.items.filter((value) => value !== item.id) } })} />{item.label}</label>)}</div><Field label="Fournisseurs et besoins identifiés"><textarea rows={3} value={draft.supplies.suppliers} onChange={(event) => update({ supplies: { ...draft.supplies, suppliers: event.target.value } })} /></Field><label className="so-checkbox"><input type="checkbox" checked={draft.supplies.customerAccountsPrepared} onChange={(event) => update({ supplies: { ...draft.supplies, customerAccountsPrepared: event.target.checked } })} />Comptes clients préparés au besoin avec la Direction financière.</label></>}
          </>}</section>)}
        </section>
        <section id="sea-operation-step-2" hidden={step !== 2} className={`so-panel ${step === 2 ? 'is-active' : ''}`} aria-label="Passage Plan">
          <div className="so-section-title"><b aria-hidden="true">3</b><div><h2 tabIndex={-1}>Passage Plan</h2><p>Cartes, points de route et conditions de navigation.</p></div></div>
          <Field label="Tirant d’eau de référence (m)"><input type="number" readOnly value={referenceDraft ?? ''} /></Field>{referenceDraft == null && <p className="so-help">{signed ? 'Tirant d’eau de référence non enregistré dans cette version : indicateur UKC indisponible.' : 'Renseignez le tirant d’eau du navire dans le module Navires.'}</p>}
          <SeaOperationHydroSources />
          {step === 2 && (editable && !signed
            ? <SeaOperationWaypointMapEditor key={`${data?.actorId}:${record?.id || 'new'}:${contextDate || ''}:${draft.planning?.operationId || 'transit'}:${draft.vessel.id}`} waypoints={draft.waypoints} isolatedPoints={draft.locationOverlay?.points} zones={draft.locationOverlay?.zones} onMoveIsolatedPoint={moveIsolatedPoint} onDeleteIsolatedPoint={deleteIsolatedPoint} onMoveZoneVertex={moveZoneVertex} onDeleteZoneVertex={deleteZoneVertex} maxSpeedKnots={data?.vessels.find(vessel => String(vessel.id) === draft.vessel.id)?.maxSpeedKnots} etd={draft.waypoints[0]?.eta || draft.vessel.etd} eta={seaOperationRouteArrivalEta(draft)} onAddWaypoint={addWaypoint} onMoveWaypoint={moveWaypoint} onDeleteWaypoint={removeWaypoint} disabled={busy || exporting} />
            : <SeaOperationRouteMap waypoints={draft.waypoints} isolatedPoints={draft.locationOverlay?.points} zones={draft.locationOverlay?.zones} />)}
          <Field label="Numéro de la ou des cartes marines"><input value={draft.charts} onChange={(event) => update({ charts: event.target.value })} /></Field>
          {draft.locationOverlay && <ProjectLocationOverlayFields value={draft.locationOverlay} disabled={busy || exporting || signed || !editable}
            vessel={{ id: draft.vessel.id, draftMeters: draft.vessel.draftMeters }} etd={draft.vessel.etd} projectId={draft.planning?.projectId}
            onChange={value => { if (canEditMap()) update({ locationOverlay: value }); }} />}
          <h3>Points de passage</h3>
          <p className="so-help">Indicateur UKC selon le tirant d’eau de référence (TE) : rouge si UKC ≤ TE ; orange si TE &lt; UKC ≤ TE + 2 m ; vert si UKC &gt; TE + 2 m.</p>
          <div className="so-passage-grid" role="table" aria-label="Points de passage">
            {draft.waypoints.map((point, index) => {
              const legacyEta = point.eta && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(point.eta);
              const operationDate = contextDate || planningDate;
              const proposedEta = legacyEta && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(point.eta) && /^\d{4}-\d{2}-\d{2}$/.test(operationDate) ? `${operationDate}T${point.eta}` : '';
              const navigation = passagePlanCellData(point, { allowLiveRadio: !signed, weatherMatrix: draft.vessel.weatherMatrix });
              return <div className={`so-passage-row${signed || !editable ? ' is-readonly' : ''}`} role="row" key={point.id}>
                {([['number', 'Waypoint', 'number'], ['descriptionVhf', 'Description', 'description']] as const).map(([key, label, variant]) => <label role="cell" className={`so-passage-field is-${variant}`} key={key}><span>{label}</span><input aria-label={`${label} · point ${index + 1}`} type="text" value={point[key]} onChange={(event) => waypointUpdate(index, { [key]: event.target.value })} onBlur={key === 'descriptionVhf' ? () => { if (!point.descriptionVhf.trim()) waypointUpdate(index, { descriptionVhf: seaOperationWaypointDescription(point, index) }); } : undefined} /></label>)}
                <div className="so-passage-position" role="presentation">{([['latitude', 'Latitude'], ['longitude', 'Longitude']] as const).map(([axis, label]) => <label role="cell" className={`so-passage-field is-${axis}`} key={axis}><span>{label}</span><SeaOperationCoordinateInput axis={axis} value={point[axis]} label={`${label} · point ${index + 1}`} onChange={(value) => waypointUpdate(index, { [axis]: value })} /></label>)}</div>
                <SeaOperationUkcField payload={draft} point={point} index={index} disabled={!editable || signed || busy || exporting} readOnly={signed || !editable}
                  onChange={patch => waypointUpdate(index, patch)} status={signed || ukcRequests.client !== client ? undefined : ukcRequests.statuses[ukcRequestKey(seaOperationUkcReference(draft), point)]} />
                <div role="cell" className="so-passage-field is-vhf"><span>Contacts VHF</span><p>{navigation.vhf.split('\n\n').map((contact) => contact.replace(/\n/g, ' · ')).join('\n')}</p></div>
                {!signed && editable && <div role="cell" className="so-passage-field is-weather"><span>Météo à l’ETA</span><SeaOperationWeatherCard point={point} matrix={draft.vessel.weatherMatrix} compact variant="editor" requestStatus={(weatherRequests.client === client ? weatherRequests.statuses[weatherRequestKey(seaOperationWeatherReference(draft), point)] : undefined) || initialSeaOperationWeatherStatus(seaOperationWeatherReference(draft), point)} /></div>}
                <div role="cell" className="so-passage-field is-eta"><span>ETA · date et heure</span>{signed || !editable
                  ? <p className="so-passage-eta-summary" aria-label={`ETA · date et heure · point ${index + 1}`}>{navigation.eta}{point.eta.includes('T') && <small>Heure de Paris</small>}</p>
                  : <><SeaOperationEtaPicker inline label={`ETA · date et heure · point ${index + 1}`} value={point.eta} disabled={busy || exporting} onChange={(eta) => { if (eta !== point.eta) waypointUpdate(index, { eta }); }} />{point.etaMode === 'automatic' && <small className="so-help">Horaire calculé automatiquement · modifiable</small>}{index > 0 && point.etaMode !== 'automatic' && (point.eta || point.etaMode === 'manual') && <button type="button" className="sp-button sp-button--secondary so-secondary" disabled={busy || exporting} aria-label={`Reprendre le calcul de l’ETA du point ${index + 1}`} onClick={() => waypointUpdate(index, { etaMode: 'automatic' })}>Reprendre le calcul</button>}{legacyEta && <small className="so-help">Ancienne ETA : {point.eta}. Renseignez une date et une heure pour la remplacer.</small>}{proposedEta && <button type="button" className="sp-button sp-button--secondary" aria-label={`Appliquer la date de l’opération à l’ETA du point ${index + 1}`} onClick={() => waypointUpdate(index, { eta: proposedEta })}>Utiliser le {operationDate.split('-').reverse().join('/')} à {point.eta}</button>}</>}</div>
                <label role="cell" className="so-passage-field is-traffic"><input aria-label={`Zone maritime à trafic dense · point ${index + 1}`} type="checkbox" checked={point.denseTraffic} onChange={(event) => waypointUpdate(index, { denseTraffic: event.target.checked })} /><span>Zone maritime à trafic dense</span></label>
                <div role="cell" className="so-passage-field is-actions"><button type="button" className="so-secondary sp-button sp-button--secondary" aria-label={`Supprimer le point ${index + 1}`} onClick={() => removeWaypoint(point.id)}><Trash2 size={15} /></button></div>
              </div>;
            })}
            {draft.waypoints.length === 0 && <div className="so-waypoint-empty" role="row"><div role="cell">Ajoutez le premier point de passage.</div></div>}
          </div>
          <button type="button" className="so-secondary sp-button sp-button--secondary" disabled={exporting} onClick={() => addWaypoint()}><Plus size={16} />Ajouter un point de passage</button>
          <div hidden={signed || !editable}><SeaOperationWeatherPanel client={client} projectId={draft.planning?.projectId || ''} transit={draft.transit ? { date: draft.transit.date, vesselId: draft.vessel.id } : undefined} waypoints={draft.waypoints} preview={previewMode} active={editing && editable && !signed} readOnly={signed || !editable} validatedAt={record?.signedAt} observations={record?.weatherObservations} compact onWeatherLoaded={retainWeather} onStatusChange={receiveWeatherStatuses} /></div>
          <SeaOperationUkcPanel client={client} payload={draft} active={editing && editable && !signed} readOnly={signed || !editable} preview={previewMode}
            onUkcLoaded={retainUkc} onStatusChange={receiveUkcStatuses} />
        </section>
        <section id="sea-operation-step-3" hidden={step !== 3} className={`so-panel so-decision-panel ${step === 3 ? 'is-active' : ''}`} aria-label="Décision du Capitaine"><div className="so-section-title"><b aria-hidden="true">4</b><div><h2 tabIndex={-1}>Décision du Capitaine</h2><p>Le Capitaine consigne sa décision après examen des conditions de la mission.</p></div></div>
          <div className={`so-assessment ${assessment.blockingChecks.length ? 'is-nogo' : 'is-pending'}`}><AlertTriangle size={22} /><div><strong>{assessment.blockingChecks.length ? `NO GO imposé · ${assessment.blockingChecks.length} contrôle(s) bloquant(s)` : 'Vérification de la préparation'}</strong><p>Toute réponse Non à un contrôle bloquant impose un NO GO. Le Capitaine doit trouver une solution et justifier toute situation empêchant l’appareillage.</p>{assessment.blockingChecks.length > 0 && <ul>{assessment.blockingChecks.map((check) => <li key={check.id}>{check.label}</li>)}</ul>}</div></div>
          <Field label="Décision"><ChoiceControl label="Décision" value={draft.decision} onChange={(decision) => update({ decision: decision as SeaOperationPayload['decision'] })} options={[{ value: 'GO', label: 'GO · la mission peut être réalisée', disabled: assessment.blockingChecks.length > 0 }, { value: 'NO_GO', label: 'NO GO · la mission ne peut être réalisée' }]} /></Field><Field label="Risques identifiés / informations à transmettre à l’Armement"><textarea rows={2} value={draft.risks} onChange={(event) => update({ risks: event.target.value })} /></Field><div className="so-grid so-decision-identity-grid"><Field label="Prénom NOM du Capitaine signataire"><input readOnly={linkedToCaptainContext} value={draft.signature.captainName} onChange={(event) => update({ signature: { ...draft.signature, captainName: event.target.value } })} /></Field><Field label="Date de la décision"><input type="date" value={draft.signature.date} onChange={(event) => update({ signature: { ...draft.signature, date: event.target.value } })} /></Field><Field label="Lieu de la décision"><input value={draft.signature.place} onChange={(event) => update({ signature: { ...draft.signature, place: event.target.value } })} /></Field></div>{linkedToCaptainContext && <div className="so-signature-preview"><strong>Signature du Capitaine</strong>{(signed ? record?.signatureUrl : captainSignature?.url) ? <img src={signed ? record?.signatureUrl : captainSignature?.url} alt={`Signature de ${draft.signature.captainName}`} /> : <p className="so-help">{signed ? 'Aucune image de signature attachée à cette fiche.' : signatureError || (signatureLoading ? 'Chargement de la signature…' : selectedCaptain?.hasSignature ? 'La signature RH est indisponible. Rechargez la fiche avant de signer.' : 'Aucune signature RH active enregistrée pour ce Capitaine.')}</p>}<small>{signed ? 'Signature conservée avec la décision.' : 'La signature est apposée lors de la confirmation de la décision par le Capitaine.'}</small></div>}<label className="so-checkbox so-attestation"><input type="checkbox" checked={draft.signature.acknowledged} onChange={(event) => update({ signature: { ...draft.signature, acknowledged: event.target.checked } })} />En qualité de Capitaine, je confirme les informations renseignées et signe cette décision.</label>
        </section>
      </fieldset>
          {record && step === 2 && <SeaOperationRecordedWeather record={record} hasUnsavedChanges={dirty} loading={historyLoading} onRefresh={() => void refreshWeatherHistory()} />}
          {step === 2 && <SeaOperationRadioPanel waypoints={draft.waypoints} />}
          {step === 2 && <SeaOperationChartsPanel client={client} projectId={draft.planning?.projectId || ''} transit={draft.transit ? { date: draft.transit.date, vesselId: draft.vessel.id } : undefined} waypoints={draft.waypoints} charts={draft.charts} onChartsChange={charts => { if (canEditMap()) update({ charts }); }} canEdit={editable && !busy && !signed} preview={previewMode} active />}
          {step === 3 && <div className="so-signature-footer">{signed ? <p><CheckCircle2 size={18} />Décision signée par {record.signedByName} le {formatDate(record.signedAt)}. Cette fiche est figée.</p> : <p>{canSign ? 'La signature enregistre votre identité et fige définitivement cette fiche.' : 'La signature est réservée au compte réel du Capitaine affecté au navire. Enregistrez la préparation pour lui transmettre la fiche.'}</p>}</div>}
        </div>
        <div className="so-editor-document-pane" hidden={compactLayout && mobilePane === 'form'}><SeaOperationPreview draft={draft} record={record} signatureImageUrl={captainSignature?.url} hasUnsavedChanges={dirty} onChangeStep={changeStep} /></div>
      </div>
    </AppDialog></div>}
  </div>{recordAction && <div className="so-record-confirm"><AppDialog size="sm" title={recordAction.kind === 'revise' ? 'Modifier une fiche signée' : 'Supprimer cette fiche du registre ?'} eyebrow="Confirmation" description={recordAction.record.draft.project || 'Opération sans titre'} isBusy={busy} onClose={() => { if (!busy) { setRecordAction(null); setRecordActionError(''); } }} footer={<div className="app-dialog__actions"><button type="button" className="sp-button sp-button--secondary so-secondary" disabled={busy} onClick={() => { setRecordAction(null); setRecordActionError(''); }}>Annuler</button><button type="button" className={`sp-button sp-button--primary${recordAction.kind === 'delete' ? ' so-delete-record' : ''}`} disabled={busy || exporting} onClick={() => void confirmRecordAction()}>{busy ? 'Traitement…' : recordAction.kind === 'revise' ? 'Créer la nouvelle préparation' : 'Supprimer'}</button></div>}>
    <p>{recordAction.kind === 'revise' ? 'Une nouvelle préparation sera créée à partir de cette fiche. La version signée restera conservée dans l’historique. Le Capitaine devra valider et signer la nouvelle préparation.' : 'Cette fiche ne sera plus affichée dans le registre des opérations. Confirmez-vous sa suppression ?'}</p>
    {recordActionError && <p className="so-alert so-danger" role="alert">{recordActionError}</p>}
  </AppDialog></div>}{record && <SeaOperationPrint record={record} />}</div>;
}
