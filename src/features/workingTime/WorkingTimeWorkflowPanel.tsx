import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileChartColumn,
  FileClock,
  FileSignature,
  LayoutList,
  LockKeyhole,
  PenLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  TableProperties,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { compareHrFunctionLabels, normalizeHrFunctionLabel } from '../humanResources/peopleQueries';
import type { RoleKey } from '../permissions/roles';
import { todayPlanningDate } from '../planning/planningDates';
import type { CurrentPersonSummary } from '../profiles/profileQueries';
import type { WorkingTimeInterval } from './workingTimeModel';
import {
  fetchWorkingTimeWorkspace,
  discardWorkingTimeDraft,
  getOrCreateWorkingTimeRegister,
  saveWorkingTimeDayComment,
  saveWorkingTimeInterval,
  saveWorkingTimePhases,
  transitionWorkingTimeRegister,
  voidWorkingTimeInterval,
  workingTimeErrorMessage,
  type WorkingTimeActiveSignature,
  type WorkingTimeNonComplianceCause,
  type WorkingTimePhaseInput,
  type WorkingTimeRange,
  type WorkingTimeSignatureSnapshot,
} from './workingTimeQueries';
import { buildWorkingTimePdf, prepareWorkingTimePdf } from './workingTimePdf';
import { WorkingTimeEntryBoard } from './WorkingTimeEntryBoard';
import { WorkingTimeMonthlyView } from './WorkingTimeMonthlyView';
import { useWorkingTimeWorkspace } from './useWorkingTimeWorkspace';

interface WorkingTimeWorkflowPanelProps {
  client: SupabaseClient;
  roles: RoleKey[];
  currentPerson: CurrentPersonSummary | null;
  range: WorkingTimeRange;
  previewMode?: boolean;
  refreshToken?: number;
  onMonthChange?: (direction: -1 | 0 | 1) => void;
  onRefresh?: () => Promise<void> | void;
  onOpenImport?: () => void;
  onOpenHse?: () => void;
  onOpenReport?: () => void;
  onOpenWorkRest?: () => void;
}

type PersonnelFilter = 'active' | 'departed';

function isVisibleForPersonnelFilter(person: { departedOn?: string | null; active?: boolean }, filter: PersonnelFilter, today: string) {
  const departed = person.departedOn?.slice(0, 10) || null;
  const isDeparted = Boolean(departed && departed < today);
  return filter === 'departed' ? isDeparted : !isDeparted && person.active !== false;
}

interface NonComplianceDraft {
  causeCategory: WorkingTimeNonComplianceCause | '';
  operationalContext: string;
  immediateAction: string;
  compensatoryRestPlan: string;
  comment: string;
}

interface SignatureEvidence {
  versionNumber: number;
  storageBucket: string;
  storagePath: string;
  sha256: string;
  signedAt?: string;
  signerRoles?: string[];
}

const EMPTY_NON_COMPLIANCE: NonComplianceDraft = {
  causeCategory: '',
  operationalContext: '',
  immediateAction: '',
  compensatoryRestPlan: '',
  comment: '',
};

const NON_COMPLIANCE_CAUSES: Array<{ value: WorkingTimeNonComplianceCause; label: string }> = [
  { value: 'unexpected_operation', label: 'Opération imprévue' },
  { value: 'safety_emergency', label: 'Urgence de sécurité' },
  { value: 'weather', label: 'Conditions météorologiques' },
  { value: 'handover', label: 'Relève / passation' },
  { value: 'breakdown_maintenance', label: 'Panne / maintenance' },
  { value: 'understaffing', label: 'Sous-effectif' },
  { value: 'other', label: 'Autre' },
];

function signatureKey(signature: Pick<SignatureEvidence, 'storageBucket' | 'storagePath'>): string {
  return `${signature.storageBucket}/${signature.storagePath}`;
}

function activeSignatureEvidence(signature: WorkingTimeActiveSignature | undefined): SignatureEvidence | undefined {
  return signature ? {
    versionNumber: signature.versionNumber,
    storageBucket: signature.storageBucket,
    storagePath: signature.storagePath,
    sha256: signature.sha256,
  } : undefined;
}

function frozenSignatureEvidence(signature: WorkingTimeSignatureSnapshot | null | undefined): SignatureEvidence | undefined {
  return signature ? {
    versionNumber: signature.versionNumber,
    storageBucket: signature.storageBucket,
    storagePath: signature.storagePath,
    sha256: signature.sha256,
    signedAt: signature.signedAt,
    signerRoles: signature.signerRoles,
  } : undefined;
}

function nonComplianceComplete(value: NonComplianceDraft | undefined): boolean {
  return Boolean(value?.causeCategory
    && value.operationalContext.trim().length >= 2
    && value.immediateAction.trim().length >= 2
    && value.compensatoryRestPlan.trim().length >= 2
    && value.comment.trim().length >= 2);
}

const pad = (value: number) => String(value).padStart(2, '0');

function dateTimeLocal(isoValue: string): string {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error('Les heures de début et de fin sont obligatoires.');
  return date.toISOString();
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatMonthLabel(monthStart: string): string {
  const date = new Date(`${monthStart}T12:00:00`);
  if (Number.isNaN(date.getTime())) return monthStart;
  const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
  return label.charAt(0).toLocaleUpperCase('fr-FR') + label.slice(1);
}

function formatPerson(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

function compactDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 3600)} h ${String(Math.floor((safe % 3600) / 60)).padStart(2, '0')}`;
}

function formatSelectedDay(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  const label = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(date);
  return label.charAt(0).toLocaleUpperCase('fr-FR') + label.slice(1);
}

function SignatureCard({ signature, imageUrl, label }: {
  signature: SignatureEvidence | undefined;
  imageUrl: string | undefined;
  label: string;
}) {
  return (
    <div className={`working-time-signature-card ${signature ? 'is-ready' : 'is-missing'}`}>
      <span>{label}</span>
      {imageUrl ? <img alt={`Signature numérisée — ${label}`} src={imageUrl} /> : null}
      {signature ? (
        <>
          <strong><FileSignature aria-hidden="true" size={16} /> Signature de profil v{signature.versionNumber}</strong>
          {signature.signedAt ? <small>Figée le {formatDateTime(signature.signedAt)} · {signature.signerRoles?.join(', ')}</small> : <small>Version active, non encore apposée</small>}
          <code title={signature.sha256}>SHA-256 {signature.sha256.slice(0, 14)}…</code>
        </>
      ) : (
        <strong><AlertTriangle aria-hidden="true" size={16} /> Signature de profil absente</strong>
      )}
    </div>
  );
}

export function WorkingTimeWorkflowPanel({
  client,
  roles,
  currentPerson,
  range,
  previewMode = false,
  refreshToken = 0,
  onMonthChange,
  onRefresh,
  onOpenImport,
  onOpenHse,
  onOpenReport,
  onOpenWorkRest,
}: WorkingTimeWorkflowPanelProps) {
  const canBrowseWithoutProfile = roles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
  const enabled = Boolean((currentPerson || canBrowseWithoutProfile) && range.start && range.end && range.start <= range.end);
  const { workspace, isLoading, errorMessage, reload } = useWorkingTimeWorkspace(client, enabled, range, refreshToken);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(currentPerson?.id || null);
  const [personId, setPersonId] = useState<number | null>(currentPerson?.id || null);
  const [registerSearch, setRegisterSearch] = useState('');
  const [startsAt, setStartsAt] = useState(`${range.start}T00:00`);
  const [endsAt, setEndsAt] = useState(`${range.start}T00:00`);
  const [vesselId, setVesselId] = useState('');
  const [watchGroup, setWatchGroup] = useState('');
  const [intervalComment, setIntervalComment] = useState('');
  const [editingIntervalId, setEditingIntervalId] = useState<number | null>(null);
  const [pendingPhases, setPendingPhases] = useState<WorkingTimePhaseInput[]>([]);
  const [voidCandidateId, setVoidCandidateId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [dayResponses, setDayResponses] = useState<Record<string, NonComplianceDraft>>({});
  const [reopenReason, setReopenReason] = useState('');
  const [signatureConsent, setSignatureConsent] = useState(false);
  const [signatureUrls, setSignatureUrls] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [personnelFilter, setPersonnelFilter] = useState<PersonnelFilter>('active');
  const [filterOpen, setFilterOpen] = useState(false);
  const [openRegisterMenu, setOpenRegisterMenu] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState(range.start);
  const [registerView, setRegisterView] = useState<'daily' | 'monthly'>('daily');

  const currentPersonId = workspace?.currentPersonId || currentPerson?.id || 0;
  const isSailorOnlyView = roles.includes('marin')
    && !roles.some((role) => role === 'capitaine' || role === 'admin' || role === 'armement');
  const visibleRegisters = useMemo(
    () => workspace?.registers.filter((register) => !isSailorOnlyView || register.personId === currentPersonId) || [],
    [currentPersonId, isSailorOnlyView, workspace?.registers],
  );
  const visibleReadablePeople = useMemo(() => {
    const readable = workspace?.readablePeople || [];
    const fallback = visibleRegisters.map((register) => ({
      personId: register.personId,
      firstName: register.personName.split(' ')[0] || register.personName,
      lastName: register.personName.split(' ').slice(1).join(' '),
      functionLabel: register.functionLabel,
      gradeLabel: '',
      departedOn: null,
      active: true,
      isSelf: register.personId === currentPersonId,
    }));
    const people = readable.length ? readable : fallback;
    return people.filter((person) => !isSailorOnlyView || person.personId === currentPersonId);
  }, [currentPersonId, isSailorOnlyView, visibleRegisters, workspace?.readablePeople]);
  const visibleEditablePeople = useMemo(
    () => workspace?.editablePeople.filter((person) => !isSailorOnlyView || person.personId === currentPersonId) || [],
    [currentPersonId, isSailorOnlyView, workspace?.editablePeople],
  );
  const monthlyRegisters = useMemo(() => visibleRegisters.filter((register) => register.periodKind === 'monthly'
    && register.periodStart === range.start
    && register.periodEnd === range.end), [range.end, range.start, visibleRegisters]);
  const monthlyRegisterByPerson = useMemo(
    () => new Map(monthlyRegisters.map((register) => [register.personId, register])),
    [monthlyRegisters],
  );
  const normalizedSearch = registerSearch.trim().toLocaleLowerCase('fr-FR');
  const localToday = useMemo(() => todayPlanningDate(), []);
  const catalogPeople = useMemo(() => visibleReadablePeople.filter((person) => (
    isVisibleForPersonnelFilter(person, personnelFilter, localToday)
    && (!normalizedSearch
      || `${person.firstName} ${person.lastName} ${person.functionLabel} ${person.gradeLabel}`.toLocaleLowerCase('fr-FR').includes(normalizedSearch))
  )), [localToday, normalizedSearch, personnelFilter, visibleReadablePeople]);
  const groupedPeople = useMemo(() => Array.from(catalogPeople.reduce<Map<string, typeof catalogPeople>>((groups, person) => {
    const label = normalizeHrFunctionLabel(person.functionLabel) || person.gradeLabel || 'Fonction non renseignée';
    groups.set(label, [...(groups.get(label) || []), person]);
    return groups;
  }, new Map()))
    .map(([label, people]) => ({
      label,
      people: people.sort((left, right) => formatPerson(left.firstName, left.lastName).localeCompare(formatPerson(right.firstName, right.lastName), 'fr')),
    }))
    .sort((left, right) => compareHrFunctionLabels(left.label, right.label)), [catalogPeople]);
  const selectedRegister = selectedPersonId ? monthlyRegisterByPerson.get(selectedPersonId) || null : null;
  const selectedCatalogPerson = visibleReadablePeople.find((person) => person.personId === selectedPersonId) || null;
  const displayedMonthLabel = formatMonthLabel(range.start);
  const selectedIntervals = useMemo(
    () => workspace?.intervals.filter((interval) => interval.personId === selectedPersonId
      && interval.localWorkDate >= range.start
      && interval.localWorkDate <= range.end) || [],
    [range.end, range.start, selectedPersonId, workspace?.intervals],
  );
  const selectedDayIntervals = useMemo(
    () => selectedIntervals.filter((interval) => interval.localWorkDate === selectedDay),
    [selectedDay, selectedIntervals],
  );
  const selectedCalculation = useMemo(() => workspace?.calculations
    .filter((calculation) => calculation.personId === selectedPersonId && calculation.localWindowEndDate === selectedDay)
    .sort((left, right) => left.windowEnd.localeCompare(right.windowEnd)).at(-1) || null,
  [selectedDay, selectedPersonId, workspace?.calculations]);
  const selectedCalculations = useMemo(() => workspace?.calculations.filter((calculation) => calculation.personId === selectedPersonId
    && calculation.localWindowEndDate >= range.start
    && calculation.localWindowEndDate <= range.end) || [], [range.end, range.start, selectedPersonId, workspace?.calculations]);
  const isOwnRegister = selectedRegister?.personId === currentPersonId;
  const hasCaptainRole = roles.includes('capitaine');
  const hasManagementValidationRole = roles.includes('admin') || roles.includes('armement');
  const canEdit = Boolean(
    selectedRegister
      && (selectedRegister.status === 'draft' || selectedRegister.status === 'reopened')
      && visibleEditablePeople.some((person) => person.personId === selectedRegister.personId),
  );

  const nonCompliantDates = useMemo(() => {
    if (!workspace || !selectedRegister) return [];
    return Array.from(new Set(workspace.calculations
      .filter((calculation) => calculation.personId === selectedRegister.personId
        && calculation.localWindowEndDate >= selectedRegister.periodStart
        && calculation.localWindowEndDate <= selectedRegister.periodEnd
        && calculation.isCompliant === false)
      .map((calculation) => calculation.localWindowEndDate))).sort();
  }, [selectedRegister, workspace]);

  const currentSignature = workspace?.signatures.find((signature) => signature.personId === currentPersonId);
  const subjectSignature = workspace?.signatures.find((signature) => signature.personId === selectedRegister?.personId);
  const selectedValidations = useMemo(
    () => workspace?.validations.filter((validation) => validation.registerId === selectedRegister?.id) || [],
    [selectedRegister?.id, workspace?.validations],
  );
  const sailorSignatureSnapshot = selectedValidations.find((validation) => validation.eventType === 'sailor_signed')?.signatureSnapshot;
  const validatorSignatureSnapshot = selectedValidations.find((validation) => validation.eventType === 'captain_validated')?.signatureSnapshot;
  const subjectSignatureEvidence = frozenSignatureEvidence(sailorSignatureSnapshot) || activeSignatureEvidence(subjectSignature);
  const validatorSignatureEvidence = frozenSignatureEvidence(validatorSignatureSnapshot)
    || (!isOwnRegister ? activeSignatureEvidence(currentSignature) : undefined);
  const persistedCommentDates = new Set((workspace?.dayComments || [])
    .filter((comment) => comment.registerId === selectedRegister?.id && nonComplianceComplete({
      causeCategory: comment.causeCategory || '',
      operationalContext: comment.operationalContext,
      immediateAction: comment.immediateAction,
      compensatoryRestPlan: comment.compensatoryRestPlan,
      comment: comment.comment,
    }))
    .map((comment) => comment.localWorkDate));
  const missingCaptainComments = nonCompliantDates.filter((date) => !persistedCommentDates.has(date));
  const canValidate = Boolean(
    selectedRegister?.status === 'submitted'
      && !isOwnRegister
      && (hasCaptainRole || hasManagementValidationRole)
      && currentSignature
      && missingCaptainComments.length === 0,
  );
  const canReopen = Boolean(
    selectedRegister
      && ['awaiting_sailor_signature', 'submitted', 'validated'].includes(selectedRegister.status)
      && (hasCaptainRole || hasManagementValidationRole),
  );

  useEffect(() => {
    if (!workspace) return;
    setPersonId((current) => current && visibleEditablePeople.some((person) => person.personId === current)
      ? current
      : visibleEditablePeople[0]?.personId || null);
    setSelectedPersonId((current) => {
      if (current
        && visibleReadablePeople.some((person) => person.personId === current)
        && (monthlyRegisterByPerson.has(current) || monthlyRegisters.length === 0)) return current;
      return (monthlyRegisterByPerson.has(workspace.currentPersonId) ? workspace.currentPersonId : null)
        || monthlyRegisters[0]?.personId
        || visibleReadablePeople.find((person) => person.personId === workspace.currentPersonId)?.personId
        || visibleReadablePeople[0]?.personId
        || null;
    });
  }, [currentPerson?.id, monthlyRegisterByPerson, monthlyRegisters, visibleEditablePeople, visibleReadablePeople, workspace]);

  useEffect(() => {
    if (!workspace || !catalogPeople.length) return;
    setSelectedPersonId((current) => current && catalogPeople.some((person) => person.personId === current)
      ? current
      : catalogPeople[0].personId);
  }, [catalogPeople, workspace]);

  useEffect(() => {
    const selectedPerson = catalogPeople.find((person) => person.personId === selectedPersonId);
    const selectedGroup = selectedPerson ? normalizeHrFunctionLabel(selectedPerson.functionLabel) || selectedPerson.gradeLabel || 'Fonction non renseignée' : groupedPeople[0]?.label;
    if (!selectedGroup) return;
    setExpandedGroups((current) => current.has(selectedGroup) ? current : new Set([...current, selectedGroup]));
  }, [catalogPeople, groupedPeople, selectedPersonId]);

  useEffect(() => {
    setSelectedDay(range.start);
    setStartsAt(`${range.start}T00:00`);
    setEndsAt(`${range.start}T00:00`);
    setPendingPhases([]);
  }, [range.start]);

  useEffect(() => {
    if (!workspace || !selectedRegister) {
      setDayResponses({});
      return;
    }
    setDayResponses(Object.fromEntries(workspace.dayComments
      .filter((comment) => comment.registerId === selectedRegister.id)
      .map((comment) => [comment.localWorkDate, {
        causeCategory: comment.causeCategory || '',
        operationalContext: comment.operationalContext,
        immediateAction: comment.immediateAction,
        compensatoryRestPlan: comment.compensatoryRestPlan,
        comment: comment.comment,
      }])));
    setSignatureConsent(false);
    setReopenReason('');
    setPendingPhases([]);
  }, [selectedRegister?.id, workspace]);

  useEffect(() => {
    if (previewMode || !workspace) {
      setSignatureUrls({});
      return;
    }
    const relevant = [
      activeSignatureEvidence(currentSignature),
      activeSignatureEvidence(subjectSignature),
      frozenSignatureEvidence(sailorSignatureSnapshot),
      frozenSignatureEvidence(validatorSignatureSnapshot),
    ].filter((signature): signature is SignatureEvidence => Boolean(signature));
    const unique = Array.from(new Map(relevant.map((signature) => [signatureKey(signature), signature])).values());
    let cancelled = false;
    void Promise.all(unique.map(async (signature) => {
      const { data } = await client.storage.from(signature.storageBucket).createSignedUrl(signature.storagePath, 600);
      return [signatureKey(signature), data?.signedUrl || ''] as const;
    })).then((entries) => {
      if (!cancelled) setSignatureUrls(Object.fromEntries(entries.filter(([, url]) => url)));
    });
    return () => { cancelled = true; };
  }, [client, currentSignature, previewMode, sailorSignatureSnapshot, subjectSignature, validatorSignatureSnapshot, workspace]);

  async function handlePdfDownload() {
    if (!workspace || !selectedRegister) return;
    setIsExporting(true);
    setActionError(null);
    try {
      const monthStart = `${selectedRegister.periodStart.slice(0, 7)}-01`;
      const monthDate = new Date(`${monthStart}T12:00:00`);
      monthDate.setMonth(monthDate.getMonth() + 1, 0);
      const monthEnd = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-${String(monthDate.getDate()).padStart(2, '0')}`;
      const monthlyWorkspace = selectedRegister.periodStart === monthStart && selectedRegister.periodEnd === monthEnd
        ? workspace
        : await fetchWorkingTimeWorkspace(client, { start: monthStart, end: monthEnd });
      const prepared = await prepareWorkingTimePdf(client, monthlyWorkspace, {
        ...selectedRegister,
        periodKind: 'monthly',
        periodStart: monthStart,
        periodEnd: monthEnd,
      });
      const { document, filename } = await buildWorkingTimePdf(prepared);
      document.save(filename);
      setActionMessage('Le registre PDF mensuel a été généré à la demande, sans copie permanente.');
    } catch (error) {
      setActionError(workingTimeErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setIsSaving(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await action();
      await reload();
      setActionMessage(successMessage);
    } catch (error) {
      setActionError(workingTimeErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function resetIntervalForm() {
    setEditingIntervalId(null);
    setPendingPhases([]);
    setStartsAt(`${selectedDay}T00:00`);
    setEndsAt(`${selectedDay}T00:00`);
    setVesselId('');
    setWatchGroup('');
    setIntervalComment('');
  }

  async function persistPendingSelection() {
    if (!selectedRegister) return;
    const phases = editingIntervalId
      ? [{ startsAt, endsAt }]
      : pendingPhases;
    if (!phases.length) return;
    const common = {
      registerId: selectedRegister.id,
      timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
      vesselId: vesselId ? Number(vesselId) : null,
      watchGroup: watchGroup.trim() || null,
      comment: intervalComment.trim() || null,
    };
    if (editingIntervalId) {
      await saveWorkingTimeInterval(client, {
        ...common,
        startsAt: localInputToIso(phases[0].startsAt),
        endsAt: localInputToIso(phases[0].endsAt),
        intervalId: editingIntervalId,
      });
    } else {
      await saveWorkingTimePhases(client, {
        ...common,
        phases: phases.map((phase) => ({
          startsAt: localInputToIso(phase.startsAt),
          endsAt: localInputToIso(phase.endsAt),
        })),
      });
    }
    resetIntervalForm();
  }

  async function persistCompleteCaptainResponses() {
    if (!selectedRegister || !hasCaptainRole) return;
    await Promise.all(nonCompliantDates.map(async (date) => {
      const response = dayResponses[date];
      if (!response || !nonComplianceComplete(response)) return;
      await saveWorkingTimeDayComment(client, {
        registerId: selectedRegister.id,
        localWorkDate: date,
        causeCategory: response.causeCategory as WorkingTimeNonComplianceCause,
        operationalContext: response.operationalContext,
        immediateAction: response.immediateAction,
        compensatoryRestPlan: response.compensatoryRestPlan,
        comment: response.comment,
      });
    }));
  }

  async function refreshEverything() {
    if (onRefresh) await onRefresh();
    else await reload();
  }

  function editInterval(interval: WorkingTimeInterval) {
    setPendingPhases([]);
    setEditingIntervalId(interval.id);
    setStartsAt(dateTimeLocal(interval.startsAt));
    setEndsAt(dateTimeLocal(interval.endsAt));
    setVesselId(interval.vesselId ? String(interval.vesselId) : '');
    setWatchGroup(interval.watchGroup || '');
    setIntervalComment(interval.comment || '');
  }

  if (!currentPerson && !canBrowseWithoutProfile) {
    const canManageImports = roles.some((role) => role === 'admin' || role === 'armement');
    return <section className="working-time-workflow"><p className="working-time-message is-warning">Votre compte n’est pas encore associé à une fiche RH. Cette association est nécessaire uniquement pour saisir, signer ou valider vos propres heures.{canManageImports ? ' L’import administrateur reste disponible ci-dessous.' : ''}</p></section>;
  }

  return (
    <section aria-labelledby="working-time-registers-title" className="working-time-workflow">
      <nav aria-label="Actions du suivi du temps de travail" className="working-time-command-bar">
        <div className="working-time-command-group">
          <span>Gestion des congés</span>
          <div>
            <button disabled={isLoading || isSaving} onClick={() => void refreshEverything()} type="button"><RefreshCw aria-hidden="true" className={isLoading ? 'is-spinning' : ''} size={21} /><small>Actualiser</small></button>
            <span className="working-time-command-popover-anchor">
              <button aria-expanded={openRegisterMenu} onClick={() => setOpenRegisterMenu((open) => !open)} type="button"><Plus aria-hidden="true" size={21} /><small>Ouvrir un registre</small></button>
              {openRegisterMenu ? <span className="working-time-command-popover is-register" role="dialog">
                <strong>Ouvrir {displayedMonthLabel}</strong>
                <label>Marin<select aria-label="Personne du registre" disabled={!visibleEditablePeople.length} onChange={(event) => setPersonId(Number(event.target.value))} value={personId || ''}>
                  {!visibleEditablePeople.length ? <option value="">Aucune personne accessible</option> : null}
                  {visibleEditablePeople.map((person) => <option key={person.personId} value={person.personId}>{formatPerson(person.firstName, person.lastName)}{person.isSelf ? ' — moi' : ''}</option>)}
                </select></label>
                <button disabled={isSaving || !currentPerson || !personId} onClick={() => void runAction(async () => {
                  await getOrCreateWorkingTimeRegister(client, { personId: personId!, periodKind: 'monthly', periodStart: range.start });
                  setSelectedPersonId(personId);
                  setOpenRegisterMenu(false);
                }, 'Le registre est prêt pour la saisie.')} type="button">Ouvrir ce mois</button>
              </span> : null}
            </span>
            <button disabled={isSaving || (!canEdit && !hasCaptainRole) || (!pendingPhases.length && !editingIntervalId && !Object.values(dayResponses).some(nonComplianceComplete))} onClick={() => void runAction(async () => {
              await persistPendingSelection();
              await persistCompleteCaptainResponses();
            }, 'Le brouillon et les commentaires complets ont été enregistrés.')} type="button"><FileSignature aria-hidden="true" size={21} /><small>Enregistrer le brouillon</small></button>
            <button disabled={!canEdit || isSaving || (!selectedIntervals.length && !pendingPhases.length)} onClick={() => void runAction(async () => {
              await persistPendingSelection();
              await persistCompleteCaptainResponses();
              await transitionWorkingTimeRegister(client, { registerId: selectedRegister!.id, action: 'request_sailor_signature' });
            }, 'Le registre attend maintenant la signature du marin.')} type="button"><Send aria-hidden="true" size={21} /><small>Demander la signature</small></button>
          </div>
        </div>

        <div className="working-time-command-group">
          <span>Aide à la décision</span>
          <div>
            {onOpenHse ? <button onClick={onOpenHse} type="button"><BarChart3 aria-hidden="true" size={21} /><small>Exposition HSE / IMCA</small></button> : null}
            {onOpenWorkRest ? <button onClick={onOpenWorkRest} type="button"><ShieldCheck aria-hidden="true" size={21} /><small>Contrôles travail et repos</small></button> : null}
            {selectedRegister?.status === 'awaiting_sailor_signature' && isOwnRegister ? <button disabled={isSaving || !currentSignature} onClick={() => {
              if (!window.confirm('Apposer explicitement votre signature de profil et soumettre ce registre ?')) return;
              setSignatureConsent(true);
              void runAction(() => transitionWorkingTimeRegister(client, { registerId: selectedRegister.id, action: 'sailor_sign' }), 'Votre registre a été signé et soumis.');
            }} type="button"><FileSignature aria-hidden="true" size={21} /><small>Signer et soumettre</small></button> : null}
            {selectedRegister?.status === 'submitted' && !isOwnRegister && (hasCaptainRole || hasManagementValidationRole) ? <button disabled={isSaving || !canValidate} onClick={() => void runAction(
              () => transitionWorkingTimeRegister(client, { registerId: selectedRegister.id, action: 'captain_validate' }),
              'Le registre est validé et verrouillé.',
            )} type="button"><UserCheck aria-hidden="true" size={21} /><small>Valider</small></button> : null}
            {canReopen ? <button disabled={isSaving} onClick={() => {
              const reason = window.prompt('Motif de la réouverture :', reopenReason);
              if (!reason?.trim()) return;
              void runAction(() => transitionWorkingTimeRegister(client, { registerId: selectedRegister!.id, action: 'reopen', comment: reason.trim() }), 'Le registre a été rouvert et le motif ajouté à l’audit.');
            }} type="button"><LockKeyhole aria-hidden="true" size={21} /><small>Réouvrir</small></button> : null}
          </div>
        </div>

        <div className="working-time-command-group">
          <span>Documents</span>
          <div>
            {onOpenImport ? <button onClick={onOpenImport} type="button"><Upload aria-hidden="true" size={21} /><small>Import</small></button> : null}
            <button disabled={!selectedRegister || isExporting} onClick={() => void handlePdfDownload()} type="button"><Download aria-hidden="true" size={21} /><small>{isExporting ? 'Génération…' : 'Export PDF'}</small></button>
            {onOpenReport ? <button onClick={onOpenReport} type="button"><FileChartColumn aria-hidden="true" size={21} /><small>Rapport de conformité</small></button> : null}
          </div>
        </div>
      </nav>
      <header className="working-time-section-heading" hidden>
        <div><p>Registres individuels</p><h2 id="working-time-registers-title">Saisie, signature et validation</h2></div>
        <div className="working-time-heading-actions">
          <span>{catalogPeople.length} marin(s) affiché(s) · {displayedMonthLabel}</span>
          <button disabled={isLoading || isSaving} onClick={() => void reload()} type="button">
            <RefreshCw aria-hidden="true" size={15} /> Actualiser
          </button>
        </div>
      </header>

      {errorMessage ? <p className="working-time-message is-error" role="alert">{errorMessage}</p> : null}
      {actionError ? <p className="working-time-message is-error" role="alert">{actionError}</p> : null}
      {actionMessage ? <p className="working-time-message is-success" role="status">{actionMessage}</p> : null}
      {!currentPerson && canBrowseWithoutProfile ? <p className="working-time-message is-warning">Vous pouvez consulter et rechercher tous les registres. Une fiche RH liée à votre compte reste requise pour saisir, signer ou valider des heures.</p> : null}
      {isLoading && !workspace ? <div className="admin-state" role="status">Chargement des registres…</div> : null}

      {workspace ? (
        <>
          <div className="working-time-register-create" hidden>
            <label>Marin
              <select aria-label="Personne du registre" disabled={!visibleEditablePeople.length} onChange={(event) => setPersonId(Number(event.target.value))} value={personId || ''}>
                {!visibleEditablePeople.length ? <option value="">Aucune personne accessible</option> : null}
                {visibleEditablePeople.map((person) => (
                  <option key={person.personId} value={person.personId}>
                    {formatPerson(person.firstName, person.lastName)}{person.isSelf ? ' — moi' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>Mois et année
              <input aria-label="Mois du registre" disabled type="month" value={range.start.slice(0, 7)} />
            </label>
            <button disabled={isSaving || !currentPerson || !personId} onClick={() => void runAction(async () => {
              await getOrCreateWorkingTimeRegister(client, { personId: personId!, periodKind: 'monthly', periodStart: range.start });
              setSelectedPersonId(personId);
            }, 'Le registre est prêt pour la saisie.')} type="button">
              <Plus aria-hidden="true" size={17} /> Ouvrir ce mois
            </button>
          </div>
          {!visibleEditablePeople.length ? <p className="working-time-message is-warning">Aucune fiche RH n’est accessible en saisie pour votre rôle et cette période.</p> : null}

          <div className="working-time-workspace-grid">
            <nav aria-label="Registres accessibles" className="working-time-register-list">
              <div className="working-time-roster-title"><h3>Équipage</h3><button aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)} type="button"><SlidersHorizontal aria-hidden="true" size={16} />Filtrer</button></div>
              <label className="working-time-register-search">
                <span><Search aria-hidden="true" size={16} /><input aria-label="Rechercher un marin" onChange={(event) => setRegisterSearch(event.target.value)} placeholder="Rechercher un marin…" type="search" value={registerSearch} /></span>
              </label>
              {filterOpen ? <fieldset className="working-time-roster-filters">
                <legend>Personnel affiché</legend>
                <label><input checked={personnelFilter === 'active'} name="working-time-personnel-filter" onChange={() => setPersonnelFilter('active')} type="radio" />Personnel en poste</label>
                <label><input checked={personnelFilter === 'departed'} name="working-time-personnel-filter" onChange={() => setPersonnelFilter('departed')} type="radio" />Personnel ancien</label>
              </fieldset> : null}
              {groupedPeople.length ? groupedPeople.map((group) => {
                const expanded = expandedGroups.has(group.label);
                return <section className="working-time-crew-group" key={group.label}>
                  <button aria-expanded={expanded} className="working-time-crew-group-toggle" onClick={() => setExpandedGroups((current) => {
                    const next = new Set(current);
                    if (next.has(group.label)) next.delete(group.label); else next.add(group.label);
                    return next;
                  })} type="button"><ChevronDown aria-hidden="true" size={15} /><span>{group.label}</span><strong>{group.people.length}</strong></button>
                  {expanded ? <div className="working-time-crew-rows">{group.people.map((person) => {
                    const register = monthlyRegisterByPerson.get(person.personId);
                    const personName = formatPerson(person.firstName, person.lastName);
                    return <div className={`working-time-register-card ${person.personId === selectedPersonId ? 'is-active' : ''}`} key={person.personId}>
                      <button className="working-time-register-select" onClick={() => {
                        setSelectedPersonId(person.personId);
                        if (visibleEditablePeople.some((editable) => editable.personId === person.personId)) setPersonId(person.personId);
                      }} type="button"><span>{personName}</span><small>{person.functionLabel || person.gradeLabel || 'Personnel maritime'}</small><i className={person.active !== false ? 'is-available' : ''} title={person.active !== false ? 'Disponible' : 'Indisponible'} /></button>
                      {register?.status === 'draft' ? <button aria-label={`Supprimer le brouillon de ${personName} du ${register.periodStart} au ${register.periodEnd}`} className="working-time-register-discard" disabled={isSaving} onClick={() => {
                        if (!window.confirm(`Retirer ce brouillon de ${personName} et abandonner ses modifications non enregistrées ?`)) return;
                        void runAction(() => discardWorkingTimeDraft(client, register.id), 'Le brouillon a été retiré sans enregistrer ses modifications.');
                      }} title="Supprimer ce brouillon" type="button"><X aria-hidden="true" size={16} /></button> : null}
                    </div>;
                  })}</div> : null}
                </section>;
              }) : <p>Aucun marin ne correspond à la recherche.</p>}
            </nav>

            {selectedRegister ? (
              <article className="working-time-register-detail">
                <header>
                  <div>
                    <h3>{selectedRegister.personName} <span>· {selectedRegister.functionLabel || 'Personnel maritime'}</span></h3>
                  </div>
                  <div className="working-time-register-header-tools">
                    <div className="working-time-month-navigation" aria-label="Navigation mensuelle">
                      <button aria-label="Mois précédent" onClick={() => onMonthChange?.(-1)} type="button"><ChevronLeft aria-hidden="true" size={17} /></button>
                      <button onClick={() => onMonthChange?.(0)} type="button"><CalendarDays aria-hidden="true" size={16} /><strong className="working-time-month-title">{displayedMonthLabel}</strong></button>
                      <button aria-label="Mois suivant" onClick={() => onMonthChange?.(1)} type="button"><ChevronRight aria-hidden="true" size={17} /></button>
                    </div>
                    <div className="working-time-view-toggle" aria-label="Affichage du registre">
                      <button aria-pressed={registerView === 'daily'} className={registerView === 'daily' ? 'is-active' : ''} onClick={() => setRegisterView('daily')} type="button"><LayoutList aria-hidden="true" size={16} />Jour</button>
                      <button aria-pressed={registerView === 'monthly'} className={registerView === 'monthly' ? 'is-active' : ''} onClick={() => setRegisterView('monthly')} type="button"><TableProperties aria-hidden="true" size={16} />Mois</button>
                    </div>
                  </div>
                </header>

                {selectedRegister.status === 'validated' ? (
                  <div className="working-time-lock-note"><LockKeyhole aria-hidden="true" size={18} />Les heures et commentaires sont verrouillés. Une réouverture motivée est nécessaire pour toute correction.</div>
                ) : null}

                <div className="working-time-signatures">
                  <h4>Conformité</h4>
                  <article className="working-time-conformity-item"><FileClock aria-hidden="true" size={20} /><span>Travail sur 7 jours</span><strong>{compactDuration(selectedCalculation?.work7dSeconds)}</strong><small>{selectedRegister.workRestPolicyId ? 'Calcul serveur P1.3' : 'Politique requise'}</small></article>
                  <article className="working-time-conformity-item"><CalendarDays aria-hidden="true" size={20} /><span>Repos consécutif actuel</span><strong>{compactDuration(selectedCalculation?.longestRest24hSeconds)}</strong><small>Fenêtre glissante de 24 h</small></article>
                  <article className="working-time-conformity-item"><Bell aria-hidden="true" size={20} /><span>Alertes</span><strong>{selectedCalculation?.violationCodes.length || 0}</strong><small>{selectedCalculation?.isCompliant === false ? 'Journée non conforme' : 'Aucune alerte détectée'}</small></article>
                  <SignatureCard
                    imageUrl={subjectSignatureEvidence ? signatureUrls[signatureKey(subjectSignatureEvidence)] : undefined}
                    label="Titulaire du registre"
                    signature={subjectSignatureEvidence}
                  />
                  {validatorSignatureEvidence ? (
                    <SignatureCard
                      imageUrl={signatureUrls[signatureKey(validatorSignatureEvidence)]}
                      label={validatorSignatureSnapshot ? 'Validation figée' : 'Validateur connecté'}
                      signature={validatorSignatureEvidence}
                    />
                  ) : null}
                </div>

                <section className="working-time-intervals" aria-label="Créneaux de travail">
                  {registerView === 'daily' ? <>
                    <div className="working-time-subheading"><div><h4>{formatSelectedDay(selectedDay)}</h4><span>Journée de travail</span></div><span>{selectedDayIntervals.length} période{selectedDayIntervals.length > 1 ? 's' : ''} enregistrée{selectedDayIntervals.length > 1 ? 's' : ''}</span></div>
                    <WorkingTimeEntryBoard
                    canEdit={canEdit}
                    client={client}
                    comment={intervalComment}
                    editingIntervalId={editingIntervalId}
                    endsAt={endsAt}
                    intervals={selectedIntervals}
                    isSaving={isSaving}
                    onCancelEdit={resetIntervalForm}
                    onCommentChange={setIntervalComment}
                    onEndsAtChange={setEndsAt}
                    onPendingPhasesChange={setPendingPhases}
                    onSelectedDayChange={setSelectedDay}
                    onStartsAtChange={setStartsAt}
                    onSubmit={(phases) => void runAction(async () => {
                      const common = {
                        registerId: selectedRegister.id,
                        timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
                        vesselId: vesselId ? Number(vesselId) : null,
                        watchGroup: watchGroup.trim() || null,
                        comment: intervalComment.trim() || null,
                      };
                      if (editingIntervalId) {
                        await saveWorkingTimeInterval(client, {
                          ...common,
                          startsAt: localInputToIso(phases[0].startsAt),
                          endsAt: localInputToIso(phases[0].endsAt),
                          intervalId: editingIntervalId,
                        });
                      } else {
                        await saveWorkingTimePhases(client, {
                          ...common,
                          phases: phases.map((phase) => ({ startsAt: localInputToIso(phase.startsAt), endsAt: localInputToIso(phase.endsAt) })),
                        });
                      }
                      resetIntervalForm();
                    }, editingIntervalId ? 'Le créneau a été corrigé.' : 'Les heures ont été ajoutées au brouillon.')}
                    onVesselIdChange={setVesselId}
                    onWatchGroupChange={setWatchGroup}
                    periodEnd={selectedRegister.periodEnd}
                    periodStart={selectedRegister.periodStart}
                    personId={selectedRegister.personId}
                    pendingPhases={pendingPhases}
                    nonCompliantDates={nonCompliantDates}
                    startsAt={startsAt}
                    selectedDay={selectedDay}
                    showSubmitActions={false}
                    vesselId={vesselId}
                    vessels={workspace.vessels}
                    watchGroup={watchGroup}
                    />
                    {selectedIntervals.length ? (
                    <div className="working-time-interval-list" hidden>
                      {selectedIntervals.map((interval) => (
                        <div key={interval.id}>
                          <span><strong>{formatDateTime(interval.startsAt)}</strong> → {formatDateTime(interval.endsAt)}</span>
                          <small>{workspace.vessels.find((vessel) => vessel.id === interval.vesselId)?.name || 'Sans navire'}{interval.watchGroup ? ` · ${interval.watchGroup}` : ''}</small>
                          {canEdit ? <span className="working-time-row-actions">
                            <button onClick={() => editInterval(interval)} type="button"><PenLine aria-hidden="true" size={15} />Corriger</button>
                            <button onClick={() => { setVoidCandidateId(interval.id); setVoidReason(''); }} type="button"><Trash2 aria-hidden="true" size={15} />Retirer</button>
                          </span> : null}
                        </div>
                      ))}
                    </div>
                    ) : <p className="working-time-empty">Aucune heure saisie.</p>}

                    {voidCandidateId ? (
                    <div className="working-time-void-form" hidden>
                      <label>Motif du retrait<input onChange={(event) => setVoidReason(event.target.value)} value={voidReason} /></label>
                      <button disabled={isSaving || voidReason.trim().length < 2} onClick={() => void runAction(async () => {
                        await voidWorkingTimeInterval(client, voidCandidateId, voidReason);
                        setVoidCandidateId(null);
                        setVoidReason('');
                      }, 'Le créneau a été retiré sans effacer son historique.')} type="button">Confirmer</button>
                      <button onClick={() => setVoidCandidateId(null)} type="button">Annuler</button>
                    </div>
                    ) : null}
                  </> : <WorkingTimeMonthlyView
                    calculations={selectedCalculations}
                    intervals={selectedIntervals}
                    nonCompliantDates={nonCompliantDates}
                    onSelectDay={(day) => { setSelectedDay(day); setRegisterView('daily'); }}
                    periodEnd={selectedRegister.periodEnd}
                    periodStart={selectedRegister.periodStart}
                    vessels={workspace.vessels}
                  />}

                </section>

                {nonCompliantDates.length ? (
                  <section className="working-time-non-compliance" aria-label="Journées non conformes">
                    <div className="working-time-subheading"><h4><AlertTriangle aria-hidden="true" size={17} />Journées non conformes</h4><span>{nonCompliantDates.length}</span></div>
                    <p>Le commentaire et les mesures prises documentent l’écart sans jamais rendre la journée conforme. Les cinq champs sont obligatoires avant validation.</p>
                    {nonCompliantDates.map((date) => {
                      const response = dayResponses[date] || EMPTY_NON_COMPLIANCE;
                      const disabled = !hasCaptainRole || selectedRegister.status === 'validated';
                      const update = (field: keyof NonComplianceDraft, value: string) => setDayResponses((current) => ({
                        ...current,
                        [date]: { ...(current[date] || EMPTY_NON_COMPLIANCE), [field]: value },
                      }));
                      return (
                        <div className="working-time-non-compliance-card" key={date}>
                          <header><strong>{date}</strong><span>NON CONFORME</span></header>
                          <div className="working-time-non-compliance-fields">
                            <label>Catégorie de cause
                              <select disabled={disabled} onChange={(event) => update('causeCategory', event.target.value)} value={response.causeCategory}>
                                <option value="">Sélectionner…</option>
                                {NON_COMPLIANCE_CAUSES.map((cause) => <option key={cause.value} value={cause.value}>{cause.label}</option>)}
                              </select>
                            </label>
                            <label>Contexte opérationnel<textarea disabled={disabled} onChange={(event) => update('operationalContext', event.target.value)} value={response.operationalContext} /></label>
                            <label>Action immédiate<textarea disabled={disabled} onChange={(event) => update('immediateAction', event.target.value)} value={response.immediateAction} /></label>
                            <label>Repos compensateur prévu<textarea disabled={disabled} onChange={(event) => update('compensatoryRestPlan', event.target.value)} value={response.compensatoryRestPlan} /></label>
                            <label className="is-wide">Commentaire obligatoire<textarea disabled={disabled} onChange={(event) => update('comment', event.target.value)} value={response.comment} /></label>
                          </div>
                          {hasCaptainRole && selectedRegister.status !== 'validated' ? <button hidden disabled={isSaving || !nonComplianceComplete(response)} onClick={() => void runAction(
                            () => saveWorkingTimeDayComment(client, {
                              registerId: selectedRegister.id,
                              localWorkDate: date,
                              causeCategory: response.causeCategory as WorkingTimeNonComplianceCause,
                              operationalContext: response.operationalContext,
                              immediateAction: response.immediateAction,
                              compensatoryRestPlan: response.compensatoryRestPlan,
                              comment: response.comment,
                            }),
                            `La réponse capitaine du ${date} est enregistrée.`,
                          )} type="button">Enregistrer la réponse</button> : null}
                        </div>
                      );
                    })}
                  </section>
                ) : null}

                <section className="working-time-workflow-actions" aria-label="Workflow du registre" hidden>
                  <h4>Signature et décision</h4>
                  {canEdit ? <button disabled={isSaving || selectedIntervals.length === 0} onClick={() => void runAction(
                    () => transitionWorkingTimeRegister(client, { registerId: selectedRegister.id, action: 'request_sailor_signature' }),
                    'Le registre attend maintenant la signature du marin.',
                  )} type="button"><Send aria-hidden="true" size={17} />Enregistrer le brouillon et demander la signature</button> : null}

                  {selectedRegister.status === 'awaiting_sailor_signature' && isOwnRegister ? (
                    <div className="working-time-sign-action">
                      <label><input checked={signatureConsent} onChange={(event) => setSignatureConsent(event.target.checked)} type="checkbox" />J’appose explicitement ma signature de profil sur ce registre.</label>
                      <button disabled={isSaving || !signatureConsent || !currentSignature} onClick={() => void runAction(
                        () => transitionWorkingTimeRegister(client, { registerId: selectedRegister.id, action: 'sailor_sign' }),
                        'Votre registre a été signé et soumis.',
                      )} type="button"><FileSignature aria-hidden="true" size={17} />Signer et soumettre</button>
                    </div>
                  ) : null}

                  {selectedRegister.status === 'submitted' && isOwnRegister && hasCaptainRole ? (
                    <p className="working-time-separation-note"><LockKeyhole aria-hidden="true" size={17} />Auto-validation interdite : un autre capitaine autorisé, l’Armement ou un administrateur doit valider votre registre.</p>
                  ) : null}

                  {selectedRegister.status === 'submitted' && !isOwnRegister && (hasCaptainRole || hasManagementValidationRole) ? (
                    <button disabled={isSaving || !canValidate} onClick={() => void runAction(
                      () => transitionWorkingTimeRegister(client, { registerId: selectedRegister.id, action: 'captain_validate' }),
                      'Le registre est validé et verrouillé.',
                    )} type="button"><UserCheck aria-hidden="true" size={17} />Contrôler et valider le registre</button>
                  ) : null}

                  {missingCaptainComments.length > 0 && selectedRegister.status === 'submitted' ? <p className="working-time-message is-error">Réponses de non-conformité incomplètes : {missingCaptainComments.join(', ')}.</p> : null}
                  {!currentSignature && ['awaiting_sailor_signature', 'submitted'].includes(selectedRegister.status) ? <p className="working-time-message is-error">Ajoutez d’abord votre signature numérisée dans votre profil utilisateur.</p> : null}

                  {canReopen ? (
                    <div className="working-time-reopen-form">
                      <label>Motif obligatoire<input onChange={(event) => setReopenReason(event.target.value)} placeholder="Décrivez la correction demandée" value={reopenReason} /></label>
                      <button disabled={isSaving || reopenReason.trim().length < 2} onClick={() => void runAction(async () => {
                        await transitionWorkingTimeRegister(client, { registerId: selectedRegister.id, action: 'reopen', comment: reopenReason });
                        setReopenReason('');
                      }, 'Le registre a été rouvert et le motif ajouté à l’audit.')} type="button"><RotateCcw aria-hidden="true" size={17} />Réouvrir</button>
                    </div>
                  ) : null}

                  {selectedRegister.status === 'validated' ? <p className="working-time-validated-note"><BadgeCheck aria-hidden="true" size={18} />Validation terminée — historique et signatures figés.</p> : null}
                </section>
              </article>
            ) : (
              <div className="working-time-register-detail working-time-empty">
                <div>
                  <h3>{selectedCatalogPerson ? formatPerson(selectedCatalogPerson.firstName, selectedCatalogPerson.lastName) : 'Aucun marin sélectionné'}</h3>
                  <p>{selectedCatalogPerson ? `Aucun registre mensuel pour ${displayedMonthLabel}.` : 'Sélectionnez un marin dans le catalogue.'}</p>
                  {selectedCatalogPerson && currentPerson && visibleEditablePeople.some((person) => person.personId === selectedCatalogPerson.personId) ? (
                    <button hidden disabled={isSaving} onClick={() => void runAction(async () => {
                      await getOrCreateWorkingTimeRegister(client, {
                        personId: selectedCatalogPerson.personId,
                        periodKind: 'monthly',
                        periodStart: range.start,
                      });
                      setPersonId(selectedCatalogPerson.personId);
                    }, 'Le registre mensuel est prêt pour la saisie.')} type="button">
                      <Plus aria-hidden="true" size={17} /> Ouvrir {displayedMonthLabel}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
