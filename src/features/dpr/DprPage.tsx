import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle, BarChart3, Check, ChevronLeft, ChevronRight, Download, Eye,
  FileArchive, FileCheck2, FileText, FolderOpen, Fuel, Gauge, Image, ListChecks,
  Paperclip, Plus, RefreshCw, Save, Search, ShieldAlert, ShieldCheck, Ship, Trash2, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ChangeEvent, ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import { ProjectPortCombobox } from '../projects/ProjectPortCombobox';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  EMPTY_DPR_PAYLOAD, INCIDENT_CATEGORIES, validateDprPayload,
  type CrewFunction, type DprFormPayload,
} from './dprFormModel.ts';
import { generateDprArchive, type GeneratedDprDocument } from './dprExport.ts';
import { generateDprPdf } from './dprPdf.ts';
import {
  createDprSignedUrl, fetchDprDashboard, fetchDprDetail, fetchDprDiagnostic, fetchDprEntryContext,
  removeDprFile, runDprTransition, saveDprPayload, uploadDprFile,
  type DprDashboardData, type DprFileRecord, type DprReferenceData, type DprReportRecord,
} from './dprQueries.ts';

interface DprPageProps { client?: SupabaseClient; roles?: RoleKey[] }
interface DprFilters {
  vesselId: string;
  projectId: string;
  dateFrom: string;
  dateTo: string;
  search: string;
  status: '' | DprReportRecord['status'];
}
interface PendingFile { key: string; kind: 'photo' | 'attachment'; file: File; previewUrl: string }
interface DprPdfPreview extends GeneratedDprDocument { report: DprReportRecord; url: string }

const EMPTY_FILTERS: DprFilters = { vesselId: '', projectId: '', dateFrom: '', dateTo: '', search: '', status: '' };
const DOCK_PROJECT_NAME = 'Navire à quai';
const DOCK_PROJECT_VALUE = '__dock_project__';
const UNLISTED_PROJECT_VALUE = '__unlisted_project__';
const STEPS = [
  ['Informations Projet', 'Informations projet'],
  ['Informations Journalière', 'Données journalières'],
  ['Indicateurs QHSE', 'Indicateurs et notes'],
  ['Escale', 'Soutes et mouvements'],
  ['Photos', 'Images du DPR'],
  ['Ajouter un fichier', 'Pièces jointes'],
] as const;
const CREW_LABELS: Record<CrewFunction, string> = {
  captain: 'Capitaine', 'chief-engineer': 'Chef mécanicien',
  'second-captain': '2nd Capitaine', execution: "Personnel d'exécution",
};
const STATUS_LABELS: Record<DprReportRecord['status'], string> = {
  draft: 'Brouillon', submitted: 'Soumis', validated: 'Validé', reopened: 'Réouvert',
};

function cloneEmptyPayload(): DprFormPayload { return structuredClone(EMPTY_DPR_PAYLOAD); }
function hasOfficeRole(roles: RoleKey[]): boolean { return roles.some((role) => ['admin', 'direction', 'armement'].includes(role)); }
function canEdit(report: DprReportRecord | null): boolean {
  if (!report) return true;
  return ['draft', 'reopened'].includes(report.status);
}
function reportTitle(report: DprReportRecord): string { return report.number ? `DPR-${report.number}` : `Brouillon #${report.id}`; }
function projectLabel(report: DprReportRecord): string { return report.projectCode || report.unlistedProjectName || 'Sans projet'; }
function formatDate(value: string): string { return value ? new Intl.DateTimeFormat('fr-FR').format(new Date(`${value}T12:00:00`)) : '-'; }

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? 'dpr-field dpr-field--wide' : 'dpr-field'}><span>{label}</span>{children}</label>;
}

interface DprRibbonButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  count?: number;
  icon: ReactNode;
  label: string;
}

function DprRibbonButton({ className = '', count = 0, icon, label, ...buttonProps }: DprRibbonButtonProps) {
  return <button
    aria-label={buttonProps['aria-label'] || `${label}${count ? ` (${Math.min(99, count)})` : ''}`}
    className={`planning-ribbon-command${className ? ` ${className}` : ''}`}
    type="button"
    {...buttonProps}
  >
    <span className="planning-ribbon-command-icon">{icon}{count ? <em>{Math.min(99, count)}</em> : null}</span>
    <span className="planning-ribbon-command-label">{label}</span>
  </button>;
}

function DprRibbonGroup({ children, label }: { children: ReactNode; label: string }) {
  return <div aria-label={label} className="planning-ribbon-group" role="group">
    <div className="planning-ribbon-actions">{children}</div>
    <span className="planning-ribbon-group-label">{label}</span>
  </div>;
}

function SelectionCheckbox({ ids, selected, label, onChange }: {
  ids: number[];
  selected: Set<number>;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const selectedCount = ids.reduce((total, id) => total + Number(selected.has(id)), 0);
  const checked = ids.length > 0 && selectedCount === ids.length;
  useEffect(() => { if (input.current) input.current.indeterminate = selectedCount > 0 && !checked; }, [checked, selectedCount]);
  return <input ref={input} type="checkbox" aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)}/>;
}

export function DprPage({ client, roles }: DprPageProps) {
  const outlet = useOutletContext<AppShellOutletContext | undefined>();
  const db = client || outlet?.client || supabase;
  const currentRoles = roles || outlet?.roles || [];
  const isMarinView = currentRoles.includes('marin')
    && !currentRoles.some((role) => role === 'admin' || role === 'direction' || role === 'armement' || role === 'capitaine');
  const [dashboard, setDashboard] = useState<DprDashboardData | null>(null);
  const [filters, setFilters] = useState<DprFilters>(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [report, setReport] = useState<DprReportRecord | null>(null);
  const [payload, setPayload] = useState<DprFormPayload>(cloneEmptyPayload);
  const [files, setFiles] = useState<DprFileRecord[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const pendingFilesRef = useRef<PendingFile[]>([]);
  const previewUrlRef = useRef('');
  const [pdfPreview, setPdfPreview] = useState<DprPdfPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const [initialSignature, setInitialSignature] = useState('');
  const [issuerName, setIssuerName] = useState('');

  const load = async (): Promise<DprDashboardData> => {
    const data = await fetchDprDashboard(db, { hideHistory: isMarinView });
    setDashboard(data);
    return data;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchDprDashboard(db, { hideHistory: isMarinView }).then((data) => { if (active) setDashboard(data); })
      .catch((reason: Error) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, isMarinView]);

  const dirty = modalOpen && (JSON.stringify(payload) !== initialSignature || pendingFiles.length > 0);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  pendingFilesRef.current = pendingFiles;
  useEffect(() => () => pendingFilesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  const visibleReports = useMemo(() => (dashboard?.reports || []).filter((item) => {
    if (filters.vesselId && String(item.vesselId ?? '') !== filters.vesselId) return false;
    if (filters.projectId && String(item.projectId ?? '') !== filters.projectId) return false;
    if (filters.dateFrom && item.reportDate < filters.dateFrom) return false;
    if (filters.dateTo && item.reportDate > filters.dateTo) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.search) {
      const haystack = `${reportTitle(item)} ${item.vesselName} ${projectLabel(item)} ${item.issuerName} ${item.description}`.toLowerCase();
      if (!haystack.includes(filters.search.toLowerCase())) return false;
    }
    return true;
  }), [dashboard, filters]);

  const visibleIds = useMemo(() => new Set(visibleReports.map((item) => item.id)), [visibleReports]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedReports = useMemo(
    () => visibleReports.filter((item) => selectedSet.has(item.id)),
    [selectedSet, visibleReports],
  );

  useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
    if (pdfPreview && !visibleIds.has(pdfPreview.report.id)) {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
      setPdfPreview(null);
    }
  }, [pdfPreview, visibleIds]);

  const kpis = useMemo(() => {
    const reports = dashboard?.reports || [];
    const month = new Date().toISOString().slice(0, 7);
    return {
      currentMonth: reports.filter((item) => item.reportDate.startsWith(month)).length,
      submitted: reports.filter((item) => item.status === 'submitted').length,
      validated: reports.filter((item) => item.status === 'validated').length,
      incidents: reports.reduce((sum, item) => sum + item.incidentCount, 0),
      fuel: reports.reduce((sum, item) => sum + item.fuelConsumedLiters, 0),
    };
  }, [dashboard]);

  const groups = useMemo(() => {
    const result = new Map<string, Map<string, DprReportRecord[]>>();
    visibleReports.forEach((item) => {
      const vessel = item.vesselName || 'Sans navire';
      const project = projectLabel(item);
      if (!result.has(vessel)) result.set(vessel, new Map());
      const projects = result.get(vessel)!;
      projects.set(project, [...(projects.get(project) || []), item]);
    });
    return result;
  }, [visibleReports]);

  const closeModal = () => {
    if (dirty && !window.confirm('Des modifications ne sont pas enregistrées. Fermer quand même ?')) return;
    pendingFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setPendingFiles([]); setModalOpen(false); setReport(null); setFiles([]); setError('');
  };

  const applyPlanningDefaults = async (reportDate: string, basePayload: DprFormPayload, vesselId: number | null = basePayload.vesselId): Promise<DprFormPayload> => {
    const context = await fetchDprEntryContext(db, reportDate, vesselId);
    const next = structuredClone(basePayload);
    next.reportDate = reportDate;
    next.projectId = context.projectId;
    next.unlistedProjectName = context.projectId === null && context.vesselId !== null ? DOCK_PROJECT_NAME : '';
    next.vesselId = context.vesselId;
    next.validatorPersonId = null;
    next.crewMembers = context.crewPersonIds.flatMap((personId, index) => {
      const person = context.people.find((item) => item.id === personId);
      return person ? [{ personId, crewFunction: person.crewFunction, rosterGroup: context.watchGroup, displayName: person.name, displayOrder: index }] : [];
    });
    const eligibleCrewIds = new Set(context.crewPersonIds);
    next.otherPeople = next.otherPeople.filter((person) => person.personId === null || eligibleCrewIds.has(person.personId));
    setDashboard((current) => current ? {
      ...current,
      references: { ...current.references, people: context.people, planningCrewPersonIds: context.crewPersonIds },
    } : current);
    setIssuerName(context.issuerName);
    return next;
  };

  const openNew = async () => {
    const next = cloneEmptyPayload();
    next.reportDate = new Date().toISOString().slice(0, 10);
    setBusy(true); setError(''); setNotice('');
    try {
      const populated = await applyPlanningDefaults(next.reportDate, next);
      setReport(null); setPayload(populated); setFiles([]); setPendingFiles([]); setStep(0);
      setInitialSignature(JSON.stringify(populated)); setModalOpen(true);
    } catch (reason) {
      setReport(null); setPayload(next); setFiles([]); setPendingFiles([]); setStep(0);
      setIssuerName(dashboard?.currentUserName || 'Utilisateur SeaPilot');
      setInitialSignature(JSON.stringify(next)); setModalOpen(true);
      setError(`Préremplissage Planning indisponible : ${(reason as Error).message}`);
    } finally { setBusy(false); }
  };

  const openReport = async (item: DprReportRecord) => {
    setBusy(true); setError('');
    try {
      const [detail, context] = await Promise.all([
        fetchDprDetail(db, item),
        fetchDprEntryContext(db, item.reportDate, item.vesselId),
      ]);
      setReport(item); setPayload(detail.payload); setFiles(detail.files); setPendingFiles([]); setStep(0);
      setDashboard((current) => current ? {
        ...current,
        references: { ...current.references, people: context.people, planningCrewPersonIds: context.crewPersonIds },
      } : current);
      setIssuerName(item.issuerName || dashboard?.currentUserName || 'Utilisateur SeaPilot');
      setInitialSignature(JSON.stringify(detail.payload)); setModalOpen(true);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const generateOnDemand = async (target: DprReportRecord): Promise<GeneratedDprDocument> => {
    if (!dashboard) throw new Error('Les données DPR ne sont pas encore disponibles.');
    const detail = await fetchDprDetail(db, target);
    return generateDprPdf(target, detail.payload, dashboard.references);
  };

  const preparePreview = async (target: DprReportRecord) => {
    setPreviewLoading(true); setError('');
    try {
      const generated = await generateOnDemand(target);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(generated.blob);
      previewUrlRef.current = url;
      setPdfPreview({ ...generated, report: target, url });
    } catch (reason) { setError((reason as Error).message); }
    finally { setPreviewLoading(false); }
  };

  const selectReports = (items: DprReportRecord[], checked: boolean) => {
    const ids = new Set(items.map((item) => item.id));
    setSelectedIds((current) => checked
      ? [...new Set([...current, ...ids])]
      : current.filter((id) => !ids.has(id)));
    if (checked && items.length) void preparePreview(items[0]);
    if (!checked && pdfPreview && ids.has(pdfPreview.report.id)) {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
      setPdfPreview(null);
    }
  };

  const downloadBlob = (generated: GeneratedDprDocument) => {
    const url = URL.createObjectURL(generated.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = generated.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const downloadSelection = async () => {
    if (!selectedReports.length) { setError('Sélectionnez au moins un DPR visible.'); return; }
    setBusy(true); setError(''); setExportProgress('');
    try {
      if (selectedReports.length === 1) {
        const target = selectedReports[0];
        const generated = pdfPreview?.report.id === target.id ? pdfPreview : await generateOnDemand(target);
        downloadBlob(generated);
        setNotice(`${reportTitle(target)} généré à la demande. Aucun PDF n’a été stocké.`);
        return;
      }

      const archive = await generateDprArchive(
        selectedReports,
        async (target) => pdfPreview?.report.id === target.id ? pdfPreview : generateOnDemand(target),
        ({ completed, total, report: current }) => setExportProgress(`${completed}/${total} · ${reportTitle(current)}`),
      );
      downloadBlob(archive);
      setNotice(`${selectedReports.length} PDF générés à la demande dans ${archive.filename}. Aucun PDF n’a été stocké.`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); setExportProgress(''); }
  };

  const addPendingFiles = (kind: PendingFile['kind'], event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    if (kind === 'photo' && files.filter((item) => item.kind === 'photo').length + pendingFiles.filter((item) => item.kind === 'photo').length + selected.length > 2) {
      setError('Deux photos maximum sont autorisées par DPR.'); event.target.value = ''; return;
    }
    setPendingFiles((current) => [...current, ...selected.map((file) => ({
      key: crypto.randomUUID(), kind, file, previewUrl: URL.createObjectURL(file),
    }))]);
    event.target.value = '';
  };

  const removePending = (key: string) => setPendingFiles((current) => current.filter((item) => {
    if (item.key === key) URL.revokeObjectURL(item.previewUrl);
    return item.key !== key;
  }));

  const uploadPending = async (dprId: number) => {
    for (const [index, item] of pendingFiles.entries()) {
      await uploadDprFile(db, dprId, item.kind, item.file, item.file.name, index);
    }
    pendingFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setPendingFiles([]);
  };

  const save = async (action: 'draft' | 'validate' = 'draft'): Promise<number | null> => {
    const validationErrors = validateDprPayload(payload, action !== 'draft');
    if (validationErrors.length) {
      setError(validationErrors.join(' '));
      if ((payload.projectId === null && !payload.unlistedProjectName.trim()) || payload.vesselId === null) setStep(0);
      else if (!payload.description.trim()) setStep(1);
      return null;
    }
    setBusy(true); setError('');
    try {
      const id = await saveDprPayload(db, report?.id || null, payload);
      await uploadPending(id);
      if (action === 'validate') await runDprTransition(db, 'validate', id);
      const nextDashboard = await load();
      const nextReport = nextDashboard.reports.find((item) => item.id === id) || null;
      setReport(nextReport); setInitialSignature(JSON.stringify(payload));
      if (isMarinView && action === 'validate') {
        setModalOpen(false);
        setReport(null);
        setFiles([]);
      }
      setNotice(action === 'validate'
        ? 'DPR validé. Il est transmis dans l’historique accessible aux profils autorisés.'
        : 'Brouillon enregistré.');
      return id;
    } catch (reason) { setError((reason as Error).message); return null; }
    finally { setBusy(false); }
  };

  const transition = async (action: 'validate' | 'reopen' | 'delete') => {
    if (!report) return;
    const reason = action === 'reopen' || action === 'delete'
      ? window.prompt(action === 'reopen' ? 'Motif de réouverture :' : 'Motif de suppression logique :')?.trim() || '' : '';
    if ((action === 'reopen' || action === 'delete') && !reason) return;
    setBusy(true); setError('');
    try {
      await runDprTransition(db, action, report.id, reason);
      const nextDashboard = await load();
      const nextReport = nextDashboard.reports.find((item) => item.id === report.id) || null;
      setNotice(action === 'validate' ? 'DPR validé. Le PDF sera généré uniquement à la demande.' : action === 'reopen' ? 'Nouvelle version réouverte.' : 'DPR supprimé logiquement.');
      if (action === 'delete') closeModal();
      else if (nextReport) await openReport(nextReport);
    } catch (reasonValue) { setError((reasonValue as Error).message); }
    finally { setBusy(false); }
  };

  const previewFile = async (item: DprFileRecord) => {
    setBusy(true); setError('');
    try { window.open(await createDprSignedUrl(db, item), '_blank', 'noopener,noreferrer'); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const deleteFile = async (item: DprFileRecord) => {
    if (!window.confirm(`Retirer « ${item.filename} » du DPR ?`)) return;
    setBusy(true);
    try { await removeDprFile(db, item.id); setFiles((current) => current.filter((file) => file.id !== item.id)); await load(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const showDiagnostic = async () => {
    setBusy(true); setError('');
    try {
      const diagnostic = await fetchDprDiagnostic(db);
      setNotice(`Diagnostic Supabase — ${Object.entries(diagnostic).map(([key, value]) => `${key}: ${value}`).join(' · ')}`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const editable = canEdit(report);
  const updatePayload = (recipe: (current: DprFormPayload) => void) => setPayload((current) => { const next = structuredClone(current); recipe(next); return next; });
  const updateReportDate = async (reportDate: string) => {
    if (report) { updatePayload((current) => { current.reportDate = reportDate; }); return; }
    setBusy(true); setError('');
    try { setPayload(await applyPlanningDefaults(reportDate, payload, payload.vesselId)); }
    catch (reason) {
      updatePayload((current) => { current.reportDate = reportDate; });
      setError(`Préremplissage Planning indisponible : ${(reason as Error).message}`);
    } finally { setBusy(false); }
  };
  const previewIndex = pdfPreview ? selectedReports.findIndex((item) => item.id === pdfPreview.report.id) : -1;
  const navigatePreview = (direction: -1 | 1) => {
    if (!selectedReports.length) return;
    const currentIndex = previewIndex >= 0 ? previewIndex : 0;
    const nextIndex = (currentIndex + direction + selectedReports.length) % selectedReports.length;
    void preparePreview(selectedReports[nextIndex]);
  };

  return <section className="dpr-native" aria-busy={loading || busy}>
    <header className="dpr-native__header">
      <div><span className="dpr-native__eyebrow">OPÉRATIONS</span><h1>Daily Progress Report</h1><p>Consultez, prévisualisez et produisez les DPR à la demande, sans stockage des PDF.</p></div>
    </header>

    {(notice || error) && !modalOpen && <div className={error ? 'dpr-message dpr-message--error' : 'dpr-message'} role={error ? 'alert' : 'status'}>{error || notice}</div>}

    <nav className="planning-module-toolbar dpr-module-toolbar" aria-label="Menu Daily Progress Report">
      <div className="planning-ribbon-scroll">
        <DprRibbonGroup label="DPR">
          <DprRibbonButton icon={<Plus aria-hidden="true" size={22}/>} label="Saisir un DPR" onClick={() => void openNew()}/>
          {!isMarinView ? <DprRibbonButton className={!filters.status ? 'is-active' : ''} icon={<BarChart3 aria-hidden="true" size={22}/>} label="Vue d’ensemble" onClick={() => setFilters(EMPTY_FILTERS)}/> : null}
          {!isMarinView ? <DprRibbonButton className={filters.status === 'submitted' ? 'is-active' : ''} count={kpis.submitted} icon={<ListChecks aria-hidden="true" size={22}/>} label="À valider" onClick={() => setFilters((current) => ({ ...current, status: 'submitted' }))}/> : null}
        </DprRibbonGroup>
        {!isMarinView ? <DprRibbonGroup label="Production">
          <DprRibbonButton disabled={!selectedReports.length} icon={<Eye aria-hidden="true" size={22}/>} label="Prévisualiser" onClick={() => selectedReports[0] && void preparePreview(selectedReports[0])}/>
          <DprRibbonButton disabled={!selectedReports.length || previewLoading || busy} icon={<FileCheck2 aria-hidden="true" size={22}/>} label="Produire" onClick={() => void downloadSelection()}/>
          <DprRibbonButton disabled={selectedReports.length < 2 || previewLoading || busy} icon={<FileArchive aria-hidden="true" size={22}/>} label="Exports ZIP" onClick={() => void downloadSelection()}/>
        </DprRibbonGroup> : null}
        <DprRibbonGroup label="Outils">
          <DprRibbonButton disabled={busy} icon={<RefreshCw aria-hidden="true" size={22}/>} label="Actualiser" onClick={() => void load()}/>
          {currentRoles.includes('admin') ? <DprRibbonButton icon={<ShieldCheck aria-hidden="true" size={22}/>} label="Diagnostic" onClick={() => void showDiagnostic()}/> : null}
        </DprRibbonGroup>
      </div>
    </nav>

    {isMarinView ? <section className="dpr-marin-entry-only" aria-label="Accès DPR Marin">
      <FolderOpen aria-hidden="true"/>
      <div><h2>Saisie DPR</h2><p>Votre profil peut saisir et valider un DPR. L’historique reste réservé aux profils Capitaine et aux autres profils autorisés.</p></div>
    </section> : <>
    <div className="dpr-kpi-strip" aria-label="Indicateurs Daily Progress Report">
      <article><Gauge/><span><small>DPR ce mois</small><strong>{kpis.currentMonth}</strong></span></article>
      <article><ListChecks/><span><small>À valider</small><strong>{kpis.submitted}</strong></span></article>
      <article><FileCheck2/><span><small>Prêts à produire</small><strong>{kpis.validated}</strong></span></article>
      <article><ShieldAlert/><span><small>Incidents QHSE</small><strong>{kpis.incidents}</strong></span></article>
      <article><Fuel/><span><small>Fuel consommé</small><strong>{kpis.fuel.toLocaleString('fr-FR')} L</strong></span></article>
    </div>

    <div className={`dpr-workspace${isMarinView ? ' is-read-only' : ''}`}>
      <section className="dpr-master" aria-label="Liste des DPR">
        <div className="dpr-native__filters">
          <Field label="NAVIRE"><select value={filters.vesselId} onChange={(event) => setFilters({ ...filters, vesselId: event.target.value })}><option value="">Tous</option>{dashboard?.references.vessels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="PROJET"><select value={filters.projectId} onChange={(event) => setFilters({ ...filters, projectId: event.target.value })}><option value="">Tous</option>{dashboard?.references.projects.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.title}</option>)}</select></Field>
          <Field label="STATUT"><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as DprFilters['status'] })}><option value="">Tous</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
          <Field label="PÉRIODE"><div className="dpr-period"><input aria-label="Date de début" type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })}/><input aria-label="Date de fin" type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })}/></div></Field>
          <Field label="RECHERCHE"><div className="dpr-search"><Search size={15}/><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="DPR, navire, auteur…"/></div></Field>
          <button className="button" onClick={() => setFilters(EMPTY_FILTERS)}>Réinitialiser</button>
        </div>

        <div className="dpr-selection-summary">
          {!isMarinView ? <span><SelectionCheckbox ids={visibleReports.map((item) => item.id)} selected={selectedSet} label={`Sélectionner les ${visibleReports.length} DPR visibles`} onChange={(checked) => selectReports(visibleReports, checked)}/><strong>{selectedReports.length} DPR sélectionné(s)</strong><small>sélection visible uniquement</small></span> : <span><strong>Mes DPR</strong><small>rédaction et suivi de mes rapports</small></span>}
          <span>{visibleReports.length} DPR affiché(s)</span>
        </div>

        <div className="dpr-native__list">
          {loading && <p>Chargement des DPR Supabase…</p>}
          {!loading && !visibleReports.length && <div className="dpr-empty"><FolderOpen/><h2>Aucun DPR</h2><p>Aucun rapport ne correspond aux filtres.</p></div>}
          {[...groups.entries()].map(([vessel, projects]) => {
            const vesselItems = [...projects.values()].flat();
            return <section className="dpr-group" key={vessel}>
              <header><span>{!isMarinView ? <SelectionCheckbox ids={vesselItems.map((item) => item.id)} selected={selectedSet} label={`Sélectionner tous les DPR du navire ${vessel}`} onChange={(checked) => selectReports(vesselItems, checked)}/> : null}<Ship size={17}/> {vessel}</span><small>{vesselItems.length} DPR</small></header>
              {[...projects.entries()].map(([project, items]) => <div className="dpr-project" key={project}>
                <div className="dpr-project__title">{!isMarinView ? <SelectionCheckbox ids={items.map((item) => item.id)} selected={selectedSet} label={`Sélectionner tous les DPR du projet ${project}`} onChange={(checked) => selectReports(items, checked)}/> : null}<FolderOpen size={16}/><strong>{project}</strong><span>{items.length} enregistrement(s)</span></div>
                {items.map((item) => <article className={`${selectedSet.has(item.id) ? 'dpr-row is-selected' : 'dpr-row'}${isMarinView ? ' is-read-only' : ''}`} key={item.id}>
                  {!isMarinView ? <input aria-label={`Sélectionner ${reportTitle(item)}`} type="checkbox" checked={selectedSet.has(item.id)} onChange={(event) => selectReports([item], event.target.checked)}/> : null}
                  {!isMarinView ? <button className="dpr-row__preview" aria-label={`Aperçu ${reportTitle(item)}`} onClick={() => void preparePreview(item)}><Eye size={16}/></button> : null}
                  <strong>{reportTitle(item)}</strong><span><small>DATE</small>{formatDate(item.reportDate)}</span><span><small>AUTEUR</small>{item.issuerName || '-'}</span><span><small>FUEL</small>{item.fuelConsumedLiters.toLocaleString('fr-FR')} L</span>
                  <span className={`dpr-status dpr-status--${item.status}`}>{STATUS_LABELS[item.status]}</span>
                  <button className="dpr-row__open" onClick={() => void openReport(item)}>{canEdit(item) ? 'Modifier' : 'Consulter'}</button>
                </article>)}
              </div>)}
            </section>;
          })}
        </div>
      </section>

      {!isMarinView ? <aside className="dpr-preview" aria-label="Aperçu avant production">
        <header><div><span>APERÇU AVANT PRODUCTION</span><h2>{pdfPreview ? `${reportTitle(pdfPreview.report)} · ${formatDate(pdfPreview.report.reportDate)}` : 'Sélectionnez un DPR'}</h2>{pdfPreview ? <p>{pdfPreview.report.vesselName} · {projectLabel(pdfPreview.report)}</p> : <p>Le document est généré localement et n’est jamais stocké.</p>}</div></header>
        {previewLoading ? <div className="dpr-preview__loading"><RefreshCw/><strong>Génération de l’aperçu…</strong></div> : null}
        {!previewLoading && pdfPreview ? <>
          <div className="dpr-preview__toolbar"><button aria-label="DPR précédent" onClick={() => navigatePreview(-1)} disabled={selectedReports.length < 2}><ChevronLeft/></button><span>{previewIndex + 1} / {selectedReports.length}</span><button aria-label="DPR suivant" onClick={() => navigatePreview(1)} disabled={selectedReports.length < 2}><ChevronRight/></button></div>
          <iframe className="dpr-preview__document" title={`Aperçu ${reportTitle(pdfPreview.report)}`} src={pdfPreview.url}/>
          <div className="dpr-preview__checks"><span><Check/><strong>Identité concordante</strong><small>{reportTitle(pdfPreview.report)} · {formatDate(pdfPreview.report.reportDate)} · {pdfPreview.report.vesselName} · {projectLabel(pdfPreview.report)}</small></span><span><Check/><strong>PDF généré à la demande</strong><small>Aucun objet Supabase créé</small></span><span><Check/><strong>Prêt à produire</strong><small>{selectedReports.length} DPR visible(s) dans la sélection</small></span></div>
        </> : null}
        {!previewLoading && !pdfPreview ? <div className="dpr-preview__empty"><Eye/><strong>Prévisualisez avant de produire</strong><p>Sélectionnez une ligne ou un groupe. Le premier DPR s’affichera ici.</p></div> : null}
        <footer>{exportProgress ? <span className="dpr-export-progress">Production {exportProgress}</span> : null}<button className="button button--primary" onClick={() => void downloadSelection()} disabled={!pdfPreview || !selectedReports.length || busy}>{selectedReports.length > 1 ? <FileArchive/> : <Download/>}{selectedReports.length > 1 ? `Télécharger le ZIP (${selectedReports.length})` : 'Télécharger le PDF'}</button></footer>
      </aside> : null}
    </div>
    </>}

    {modalOpen && dashboard && <div className="dpr-modal" role="dialog" aria-modal="true" aria-label="Saisie Daily Progress Report">
      <div className="dpr-modal__panel">
        <header className="dpr-modal__header"><div><small>SAISIE</small><h2>Daily Progress Report</h2></div><button aria-label="Fermer" onClick={closeModal}><X/></button></header>
        <div className="dpr-modal__body">
          <nav className="dpr-steps" aria-label="Étapes du DPR"><span>ASSISTANT</span><h3>DPR</h3>{STEPS.map(([title, subtitle], index) => <button key={title} className={step === index ? 'active' : ''} onClick={() => setStep(index)}><b>{index + 1}</b><span><strong>{title}</strong><small>{subtitle}</small></span><ChevronRight size={15}/></button>)}</nav>
          <main className="dpr-step">
            {(notice || error) && <div className={error ? 'dpr-message dpr-message--error dpr-modal__message' : 'dpr-message dpr-modal__message'} role={error ? 'alert' : 'status'}>{error || notice}</div>}
            <div className="dpr-step__title"><b>{step + 1}.</b><h3>{STEPS[step][0]}</h3><span>— {STEPS[step][1]}</span></div>
            {step === 0 && <StepProject payload={payload} references={dashboard.references} issuer={issuerName || report?.issuerName || dashboard.currentUserName} editable={editable} update={updatePayload} onDateChange={(value) => void updateReportDate(value)} onVesselChange={async (vesselId) => {
              setBusy(true); setError('');
              try { setPayload(await applyPlanningDefaults(payload.reportDate, payload, vesselId)); }
              catch (reason) { setError(`Préremplissage Planning indisponible : ${(reason as Error).message}`); }
              finally { setBusy(false); }
            }} />}
            {step === 1 && <StepDaily payload={payload} editable={editable} update={updatePayload}/>}
            {step === 2 && <StepQhse payload={payload} references={dashboard.references} editable={editable} update={updatePayload}/>}
            {step === 3 && <StepPort payload={payload} references={dashboard.references} editable={editable} update={updatePayload}/>}
            {step === 4 && <StepFiles kind="photo" files={files} pending={pendingFiles} editable={editable} onAdd={addPendingFiles} onOpen={previewFile} onRemove={deleteFile} onRemovePending={removePending}/>}
            {step === 5 && <StepFiles kind="attachment" files={files} pending={pendingFiles} editable={editable} onAdd={addPendingFiles} onOpen={previewFile} onRemove={deleteFile} onRemovePending={removePending}/>}
          </main>
        </div>
        <footer className="dpr-modal__footer">
          {dirty && <span className="dpr-unsaved"><AlertTriangle size={15}/> Modifications non enregistrées</span>}
          <button className="button" onClick={closeModal}>Annuler</button>
          {editable && !isMarinView && <button className="button" onClick={() => void save('draft')} disabled={busy}><Save size={16}/> Enregistrer le brouillon</button>}
          {editable && <button className="button button--primary" onClick={() => void save('validate')} disabled={busy}><ShieldCheck size={16}/> Valider le DPR</button>}
          {report?.status === 'submitted' && <button className="button button--primary" onClick={() => void transition('validate')} disabled={busy}><ShieldCheck size={16}/> Valider le DPR</button>}
          {report?.status === 'validated' && <button className="button" onClick={() => void transition('reopen')} disabled={busy}>Réouvrir</button>}
          {report && hasOfficeRole(currentRoles) && <button className="button button--danger" onClick={() => void transition('delete')} disabled={busy}><Trash2 size={16}/> Supprimer</button>}
        </footer>
      </div>
    </div>}
  </section>;
}

interface StepProps { payload: DprFormPayload; editable: boolean; update: (recipe: (current: DprFormPayload) => void) => void }

function StepProject({ payload, references, issuer, editable, update, onDateChange, onVesselChange }: StepProps & { references: DprReferenceData; issuer: string; onDateChange: (value: string) => void; onVesselChange: (value: number | null) => Promise<void> }) {
  const [manualNames, setManualNames] = useState('');
  const otherPersonIds = useMemo(() => new Set(payload.otherPeople.flatMap((person) => person.personId === null ? [] : [person.personId])), [payload.otherPeople]);
  const planningCrewIds = useMemo(() => new Set(references.planningCrewPersonIds || []), [references.planningCrewPersonIds]);
  const availableOtherPeople = useMemo(() => references.people.filter((person) => planningCrewIds.has(person.id)
    && !payload.crewMembers.some((crew) => crew.personId === person.id)), [payload.crewMembers, planningCrewIds, references.people]);
  const peopleByFunction = useMemo(() => {
    const groups = new Map<string, typeof references.people>();
    availableOtherPeople.forEach((person) => groups.set(person.functionLabel, [...(groups.get(person.functionLabel) || []), person]));
    return [...groups.entries()].sort(([leftLabel, leftPeople], [rightLabel, rightPeople]) => {
      const sedentaryDifference = Number(rightPeople.some((person) => person.isSedentary)) - Number(leftPeople.some((person) => person.isSedentary));
      return sedentaryDifference || leftLabel.localeCompare(rightLabel, 'fr');
    });
  }, [availableOtherPeople, references.people]);
  const toggleCrew = (personId: number) => update((current) => {
    const person = references.people.find((item) => item.id === personId)!;
    const existing = current.crewMembers.findIndex((item) => item.personId === personId);
    if (existing >= 0) current.crewMembers.splice(existing, 1);
    else current.crewMembers.push({ personId, crewFunction: person.crewFunction, rosterGroup: '', displayName: person.name, displayOrder: current.crewMembers.length });
  });
  const toggleOtherPerson = (personId: number) => update((current) => {
    const existing = current.otherPeople.findIndex((item) => item.personId === personId);
    if (existing >= 0) current.otherPeople.splice(existing, 1);
    else {
      const person = references.people.find((item) => item.id === personId);
      if (person) current.otherPeople.push({ personId, displayName: person.name, displayOrder: current.otherPeople.length });
    }
  });
  const addManualNames = () => {
    const names = manualNames.split(/[;\n]+/).map((name) => name.trim()).filter(Boolean);
    if (!names.length) return;
    update((current) => {
      const existing = new Set(current.otherPeople.map((person) => person.displayName.toLocaleLowerCase('fr')));
      names.forEach((name) => {
        if (!existing.has(name.toLocaleLowerCase('fr'))) {
          current.otherPeople.push({ personId: null, displayName: name, displayOrder: current.otherPeople.length });
          existing.add(name.toLocaleLowerCase('fr'));
        }
      });
    });
    setManualNames('');
  };
  return <div className="dpr-cards">
    <section className="dpr-card"><h4><b>1</b> Projet</h4><div className="dpr-form-grid">
      <Field label="DATE"><input type="date" disabled={!editable} value={payload.reportDate} onChange={(event) => onDateChange(event.target.value)}/></Field>
      <Field label="PROJET"><select disabled={!editable} value={payload.projectId !== null ? String(payload.projectId) : payload.unlistedProjectName === DOCK_PROJECT_NAME ? DOCK_PROJECT_VALUE : payload.unlistedProjectName ? UNLISTED_PROJECT_VALUE : ''} onChange={(event) => update((current) => {
        if (event.target.value === DOCK_PROJECT_VALUE) {
          current.projectId = null;
          current.unlistedProjectName = DOCK_PROJECT_NAME;
        } else if (event.target.value === UNLISTED_PROJECT_VALUE) {
          current.projectId = null;
        } else {
          current.projectId = event.target.value ? Number(event.target.value) : null;
          current.unlistedProjectName = '';
        }
      })}><option value="">Sélectionner…</option><option value={DOCK_PROJECT_VALUE}>{DOCK_PROJECT_NAME}</option>{payload.unlistedProjectName && payload.unlistedProjectName !== DOCK_PROJECT_NAME ? <option value={UNLISTED_PROJECT_VALUE}>{payload.unlistedProjectName}</option> : null}{references.projects.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.title}</option>)}</select></Field>
      <Field label="NAVIRE"><select disabled={!editable} value={payload.vesselId ?? ''} onChange={(event) => void onVesselChange(event.target.value ? Number(event.target.value) : null)}><option value="">Sélectionner…</option>{references.vessels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="ÉMETTEUR"><input value={issuer} disabled/></Field>
    </div></section>
    <section className="dpr-card"><h4><b>2</b> Personnel embarqué</h4>{(Object.keys(CREW_LABELS) as CrewFunction[]).map((role) => <div className="dpr-people" key={role}><strong>{CREW_LABELS[role]}</strong><div>{references.people.filter((person) => planningCrewIds.has(person.id) && person.crewFunction === role).map((person) => <label key={person.id}><input type="checkbox" disabled={!editable} checked={payload.crewMembers.some((item) => item.personId === person.id)} onChange={() => toggleCrew(person.id)}/>{person.name}</label>)}</div></div>)}
      <div className="dpr-people dpr-other-people"><strong>Autres personnes</strong>
        {editable && <details className="dpr-multiselect"><summary>{otherPersonIds.size ? `${otherPersonIds.size} personne(s) sélectionnée(s)` : 'Sélectionner des personnes en poste'}</summary><div className="dpr-multiselect__panel">{peopleByFunction.map(([functionLabel, people]) => <fieldset key={functionLabel}><legend>{functionLabel}{people.some((person) => person.isSedentary) ? ' · Sédentaire' : ''}</legend>{people.map((person) => <label key={person.id}><input type="checkbox" checked={otherPersonIds.has(person.id)} onChange={() => toggleOtherPerson(person.id)}/>{person.name}</label>)}</fieldset>)}</div></details>}
        <div className="dpr-selected-people">{payload.otherPeople.map((person, index) => <span key={`${person.personId ?? 'free'}-${index}`}>{person.displayName}<button type="button" disabled={!editable} aria-label={`Retirer ${person.displayName}`} onClick={() => update((current) => { current.otherPeople.splice(index, 1); })}><X size={13}/></button></span>)}</div>
        {editable && <div className="dpr-inline-add dpr-inline-add--names"><textarea aria-label="Ajouter plusieurs autres personnes" rows={2} value={manualNames} onChange={(event) => setManualNames(event.target.value)} placeholder="Prénom NOM ; Prénom NOM (séparer par un point-virgule ou une nouvelle ligne)"/><button type="button" className="button" onClick={addManualNames}><Plus size={15}/> Ajouter les personnes</button></div>}
      </div>
    </section>
  </div>;
}

function StepDaily({ payload, editable, update }: StepProps) {
  return <div className="dpr-cards"><section className="dpr-card"><h4><b>1</b> Journée</h4><Field label="DESCRIPTION DE LA JOURNÉE" wide><textarea rows={6} disabled={!editable} value={payload.description} onChange={(event) => update((current) => { current.description = event.target.value; })}/></Field><div className="dpr-form-grid"><Field label="CONSOMMATION DE CARBURANT EN L"><input type="number" min="0" disabled={!editable} value={payload.metrics.fuelConsumedLiters} onChange={(event) => update((current) => { current.metrics.fuelConsumedLiters = event.target.value; })}/></Field></div></section><section className="dpr-card"><h4><b>2</b> Soutes</h4><Field label="QUANTITÉ TOTALE DE FUEL À BORD EN L"><input type="number" min="0" disabled={!editable} value={payload.metrics.fuelOnBoardLiters} onChange={(event) => update((current) => { current.metrics.fuelOnBoardLiters = event.target.value; })}/></Field></section></div>;
}

function StepQhse({ payload, references, editable, update }: StepProps & { references: DprReferenceData }) {
  return <div className="dpr-qhse-grid"><section className="dpr-card"><h4><b>1</b> Incidents</h4>{INCIDENT_CATEGORIES.map((definition) => { const incident = payload.incidents.find((item) => item.category === definition.key)!; return <Field key={definition.key} label={definition.label.toUpperCase()}><select disabled={!editable} value={incident.level} onChange={(event) => update((current) => { current.incidents.find((item) => item.category === definition.key)!.level = event.target.value as 'T0' | 'T1' | 'T2'; })}><option value="T0">T0 - Non</option><option value="T1">T1 - Événement</option><option value="T2">T2 - Incident</option></select></Field>; })}</section>
    <section className="dpr-card"><h4><b>2</b> Actions HSE</h4><div className="dpr-check-grid"><label><input type="checkbox" disabled={!editable} checked={payload.hseActions.tbtPerformed} onChange={(event) => update((current) => { current.hseActions.tbtPerformed = event.target.checked; if (!event.target.checked) current.hseActions.tbtTheme = ''; })}/> TBT</label><Field label="THÈME DU TBT"><input disabled={!editable || !payload.hseActions.tbtPerformed} value={payload.hseActions.tbtTheme} onChange={(event) => update((current) => { current.hseActions.tbtTheme = event.target.value; })}/></Field><label><input type="checkbox" disabled={!editable} checked={payload.hseActions.hseVisitPerformed} onChange={(event) => update((current) => { current.hseActions.hseVisitPerformed = event.target.checked; })}/> Visites HSE</label><label><input type="checkbox" disabled={!editable} checked={payload.hseActions.hseAuditPerformed} onChange={(event) => update((current) => { current.hseActions.hseAuditPerformed = event.target.checked; })}/> Audits HSE</label></div><div className="dpr-form-grid">{([['goodPracticesCount', 'NOMBRE DE BONNES PRATIQUES'], ['dangerousSituationsCount', 'NB DE SITUATIONS DANGEREUSES'], ['stopWorkCount', 'NOMBRE DE STOP WORK']] as const).map(([key, label]) => <Field key={key} label={label}><input type="number" min="0" disabled={!editable} value={payload.hseActions[key]} onChange={(event) => update((current) => { current.hseActions[key] = event.target.value; })}/></Field>)}</div></section>
    <section className="dpr-card"><h4><b>3</b> Exercices d'urgence</h4><div className="dpr-choice-grid">{references.exerciseTypes.map((exercise) => <label key={exercise.key}><input type="checkbox" disabled={!editable} checked={payload.emergencyExercises.some((item) => item.key === exercise.key)} onChange={(event) => update((current) => { if (event.target.checked) current.emergencyExercises.push({ key: exercise.key, notes: '' }); else current.emergencyExercises = current.emergencyExercises.filter((item) => item.key !== exercise.key); })}/>{exercise.label}</label>)}</div></section>
    <section className="dpr-card"><h4><b>4</b> Note QHSE</h4><Field label="NOTE QHSE" wide><textarea rows={6} disabled={!editable} value={payload.qhseNote} onChange={(event) => update((current) => { current.qhseNote = event.target.value; })}/></Field></section></div>;
}

function StepPort({ payload, references, editable, update }: StepProps & { references: DprReferenceData }) {
  const call = payload.portCalls[0];
  return <div className="dpr-cards"><section className="dpr-card"><h4>Date et heure de l'Escale</h4><div className="dpr-form-grid"><Field label="PORT"><ProjectPortCombobox disabled={!editable} onChange={(value) => update((current) => { current.portCalls[0].portName = value; })} value={call.portName} /></Field><Field label="HEURE - NAVIRE ACCOSTÉ AU PORT"><input type="datetime-local" disabled={!editable} value={call.arrivalAt} onChange={(event) => update((current) => { current.portCalls[0].arrivalAt = event.target.value; })}/></Field><Field label="HEURE - APPAREILLAGE DU PORT"><input type="datetime-local" disabled={!editable} value={call.departureAt} onChange={(event) => update((current) => { current.portCalls[0].departureAt = event.target.value; })}/></Field></div><div className="dpr-choice-grid">{references.portReasons.map((reason) => <label key={reason.key}><input type="checkbox" disabled={!editable} checked={call.reasons.includes(reason.key)} onChange={(event) => update((current) => { const reasons = current.portCalls[0].reasons; current.portCalls[0].reasons = event.target.checked ? [...reasons, reason.key] : reasons.filter((key) => key !== reason.key); })}/>{reason.label}</label>)}</div></section>
    <section className="dpr-card"><h4>Approvisionnements</h4><div className="dpr-form-grid">{([['fuelM3', 'FUEL (EN M3)'], ['oilLiters', 'APPROVISIONNEMENT HUILE (EN L)'], ['waterM3', 'APPROVISIONNEMENT EN EAU (M3)']] as const).map(([key, label]) => <Field key={key} label={label}><input type="number" min="0" disabled={!editable} value={payload.supplies[key]} onChange={(event) => update((current) => { current.supplies[key] = event.target.value; })}/></Field>)}</div></section>
    <section className="dpr-card"><h4>Collecte et déchets</h4><div className="dpr-form-grid">{payload.wasteRecords.map((record, index) => <Field key={record.key} label={`${record.key.toUpperCase()} (EN ${record.unit.toUpperCase()})`}><input type="number" min="0" disabled={!editable} value={record.quantity} onChange={(event) => update((current) => { current.wasteRecords[index].quantity = event.target.value; })}/></Field>)}</div></section></div>;
}

function StepFiles({ kind, files, pending, editable, onAdd, onOpen, onRemove, onRemovePending }: {
  kind: 'photo' | 'attachment'; files: DprFileRecord[]; pending: PendingFile[]; editable: boolean;
  onAdd: (kind: PendingFile['kind'], event: ChangeEvent<HTMLInputElement>) => void;
  onOpen: (file: DprFileRecord) => void; onRemove: (file: DprFileRecord) => void; onRemovePending: (key: string) => void;
}) {
  const existing = files.filter((item) => item.kind === kind);
  const queued = pending.filter((item) => item.kind === kind);
  return <section className="dpr-card dpr-files"><div className="dpr-file-grid">
    {existing.map((item) => <article key={item.id} className="dpr-file"><button onClick={() => onOpen(item)}>{kind === 'photo' ? <Image/> : <FileText/>}<strong>{item.filename}</strong><small>{Math.round(item.sizeBytes / 1024)} Ko · Supabase</small></button>{editable && <button aria-label={`Retirer ${item.filename}`} onClick={() => onRemove(item)}><Trash2 size={16}/></button>}</article>)}
    {queued.map((item) => <article key={item.key} className="dpr-file dpr-file--pending"><button onClick={() => window.open(item.previewUrl, '_blank', 'noopener,noreferrer')}>{kind === 'photo' ? <Image/> : <FileText/>}<strong>{item.file.name}</strong><small>En attente d'enregistrement</small></button><button aria-label={`Retirer ${item.file.name}`} onClick={() => onRemovePending(item.key)}><Trash2 size={16}/></button></article>)}
    {editable && <label className="dpr-dropzone">{kind === 'photo' ? <Image/> : <Paperclip/>}<strong>{kind === 'photo' ? 'Insérer une image' : 'Choisir un ou plusieurs fichiers'}</strong><input type="file" hidden multiple={kind === 'attachment'} accept={kind === 'photo' ? 'image/*' : undefined} onChange={(event) => onAdd(kind, event)}/></label>}
  </div>{!existing.length && !queued.length && !editable && <p>Aucun fichier.</p>}</section>;
}
