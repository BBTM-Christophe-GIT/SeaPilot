import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ClipboardCheck, Copy, FileText, ListChecks, LockKeyhole, Pencil, Plus, RotateCcw, Save, Search, Ship, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AppDialog } from '../../components/AppDialog';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  annualAuditWindow, blankAuditAnswers, compareAuditScores, completionIssues, findingIssues, plannedAuditDateIssues, planningStatus, scoreAudit,
  type AuditAnswer, type AuditAnswerValue, type AuditAssigneeRole, type AuditFinding, type AuditFindingSeverity,
  type AuditFindingStatus, type AuditQuestion, type AuditSite, type AuditTemplate, type InternalAudit,
} from './internalAuditModel';
import {
  addAuditFindingTreatment, fetchInternalAuditData, saveAuditFinding, saveAuditSite, saveAuditTemplate,
  saveInternalAudit, type InternalAuditData,
} from './internalAuditQueries';
import { createInternalAuditPreviewData } from './internalAuditPreview';
import './internalAudits.css';

type Tab = 'planning' | 'templates' | 'grid' | 'findings' | 'chart';
const TABS: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'planning', label: 'Planning', icon: CalendarDays }, { id: 'templates', label: 'Grilles', icon: FileText },
  { id: 'grid', label: 'Grille d’audit', icon: ClipboardCheck }, { id: 'findings', label: 'Synthèse', icon: ListChecks },
  { id: 'chart', label: 'Graphique', icon: BarChart3 },
];
const ANSWERS: { value: AuditAnswerValue; label: string; hint: string }[] = [
  { value: 'conforme', label: 'Conforme', hint: '100 % du barème' },
  { value: 'incomplet', label: 'Incomplet', hint: '50 % du barème' },
  { value: 'non_conforme', label: 'Non Conforme', hint: '0 point' },
  { value: 'na', label: 'N/A', hint: 'Hors calcul' },
];
const SEVERITIES: Record<AuditFindingSeverity, string> = { major: 'Non conformité majeure', minor: 'Non conformité mineure', remark: 'Remarque' };
const FINDING_STATUSES: Record<AuditFindingStatus, string> = { open: 'Ouvert', in_progress: 'En traitement', resolved: 'Traité · à valider', closed: 'Clôturé' };
const AUDIT_STATUSES = { planned: 'Planifié', in_progress: 'En cours', completed: 'Réalisé' };
const PLANNING_STATUSES = { unscheduled: 'À planifier', upcoming: 'À venir', window: 'Fenêtre ouverte', overdue: 'En retard', in_progress: 'En cours', completed: 'Réalisé' };
const ROLE_LABELS: Record<AuditAssigneeRole, string> = { captain: 'Capitaines', chief_engineer: 'Chefs Mécaniciens', crew: 'Équipage' };

function today(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function dateLabel(value: string | null): string {
  if (!value) return 'Non définie';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'Non définie' : new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
function percent(value: number | null): string { return value === null ? 'N/A' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)} %`; }
function newQuestion(section = ''): AuditQuestion { return { id: crypto.randomUUID(), section: section || 'Nouvelles questions', reference: '', question: '', maxPoints: 3, guidance: '' }; }
function failure(error: unknown): string { return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : 'L’opération n’a pas pu être enregistrée.'; }
function validQuestions(rows: AuditQuestion[]): boolean { return rows.length > 0 && rows.every((row) => row.section.trim() && row.question.trim() && Number.isFinite(row.maxPoints) && row.maxPoints >= 0); }

function QuestionEditor({ row, onChange, onRemove, disabled = false, removeDisabled = false }: { row: AuditQuestion; onChange: (row: AuditQuestion) => void; onRemove: () => void; disabled?: boolean; removeDisabled?: boolean }) {
  const [expanded, setExpanded] = useState(!row.question);
  return <details className="ia-question-editor" onToggle={(event) => setExpanded(event.currentTarget.open)} open={expanded}>
    <summary><span className="ia-reference">{row.reference || 'Nouvelle'}</span><strong>{row.question || 'Renseigner la question'}</strong><span>{row.maxPoints} pts</span><Pencil aria-hidden="true" size={15} /></summary>
    <div className="ia-editor-fields"><label>Chapitre<input disabled={disabled} required value={row.section} onChange={(event) => onChange({ ...row, section: event.target.value })} /></label><label>Référence<input disabled={disabled} value={row.reference} onChange={(event) => onChange({ ...row, reference: event.target.value })} /></label><label>Barème maximum<input disabled={disabled} min="0" step="0.5" required type="number" value={row.maxPoints} onChange={(event) => onChange({ ...row, maxPoints: Number(event.target.value) })} /></label><label className="ia-full">Question<textarea disabled={disabled} required rows={2} value={row.question} onChange={(event) => onChange({ ...row, question: event.target.value })} /></label><label className="ia-full">Consignes / éléments à vérifier<textarea disabled={disabled} rows={2} value={row.guidance} onChange={(event) => onChange({ ...row, guidance: event.target.value })} /></label>{!disabled ? <button className="ia-text-danger" disabled={removeDisabled} onClick={onRemove} title={removeDisabled ? 'Cette ligne est liée à un écart et doit être conservée.' : undefined} type="button"><Trash2 size={15} />Supprimer cette ligne</button> : null}</div>
  </details>;
}

export function InternalAuditsPage() {
  const context = useOutletContext<AppShellOutletContext>();
  const [data, setData] = useState<InternalAuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<Tab>('planning');
  const [year, setYear] = useState(Number(today().slice(0, 4)));
  const [auditId, setAuditId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [draftAudit, setDraftAudit] = useState<InternalAudit | null>(null);
  const [draftTemplate, setDraftTemplate] = useState<AuditTemplate | null>(null);
  const [auditDirty, setAuditDirty] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [section, setSection] = useState('');
  const [search, setSearch] = useState('');
  const [findingFilter, setFindingFilter] = useState('');
  const [newAuditSite, setNewAuditSite] = useState<AuditSite | null>(null);
  const [newAuditForm, setNewAuditForm] = useState({ templateId: '', plannedOn: '', year: '', auditorName: '' });
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateForm, setDuplicateForm] = useState({ name: '', siteId: '' });
  const [siteEditor, setSiteEditor] = useState<AuditSite | null>(null);
  const [findingRow, setFindingRow] = useState<AuditAnswer | null>(null);
  const [findingForm, setFindingForm] = useState({ severity: 'minor' as AuditFindingSeverity, description: '', target: '', dueOn: '' });
  const [treatmentFinding, setTreatmentFinding] = useState<AuditFinding | null>(null);
  const [treatmentForm, setTreatmentForm] = useState({ status: 'in_progress' as AuditFindingStatus, treatment: '' });
  const [completeOpen, setCompleteOpen] = useState(false);
  const canManage = Boolean(data?.permissions.canManage);
  const hasUnsavedChanges = auditDirty || templateDirty;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = context.previewMode ? createInternalAuditPreviewData() : await fetchInternalAuditData(context.client);
      if (context.previewMode) result.permissions.canManage = context.roles.some((role) => ['admin', 'direction', 'armement'].includes(role));
      setData(result);
      setAuditId((current) => current || [...result.audits].sort((a, b) => b.year - a.year)[0]?.id || '');
      setTemplateId((current) => current || result.templates[0]?.id || '');
    } catch (cause) { setError(failure(cause)); } finally { setLoading(false); }
  }, [context.client, context.previewMode, context.roles]);
  useEffect(() => { void load(); }, [load]);

  const selectedAudit = data?.audits.find((audit) => audit.id === auditId) || null;
  const selectedTemplate = data?.templates.find((template) => template.id === templateId) || null;
  useEffect(() => { setDraftAudit(selectedAudit ? structuredClone(selectedAudit) : null); setAuditDirty(false); setSection(''); }, [selectedAudit]);
  useEffect(() => { setDraftTemplate(selectedTemplate ? structuredClone(selectedTemplate) : null); setTemplateDirty(false); }, [selectedTemplate]);
  const currentSite = data?.sites.find((site) => site.id === draftAudit?.siteId) || null;
  const score = scoreAudit(draftAudit?.rows || []);
  const sections = [...new Set(draftAudit?.rows.map((row) => row.section) || [])];
  const editable = canManage && Boolean(draftAudit && draftAudit.status !== 'completed');
  const visibleRows = draftAudit?.rows.filter((row) => (!section || row.section === section) && (!search.trim() || `${row.reference} ${row.question} ${row.section}`.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr')))) || [];
  const findings = (data?.findings || []).filter((finding) => (!auditId || finding.auditId === auditId) && (!findingFilter || (findingFilter === 'pending' ? finding.status !== 'closed' : finding.severity === findingFilter)));
  const allFindingsForAudit = data?.findings.filter((finding) => finding.auditId === auditId) || [];
  const comparison = useMemo(() => draftAudit && data ? compareAuditScores(draftAudit, data.audits) : null, [draftAudit, data]);
  const pendingCount = (data?.findings || []).filter((finding) => finding.status !== 'closed').length;

  async function mutate(action: () => Promise<void>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); } catch (cause) { setError(failure(cause)); } finally { setBusy(false); }
  }
  async function refresh() { if (!context.previewMode) setData(await fetchInternalAuditData(context.client)); }
  async function persistAudit(audit: InternalAudit) {
    const site = data?.sites.find((item) => item.id === audit.siteId);
    const dateIssues = site ? plannedAuditDateIssues(site, audit) : [];
    if (dateIssues.length) throw new Error(dateIssues.join(' '));
    if (context.previewMode) setData((current) => current ? { ...current, sites: current.sites.map((item) => item.id === audit.siteId && !item.anniversaryOn ? { ...item, anniversaryOn: audit.plannedOn } : item), audits: [...current.audits.filter((item) => item.id !== audit.id), structuredClone(audit)] } : current);
    else { await saveInternalAudit(context.client, audit); await refresh(); }
    setAuditDirty(false);
  }
  function editAudit(patch: Partial<InternalAudit>) { setDraftAudit((current) => current ? { ...current, ...patch } : null); setAuditDirty(true); }
  function editAnswer(rowId: string, patch: Partial<AuditAnswer>) {
    setDraftAudit((current) => current ? { ...current, rows: current.rows.map((row) => row.id === rowId ? { ...row, ...patch } : row), status: 'in_progress' } : null);
    setAuditDirty(true);
  }
  function editTemplate(patch: Partial<AuditTemplate>) { setDraftTemplate((current) => current ? { ...current, ...patch } : null); setTemplateDirty(true); }
  function openNewAudit(site: AuditSite) {
    if (!data || hasUnsavedChanges || busy) return;
    const existing = data.audits.filter((audit) => audit.siteId === site.id).sort((a, b) => b.year - a.year);
    const target = planningStatus(site, existing, today()).targetOn;
    const proposedYear = existing.some((audit) => audit.year === year) ? Math.max(year + 1, (existing[0]?.year || year) + 1) : year;
    const targetDate = annualAuditWindow(site, proposedYear, target || `${proposedYear}${today().slice(4)}`).targetOn;
    setNewAuditForm({ templateId: data.templates.find((template) => template.active && template.siteId === site.id)?.id || data.templates.find((template) => template.active && !template.siteId)?.id || '', year: String(proposedYear), plannedOn: targetDate, auditorName: context.currentPerson ? `${context.currentPerson.firstName} ${context.currentPerson.lastName}` : '' });
    setNewAuditSite(site);
  }
  async function createAudit(event: FormEvent) {
    event.preventDefault();
    const template = data?.templates.find((item) => item.id === newAuditForm.templateId);
    if (!data || !template || !newAuditSite) return;
    if (data.audits.some((audit) => audit.siteId === newAuditSite.id && audit.year === Number(newAuditForm.year))) { setError('Un audit existe déjà pour ce site et cette année.'); return; }
    const audit: InternalAudit = { id: crypto.randomUUID(), companyId: data.companyId, siteId: newAuditSite.id, templateId: template.id, templateName: template.name, templateVersion: template.version, year: Number(newAuditForm.year), plannedOn: newAuditForm.plannedOn, performedOn: null, auditorName: newAuditForm.auditorName.trim(), status: 'planned', rows: blankAuditAnswers(template.rows), completedAt: null };
    await mutate(async () => { await persistAudit(audit); setAuditId(audit.id); setNewAuditSite(null); setTab('grid'); }, 'Audit planifié. Sa grille est prête à être renseignée.');
  }
  async function saveTemplate(event?: FormEvent) {
    event?.preventDefault();
    if (!draftTemplate || !data) return;
    if (!draftTemplate.name.trim() || !validQuestions(draftTemplate.rows)) { setError('Chaque ligne doit comporter un chapitre, une question et un barème positif ou nul.'); return; }
    await mutate(async () => {
      const template = { ...draftTemplate, name: draftTemplate.name.trim() };
      if (context.previewMode) setData((current) => current ? { ...current, templates: current.templates.map((item) => item.id === template.id ? { ...template, version: template.version + 1 } : item) } : current);
      else { await saveAuditTemplate(context.client, template); await refresh(); }
      setTemplateDirty(false);
    }, 'Grille enregistrée. Elle sera utilisée pour les prochains audits.');
  }
  async function duplicateTemplate(event: FormEvent) {
    event.preventDefault();
    if (!draftTemplate || !data) return;
    const template = { ...structuredClone(draftTemplate), id: crypto.randomUUID(), name: duplicateForm.name.trim(), siteId: duplicateForm.siteId || null, version: 1, rows: draftTemplate.rows.map((row) => ({ ...row, id: crypto.randomUUID() })) };
    await mutate(async () => {
      if (context.previewMode) setData((current) => current ? { ...current, templates: [...current.templates, template] } : current);
      else { await saveAuditTemplate(context.client, template); await refresh(); }
      setTemplateId(template.id); setDuplicateOpen(false);
    }, 'Grille personnalisée créée. Vous pouvez adapter ses questions.');
  }
  async function saveDraft() {
    if (!draftAudit) return;
    if (!validQuestions(draftAudit.rows)) { setError('Renseignez le chapitre, la question et un barème positif ou nul pour chaque ligne.'); return; }
    await mutate(() => persistAudit(draftAudit), 'Réponses et observations enregistrées.');
  }
  async function emitFinding(event: FormEvent) {
    event.preventDefault();
    if (!data || !draftAudit || !findingRow || !findingForm.target) return;
    const [kind, rawId, rawVesselId] = findingForm.target.split(':');
    const role = kind === 'role' ? rawId as AuditAssigneeRole : null;
    const person = kind === 'person' ? data.people.find((item) => item.id === Number(rawId)) : null;
    const responsibleSite = role ? data.sites.find((site) => site.vesselId === Number(rawVesselId)) : null;
    if (!person && (!role || !responsibleSite?.vesselId)) { setError('Désignez une personne ou une fonction associée à un navire.'); return; }
    if (!findingForm.description.trim()) { setError('Décrivez l’écart constaté.'); return; }
    const finding: AuditFinding = { id: crypto.randomUUID(), companyId: data.companyId, auditId: draftAudit.id, questionId: findingRow.id, reference: findingRow.reference, severity: findingForm.severity, description: findingForm.description.trim(), assigneePersonId: person?.id || null, assigneeRole: role, assigneeVesselId: responsibleSite?.vesselId || null, assigneeLabel: person?.name || `${ROLE_LABELS[role!]} ${responsibleSite?.name}`, dueOn: findingForm.dueOn, status: 'open', treatment: '', resolvedAt: null, closedAt: null };
    const issues = findingIssues(finding);
    if (issues.length) { setError(issues.join(' ')); return; }
    await mutate(async () => {
      if (auditDirty) await persistAudit(draftAudit);
      if (context.previewMode) setData((current) => current ? { ...current, findings: [...current.findings, finding] } : current);
      else { await saveAuditFinding(context.client, finding); await refresh(); }
      setFindingRow(null);
    }, 'Écart émis et affecté au responsable de traitement.');
  }
  async function saveTreatment(event: FormEvent) {
    event.preventDefault();
    if (!treatmentFinding || !treatmentForm.treatment.trim()) return;
    await mutate(async () => {
      if (context.previewMode) {
        const now = new Date().toISOString();
        setData((current) => current ? { ...current, findings: current.findings.map((finding) => finding.id === treatmentFinding.id ? { ...finding, status: treatmentForm.status, treatment: treatmentForm.treatment.trim(), resolvedAt: treatmentForm.status === 'resolved' ? now : finding.resolvedAt, closedAt: treatmentForm.status === 'closed' ? now : null } : finding), events: [...current.events, { id: crypto.randomUUID(), findingId: treatmentFinding.id, actorId: null, actorName: context.currentPerson ? `${context.currentPerson.firstName} ${context.currentPerson.lastName}` : 'Utilisateur de démonstration', createdAt: now, status: treatmentForm.status, treatment: treatmentForm.treatment.trim() }] } : current);
      } else { await addAuditFindingTreatment(context.client, treatmentFinding.id, treatmentForm.status, treatmentForm.treatment.trim()); await refresh(); }
      setTreatmentFinding(null);
    }, 'Traitement enregistré dans l’historique de l’écart.');
  }

  if (loading) return <div className="ia-state" role="status">Chargement des audits internes…</div>;
  if (!data) return <div className="ia-state"><p role="alert">{error || 'Les audits ne sont pas disponibles.'}</p><button onClick={() => void load()} type="button">Réessayer</button></div>;

  return <section className="internal-audits-page">
    <header className="ia-page-header"><div><p className="ia-eyebrow">Audits</p><h1>Audit ISM Interne</h1><p>Planifier les audits, évaluer la conformité et suivre chaque écart.</p></div><div className="ia-header-note"><CalendarDays size={20} /><span><strong>Périodicité annuelle</strong>Fenêtre de ± 3 mois calendaires</span></div></header>
    {error ? <p className="ia-alert is-error" role="alert"><AlertTriangle size={17} />{error}</p> : null}
    {message ? <p className="ia-alert is-success" role="status"><CheckCircle2 size={17} />{message}</p> : null}
    {hasUnsavedChanges ? <p className="ia-unsaved-notice" role="status"><Save aria-hidden="true" size={17} />{templateDirty ? 'Grille non enregistrée : enregistrez-la ou annulez les modifications avant de changer de grille ou d’onglet.' : 'Réponses non enregistrées : enregistrez-les ou annulez les modifications avant de changer d’audit ou d’onglet.'}</p> : null}
    <nav className="ia-tabs" aria-label="Onglets des audits internes">{TABS.map(({ id, label, icon: Icon }) => <button aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'is-active' : ''} disabled={busy || (hasUnsavedChanges && tab !== id)} key={id} onClick={() => setTab(id)} type="button"><Icon size={17} />{label}{id === 'findings' && pendingCount ? <span>{pendingCount}</span> : null}</button>)}</nav>

    {tab === 'planning' ? <section className="ia-panel"><header className="ia-panel-header"><div><h2>Planning d’audit</h2><p>Une campagne par site et par année. La fenêtre suit la date anniversaire.</p></div><label className="ia-compact-field">Année<input aria-label="Année du planning" max="2200" min="2000" onChange={(event) => setYear(Number(event.target.value))} type="number" value={year} /></label></header><div className="ia-planning-list"><div className="ia-planning-labels" aria-hidden="true"><span>Site / Navire</span><span>Date cible</span><span>Fenêtre autorisée</span><span>Avancement</span><span>Action</span></div>{data.sites.map((site) => {
      const annualAudit = data.audits.find((audit) => audit.siteId === site.id && audit.year === year);
      const fallbackDate = data.audits.find((audit) => audit.siteId === site.id)?.plannedOn || '';
      const window = annualAuditWindow(site, year, annualAudit?.plannedOn || fallbackDate);
      const status = annualAudit?.status === 'completed' ? 'completed' : !window.targetOn ? 'unscheduled' : today() > window.closesOn ? 'overdue' : annualAudit?.status === 'in_progress' ? 'in_progress' : today() >= window.opensOn ? 'window' : 'upcoming';
      return <article className="ia-planning-row" key={site.id}><div className="ia-site-name"><span className="ia-site-icon">{site.kind === 'vessel' ? <Ship size={18} /> : <CalendarDays size={18} />}</span><span><strong>{site.name}</strong><small>{site.kind === 'vessel' ? 'Navire' : 'Site à terre'}{annualAudit ? ` · Audit ${annualAudit.year}` : ''}</small></span></div><div><small className="ia-mobile-label">Date cible</small><strong>{dateLabel(window.targetOn)}</strong>{canManage ? <button aria-label={`Modifier la date anniversaire de ${site.name}`} className="ia-icon-button" onClick={() => setSiteEditor({ ...site, anniversaryOn: site.anniversaryOn || window.targetOn || '' })} title="Date anniversaire annuelle" type="button"><Pencil size={13} /></button> : null}</div><div><small className="ia-mobile-label">Fenêtre autorisée</small><span>{window.opensOn && window.closesOn ? `${dateLabel(window.opensOn)} → ${dateLabel(window.closesOn)}` : 'Définir la date anniversaire'}</span></div><div><span className={`ia-badge is-${status}`}>{PLANNING_STATUSES[status]}</span>{annualAudit ? <small>{scoreAudit(annualAudit.rows).answeredCount} / {annualAudit.rows.length} réponses</small> : <small>Aucun audit {year}</small>}</div><div className="ia-row-actions">{annualAudit ? <button className="is-secondary" disabled={busy || hasUnsavedChanges} onClick={() => { setAuditId(annualAudit.id); setTab('grid'); }} type="button">Ouvrir</button> : null}{canManage ? <button aria-label={`Planifier ${site.name}`} className={annualAudit ? 'ia-icon-button' : 'is-secondary'} disabled={busy || hasUnsavedChanges} onClick={() => openNewAudit(site)} type="button"><Plus size={15} />{annualAudit ? '' : 'Planifier'}</button> : null}</div></article>;
    })}</div></section> : null}

    {tab === 'templates' ? <section className="ia-panel"><header className="ia-panel-header"><div><h2>Grilles de référence</h2><p>Adaptez les questions par navire. Chaque audit conserve sa propre copie.</p></div>{canManage && draftTemplate ? <button className="is-secondary" disabled={busy || templateDirty} onClick={() => { setDuplicateForm({ name: '', siteId: '' }); setDuplicateOpen(true); }} type="button"><Copy size={16} />Créer une grille personnalisée</button> : null}</header><div className="ia-template-layout"><aside className="ia-template-list" aria-label="Grilles disponibles">{data.templates.filter((item) => item.active).map((template) => <button aria-pressed={templateId === template.id} disabled={hasUnsavedChanges || busy} key={template.id} onClick={() => setTemplateId(template.id)} type="button"><FileText size={17} /><span><strong>{template.name}</strong><small>{data.sites.find((site) => site.id === template.siteId)?.name || 'Commune à tous les sites'} · {template.rows.length} questions</small></span></button>)}</aside>{draftTemplate ? <form className="ia-template-workspace" onSubmit={(event) => void saveTemplate(event)}><div className="ia-template-metadata"><label>Nom de la grille<input disabled={!canManage || busy} required onChange={(event) => editTemplate({ name: event.target.value })} value={draftTemplate.name} /></label><span className="ia-badge">Version {draftTemplate.version}</span></div><div className="ia-question-list">{draftTemplate.rows.map((row) => <QuestionEditor disabled={!canManage || busy} key={row.id} onChange={(edited) => editTemplate({ rows: draftTemplate.rows.map((item) => item.id === row.id ? edited : item) })} onRemove={() => editTemplate({ rows: draftTemplate.rows.filter((item) => item.id !== row.id) })} row={row} />)}</div>{canManage ? <footer className="ia-save-actions"><button className="is-secondary" disabled={busy} onClick={() => editTemplate({ rows: [...draftTemplate.rows, newQuestion(draftTemplate.rows.at(-1)?.section)] })} type="button"><Plus size={16} />Ajouter une ligne à la grille</button>{templateDirty ? <button className="is-secondary" disabled={busy} onClick={() => { setDraftTemplate(selectedTemplate ? structuredClone(selectedTemplate) : null); setTemplateDirty(false); }} type="button"><RotateCcw size={15} />Annuler les modifications</button> : null}<button disabled={!templateDirty || busy} type="submit"><Save size={16} />{busy ? 'Enregistrement…' : 'Enregistrer la grille'}</button></footer> : null}</form> : <EmptyState label="Aucune grille disponible" />}</div></section> : null}

    {(['grid', 'findings', 'chart'] as Tab[]).includes(tab) ? <div className="ia-audit-selector"><label>Audit sélectionné<select disabled={hasUnsavedChanges || busy} onChange={(event) => setAuditId(event.target.value)} value={auditId}>{!data.audits.length ? <option value="">Aucun audit</option> : null}{[...data.audits].sort((a, b) => b.year - a.year || a.plannedOn.localeCompare(b.plannedOn)).map((audit) => <option key={audit.id} value={audit.id}>{data.sites.find((site) => site.id === audit.siteId)?.name} · {audit.year} · {AUDIT_STATUSES[audit.status]}</option>)}</select></label>{draftAudit ? <span className={`ia-badge is-${draftAudit.status}`}>{AUDIT_STATUSES[draftAudit.status]}</span> : null}{auditDirty ? <span className="ia-unsaved">Modifications non enregistrées</span> : null}</div> : null}

    {tab === 'grid' ? draftAudit ? <section className="ia-panel"><header className="ia-audit-header"><div><h2>{currentSite?.name} · {draftAudit.year}</h2><p>{draftAudit.templateName} · Version {draftAudit.templateVersion}</p>{draftAudit.status === 'completed' ? <span className="ia-locked"><LockKeyhole size={14} />Réponses conservées · audit réalisé le {dateLabel(draftAudit.performedOn)}</span> : null}</div><div className="ia-score-summary"><strong>{percent(score.percentage)}</strong><span>{score.earnedPoints} / {score.maxPoints} points · {score.answeredCount} / {score.totalCount} réponses</span><div className="ia-progress-track"><span style={{ width: `${score.percentage || 0}%` }} /></div></div></header><div className="ia-audit-metadata"><label>Date planifiée<input disabled={!canManage || draftAudit.status !== 'planned' || busy} onChange={(event) => editAudit({ plannedOn: event.target.value })} required type="date" value={draftAudit.plannedOn} /></label><label>Date de réalisation<input disabled={!editable || busy} onChange={(event) => editAudit({ performedOn: event.target.value || null })} type="date" value={draftAudit.performedOn || ''} /></label><label>Auditeur<input disabled={!editable || busy} onChange={(event) => editAudit({ auditorName: event.target.value })} value={draftAudit.auditorName} /></label></div><div className="ia-grid-tools"><label><span>Chapitre</span><select onChange={(event) => setSection(event.target.value)} value={section}><option value="">Tous les chapitres</option>{sections.map((name) => <option key={name}>{name}</option>)}</select></label><label className="ia-search"><Search size={16} /><input aria-label="Rechercher une question" onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une question…" value={search} /></label><span>{score.excludedCount} N/A · exclus du calcul</span></div><div className="ia-rating-guide">Conforme = barème · Incomplet = moitié du barème · Non Conforme = 0 · N/A = hors calcul</div><div className="ia-audit-questions">{visibleRows.map((row) => {
      const rowFindings = allFindingsForAudit.filter((finding) => finding.questionId === row.id);
      return <article className="ia-audit-question" key={row.id}><header><div><span className="ia-reference">{row.reference || 'Sans référence'}</span><small>{row.section}</small><h3>{row.question || 'Nouvelle question'}</h3></div><span className="ia-question-points">Barème <strong>{row.maxPoints} pts</strong></span></header>{row.guidance ? <details className="ia-guidance"><summary>Éléments à vérifier</summary><p>{row.guidance}</p></details> : null}<fieldset className="ia-rating-options" disabled={!editable || busy}><legend className="ia-sr-only">Réponse {row.reference || row.question}</legend>{ANSWERS.map((option) => <label className={row.answer === option.value ? `is-selected is-${option.value}` : ''} key={option.value}><input checked={row.answer === option.value} name={`answer-${row.id}`} onChange={() => editAnswer(row.id, { answer: option.value })} type="radio" value={option.value} /><strong>{option.label}</strong><small>{option.hint}</small></label>)}</fieldset><div className="ia-observation"><label>Observations · {row.reference || 'question'}<textarea disabled={!editable || busy} onChange={(event) => editAnswer(row.id, { observation: event.target.value })} placeholder="Constats, preuves et commentaires de l’audit…" rows={2} value={row.observation} /></label><div>{rowFindings.length ? <button className="ia-finding-link" disabled={busy || hasUnsavedChanges} onClick={() => setTab('findings')} type="button"><AlertTriangle size={15} />{rowFindings.length} écart{rowFindings.length > 1 ? 's' : ''} émis</button> : null}{canManage ? <button aria-label={`Émettre un écart ${row.reference || row.question}`} className="is-secondary" disabled={busy || !row.question.trim()} onClick={() => { setFindingForm({ severity: 'minor', description: row.observation, target: '', dueOn: '' }); setFindingRow(row); }} type="button"><Plus size={15} />Émettre un écart</button> : null}</div></div>{editable ? <QuestionEditor disabled={busy} removeDisabled={rowFindings.length > 0} onChange={(edited) => editAnswer(row.id, edited)} onRemove={() => { if (rowFindings.length) { setError('Cette ligne est liée à un écart et doit être conservée.'); return; } editAudit({ rows: draftAudit.rows.filter((item) => item.id !== row.id) }); }} row={row} /> : null}</article>;
    })}{!visibleRows.length ? <EmptyState label="Aucune question ne correspond à ce filtre" /> : null}</div>{editable ? <footer className="ia-save-actions ia-audit-save"><button className="is-secondary" disabled={busy} onClick={() => { const row: AuditAnswer = { ...newQuestion(section || draftAudit.rows.at(-1)?.section), answer: null, observation: '' }; editAudit({ rows: [...draftAudit.rows, row] }); setSearch(''); }} type="button"><Plus size={16} />Ajouter une ligne à l’audit</button>{auditDirty ? <button className="is-secondary" disabled={busy} onClick={() => { setDraftAudit(selectedAudit ? structuredClone(selectedAudit) : null); setAuditDirty(false); }} type="button">Annuler</button> : null}<button disabled={!auditDirty || busy} onClick={() => void saveDraft()} type="button"><Save size={16} />Enregistrer les réponses</button><button className="is-secondary" disabled={busy} onClick={() => setCompleteOpen(true)} type="button"><CheckCircle2 size={16} />Finaliser l’audit</button></footer> : null}</section> : <EmptyState label="Planifiez un audit pour commencer à remplir une grille" /> : null}

    {tab === 'findings' ? <section className="ia-panel"><header className="ia-panel-header"><div><h2>Synthèse des écarts</h2><p>Non conformités majeures, mineures et remarques avec leur suivi de traitement.</p></div><label className="ia-compact-field">Afficher<select onChange={(event) => setFindingFilter(event.target.value)} value={findingFilter}><option value="">Tous les écarts</option><option value="pending">À clôturer</option>{Object.entries(SEVERITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></header><div className="ia-findings-list">{findings.map((finding) => {
      const linkedAudit = data.audits.find((audit) => audit.id === finding.auditId);
      const linkedRow = linkedAudit?.rows.find((row) => row.id === finding.questionId);
      const overdue = finding.dueOn < today() && !['resolved', 'closed'].includes(finding.status);
      const events = data.events.filter((event) => event.findingId === finding.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const canTreat = canManage || data.permissions.treatableFindingIds.includes(finding.id);
      return <article className="ia-finding" key={finding.id}><header><div><span className={`ia-badge is-${finding.severity}`}>{SEVERITIES[finding.severity]}</span><span className={`ia-badge is-${finding.status}`}>{FINDING_STATUSES[finding.status]}</span></div><strong>{finding.reference || 'Sans référence'}</strong></header><h3>{finding.description}</h3>{linkedRow ? <p className="ia-finding-question">{linkedRow.section} · {linkedRow.question}</p> : null}<div className="ia-finding-info"><span><small>Responsable de traitement</small><strong>{finding.assigneeLabel}</strong></span><span className={overdue ? 'is-overdue' : ''}><small>Délai de traitement</small><strong>{dateLabel(finding.dueOn)}{overdue ? ' · En retard' : ''}</strong></span>{canTreat ? <button className="is-secondary" disabled={busy} onClick={() => { setTreatmentForm({ status: finding.status === 'open' ? 'in_progress' : finding.status === 'closed' ? 'open' : finding.status, treatment: '' }); setTreatmentFinding(finding); }} type="button"><Pencil size={15} />Suivre le traitement</button> : null}</div>{finding.treatment ? <p className="ia-treatment-note"><strong>Dernier traitement</strong>{finding.treatment}</p> : null}<details className="ia-finding-history"><summary>Historique du traitement ({events.length})</summary>{events.length ? <ol>{events.map((event) => <li key={event.id}><div><strong>{event.actorName || 'Responsable de traitement'}</strong><small>{dateLabel(event.createdAt)} · {FINDING_STATUSES[event.status]}</small></div><p>{event.treatment}</p></li>)}</ol> : <p>Aucun traitement enregistré pour le moment.</p>}</details></article>;
    })}{!findings.length ? <EmptyState label="Aucun écart pour cet audit et ce filtre" description="Émettez un écart depuis une ligne de la grille d’audit pour le suivre ici." /> : null}</div></section> : null}

    {tab === 'chart' ? <section className="ia-panel"><header className="ia-panel-header"><div><h2>Évolution des scores</h2><p>Comparaison avec l’audit réalisé du même site l’année précédente.</p></div></header>{draftAudit?.status === 'completed' && comparison ? <div className="ia-chart-content"><div className="ia-chart-summary"><div><small>Audit {draftAudit.year}</small><strong>{percent(comparison.current.percentage)}</strong><span>{currentSite?.name}</span></div><div><small>Audit {draftAudit.year - 1}</small><strong>{comparison.previous ? percent(comparison.previous.percentage) : '—'}</strong><span>{comparison.previousAudit ? `Réalisé le ${dateLabel(comparison.previousAudit.performedOn)}` : 'Aucun audit réalisé cette année-là'}</span></div><div><small>Évolution</small><strong className={comparison.delta !== null && comparison.delta < 0 ? 'is-negative' : 'is-positive'}>{comparison.delta === null ? '—' : `${comparison.delta > 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(comparison.delta)} pts`}</strong><span>Points de pourcentage</span></div></div>{!comparison.previousAudit ? <p className="ia-chart-notice">Aucun audit réalisé pour {currentSite?.name} en {draftAudit.year - 1}. Le score précédent reste absent de la comparaison.</p> : null}<div className="ia-chart-legend"><span><i />{draftAudit.year}</span><span><i />{draftAudit.year - 1}</span></div><div className="ia-section-chart" role="img" aria-label={`Scores par chapitre : audit ${draftAudit.year} et année ${draftAudit.year - 1}`}><div className="ia-chart-axis"><span>0 %</span><span>25 %</span><span>50 %</span><span>75 %</span><span>100 %</span></div>{comparison.sections.map((item) => <div className="ia-chart-row" key={item.section}><strong>{item.section}</strong><div className="ia-chart-bars"><div><span className="ia-chart-bar" style={{ width: `${item.current || 0}%` }} /><output>{percent(item.current)}</output></div><div><span className="ia-chart-bar is-previous" style={{ width: `${item.previous || 0}%` }} /><output>{item.previous !== null ? percent(item.previous) : comparison.previousAudit ? 'N/A' : 'Absent'}</output></div></div></div>)}</div><p className="ia-chart-footnote">Les N/A sont exclus du barème. Chaque score est calculé sur les questions applicables de l’audit concerné.</p></div> : <EmptyState label="Le graphique est disponible après la réalisation de l’audit" description="Finalisez la grille pour conserver les réponses et comparer les scores annuels." />}</section> : null}

    {newAuditSite ? <AppDialog title={`Planifier · ${newAuditSite.name}`} description="Les questions seront copiées dans l’audit. Vous pourrez les adapter pendant sa préparation." onClose={() => setNewAuditSite(null)} onSubmit={(event) => void createAudit(event)} isBusy={busy} footer={<div className="ia-dialog-actions"><button className="is-secondary" disabled={busy} onClick={() => setNewAuditSite(null)} type="button">Annuler</button><button disabled={busy || !newAuditForm.templateId} type="submit"><CalendarDays size={16} />Planifier l’audit</button></div>}><DialogError error={error} /><div className="ia-form-grid"><label className="ia-full">Grille de référence<select required value={newAuditForm.templateId} onChange={(event) => setNewAuditForm({ ...newAuditForm, templateId: event.target.value })}><option value="">Choisir une grille</option>{data.templates.filter((template) => template.active && (!template.siteId || template.siteId === newAuditSite.id)).map((template) => <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>)}</select></label><label>Année de campagne<input max="2200" min="2000" required type="number" value={newAuditForm.year} onChange={(event) => setNewAuditForm({ ...newAuditForm, year: event.target.value })} /></label><label>Date planifiée<input required type="date" value={newAuditForm.plannedOn} onChange={(event) => setNewAuditForm({ ...newAuditForm, plannedOn: event.target.value })} /></label><label className="ia-full">Auditeur<input required value={newAuditForm.auditorName} onChange={(event) => setNewAuditForm({ ...newAuditForm, auditorName: event.target.value })} /></label></div>{newAuditForm.plannedOn ? <p className="ia-form-help">Fenêtre : {dateLabel(annualAuditWindow(newAuditSite, Number(newAuditForm.year), newAuditForm.plannedOn).opensOn)} au {dateLabel(annualAuditWindow(newAuditSite, Number(newAuditForm.year), newAuditForm.plannedOn).closesOn)}</p> : null}</AppDialog> : null}
    {siteEditor ? <AppDialog title={`Date anniversaire · ${siteEditor.name}`} description="Cette date définit la prochaine échéance annuelle et sa fenêtre de trois mois avant / après." isBusy={busy} onClose={() => setSiteEditor(null)} onSubmit={(event) => { event.preventDefault(); void mutate(async () => { if (context.previewMode) setData((current) => current ? { ...current, sites: current.sites.map((site) => site.id === siteEditor.id ? siteEditor : site) } : current); else { await saveAuditSite(context.client, siteEditor); await refresh(); } setSiteEditor(null); }, 'Date anniversaire mise à jour.'); }} footer={<div className="ia-dialog-actions"><button disabled={busy} type="submit"><Save size={16} />Enregistrer la date</button></div>}><DialogError error={error} /><label>Date anniversaire de référence<input required type="date" value={siteEditor.anniversaryOn || ''} onChange={(event) => setSiteEditor({ ...siteEditor, anniversaryOn: event.target.value })} /></label></AppDialog> : null}
    {duplicateOpen ? <AppDialog title="Créer une grille personnalisée" description="Partez de la grille sélectionnée puis adaptez les questions pour le navire ou le site choisi." isBusy={busy} onClose={() => setDuplicateOpen(false)} onSubmit={(event) => void duplicateTemplate(event)} footer={<div className="ia-dialog-actions"><button disabled={busy} type="submit"><Copy size={16} />Créer la grille</button></div>}><DialogError error={error} /><div className="ia-form-grid"><label className="ia-full">Nom de la nouvelle grille<input placeholder="Ex. Grille LE ROZEL" required value={duplicateForm.name} onChange={(event) => setDuplicateForm({ ...duplicateForm, name: event.target.value })} /></label><label className="ia-full">Site / Navire<select value={duplicateForm.siteId} onChange={(event) => setDuplicateForm({ ...duplicateForm, siteId: event.target.value })}><option value="">Grille commune</option>{data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label></div></AppDialog> : null}
    {findingRow ? <AppDialog title={`Émettre un écart · ${findingRow.reference || 'question'}`} description={findingRow.question} isBusy={busy} onClose={() => setFindingRow(null)} onSubmit={(event) => void emitFinding(event)} footer={<div className="ia-dialog-actions"><button className="is-secondary" disabled={busy} onClick={() => setFindingRow(null)} type="button">Annuler</button><button disabled={busy} type="submit"><AlertTriangle size={16} />Enregistrer l’écart</button></div>}><DialogError error={error} /><div className="ia-form-grid"><label className="ia-full">Type d’écart<select value={findingForm.severity} onChange={(event) => setFindingForm({ ...findingForm, severity: event.target.value as AuditFindingSeverity })}>{Object.entries(SEVERITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="ia-full">Description du constat<textarea required rows={4} value={findingForm.description} onChange={(event) => setFindingForm({ ...findingForm, description: event.target.value })} /></label><label className="ia-full">Responsable de traitement<select required value={findingForm.target} onChange={(event) => setFindingForm({ ...findingForm, target: event.target.value })}><option value="">Désigner une personne ou une fonction</option>{data.sites.filter((site) => site.kind === 'vessel' && site.vesselId).map((site) => <optgroup key={site.id} label={`Fonctions · ${site.name}`}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={`role:${value}:${site.vesselId}`}>{label} {site.name}</option>)}</optgroup>)}<optgroup label="Personnes">{data.people.map((person) => <option key={person.id} value={`person:${person.id}`}>{person.name}{person.functionLabel ? ` · ${person.functionLabel}` : ''}</option>)}</optgroup></select></label><label>Délai de traitement<input required type="date" value={findingForm.dueOn} onChange={(event) => setFindingForm({ ...findingForm, dueOn: event.target.value })} /></label></div></AppDialog> : null}
    {treatmentFinding ? <AppDialog title="Suivi du traitement" description={treatmentFinding.description} isBusy={busy} onClose={() => setTreatmentFinding(null)} onSubmit={(event) => void saveTreatment(event)} footer={<div className="ia-dialog-actions"><button disabled={busy} type="submit"><Save size={16} />Enregistrer le traitement</button></div>}><DialogError error={error} /><div className="ia-form-grid"><label className="ia-full">Avancement<select value={treatmentForm.status} onChange={(event) => setTreatmentForm({ ...treatmentForm, status: event.target.value as AuditFindingStatus })}>{Object.entries(FINDING_STATUSES).filter(([value]) => value !== 'closed' || (canManage && treatmentFinding.status === 'resolved')).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="ia-full">Traitement / preuve de correction<textarea placeholder="Action menée, vérification, preuve ou motif de réouverture…" required rows={5} value={treatmentForm.treatment} onChange={(event) => setTreatmentForm({ ...treatmentForm, treatment: event.target.value })} /></label></div><p className="ia-form-help">Responsable : {treatmentFinding.assigneeLabel} · Échéance : {dateLabel(treatmentFinding.dueOn)}</p></AppDialog> : null}
    {completeOpen && draftAudit ? <AppDialog title="Finaliser l’audit" description="Les réponses, questions, barèmes et observations seront conservés et figés. Le traitement des écarts reste accessible dans la synthèse." isBusy={busy} onClose={() => setCompleteOpen(false)} footer={<div className="ia-dialog-actions"><button className="is-secondary" disabled={busy} onClick={() => setCompleteOpen(false)} type="button">Revenir à la grille</button><button disabled={busy || completionIssues(draftAudit).length > 0} onClick={() => void mutate(async () => { await persistAudit({ ...draftAudit, status: 'completed', completedAt: new Date().toISOString() }); setCompleteOpen(false); }, 'Audit réalisé. Les réponses sont conservées et les écarts restent suivis.')} type="button"><CheckCircle2 size={16} />Confirmer la réalisation</button></div>}><DialogError error={error} /><div className="ia-completion-score"><strong>{percent(score.percentage)}</strong><span>{score.answeredCount} / {score.totalCount} réponses · {allFindingsForAudit.length} écarts émis</span></div>{completionIssues(draftAudit).length ? <ul className="ia-completion-issues">{completionIssues(draftAudit).map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p>La grille est complète et prête à être conservée.</p>}</AppDialog> : null}
  </section>;
}

function EmptyState({ label, description }: { label: string; description?: string }) { return <div className="ia-empty"><ClipboardCheck size={30} /><h3>{label}</h3>{description ? <p>{description}</p> : null}</div>; }

function DialogError({ error }: { error: string }) { return error ? <p className="ia-alert is-error" role="alert">{error}</p> : null; }
