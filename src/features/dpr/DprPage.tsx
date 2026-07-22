import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle, Check, ChevronRight, Download, FileText, FolderOpen, Image,
  Paperclip, Plus, RefreshCw, Save, Search, ShieldCheck, Ship, Trash2, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  EMPTY_DPR_PAYLOAD, INCIDENT_CATEGORIES, validateDprPayload,
  type CrewFunction, type DprFormPayload,
} from './dprFormModel.ts';
import { generateDprPdf } from './dprPdf.ts';
import {
  createDprSignedUrl, fetchDprDashboard, fetchDprDetail, fetchDprDiagnostic,
  removeDprFile, runDprTransition, saveDprPayload, uploadDprFile,
  type DprDashboardData, type DprFileRecord, type DprReferenceData, type DprReportRecord,
} from './dprQueries.ts';

interface DprPageProps { client?: SupabaseClient; roles?: RoleKey[] }
interface DprFilters { vesselId: string; projectId: string; dateFrom: string; dateTo: string; search: string }
interface PendingFile { key: string; kind: 'photo' | 'attachment'; file: File; previewUrl: string }

const EMPTY_FILTERS: DprFilters = { vesselId: '', projectId: '', dateFrom: '', dateTo: '', search: '' };
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
function canValidate(roles: RoleKey[]): boolean { return hasOfficeRole(roles) || roles.includes('capitaine'); }
function canEdit(report: DprReportRecord | null, roles: RoleKey[], userId: string | null): boolean {
  if (!report) return true;
  if (!['draft', 'reopened'].includes(report.status)) return false;
  return canValidate(roles) || (roles.includes('marin') && report.createdBy === userId);
}
function reportTitle(report: DprReportRecord): string { return report.number ? `DPR-${report.number}` : `Brouillon #${report.id}`; }
function projectLabel(report: DprReportRecord): string { return report.projectCode || report.unlistedProjectName || 'Sans projet'; }
function formatDate(value: string): string { return value ? new Intl.DateTimeFormat('fr-FR').format(new Date(`${value}T12:00:00`)) : '-'; }

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? 'dpr-field dpr-field--wide' : 'dpr-field'}><span>{label}</span>{children}</label>;
}

export function DprPage({ client, roles }: DprPageProps) {
  const outlet = useOutletContext<AppShellOutletContext | undefined>();
  const db = client || outlet?.client || supabase;
  const currentRoles = roles || outlet?.roles || [];
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
  const [initialSignature, setInitialSignature] = useState('');

  const load = async (): Promise<DprDashboardData> => {
    const data = await fetchDprDashboard(db);
    setDashboard(data);
    return data;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchDprDashboard(db).then((data) => { if (active) setDashboard(data); })
      .catch((reason: Error) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db]);

  const dirty = modalOpen && (JSON.stringify(payload) !== initialSignature || pendingFiles.length > 0);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  pendingFilesRef.current = pendingFiles;
  useEffect(() => () => pendingFilesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);

  const visibleReports = useMemo(() => (dashboard?.reports || []).filter((item) => {
    if (filters.vesselId && String(item.vesselId ?? '') !== filters.vesselId) return false;
    if (filters.projectId && String(item.projectId ?? '') !== filters.projectId) return false;
    if (filters.dateFrom && item.reportDate < filters.dateFrom) return false;
    if (filters.dateTo && item.reportDate > filters.dateTo) return false;
    if (filters.search) {
      const haystack = `${reportTitle(item)} ${item.vesselName} ${projectLabel(item)} ${item.issuerName} ${item.description}`.toLowerCase();
      if (!haystack.includes(filters.search.toLowerCase())) return false;
    }
    return true;
  }), [dashboard, filters]);

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

  const openNew = () => {
    const next = cloneEmptyPayload();
    next.reportDate = new Date().toISOString().slice(0, 10);
    setReport(null); setPayload(next); setFiles([]); setPendingFiles([]); setStep(0);
    setInitialSignature(JSON.stringify(next)); setModalOpen(true); setError(''); setNotice('');
  };

  const openReport = async (item: DprReportRecord) => {
    setBusy(true); setError('');
    try {
      const detail = await fetchDprDetail(db, item);
      setReport(item); setPayload(detail.payload); setFiles(detail.files); setPendingFiles([]); setStep(0);
      setInitialSignature(JSON.stringify(detail.payload)); setModalOpen(true);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
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

  const save = async (submit = false): Promise<number | null> => {
    const validationErrors = validateDprPayload(payload, submit);
    if (validationErrors.length) { setError(validationErrors.join(' ')); return null; }
    setBusy(true); setError('');
    try {
      const id = await saveDprPayload(db, report?.id || null, payload);
      await uploadPending(id);
      if (submit) await runDprTransition(db, 'submit', id);
      const nextDashboard = await load();
      const nextReport = nextDashboard.reports.find((item) => item.id === id) || null;
      setReport(nextReport); setInitialSignature(JSON.stringify(payload));
      setNotice(submit ? 'DPR soumis avec succès.' : 'Brouillon enregistré.');
      if (submit && nextReport && canValidate(currentRoles)) await createAndStorePdf(nextReport, nextDashboard.references);
      return id;
    } catch (reason) { setError((reason as Error).message); return null; }
    finally { setBusy(false); }
  };

  const createAndStorePdf = async (target: DprReportRecord, references: DprReferenceData) => {
    const detail = await fetchDprDetail(db, target);
    const generated = await generateDprPdf(target, detail.payload, references);
    await uploadDprFile(db, target.id, 'pdf', generated.blob, generated.filename);
    await load();
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
      if (action === 'validate' && nextReport) await createAndStorePdf(nextReport, nextDashboard.references);
      setNotice(action === 'validate' ? 'DPR validé et PDF enregistré.' : action === 'reopen' ? 'Nouvelle version réouverte.' : 'DPR supprimé logiquement.');
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

  const downloadSelectedPdf = async () => {
    const target = dashboard?.reports.find((item) => selectedIds.includes(item.id));
    const pdf = target?.files.find((item) => item.kind === 'pdf' && item.isCurrent) || target?.files.find((item) => item.kind === 'pdf');
    if (!pdf) { setError('Sélectionnez un DPR possédant un PDF.'); return; }
    await previewFile(pdf);
  };

  const showDiagnostic = async () => {
    setBusy(true); setError('');
    try {
      const diagnostic = await fetchDprDiagnostic(db);
      setNotice(`Diagnostic Supabase — ${Object.entries(diagnostic).map(([key, value]) => `${key}: ${value}`).join(' · ')}`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const editable = canEdit(report, currentRoles, dashboard?.currentUserId || null);
  const updatePayload = (recipe: (current: DprFormPayload) => void) => setPayload((current) => { const next = structuredClone(current); recipe(next); return next; });

  return <section className="dpr-native" aria-busy={loading || busy}>
    <header className="dpr-native__header">
      <div><span className="dpr-native__eyebrow">QHSE</span><h1>Daily Progress Report</h1><p>Données, workflow et PDF centralisés dans Supabase. SharePoint reste actif pendant la bascule.</p></div>
      <div className="dpr-native__actions">
        <button className="button button--primary" onClick={openNew}><Plus size={17}/> Saisir un DPR</button>
        <button className="button" onClick={() => void load()} disabled={busy}><RefreshCw size={16}/> Actualiser</button>
        {currentRoles.includes('admin') && <button className="button" onClick={() => void showDiagnostic()}><ShieldCheck size={16}/> Diagnostic</button>}
        <button className="button" onClick={() => void downloadSelectedPdf()} disabled={!selectedIds.length}><Download size={16}/> Télécharger le PDF</button>
      </div>
    </header>

    {(notice || error) && <div className={error ? 'dpr-message dpr-message--error' : 'dpr-message'}>{error || notice}</div>}

    <div className="dpr-native__filters">
      <Field label="NAVIRE"><select value={filters.vesselId} onChange={(event) => setFilters({ ...filters, vesselId: event.target.value })}><option value="">Tous</option>{dashboard?.references.vessels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="PROJET"><select value={filters.projectId} onChange={(event) => setFilters({ ...filters, projectId: event.target.value })}><option value="">Tous</option>{dashboard?.references.projects.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.title}</option>)}</select></Field>
      <Field label="PÉRIODE"><div className="dpr-period"><input aria-label="Date de début" type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })}/><input aria-label="Date de fin" type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })}/></div></Field>
      <Field label="RECHERCHE"><div className="dpr-search"><Search size={15}/><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="DPR, rédacteur…"/></div></Field>
      <button className="button" onClick={() => setFilters(EMPTY_FILTERS)}>Réinitialiser</button>
      <strong>{visibleReports.length} DPR affiché(s)</strong>
    </div>

    <div className="dpr-native__list">
      {loading && <p>Chargement des DPR Supabase…</p>}
      {!loading && !visibleReports.length && <div className="dpr-empty"><FolderOpen/><h2>Aucun DPR</h2><p>Aucun rapport ne correspond aux filtres.</p></div>}
      {[...groups.entries()].map(([vessel, projects]) => <section className="dpr-group" key={vessel}>
        <header><span><Ship size={17}/> {vessel}</span><small>{[...projects.values()].reduce((sum, items) => sum + items.length, 0)} DPR</small></header>
        {[...projects.entries()].map(([project, items]) => <div className="dpr-project" key={project}>
          <div className="dpr-project__title"><FolderOpen size={16}/><strong>{project}</strong><span>{items.length} enregistrement(s)</span></div>
          {items.map((item) => <article className="dpr-row" key={item.id}>
            <input aria-label={`Sélectionner ${reportTitle(item)}`} type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}/>
            <button className="dpr-row__open" onClick={() => void openReport(item)}>{canEdit(item, currentRoles, dashboard?.currentUserId || null) ? 'Modifier' : 'Consulter'}</button>
            <strong>{reportTitle(item)}</strong><span><small>DATE DU DPR</small>{formatDate(item.reportDate)}</span><span><small>RÉDACTEUR</small>{item.issuerName || '-'}</span><span><small>FUEL CONSOMMÉ</small>{item.fuelConsumedLiters.toLocaleString('fr-FR')} L</span>
            <span className={`dpr-status dpr-status--${item.status}`}>{STATUS_LABELS[item.status]}</span>
          </article>)}
        </div>)}
      </section>)}
    </div>

    {modalOpen && dashboard && <div className="dpr-modal" role="dialog" aria-modal="true" aria-label="Saisie Daily Progress Report">
      <div className="dpr-modal__panel">
        <header className="dpr-modal__header"><div><small>SAISIE</small><h2>Daily Progress Report</h2></div><button aria-label="Fermer" onClick={closeModal}><X/></button></header>
        <div className="dpr-modal__body">
          <nav className="dpr-steps" aria-label="Étapes du DPR"><span>ASSISTANT</span><h3>DPR</h3>{STEPS.map(([title, subtitle], index) => <button key={title} className={step === index ? 'active' : ''} onClick={() => setStep(index)}><b>{index + 1}</b><span><strong>{title}</strong><small>{subtitle}</small></span><ChevronRight size={15}/></button>)}</nav>
          <main className="dpr-step">
            <div className="dpr-step__title"><b>{step + 1}.</b><h3>{STEPS[step][0]}</h3><span>— {STEPS[step][1]}</span></div>
            {step === 0 && <StepProject payload={payload} references={dashboard.references} issuer={report?.issuerName || dashboard.currentUserName} editable={editable} update={updatePayload}/>}
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
          {editable && <button className="button" onClick={() => void save(false)} disabled={busy}><Save size={16}/> Enregistrer le brouillon</button>}
          {editable && <button className="button button--primary" onClick={() => void save(true)} disabled={busy}><Check size={16}/> Soumettre le DPR</button>}
          {report?.status === 'submitted' && canValidate(currentRoles) && <button className="button button--primary" onClick={() => void transition('validate')} disabled={busy}><ShieldCheck size={16}/> Valider</button>}
          {report?.status === 'validated' && canValidate(currentRoles) && <button className="button" onClick={() => void transition('reopen')} disabled={busy}>Réouvrir</button>}
          {report && hasOfficeRole(currentRoles) && <button className="button button--danger" onClick={() => void transition('delete')} disabled={busy}><Trash2 size={16}/> Supprimer</button>}
        </footer>
      </div>
    </div>}
  </section>;
}

interface StepProps { payload: DprFormPayload; editable: boolean; update: (recipe: (current: DprFormPayload) => void) => void }

function StepProject({ payload, references, issuer, editable, update }: StepProps & { references: DprReferenceData; issuer: string }) {
  const [otherName, setOtherName] = useState('');
  const toggleCrew = (personId: number) => update((current) => {
    const person = references.people.find((item) => item.id === personId)!;
    const existing = current.crewMembers.findIndex((item) => item.personId === personId);
    if (existing >= 0) current.crewMembers.splice(existing, 1);
    else current.crewMembers.push({ personId, crewFunction: person.crewFunction, rosterGroup: '', displayName: person.name, displayOrder: current.crewMembers.length });
  });
  return <div className="dpr-cards">
    <section className="dpr-card"><h4><b>1</b> Projet</h4><div className="dpr-form-grid">
      <Field label="DATE"><input type="date" disabled={!editable} value={payload.reportDate} onChange={(event) => update((current) => { current.reportDate = event.target.value; })}/></Field>
      <Field label="PROJET"><select disabled={!editable} value={payload.projectId ?? ''} onChange={(event) => update((current) => { current.projectId = event.target.value ? Number(event.target.value) : null; if (current.projectId) current.unlistedProjectName = ''; })}><option value="">Sélectionner…</option>{references.projects.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.title}</option>)}</select></Field>
      <Field label="PROJET NON RÉFÉRENCÉ"><input disabled={!editable || payload.projectId !== null} value={payload.unlistedProjectName} onChange={(event) => update((current) => { current.unlistedProjectName = event.target.value; })}/></Field>
      <Field label="NAVIRE"><select disabled={!editable} value={payload.vesselId ?? ''} onChange={(event) => update((current) => { current.vesselId = event.target.value ? Number(event.target.value) : null; })}><option value="">Sélectionner…</option>{references.vessels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="ÉMETTEUR"><input value={issuer} disabled/></Field>
    </div></section>
    <section className="dpr-card"><h4><b>2</b> Personnel embarqué</h4>{(Object.keys(CREW_LABELS) as CrewFunction[]).map((role) => <div className="dpr-people" key={role}><strong>{CREW_LABELS[role]}</strong><div>{references.people.filter((person) => person.crewFunction === role).map((person) => <label key={person.id}><input type="checkbox" disabled={!editable} checked={payload.crewMembers.some((item) => item.personId === person.id)} onChange={() => toggleCrew(person.id)}/>{person.name}</label>)}</div></div>)}
      <div className="dpr-people"><strong>Autres personnes</strong><div>{payload.otherPeople.map((person, index) => <label key={`${person.personId ?? 'free'}-${index}`}><input type="checkbox" disabled={!editable} checked onChange={() => update((current) => { current.otherPeople.splice(index, 1); })}/>{person.displayName}</label>)}</div>{editable && <div className="dpr-inline-add"><input aria-label="Ajouter une autre personne" value={otherName} onChange={(event) => setOtherName(event.target.value)} placeholder="Prénom et nom"/><button type="button" className="button" onClick={() => { const name = otherName.trim(); if (!name) return; update((current) => { current.otherPeople.push({ personId: null, displayName: name, displayOrder: current.otherPeople.length }); }); setOtherName(''); }}><Plus size={15}/> Ajouter</button></div>}</div>
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
  return <div className="dpr-cards"><section className="dpr-card"><h4>Date et heure de l'Escale</h4><div className="dpr-form-grid"><Field label="PORT"><input disabled={!editable} value={call.portName} onChange={(event) => update((current) => { current.portCalls[0].portName = event.target.value; })}/></Field><Field label="HEURE - NAVIRE ACCOSTÉ AU PORT"><input type="datetime-local" disabled={!editable} value={call.arrivalAt} onChange={(event) => update((current) => { current.portCalls[0].arrivalAt = event.target.value; })}/></Field><Field label="HEURE - APPAREILLAGE DU PORT"><input type="datetime-local" disabled={!editable} value={call.departureAt} onChange={(event) => update((current) => { current.portCalls[0].departureAt = event.target.value; })}/></Field></div><div className="dpr-choice-grid">{references.portReasons.map((reason) => <label key={reason.key}><input type="checkbox" disabled={!editable} checked={call.reasons.includes(reason.key)} onChange={(event) => update((current) => { const reasons = current.portCalls[0].reasons; current.portCalls[0].reasons = event.target.checked ? [...reasons, reason.key] : reasons.filter((key) => key !== reason.key); })}/>{reason.label}</label>)}</div></section>
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
