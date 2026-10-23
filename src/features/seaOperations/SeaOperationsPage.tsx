import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AlertTriangle, Anchor, ArrowLeft, CheckCircle2, ChevronRight, ClipboardCheck, Compass, Eye, FileDown, FileText, Map, Plus, Printer, Save, Search, Ship, Trash2 } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { ModuleRibbon, ModuleRibbonCommand, ModuleRibbonGroup } from '../../components/ModuleRibbon';
import type { AppShellOutletContext } from '../shell/AppShell';
import { DIVING_MEDICAL_KIT, SEA_OPERATION_CHECKS, SEA_OPERATION_SECTIONS, SEA_OPERATION_SUPPLY_ITEMS, emptySeaOperation, newSeaOperation, getSeaOperationAssessment, isSeaOperationPayload, validateSeaOperation, seaOperationToday, type SeaOperationPayload, type SeaOperationAnswer as Answer } from './seaOperationModel';
import { fetchSeaOperationData, fetchSeaOperationDetail, fetchSeaOperationPlanning, fetchSeaOperationCaptainSignature, fetchSeaOperationWeatherObservations, loadSeaOperationSignature, saveSeaOperation, signSeaOperation, type SeaOperationData, type SeaOperationRecord, type SeaOperationPlanningContext, type SeaOperationPlanningChoice } from './seaOperationQueries';
import './seaOperations.css';
import { SeaOperationPrint } from './SeaOperationPrint';
import { SeaOperationPreview } from './SeaOperationDocumentPreview';
import { exportSeaOperationPdf } from './seaOperationPdf';
import { SeaOperationProjectDocuments } from './SeaOperationProjectDocuments';
import { SeaOperationRadioPanel } from './SeaOperationRadioPanel';
import { SeaOperationWeatherPanel } from './SeaOperationWeatherPanel';
import { SeaOperationHydroSources } from './SeaOperationHydroSources';
import { SeaOperationChartsPanel } from './SeaOperationChartsPanel';
import { captureSeaOperationRadios, retainSeaOperationWeather, updateSeaOperationWaypoint } from './seaOperationWaypointSnapshots';
import type { SeaOperationWeatherCaptureContext } from './seaOperationWaypointSnapshots';
import type { SeaOperationWaypointWeather } from './seaOperationWeatherModel';
import type { SupabaseClient } from '@supabase/supabase-js';
import { passagePlanCellData } from './seaOperationPassagePlan';
import { cloneVesselWeatherMatrix, type VesselWeatherMatrix } from '../fleet/vesselWeatherMatrix';
import { SeaOperationWeatherCard } from './SeaOperationWeatherCard';
import { SeaOperationRouteMap } from './SeaOperationRouteMap';
import { SeaOperationWaypointMapEditor } from './SeaOperationWaypointMapEditor';
import { SeaOperationEtaPicker } from './SeaOperationEtaPicker';
import { captureSeaOperationValidationWeather } from './seaOperationValidationWeather';
import type { SeaPosition } from './seaOperationNavigation';

const STEPS = ['Armement', 'Contrôles avant appareillage', 'Passage Plan', 'Décision du Capitaine'];
const STEP_DETAILS = ['Mission, client et voyage', 'Préparation et sécurité du navire', 'Cartes et points de route', 'GO / NO GO et signature'];
const STEP_ICONS = [FileText, ClipboardCheck, Compass, Anchor];
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Non renseignée';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Une erreur est survenue. Réessayez.';
const recoveryKey = (data: SeaOperationData) => `seapilot:sea-operation-draft:v1:${data.companyId}:${data.actorId}`;
interface DraftRecovery { draft: SeaOperationPayload; recordId: string | null; version: number | null; step: number }
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
function draftForPlanningChoice(choice: SeaOperationPlanningChoice, date: string): SeaOperationPayload {
  const draft = newSeaOperation();
  const captain = choice.captains.length === 1 ? choice.captains[0] : null;
  return { ...draft, planning: { date, operationId: choice.operationId, projectId: choice.projectId, captainPersonId: captain?.personId || '' },
    project: choice.project, client: choice.client, clientContact: choice.clientContact, description: choice.description,
    vessel: { ...draft.vessel, ...choice.vessel, id: String(choice.vessel.id), captainName: captain?.name || '',
      ...(choice.vessel.weatherMatrix === undefined ? {} : { weatherMatrix: structuredClone(choice.vessel.weatherMatrix) }) },
    signature: { ...draft.signature, captainName: captain?.name || '', place: choice.vessel.departurePort } };
}

/** Undefined means an older/unloaded source; null explicitly records a vessel without a configured matrix. */
function captureVesselMatrix(payload: SeaOperationPayload, source?: { id: string | number; weatherMatrix?: VesselWeatherMatrix | null }): SeaOperationPayload {
  const fingerprint = (matrix: VesselWeatherMatrix | null | undefined) => JSON.stringify(matrix ? cloneVesselWeatherMatrix(matrix) : matrix);
  if (!source || String(source.id) !== payload.vessel.id || source.weatherMatrix === undefined
    || fingerprint(payload.vessel.weatherMatrix) === fingerprint(source.weatherMatrix)) return payload;
  return { ...payload, vessel: { ...payload.vessel, weatherMatrix: structuredClone(source.weatherMatrix) } };
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
  const [planning, setPlanning] = useState<SeaOperationPlanningContext | null>(null);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [planningError, setPlanningError] = useState('');
  const [captainSignature, setCaptainSignature] = useState<Awaited<ReturnType<typeof fetchSeaOperationCaptainSignature>> | null>(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [signatureError, setSignatureError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [compactLayout, setCompactLayout] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1100px)').matches);
  const [mobilePane, setMobilePane] = useState<'form' | 'preview'>('form');
  const formPane = useRef<HTMLDivElement>(null);
  const editorOpener = useRef<HTMLElement | null>(null);
  const editRevision = useRef(0);
  const allowAutomaticMission = useRef(false);
  const loadSequence = useRef(0);
  const loadedAccount = useRef('');
  useEffect(() => { latestDraft.current = draft; }, [draft]);
  const applyData = useCallback((result: SeaOperationData) => {
    setData(result);
    const account = recoveryKey(result);
    if (loadedAccount.current === account) return;
    loadedAccount.current = account;
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
    setDraft(captureVesselMatrix(recovery.draft, result.vessels.find((vessel) => String(vessel.id) === recovery.draft.vessel.id))); setPlanningDate(recovery.draft.planning?.date || recovery.draft.vessel.etd.slice(0, 10) || seaOperationToday()); setStep(recovery.step); setEditing(true); setDirty(true);
    setNotice('Votre préparation non enregistrée a été récupérée dans cet onglet. Vérifiez-la avant de l’enregistrer.');
  }, []);

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(planningDate)) return;
    let active = true;
    const revision = editRevision.current;
    setPlanning(null); setPlanningLoading(true); setPlanningError('');
    fetchSeaOperationPlanning(client, planningDate).then((result) => {
      if (!active) return;
      setPlanning(result);
      const current = latestDraft.current;
      const mission = result.choices.find((choice) => choice.operationId === current.planning?.operationId);
      if (mission && record?.canEdit !== false && current.planning?.date === result.date && !weatherEditor.current.busy && !weatherEditor.current.signed) {
        const source = mission.vessel.weatherMatrix === undefined ? data?.vessels.find((vessel) => String(vessel.id) === current.vessel.id) : mission.vessel;
        if (captureVesselMatrix(current, source) !== current) {
          setDraft((value) => value.planning?.operationId === mission.operationId && value.planning.date === result.date ? captureVesselMatrix(value, source) : value);
          setDirty(true);
        }
      }
      const captain = mission?.captains.find((person) => person.personId === current.planning?.captainPersonId)
        || (!current.planning?.captainPersonId && mission?.captains.length === 1 ? mission.captains[0] : undefined);
      // Repair missing draft identity only; signed decisions and existing names remain historical.
      if (captain && record?.canEdit !== false && current.planning?.date === result.date && (!current.signature.captainName.trim() || !current.vessel.captainName.trim())) {
        setDraft((draft) => draft.planning && mission && draft.planning.operationId === mission.operationId && draft.planning.date === result.date && draft.planning.captainPersonId === current.planning?.captainPersonId ? {
          ...draft, planning: { ...draft.planning, captainPersonId: draft.planning.captainPersonId || captain.personId },
          vessel: { ...draft.vessel, captainName: draft.vessel.captainName.trim() ? draft.vessel.captainName : captain.name },
          signature: { ...draft.signature, captainName: draft.signature.captainName.trim() ? draft.signature.captainName : captain.name, acknowledged: draft.signature.captainName.trim() ? draft.signature.acknowledged : false },
        } : draft);
        setDirty(true);
      }
      // A unique planned mission can be selected directly. Multiple missions always require a choice.
      if (allowAutomaticMission.current && editRevision.current === revision && !latestDraft.current.project && !latestDraft.current.planning?.operationId && result.choices.length === 1) {
        allowAutomaticMission.current = false;
        const selected = draftForPlanningChoice(result.choices[0], planningDate);
        setDraft(result.choices[0].vessel.weatherMatrix === undefined ? captureVesselMatrix(selected, data?.vessels.find((vessel) => String(vessel.id) === selected.vessel.id)) : selected);
        setDirty(true);
      }
    }).catch((reason: unknown) => { if (active) setPlanningError(errorMessage(reason)); })
      .finally(() => { if (active) setPlanningLoading(false); });
    return () => { active = false; };
  }, [client, editing, planningDate, record?.status, record?.canEdit, data?.vessels]);
  useEffect(() => {
    setCaptainSignature(null); setSignatureError(''); setSignatureLoading(false);
    if (!editing || record?.status === 'signed' || !draft.planning?.operationId || !draft.planning.captainPersonId) return;
    let active = true;
    setSignatureLoading(true);
    fetchSeaOperationCaptainSignature(client, draft.planning.date, draft.planning.operationId, draft.planning.captainPersonId)
      .then((result) => { if (active) setCaptainSignature(result); })
      .catch((reason: unknown) => { if (active) setSignatureError(errorMessage(reason)); })
      .finally(() => { if (active) setSignatureLoading(false); });
    return () => { active = false; };
  }, [client, editing, record?.status, draft.planning?.date, draft.planning?.operationId, draft.planning?.captainPersonId]);

  const update = (patch: Partial<SeaOperationPayload>) => { allowAutomaticMission.current = false; editRevision.current += 1; setDraft((current) => ({ ...current, ...patch })); setDirty(true); setNotice(''); setIssues([]); };
  const vesselUpdate = (patch: Partial<SeaOperationPayload['vessel']>) => update({ vessel: { ...draft.vessel, ...patch } });
  const waypointUpdate = (index: number, patch: Partial<SeaOperationPayload['waypoints'][number]>) => update({ waypoints: draft.waypoints.map((point, i) => i === index ? updateSeaOperationWaypoint(point, patch) : point) });
  const editable = !record || record.canEdit;
  const signed = record?.status === 'signed';
  const weatherEditor = useRef({ client, draft, editing, editable, signed, busy, exporting });
  const pendingWeather = useRef(new globalThis.Map<string, { weather: SeaOperationWaypointWeather; context: SeaOperationWeatherCaptureContext; sourceClient: SupabaseClient }>());
  weatherEditor.current = { client, draft, editing, editable, signed, busy, exporting };
  const addWaypoint = (position?: SeaPosition) => {
    const current = weatherEditor.current;
    if (!current.editing || !current.editable || current.signed || current.busy || current.exporting) return;
    if (position && (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude) || Math.abs(position.latitude) > 90 || Math.abs(position.longitude) > 180)) return;
    const id = crypto.randomUUID();
    allowAutomaticMission.current = false; editRevision.current += 1;
    setDraft((value) => {
      const used = new Set(value.waypoints.map((point) => point.number.trim()));
      let number = value.waypoints.length + 1;
      while (used.has(String(number))) number += 1;
      const point = { id, number: String(number), descriptionVhf: '', latitude: position ? String(Number(position.latitude.toFixed(6))) : '', longitude: position ? String(Number(position.longitude.toFixed(6))) : '', ukc: '', eta: '', denseTraffic: false };
      return { ...value, waypoints: [...value.waypoints, point] };
    });
    setDirty(true); setNotice(''); setIssues([]);
  };
  const retainWeather = useCallback((weather: SeaOperationWaypointWeather, context: SeaOperationWeatherCaptureContext, sourceClient: SupabaseClient) => {
    const current = weatherEditor.current;
    if (sourceClient !== current.client || !current.editing || !current.editable || current.signed
      || retainSeaOperationWeather(current.draft, weather, context) === current.draft) return;
    if (current.busy) {
      const key = `${context.projectId}:${context.pointId}`;
      if (!pendingWeather.current.has(key) && pendingWeather.current.size >= 64) pendingWeather.current.delete(pendingWeather.current.keys().next().value!);
      pendingWeather.current.set(key, { weather, context, sourceClient });
      return;
    }
    setDraft((value) => retainSeaOperationWeather(value, weather, context));
    setDirty(true); setNotice('');
  }, []);
  useEffect(() => {
    if (busy) return;
    const pending = [...pendingWeather.current.values()];
    pendingWeather.current.clear();
    if (editing && editable && !signed) for (const entry of pending) retainWeather(entry.weather, entry.context, entry.sourceClient);
  }, [busy, client, editing, editable, signed, retainWeather]);
  const assessment = getSeaOperationAssessment(draft);
  const selectedMission = planning?.choices.find((choice) => choice.operationId === draft.planning?.operationId);
  const selectedCaptain = selectedMission?.captains.find((captain) => captain.personId === draft.planning?.captainPersonId);
  const linkedToPlanning = Boolean(draft.planning?.operationId);
  const referenceDraft = data?.vessels.find((vessel) => String(vessel.id) === draft.vessel.id)?.draftMeters;
  const canSign = linkedToPlanning ? selectedCaptain?.canSign === true : record?.canSign || (!record && data?.vessels.some((vessel) => String(vessel.id) === draft.vessel.id && vessel.canSign));
  function selectMission(operationId: string) {
    allowAutomaticMission.current = false;
    editRevision.current += 1;
    const choice = planning?.choices.find((item) => item.operationId === operationId);
    const next = choice ? draftForPlanningChoice(choice, planningDate) : newSeaOperation();
    setDraft(choice?.vessel.weatherMatrix === undefined ? captureVesselMatrix(next, data?.vessels.find((vessel) => String(vessel.id) === next.vessel.id)) : next);
    setDirty(true); setIssues([]); setNotice(''); setError('');
  }
  function changePlanningDate(value: string) {
    allowAutomaticMission.current = true;
    editRevision.current += 1;
    setPlanningDate(value); setPlanning(null); setDraft(newSeaOperation()); setDirty(true); setIssues([]); setNotice('');
  }
  function selectCaptain(personId: string) {
    const captain = selectedMission?.captains.find((item) => item.personId === personId);
    update({ planning: { ...draft.planning!, captainPersonId: captain?.personId || '' }, vessel: { ...draft.vessel, captainName: captain?.name || '' }, signature: { ...draft.signature, captainName: captain?.name || '', acknowledged: false } });
  }
  const confirmLeave = () => !dirty || window.confirm('Quitter cette fiche sans enregistrer les modifications ?');
  function closeEditor() {
    if (busy || exporting || !confirmLeave()) return;
    clearRecovery(data); setEditing(false); setDirty(false); setNotice(''); setIssues([]); setError('');
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
    setData((current) => current ? { ...current, records: [saved, ...current.records.filter((item) => item.id !== saved.id)] } : current);
  };
  async function open(item: SeaOperationRecord) {
    if (!confirmLeave()) return;
    allowAutomaticMission.current = false;
    editorOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const request = ++loadSequence.current;
    setBusy(true); setError(''); setNotice(''); setIssues([]);
    try { const loaded = await fetchSeaOperationDetail(client, item.id); if (request === loadSequence.current) {
      remember(loaded);
      if (loaded.status !== 'signed' && loaded.canEdit) {
        const prepared = captureVesselMatrix(loaded.draft, data?.vessels.find((vessel) => String(vessel.id) === loaded.draft.vessel.id));
        if (prepared !== loaded.draft) { setDraft(prepared); setDirty(true); setNotice('La matrice du navire a été actualisée pour cette préparation. Enregistrez pour la conserver.'); }
      }
      setPlanningDate(loaded.draft.planning?.date || loaded.draft.vessel.etd.slice(0, 10) || seaOperationToday()); setEditing(true); setStep(0); setMobilePane('form');
    } }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  function create() {
    if (!confirmLeave()) return;
    allowAutomaticMission.current = true;
    editorOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    clearRecovery(data);
    ++loadSequence.current;
    setRecord(null); setDraft(newSeaOperation()); setPlanningDate(seaOperationToday()); setPlanning(null); setDirty(false); setEditing(true); setStep(0); setMobilePane('form'); setError(''); setNotice(''); setIssues([]);
  }
  async function save(sign = false) {
    if (busy) return;
    const matrixSource = selectedMission?.vessel.weatherMatrix === undefined ? data?.vessels.find((vessel) => String(vessel.id) === draft.vessel.id) : selectedMission.vessel;
    const prepared = captureSeaOperationRadios(captureVesselMatrix(draft, matrixSource));
    const validation = validateSeaOperation(prepared, sign ? prepared.decision || 'GO' : 'DRAFT');
    if (validation.length) { setIssues(validation); setStep(sign ? 3 : step); revealFormFeedback(); return; }
    setBusy(true); setError(''); setIssues([]); setNotice('');
    const sequence = loadSequence.current;
    try {
      const captured = sign ? await captureSeaOperationValidationWeather(client, prepared, { preview: previewMode }) : prepared;
      if (sequence !== loadSequence.current || weatherEditor.current.client !== client || !weatherEditor.current.editing) return;
      const saved = await saveSeaOperation(client, captured, record || undefined);
      remember(saved);
      if (sign) {
        const finalized = await signSeaOperation(client, saved, saved.draft.signature.captainName, saved.draft.signature.acknowledged);
        remember(finalized); setNotice('Décision du Capitaine signée et enregistrée. La fiche est figée.');
      } else setNotice('Brouillon enregistré.');
    } catch (reason) { setError(errorMessage(reason)); revealFormFeedback(); }
    finally { setBusy(false); }
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

  return <div className="so-page"><div className="so-screen">
    <header className="so-heading sp-module-header"><div className="so-title"><span className="so-icon"><Map size={26} /></span><div><span className="so-eyebrow">OPÉRATIONS · OPE-FOR-10-C</span><h1>Opération en Mer</h1><p>Préparer la mission, vérifier les conditions et consigner la décision du Capitaine.</p></div></div></header>
    <ModuleRibbon ariaLabel="Commandes Opération en Mer" singleRow><ModuleRibbonGroup label="Opérations"><ModuleRibbonCommand disabled={busy || !data} icon={<Plus size={22} />} label="Nouvelle opération" onClick={create} /></ModuleRibbonGroup></ModuleRibbon>
    {!editing && error && <div className="so-alert so-danger" tabIndex={-1} role="alert"><AlertTriangle size={19} /><span>{error}</span>{!data && <button onClick={() => { setError(''); void fetchSeaOperationData(client).then(applyData).catch((reason: unknown) => setError(errorMessage(reason))); }}>Réessayer</button>}</div>}
    {!editing && notice && <div className="so-alert so-success" role="status"><CheckCircle2 size={18} />{notice}</div>}
    {!data && !error && <p role="status">Chargement des opérations en mer…</p>}
    {data && <>
      <div className="so-metrics">{[['Fiches enregistrées', data.records.length], ['En préparation', data.records.filter((item) => item.status === 'draft').length], ['Décisions GO', data.records.filter((item) => item.status === 'signed' && item.draft.decision === 'GO').length], ['Décisions NO GO', data.records.filter((item) => item.status === 'signed' && item.draft.decision === 'NO_GO').length]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
      <section className="so-register sp-panel"><header><div><h2>Registre des opérations</h2><p>Les préparations et décisions de votre société.</p></div><div className="so-filters sp-filters"><label className="so-search"><Search size={17} /><input aria-label="Rechercher une opération" placeholder="Projet, client ou navire…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filtrer par état" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tous les états</option><option value="draft">Brouillons</option><option value="GO">GO signés</option><option value="NO_GO">NO GO signés</option></select></div></header>
      {records.length ? <div className="so-records">{records.map((item) => <button className="so-record" key={item.id} disabled={busy} onClick={() => void open(item)}><span className="so-record-icon"><Ship size={21} /></span><span><strong>{item.draft.project || 'Opération sans titre'}</strong><small>{item.draft.vessel.name || 'Navire à renseigner'} · {item.draft.client || 'Client à renseigner'}</small></span><span className={`so-badge ${item.status === 'draft' ? '' : item.draft.decision === 'GO' ? 'is-go' : 'is-nogo'}`}>{item.status === 'draft' ? 'Brouillon' : item.draft.decision === 'NO_GO' ? 'NO GO' : 'GO'}</span><span className="so-record-date">{formatDate(item.updatedAt)}<small>{item.updatedByName}</small></span><ChevronRight size={18} /></button>)}</div> : <div className="so-empty"><Compass size={42} /><h3>{search || status !== 'all' ? 'Aucune opération correspondante' : 'Préparez votre première opération en mer'}</h3><p>Renseignez la mission puis les contrôles du formulaire GO / NO GO.</p>{!search && status === 'all' && <button onClick={create}><Plus size={16} />Créer une opération</button>}</div>}</section>
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
          {error && <div className="so-alert so-danger" tabIndex={-1} role="alert"><AlertTriangle size={18} /><span>{error}</span></div>}
          {notice && <div className="so-alert so-success" role="status"><CheckCircle2 size={18} />{notice}</div>}
          {issues.length > 0 && <div className="so-alert so-danger" tabIndex={-1} role="alert"><div><strong>La fiche doit être complétée</strong><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div></div>}
          {step === 0 && <SeaOperationProjectDocuments client={client} projectId={draft.planning?.projectId || ''} disabled={busy || exporting} />}
      <fieldset className="so-form" disabled={!editable || busy || signed}>
        <section id="sea-operation-step-0" hidden={step !== 0} className={`so-panel so-armament-panel ${step === 0 ? 'is-active' : ''}`} aria-label="Préparation de l’Armement">
          <div className="so-section-title"><b aria-hidden="true">1</b><div><h2 tabIndex={-1}>Préparation de l’Armement</h2><p>Informations opérationnelles et organisation de la mission.</p></div></div>
          <div className="so-grid so-armament-grid">
            <Field label="Date de l’opération"><input type="date" autoFocus={!record} value={planningDate} onChange={(event) => changePlanningDate(event.target.value)} /></Field>
            <Field label="Projet"><select value={draft.planning?.operationId || (draft.project ? '__existing' : '')} disabled={planningLoading || Boolean(planningError)} onChange={(event) => selectMission(event.target.value)}><option value="">{planningLoading ? 'Chargement du planning…' : 'Choisir un projet du planning'}</option>{draft.project && !draft.planning?.operationId && <option value="__existing">{draft.project}</option>}{draft.planning?.operationId && !selectedMission && <option value={draft.planning.operationId}>{draft.project} · {draft.vessel.name}</option>}{planning?.choices.map((choice) => <option key={choice.operationId} value={choice.operationId}>{choice.project} · {choice.vessel.name}</option>)}</select></Field>
            {planningError && <p className="so-planning-status so-wide" role="alert">{planningError}</p>}
            {!planningLoading && !planningError && planning?.choices.length === 0 && <p className="so-planning-status so-wide" role="status">Aucun projet planifié à cette date. Choisissez la date de la mission dans le planning.</p>}
            <Field label="Client" wide><input readOnly={linkedToPlanning && Boolean(selectedMission?.client)} value={draft.client} onChange={(event) => update({ client: event.target.value })} /></Field>
            <Field label="Coordonnées du client" wide><input readOnly={linkedToPlanning && Boolean(selectedMission?.clientContact)} value={draft.clientContact} onChange={(event) => update({ clientContact: event.target.value })} /></Field>
            <Field label="Description de l’opération" wide><textarea rows={2} readOnly={linkedToPlanning && Boolean(selectedMission?.description)} value={draft.description} onChange={(event) => update({ description: event.target.value })} /></Field>
          </div>
          {linkedToPlanning && <p className="so-help">Données du projet et du planning sélectionnés. Complétez les informations absentes du planning. Un changement de mission réinitialise les contrôles et la décision.</p>}
          <div className="so-armament-personnel-heading"><h3>Personnel spécial à embarquer</h3><button className="so-secondary sp-button sp-button--secondary" onClick={() => update({ specialPersonnel: [...draft.specialPersonnel, { name: '', phone: '' }] })}><Plus size={15} />Ajouter une personne</button></div>{draft.specialPersonnel.map((person, index) => <div className="so-contact" key={index}><Field label={`Prénom NOM ${index + 1}`}><input value={person.name} onChange={(event) => update({ specialPersonnel: draft.specialPersonnel.map((row, i) => i === index ? { ...row, name: event.target.value } : row) })} /></Field><Field label={`Téléphone ${index + 1}`}><input type="tel" value={person.phone} onChange={(event) => update({ specialPersonnel: draft.specialPersonnel.map((row, i) => i === index ? { ...row, phone: event.target.value } : row) })} /></Field><button type="button" className="so-secondary sp-button sp-button--secondary" aria-label={`Retirer la personne ${index + 1}`} onClick={() => update({ specialPersonnel: draft.specialPersonnel.filter((_, i) => i !== index) })}><Trash2 size={16} /></button></div>)}
          <h3>Demande d’attribution de poste à quai (DAPAQ)</h3><details className="so-armament-help"><summary>Consignes DAPAQ</summary><p className="so-help">Caen, Le Havre, Dieppe et Rouen : préparation dans NOMADE par l’Armement ou le Capitaine. Autres ports : transmission par mail à la Capitainerie.</p></details><div className="so-grid so-armament-grid"><Field label="Mode de déclaration"><ChoiceControl label="Mode de déclaration" value={draft.dapaq.method} onChange={(method) => update({ dapaq: { ...draft.dapaq, method: method as SeaOperationPayload['dapaq']['method'], preparedBy: method === 'nomade' && draft.dapaq.preparedBy === 'agent' ? '' : draft.dapaq.preparedBy } })} options={[{ value: 'nomade', label: 'NOMADE' }, { value: 'email', label: 'Mail à la Capitainerie' }]} /></Field><Field label="Préparée par"><ChoiceControl label="Préparée par" value={draft.dapaq.preparedBy} onChange={(preparedBy) => update({ dapaq: { ...draft.dapaq, preparedBy: preparedBy as SeaOperationPayload['dapaq']['preparedBy'] } })} options={[{ value: 'armament', label: 'Armement' }, { value: 'captain', label: 'Capitaine' }, ...(draft.dapaq.method !== 'nomade' ? [{ value: 'agent', label: 'Agent consignataire' }] : [])]} /></Field>{draft.dapaq.preparedBy === 'agent' && <><Field label="Nom de l’agent consignataire"><input value={draft.dapaq.agentName} onChange={(event) => update({ dapaq: { ...draft.dapaq, agentName: event.target.value } })} /></Field><Field label="Coordonnées de l’agent"><input value={draft.dapaq.agentContact} onChange={(event) => update({ dapaq: { ...draft.dapaq, agentContact: event.target.value } })} /></Field></>}</div>
          <h3>Navire et voyage</h3><div className="so-grid so-armament-grid"><Field label="Navire"><select disabled={linkedToPlanning} value={draft.vessel.id ?? ''} onChange={(event) => { const vessel = data?.vessels.find((item) => item.id === Number(event.target.value)); vesselUpdate({ id: vessel ? String(vessel.id) : '', name: vessel?.name || '', registrationImo: vessel?.registrationImo || '' }); }}><option value="">Choisir un navire</option>{data?.vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></Field><Field label="Immatriculation / IMO"><input readOnly={linkedToPlanning && Boolean(selectedMission?.vessel.registrationImo)} value={draft.vessel.registrationImo} onChange={(event) => vesselUpdate({ registrationImo: event.target.value })} /></Field><Field label="Prénom NOM du Capitaine" wide>{linkedToPlanning && (selectedMission?.captains.length || 0) > 1 ? <select value={draft.planning?.captainPersonId || ''} onChange={(event) => selectCaptain(event.target.value)}><option value="">Choisir le Capitaine affecté</option>{selectedMission?.captains.map((captain) => <option value={captain.personId} key={captain.personId}>{captain.name} · {captain.functionLabel}</option>)}</select> : <input readOnly={linkedToPlanning} value={draft.vessel.captainName} onChange={(event) => vesselUpdate({ captainName: event.target.value })} />}</Field>{linkedToPlanning && selectedMission?.captains.length === 0 && <p className="so-help" role="status">Aucun Capitaine confirmé n’est affecté à ce navire à cette date.</p>}<Field label="Port de départ"><input readOnly={linkedToPlanning && Boolean(selectedMission?.vessel.departurePort)} value={draft.vessel.departurePort} onChange={(event) => vesselUpdate({ departurePort: event.target.value })} /></Field><Field label="Quai de départ"><input value={draft.vessel.departureQuay} onChange={(event) => vesselUpdate({ departureQuay: event.target.value })} /></Field><Field label="Port d’arrivée"><input readOnly={linkedToPlanning && Boolean(selectedMission?.vessel.arrivalPort)} value={draft.vessel.arrivalPort} onChange={(event) => vesselUpdate({ arrivalPort: event.target.value })} /></Field><Field label="Quai d’arrivée"><input value={draft.vessel.arrivalQuay} onChange={(event) => vesselUpdate({ arrivalQuay: event.target.value })} /></Field><Field label="ETD · date et heure de départ"><input type="datetime-local" value={draft.vessel.etd} onChange={(event) => vesselUpdate({ etd: event.target.value })} /></Field><Field label="ETA · date et heure d’arrivée"><input type="datetime-local" value={draft.vessel.eta} onChange={(event) => vesselUpdate({ eta: event.target.value })} /></Field></div><p className="so-help">Les horaires sont saisis dans l’heure locale de l’opération.</p>
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
          <Field label="Numéro de la ou des cartes marines"><input value={draft.charts} onChange={(event) => update({ charts: event.target.value })} /></Field>
          <Field label="Tirant d’eau de référence (m)"><input type="number" readOnly value={referenceDraft ?? ''} /></Field>{referenceDraft == null && <p className="so-help">Renseignez le tirant d’eau du navire dans le module Navires.</p>}
          <SeaOperationHydroSources />
          {step === 2 && (editable && !signed
            ? <SeaOperationWaypointMapEditor key={`${data?.actorId}:${record?.id || 'new'}:${draft.planning?.operationId || ''}`} waypoints={draft.waypoints} onAddWaypoint={addWaypoint} disabled={busy || exporting} />
            : <SeaOperationRouteMap waypoints={draft.waypoints} />)}
          <h3>Points de passage</h3>
          <div className="so-passage-grid" role="table" aria-label="Points de passage">
            {draft.waypoints.map((point, index) => {
              const legacyEta = point.eta && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(point.eta);
              const operationDate = draft.planning?.date || planningDate;
              const proposedEta = legacyEta && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(point.eta) && /^\d{4}-\d{2}-\d{2}$/.test(operationDate) ? `${operationDate}T${point.eta}` : '';
              const navigation = passagePlanCellData(point, { allowLiveRadio: !signed, weatherMatrix: draft.vessel.weatherMatrix });
              return <div className="so-passage-row" role="row" key={point.id}>
                {([['number', 'Waypoint', 'number'], ['descriptionVhf', 'Description', 'description'], ['latitude', 'Latitude', 'latitude'], ['longitude', 'Longitude', 'longitude'], ['ukc', 'UKC', 'ukc']] as const).map(([key, label, variant]) => <label role="cell" className={`so-passage-field is-${variant}`} key={key}><span>{label}</span><input aria-label={`${label} · point ${index + 1}`} type="text" value={point[key]} onChange={(event) => waypointUpdate(index, { [key]: event.target.value })} /></label>)}
                <div role="cell" className="so-passage-field is-vhf"><span>Contacts VHF</span><p>{navigation.vhf.split('\n\n').map((contact) => contact.replace(/\n/g, ' · ')).join('\n')}</p></div>
                <div role="cell" className="so-passage-field is-weather"><span>Météo à l’ETA</span><SeaOperationWeatherCard point={point} matrix={draft.vessel.weatherMatrix} compact variant="editor" validatedAt={signed ? record?.signedAt : undefined} showObservations={signed} observations={record?.weatherObservations} /></div>
                <div role="cell" className="so-passage-field is-eta"><span>ETA · date et heure</span><SeaOperationEtaPicker label={`ETA · date et heure · point ${index + 1}`} value={point.eta} disabled={!editable || signed || busy || exporting} onChange={(eta) => { if (eta !== point.eta) waypointUpdate(index, { eta }); }} />{legacyEta && <small className="so-help">Ancienne ETA : {point.eta}. Renseignez une date et une heure pour la remplacer.</small>}{proposedEta && <button type="button" className="sp-button sp-button--secondary" aria-label={`Appliquer la date de l’opération à l’ETA du point ${index + 1}`} onClick={() => waypointUpdate(index, { eta: proposedEta })}>Utiliser le {operationDate.split('-').reverse().join('/')} à {point.eta}</button>}</div>
                <label role="cell" className="so-passage-field is-traffic"><input aria-label={`Zone maritime à trafic dense · point ${index + 1}`} type="checkbox" checked={point.denseTraffic} onChange={(event) => waypointUpdate(index, { denseTraffic: event.target.checked })} /><span>Zone maritime à trafic dense</span></label>
                <div role="cell" className="so-passage-field is-actions"><button type="button" className="so-secondary sp-button sp-button--secondary" aria-label={`Supprimer le point ${index + 1}`} onClick={() => update({ waypoints: draft.waypoints.filter((_, i) => i !== index) })}><Trash2 size={15} /></button></div>
              </div>;
            })}
            {draft.waypoints.length === 0 && <div className="so-waypoint-empty" role="row"><div role="cell">Ajoutez le premier point de passage.</div></div>}
          </div>
          <button type="button" className="so-secondary sp-button sp-button--secondary" disabled={exporting} onClick={() => addWaypoint()}><Plus size={16} />Ajouter un point de passage</button>
          <SeaOperationRadioPanel waypoints={draft.waypoints} />
          <SeaOperationWeatherPanel client={client} projectId={draft.planning?.projectId || ''} waypoints={draft.waypoints} preview={previewMode} active={step === 2} readOnly={signed} validatedAt={record?.signedAt} observations={record?.weatherObservations} onWeatherLoaded={retainWeather} />
        </section>
        <section id="sea-operation-step-3" hidden={step !== 3} className={`so-panel so-decision-panel ${step === 3 ? 'is-active' : ''}`} aria-label="Décision du Capitaine"><div className="so-section-title"><b aria-hidden="true">4</b><div><h2 tabIndex={-1}>Décision du Capitaine</h2><p>Le Capitaine consigne sa décision après examen des conditions de la mission.</p></div></div>
          <div className={`so-assessment ${assessment.blockingChecks.length ? 'is-nogo' : 'is-pending'}`}><AlertTriangle size={22} /><div><strong>{assessment.blockingChecks.length ? `NO GO imposé · ${assessment.blockingChecks.length} contrôle(s) bloquant(s)` : 'Vérification de la préparation'}</strong><p>Toute réponse Non à un contrôle bloquant impose un NO GO. Le Capitaine doit trouver une solution et justifier toute situation empêchant l’appareillage.</p>{assessment.blockingChecks.length > 0 && <ul>{assessment.blockingChecks.map((check) => <li key={check.id}>{check.label}</li>)}</ul>}</div></div>
          <Field label="Décision"><ChoiceControl label="Décision" value={draft.decision} onChange={(decision) => update({ decision: decision as SeaOperationPayload['decision'] })} options={[{ value: 'GO', label: 'GO · la mission peut être réalisée', disabled: assessment.blockingChecks.length > 0 }, { value: 'NO_GO', label: 'NO GO · la mission ne peut être réalisée' }]} /></Field><Field label="Risques identifiés / informations à transmettre à l’Armement"><textarea rows={2} value={draft.risks} onChange={(event) => update({ risks: event.target.value })} /></Field><div className="so-grid so-decision-identity-grid"><Field label="Prénom NOM du Capitaine signataire"><input readOnly={linkedToPlanning} value={draft.signature.captainName} onChange={(event) => update({ signature: { ...draft.signature, captainName: event.target.value } })} /></Field><Field label="Date de la décision"><input type="date" value={draft.signature.date} onChange={(event) => update({ signature: { ...draft.signature, date: event.target.value } })} /></Field><Field label="Lieu de la décision"><input value={draft.signature.place} onChange={(event) => update({ signature: { ...draft.signature, place: event.target.value } })} /></Field></div>{linkedToPlanning && <div className="so-signature-preview"><strong>Signature du Capitaine</strong>{(signed ? record?.signatureUrl : captainSignature?.url) ? <img src={signed ? record?.signatureUrl : captainSignature?.url} alt={`Signature de ${draft.signature.captainName}`} /> : <p className="so-help">{signed ? 'Aucune image de signature attachée à cette fiche.' : signatureError || (signatureLoading ? 'Chargement de la signature…' : selectedCaptain?.hasSignature ? 'La signature RH est indisponible. Rechargez la fiche avant de signer.' : 'Aucune signature RH active enregistrée pour ce Capitaine.')}</p>}<small>{signed ? 'Signature conservée avec la décision.' : 'La signature est apposée lors de la confirmation de la décision par le Capitaine.'}</small></div>}<label className="so-checkbox so-attestation"><input type="checkbox" checked={draft.signature.acknowledged} onChange={(event) => update({ signature: { ...draft.signature, acknowledged: event.target.checked } })} />En qualité de Capitaine, je confirme les informations renseignées et signe cette décision.</label>
        </section>
      </fieldset>
          {signed && step === 2 && <div className="so-weather-history-actions"><p className="so-help">Les mesures officielles sont ajoutées après le passage, selon leur disponibilité. La prévision validée et la décision du Capitaine restent conservées.</p><button className="sp-button sp-button--secondary" disabled={historyLoading} onClick={() => void refreshWeatherHistory()} type="button">{historyLoading ? 'Lecture des mesures…' : 'Actualiser les mesures enregistrées'}</button>{record?.weatherHistoryError && <p role="status">{record.weatherHistoryError}</p>}</div>}
          {step === 2 && <SeaOperationChartsPanel client={client} projectId={draft.planning?.projectId || ''} waypoints={draft.waypoints} charts={draft.charts} onChartsChange={(charts) => update({ charts })} canEdit={editable && !busy && !signed} preview={previewMode} active />}
          {step === 3 && <div className="so-signature-footer">{signed ? <p><CheckCircle2 size={18} />Décision signée par {record.signedByName} le {formatDate(record.signedAt)}. Cette fiche est figée.</p> : <p>{canSign ? 'La signature enregistre votre identité et fige définitivement cette fiche.' : 'La signature est réservée au compte réel du Capitaine affecté au navire. Enregistrez la préparation pour lui transmettre la fiche.'}</p>}</div>}
        </div>
        <div className="so-editor-document-pane" hidden={compactLayout && mobilePane === 'form'}><SeaOperationPreview draft={draft} record={record} signatureImageUrl={captainSignature?.url} hasUnsavedChanges={dirty} onChangeStep={changeStep} /></div>
      </div>
    </AppDialog></div>}
  </div>{record && <SeaOperationPrint record={record} />}</div>;
}
