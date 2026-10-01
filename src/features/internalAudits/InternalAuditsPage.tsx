import { AlertTriangle, BarChart3, CalendarDays, Camera, CheckCircle2, ClipboardCheck, Copy, Download, FileText, ListChecks, LockKeyhole, Pencil, Plus, Printer, RotateCcw, Save, Search, Ship, Trash2, X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { AppDialog } from '../../components/AppDialog';
import type { AppShellOutletContext } from '../shell/AppShell';
import { compareFleetAssets, fleetIllustration } from '../fleet/fleetDisplay';
import {
  annualAuditWindow, auditDueOnFromDuration, blankAuditAnswers, compareAuditScores, completionIssues, defaultFindingDuration, findingIssues, plannedAuditDateIssues, planningStatus, scoreAudit,
  type AuditAnswer, type AuditAnswerValue, type AuditAssigneeRole, type AuditDeadlineUnit, type AuditFinding, type AuditFindingSeverity, type AuditPhoto,
  type AuditFindingStatus, type AuditQuestion, type AuditSite, type AuditTemplate, type InternalAudit,
} from './internalAuditModel';
import {
  addAuditFindingTreatment, fetchInternalAuditData, saveAuditFinding, saveAuditSite, saveAuditTemplate,
  saveInternalAudit, type InternalAuditData,
} from './internalAuditQueries';
import { createInternalAuditPreviewData } from './internalAuditPreview';
import { downloadAuditPhoto } from './internalAuditPhotos';
import { downloadInternalAuditReport, openInternalAuditGridPrintPreview } from './internalAuditReport';
import { downloadInternalAuditWorkbook } from './internalAuditWorkbook';
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
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? 'Non définie' : new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
function percent(value: number | null): string { return value === null ? 'N/A' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)} %`; }
function newQuestion(section = ''): AuditQuestion { return { id: crypto.randomUUID(), section: section || 'Nouvelles questions', reference: '', question: '', maxPoints: 3, guidance: '' }; }
function failure(error: unknown): string { return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : 'L’opération n’a pas pu être enregistrée.'; }
function validQuestions(rows: AuditQuestion[]): boolean { return rows.length > 0 && rows.every((row) => row.section.trim() && row.question.trim() && Number.isFinite(row.maxPoints) && row.maxPoints >= 0); }
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
function photoIssues(files: File[]): string | null {
  if (files.length > 10) return 'Vous pouvez joindre jusqu’à 10 photos à la fois.';
  if (files.some((file) => !PHOTO_TYPES.includes(file.type))) return 'Les photos doivent être au format JPEG, PNG ou WebP.';
  if (files.some((file) => file.size < 1 || file.size > 10 * 1024 * 1024)) return 'Chaque photo doit peser entre 1 octet et 10 Mo.';
  return null;
}
async function previewPhotos(files: File[]): Promise<AuditPhoto[]> {
  return Promise.all(files.map(async (file) => {
    const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('La photo n’a pas pu être lue.')); reader.readAsDataURL(file); });
    const id = crypto.randomUUID();
    return { id, fileName: file.name, storagePath: `preview/${id}`, mimeType: file.type, sizeBytes: file.size, url };
  }));
}
function photoDataUrl(blob: Blob): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('La photo n’a pas pu être téléchargée.')); reader.readAsDataURL(blob); }); }
function deltaLabel(value: number | null): string { return value === null ? '—' : `${value > 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)} pts`; }

function QuestionEditor({ row, onChange, onRemove, disabled = false, removeDisabled = false }: { row: AuditQuestion; onChange: (row: AuditQuestion) => void; onRemove: () => void; disabled?: boolean; removeDisabled?: boolean }) {
  const [expanded, setExpanded] = useState(!row.question);
  return <details className="ia-question-editor" onToggle={(event) => setExpanded(event.currentTarget.open)} open={expanded}>
    <summary><span className="ia-reference">{row.reference || 'Nouvelle'}</span><strong>{row.question || 'Renseigner la question'}</strong><span>{row.maxPoints} pts</span><Pencil aria-hidden="true" size={15} /></summary>
    <div className="ia-editor-fields"><label>Chapitre<input disabled={disabled} required value={row.section} onChange={(event) => onChange({ ...row, section: event.target.value })} /></label><label>Référence<input disabled={disabled} value={row.reference} onChange={(event) => onChange({ ...row, reference: event.target.value })} /></label><label>Barème maximum<input disabled={disabled} min="0" step="0.5" required type="number" value={row.maxPoints} onChange={(event) => onChange({ ...row, maxPoints: Number(event.target.value) })} /></label><label className="ia-full">Question<textarea disabled={disabled} required rows={2} value={row.question} onChange={(event) => onChange({ ...row, question: event.target.value })} /></label><label className="ia-full">Consignes / éléments à vérifier<textarea disabled={disabled} rows={2} value={row.guidance} onChange={(event) => onChange({ ...row, guidance: event.target.value })} /></label>{!disabled ? <button className="ia-text-danger" disabled={removeDisabled} onClick={onRemove} title={removeDisabled ? 'Cette ligne est liée à un écart et doit être conservée.' : undefined} type="button"><Trash2 size={15} />Supprimer cette ligne</button> : null}</div>
  </details>;
}

export function InternalAuditsPage() {
  const context = useOutletContext<AppShellOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedAudit = searchParams.get('audit');
  const [handledAuditLink, setHandledAuditLink] = useState<string | null>(null);
  const [auditLinkBlocked, setAuditLinkBlocked] = useState(false);
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
  const [findingForm, setFindingForm] = useState({ severity: 'minor' as AuditFindingSeverity, description: '', target: '', openedOn: today(), delayValue: '1', delayUnit: 'months' as AuditDeadlineUnit });
  const [findingFiles, setFindingFiles] = useState<File[]>([]);
  const [treatmentFinding, setTreatmentFinding] = useState<AuditFinding | null>(null);
  const [treatmentForm, setTreatmentForm] = useState({ status: 'in_progress' as AuditFindingStatus, treatment: '' });
  const [treatmentFiles, setTreatmentFiles] = useState<File[]>([]);
  const [questionDraft, setQuestionDraft] = useState<AuditAnswer | null>(null);
  const [newRow, setNewRow] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'xlsx'>('pdf');
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
  useEffect(() => {
    if (requestedAudit === null) {
      setHandledAuditLink(null);
      if (auditLinkBlocked) {
        setAuditLinkBlocked(false);
        setAuditId([...(data?.audits || [])].sort((a, b) => b.year - a.year)[0]?.id || '');
        setTab('planning');
        setError('');
      }
      return;
    }
    if (!data || busy || hasUnsavedChanges || handledAuditLink === requestedAudit) return;
    setHandledAuditLink(requestedAudit);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedAudit);
    const linkedAudit = isUuid ? data.audits.find((audit) => audit.id.toLowerCase() === requestedAudit.toLowerCase() && audit.companyId === data.companyId && data.sites.some((site) => site.id === audit.siteId && site.companyId === data.companyId)) : undefined;
    if (!linkedAudit) {
      setAuditLinkBlocked(true);
      setAuditId(''); setDraftAudit(null);
      setError('Cet audit n’est pas disponible dans votre accès.');
      setTab('planning');
      return;
    }
    setAuditId(linkedAudit.id);
    setAuditLinkBlocked(false);
    setDraftAudit(structuredClone(linkedAudit));
    setYear(linkedAudit.year);
    setTab('grid');
    setSection(''); setSearch(''); setFindingFilter(''); setError('');
  }, [requestedAudit, data, busy, hasUnsavedChanges, handledAuditLink, auditLinkBlocked]);
  const currentSite = data?.sites.find((site) => site.id === draftAudit?.siteId) || null;
  const score = scoreAudit(draftAudit?.rows || []);
  const sections = [...new Set(draftAudit?.rows.map((row) => row.section) || [])];
  const editable = canManage && Boolean(draftAudit && draftAudit.status !== 'completed');
  const visibleRows = draftAudit?.rows.filter((row) => (!section || row.section === section) && (!search.trim() || `${row.reference} ${row.question} ${row.section}`.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr')))) || [];
  const findings = (data?.findings || []).filter((finding) => (!auditId || finding.auditId === auditId) && (!findingFilter || (findingFilter === 'pending' ? finding.status !== 'closed' : finding.severity === findingFilter)));
  const allFindingsForAudit = data?.findings.filter((finding) => finding.auditId === auditId) || [];
  const comparison = useMemo(() => draftAudit && data ? compareAuditScores(draftAudit, data.audits) : null, [draftAudit, data]);
  const pendingCount = (data?.findings || []).filter((finding) => finding.status !== 'closed').length;
  const sortedSites = useMemo(() => [...(data?.sites || [])].sort(compareFleetAssets), [data?.sites]);
  const planningYears = [...new Set([year, ...Array.from({ length: 9 }, (_, index) => Number(today().slice(0, 4)) - 3 + index), ...(data?.audits.map((audit) => audit.year) || [])])].sort((a, b) => b - a);
  const delayAmount = Number(findingForm.delayValue);
  const findingDuration = findingForm.severity !== 'remark' && Number.isInteger(delayAmount) && delayAmount > 0 ? { amount: delayAmount, unit: findingForm.delayUnit } : null;
  const findingDueOn = auditDueOnFromDuration(findingForm.openedOn, findingDuration);

  function clearAuditLink() {
    if (requestedAudit === null) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('audit');
    setSearchParams(nextParams, { replace: true });
    if (auditLinkBlocked) {
      setAuditLinkBlocked(false);
      setAuditId([...(data?.audits || [])].sort((a, b) => b.year - a.year)[0]?.id || '');
      setTab('planning');
    }
    if (error === 'Cet audit n’est pas disponible dans votre accès.') setError('');
  }

  async function mutate(action: () => Promise<void>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); } catch (cause) { setError(failure(cause)); } finally { setBusy(false); }
  }
  async function refresh() { if (!context.previewMode) setData(await fetchInternalAuditData(context.client)); }
  async function refreshAfterSave() {
    try { await refresh(); } catch (cause) { setError(`L’enregistrement a réussi, mais l’actualisation a échoué : ${failure(cause)} Rechargez la page pour obtenir les dernières données.`); }
  }
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
    setDraftAudit((current) => current ? { ...current, rows: current.rows.map((row) => row.id === rowId ? { ...row, ...patch } : row), performedOn: current.performedOn || today(), status: 'in_progress' } : null);
    setAuditDirty(true);
  }
  function openFinding(row: AuditAnswer) {
    const duration = defaultFindingDuration('minor');
    setError(''); setFindingFiles([]);
    setFindingForm({ severity: 'minor', description: row.observation, target: '', openedOn: today(), delayValue: String(duration?.amount || 1), delayUnit: duration?.unit || 'months' });
    setFindingRow(row);
  }
  function changeSeverity(severity: AuditFindingSeverity) {
    const duration = defaultFindingDuration(severity);
    setFindingForm((current) => ({ ...current, severity, delayValue: String(duration?.amount || 1), delayUnit: duration?.unit || 'months' }));
  }
  function chooseFiles(files: File[], target: 'finding' | 'treatment') {
    const issue = photoIssues(files);
    if (issue) { setError(issue); return; }
    setError('');
    if (target === 'finding') setFindingFiles(files); else setTreatmentFiles(files);
  }
  function applyQuestion(event: FormEvent) {
    event.preventDefault();
    if (!draftAudit || !questionDraft) return;
    if (!validQuestions([questionDraft])) { setError('Renseignez le chapitre, la question et un barème positif ou nul.'); return; }
    editAudit({ rows: newRow ? [...draftAudit.rows, questionDraft] : draftAudit.rows.map((row) => row.id === questionDraft.id ? questionDraft : row) });
    setQuestionDraft(null); setSearch(''); setError('');
  }
  async function exportReport() {
    if (!data || !selectedAudit || !currentSite || hasUnsavedChanges) return;
    await mutate(async () => {
      const input = { audit: selectedAudit, site: currentSite, audits: data.audits, findings: data.findings.filter((finding) => finding.auditId === selectedAudit.id), events: data.events, loadPhoto: context.previewMode ? undefined : async (photo: AuditPhoto) => photoDataUrl(await downloadAuditPhoto(context.client, photo)) };
      if (exportFormat === 'pdf') await downloadInternalAuditReport(input); else await downloadInternalAuditWorkbook(input);
    }, `Rapport ${exportFormat === 'pdf' ? 'PDF' : 'Excel'} exporté.`);
  }
  async function printGrid() {
    if (!data || !selectedAudit || !currentSite || hasUnsavedChanges) return;
    await mutate(async () => {
      await openInternalAuditGridPrintPreview({ audit: selectedAudit, site: currentSite, audits: data.audits, findings: [], events: [] });
    }, 'Grille ouverte dans un aperçu PDF. Utilisez la commande Imprimer de votre navigateur.');
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
    await mutate(async () => { await persistAudit(audit); setAuditId(audit.id); clearAuditLink(); setNewAuditSite(null); setTab('grid'); }, 'Audit planifié. Sa grille est prête à être renseignée.');
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
    const finding: AuditFinding = { id: crypto.randomUUID(), companyId: data.companyId, auditId: draftAudit.id, questionId: findingRow.id, reference: findingRow.reference, severity: findingForm.severity, description: findingForm.description.trim(), assigneePersonId: person?.id || null, assigneeRole: role, assigneeVesselId: responsibleSite?.vesselId || null, assigneeLabel: person?.name || `${ROLE_LABELS[role!]} ${responsibleSite?.name}`, openedOn: findingForm.openedOn, dueOn: findingDueOn, treatmentDelayValue: findingForm.severity === 'remark' ? null : delayAmount, treatmentDelayUnit: findingForm.severity === 'remark' ? null : findingForm.delayUnit, photos: [], status: 'open', treatment: '', resolvedAt: null, closedAt: null };
    const issues = findingIssues(finding);
    if (issues.length) { setError(issues.join(' ')); return; }
    await mutate(async () => {
      if (auditDirty) await persistAudit(draftAudit);
      if (context.previewMode) { const photos = await previewPhotos(findingFiles); setData((current) => current ? { ...current, findings: [...current.findings, { ...finding, photos }] } : current); }
      else {
        const saved = await saveAuditFinding(context.client, finding, findingFiles);
        setData((current) => current ? { ...current, findings: [...current.findings.filter((item) => item.id !== saved.id), saved] } : current);
      }
      setFindingRow(null); setFindingFiles([]);
      await refreshAfterSave();
    }, 'Écart émis et affecté au responsable de traitement.');
  }
  async function saveTreatment(event: FormEvent) {
    event.preventDefault();
    if (!treatmentFinding) return;
    const note = treatmentForm.treatment.trim() || (treatmentForm.status === 'closed' ? 'Écart clôturé.' : '');
    if (!note && !treatmentFiles.length) { setError('Décrivez le traitement ou joignez une photo.'); return; }
    await mutate(async () => {
      if (context.previewMode) {
        const now = new Date().toISOString();
        const photos = await previewPhotos(treatmentFiles);
        setData((current) => current ? { ...current, findings: current.findings.map((finding) => finding.id === treatmentFinding.id ? { ...finding, status: treatmentForm.status, treatment: note, resolvedAt: treatmentForm.status === 'resolved' ? now : finding.resolvedAt, closedAt: treatmentForm.status === 'closed' ? now : null } : finding), events: [...current.events, { id: crypto.randomUUID(), findingId: treatmentFinding.id, actorId: null, actorName: context.currentPerson ? `${context.currentPerson.firstName} ${context.currentPerson.lastName}` : 'Utilisateur de démonstration', createdAt: now, status: treatmentForm.status, treatment: note, photos }] } : current);
      } else {
        const saved = await addAuditFindingTreatment(context.client, treatmentFinding.id, treatmentForm.status, note, treatmentFiles);
        setData((current) => current ? { ...current, findings: current.findings.map((finding) => finding.id === saved.findingId ? { ...finding, status: saved.status, treatment: saved.treatment, resolvedAt: saved.status === 'resolved' ? saved.createdAt : finding.resolvedAt, closedAt: saved.status === 'closed' ? saved.createdAt : null } : finding), events: [...current.events.filter((event) => event.id !== saved.id), saved] } : current);
      }
      setTreatmentFinding(null); setTreatmentFiles([]);
      await refreshAfterSave();
    }, 'Traitement enregistré dans l’historique de l’écart.');
  }

  if (loading) return <div className="ia-state" role="status">Chargement des audits internes…</div>;
  if (!data) return <div className="ia-state"><p role="alert">{error || 'Les audits ne sont pas disponibles.'}</p><button onClick={() => void load()} type="button">Réessayer</button></div>;
  if (auditLinkBlocked) return <section className="internal-audits-page"><div className="ia-state"><h1>Audit ISM Interne</h1><p className="ia-alert is-error" role="alert">Cet audit n’est pas disponible dans votre accès.</p><button onClick={clearAuditLink} type="button">Retour au planning des audits</button></div></section>;

  return <section className="internal-audits-page">
    <header className="ia-page-header"><div><p className="ia-eyebrow">Audits</p><h1>Audit ISM Interne</h1><p>Planifier les audits, évaluer la conformité et suivre chaque écart.</p></div><div className="ia-header-note"><CalendarDays size={20} /><span><strong>Périodicité annuelle</strong>Fenêtre de ± 3 mois calendaires</span></div></header>
    {error ? <p className="ia-alert is-error" role="alert"><AlertTriangle size={17} />{error}</p> : null}
    {message ? <p className="ia-alert is-success" role="status"><CheckCircle2 size={17} />{message}</p> : null}
    {hasUnsavedChanges ? <p className="ia-unsaved-notice" role="status"><Save aria-hidden="true" size={17} />{templateDirty ? 'Grille non enregistrée : enregistrez-la ou annulez les modifications avant de changer de grille ou d’onglet.' : 'Réponses non enregistrées : enregistrez-les ou annulez les modifications avant de changer d’audit ou d’onglet.'}</p> : null}
    <nav className="ia-tabs" aria-label="Onglets des audits internes">{TABS.map(({ id, label, icon: Icon }) => <button aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'is-active' : ''} disabled={busy || (hasUnsavedChanges && tab !== id)} key={id} onClick={() => setTab(id)} type="button"><Icon size={17} />{label}{id === 'findings' && pendingCount ? <span>{pendingCount}</span> : null}</button>)}</nav>

    {tab === 'planning' ? <section className="ia-panel"><header className="ia-panel-header"><div><h2>Planning annuel d’audit</h2><p>Une campagne par site et par année. La fenêtre suit la date anniversaire.</p></div><label className="ia-compact-field">Année<select aria-label="Année du planning" onChange={(event) => { setYear(Number(event.target.value)); clearAuditLink(); }} value={year}>{planningYears.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></header>
      <div className="ia-year-legend"><span><i className="ia-key-window" />Fenêtre autorisée ± 3 mois</span><span><i className="ia-key-target" />Date cible</span><span><i className="ia-key-audit" />Audit planifié / réalisé</span>{year === Number(today().slice(0, 4)) ? <span><i className="ia-key-today" />Aujourd’hui</span> : null}</div>
      <div className="ia-year-scroll" tabIndex={0} aria-label={`Planning annuel ${year}, défilement horizontal disponible`}><div className="ia-year-planning">
        <div className="ia-year-header" aria-hidden="true"><strong>Site / Navire</strong><div className="ia-year-months">{PLANNING_MONTHS.map((month, index) => <span key={month} style={{ left: `${yearPosition(year, `${year}-${String(index + 1).padStart(2, '0')}-15`)}%` }}>{month}</span>)}</div><span>Actions</span></div>{sortedSites.map((site) => {
      const annualAudit = data.audits.find((audit) => audit.siteId === site.id && audit.year === year);
      const fallbackDate = data.audits.find((audit) => audit.siteId === site.id)?.plannedOn || '';
      const window = annualAuditWindow(site, year, annualAudit?.plannedOn || fallbackDate);
      const status = annualAudit?.status === 'completed' ? 'completed' : !window.targetOn ? 'unscheduled' : today() > window.closesOn ? 'overdue' : annualAudit?.status === 'in_progress' ? 'in_progress' : today() >= window.opensOn ? 'window' : 'upcoming';
      const illustration = fleetIllustration(site);
      return <article className="ia-year-row" key={site.id}>
        <div className="ia-year-site"><div className="ia-site-name"><span className="ia-year-illustration">{illustration ? <img alt="" loading="lazy" src={illustration} /> : site.kind === 'vessel' ? <Ship size={22} /> : <CalendarDays size={22} />}</span><span><strong>{site.name}</strong><small>{site.kind === 'vessel' ? 'Navire' : 'Site à terre'}{annualAudit ? ` · Audit ${annualAudit.year}` : ''}</small></span></div><div className="ia-year-status"><span className={`ia-badge is-${status}`}>{PLANNING_STATUSES[status]}</span><small>{annualAudit ? `${scoreAudit(annualAudit.rows).answeredCount} / ${annualAudit.rows.length} réponses` : `Aucun audit ${year}`}</small></div></div>
        <div className="ia-year-calendar"><AnnualAuditTimeline year={year} site={site} window={window} audit={annualAudit} /><div className="ia-year-dates"><span><small>Date cible</small><strong>{dateLabel(window.targetOn)}</strong>{canManage ? <button aria-label={`Modifier la date anniversaire de ${site.name}`} className="ia-icon-button" onClick={() => setSiteEditor({ ...site, anniversaryOn: site.anniversaryOn || window.targetOn || '' })} title="Date anniversaire annuelle" type="button"><Pencil size={13} /></button> : null}</span><span><small>Fenêtre autorisée</small>{window.opensOn && window.closesOn ? `${dateLabel(window.opensOn)} → ${dateLabel(window.closesOn)}` : 'Définir la date anniversaire'}</span>{annualAudit ? <span><small>{annualAudit.status === 'completed' ? 'Réalisé le' : 'Planifié le'}</small>{dateLabel(annualAudit.status === 'completed' ? annualAudit.performedOn : annualAudit.plannedOn)}</span> : null}</div></div>
        <div className="ia-row-actions">{annualAudit ? <button className="is-secondary" disabled={busy || hasUnsavedChanges} onClick={() => { setAuditId(annualAudit.id); clearAuditLink(); setTab('grid'); }} type="button">Ouvrir</button> : null}{canManage ? <button aria-label={`Planifier ${site.name}`} className={annualAudit ? 'ia-icon-button' : 'is-secondary'} disabled={busy || hasUnsavedChanges} onClick={() => openNewAudit(site)} type="button"><Plus size={15} />{annualAudit ? '' : 'Planifier'}</button> : null}</div>
      </article>;
    })}</div></div></section> : null}

    {tab === 'templates' ? <section className="ia-panel"><header className="ia-panel-header"><div><h2>Grilles de référence</h2><p>Adaptez les questions par navire. Chaque audit conserve sa propre copie.</p></div>{canManage && draftTemplate ? <button className="is-secondary" disabled={busy || templateDirty} onClick={() => { setDuplicateForm({ name: '', siteId: '' }); setDuplicateOpen(true); }} type="button"><Copy size={16} />Créer une grille personnalisée</button> : null}</header><div className="ia-template-layout"><aside className="ia-template-list" aria-label="Grilles disponibles">{data.templates.filter((item) => item.active).map((template) => <button aria-pressed={templateId === template.id} disabled={hasUnsavedChanges || busy} key={template.id} onClick={() => setTemplateId(template.id)} type="button"><FileText size={17} /><span><strong>{template.name}</strong><small>{data.sites.find((site) => site.id === template.siteId)?.name || 'Commune à tous les sites'} · {template.rows.length} questions</small></span></button>)}</aside>{draftTemplate ? <form className="ia-template-workspace" onSubmit={(event) => void saveTemplate(event)}><div className="ia-template-metadata"><label>Nom de la grille<input disabled={!canManage || busy} required onChange={(event) => editTemplate({ name: event.target.value })} value={draftTemplate.name} /></label><span className="ia-badge">Version {draftTemplate.version}</span></div><div className="ia-question-list">{draftTemplate.rows.map((row) => <QuestionEditor disabled={!canManage || busy} key={row.id} onChange={(edited) => editTemplate({ rows: draftTemplate.rows.map((item) => item.id === row.id ? edited : item) })} onRemove={() => editTemplate({ rows: draftTemplate.rows.filter((item) => item.id !== row.id) })} row={row} />)}</div>{canManage ? <footer className="ia-save-actions"><button className="is-secondary" disabled={busy} onClick={() => editTemplate({ rows: [...draftTemplate.rows, newQuestion(draftTemplate.rows.at(-1)?.section)] })} type="button"><Plus size={16} />Ajouter une ligne à la grille</button>{templateDirty ? <button className="is-secondary" disabled={busy} onClick={() => { setDraftTemplate(selectedTemplate ? structuredClone(selectedTemplate) : null); setTemplateDirty(false); }} type="button"><RotateCcw size={15} />Annuler les modifications</button> : null}<button disabled={!templateDirty || busy} type="submit"><Save size={16} />{busy ? 'Enregistrement…' : 'Enregistrer la grille'}</button></footer> : null}</form> : <EmptyState label="Aucune grille disponible" />}</div></section> : null}

    {(['grid', 'findings', 'chart'] as Tab[]).includes(tab) ? <div className="ia-audit-selector"><label>Audit sélectionné<select disabled={hasUnsavedChanges || busy} onChange={(event) => { setAuditId(event.target.value); clearAuditLink(); }} value={auditId}>{!data.audits.length ? <option value="">Aucun audit</option> : null}{[...data.audits].sort((a, b) => b.year - a.year || a.plannedOn.localeCompare(b.plannedOn)).map((audit) => <option key={audit.id} value={audit.id}>{data.sites.find((site) => site.id === audit.siteId)?.name} · {audit.year} · {AUDIT_STATUSES[audit.status]}</option>)}</select></label>{draftAudit ? <span className={`ia-badge is-${draftAudit.status}`}>{AUDIT_STATUSES[draftAudit.status]}</span> : null}{auditDirty ? <span className="ia-unsaved">Modifications non enregistrées</span> : null}{selectedAudit ? <div className="ia-export-actions"><button className="is-secondary" disabled={busy || hasUnsavedChanges} title={hasUnsavedChanges ? 'Enregistrez les modifications avant d’imprimer la grille.' : 'Ouvrir la grille seule dans un aperçu PDF imprimable'} onClick={() => void printGrid()} type="button"><Printer size={16} />Imprimer la grille</button><label className="ia-sr-only" htmlFor="audit-export-format">Format du rapport</label><select id="audit-export-format" disabled={busy} value={exportFormat} onChange={(event) => setExportFormat(event.target.value as 'pdf' | 'xlsx')}><option value="pdf">PDF</option><option value="xlsx">Excel (.xlsx)</option></select><button className="is-secondary" disabled={busy || hasUnsavedChanges} title={hasUnsavedChanges ? 'Enregistrez les modifications avant d’exporter le rapport.' : 'Grille, synthèse des écarts et comparaison annuelle'} onClick={() => void exportReport()} type="button"><Download size={16} />Exporter le rapport</button></div> : null}</div> : null}

    {tab === 'grid' ? draftAudit ? <section className="ia-panel">
      <header className="ia-audit-header"><div><h2>{currentSite?.name} · {draftAudit.year}</h2><p>{draftAudit.templateName} · Version {draftAudit.templateVersion}</p>{draftAudit.status === 'completed' ? <span className="ia-locked"><LockKeyhole size={14} />Réponses conservées · audit réalisé le {dateLabel(draftAudit.performedOn)}</span> : null}</div><div className="ia-score-summary"><strong>{percent(score.percentage)}</strong><span>{score.earnedPoints} / {score.maxPoints} points · {score.answeredCount} / {score.totalCount} réponses</span><div className="ia-progress-track"><span style={{ width: `${score.percentage || 0}%` }} /></div></div></header>
      <div className="ia-audit-metadata"><label>Date planifiée<input disabled={!canManage || draftAudit.status !== 'planned' || busy} onChange={(event) => editAudit({ plannedOn: event.target.value })} required type="date" value={draftAudit.plannedOn} /></label><label>Date de réalisation<input aria-label="Date de réalisation" disabled readOnly type="date" value={draftAudit.performedOn || ''} /><small>Renseignée automatiquement au début de l’audit.</small></label><label>Auditeur<input disabled={!editable || busy} onChange={(event) => editAudit({ auditorName: event.target.value })} value={draftAudit.auditorName} /></label></div>
      <div className="ia-grid-tools"><label><span>Chapitre</span><select onChange={(event) => setSection(event.target.value)} value={section}><option value="">Tous les chapitres</option>{sections.map((name) => <option key={name}>{name}</option>)}</select></label><label className="ia-search"><Search size={16} /><input aria-label="Rechercher une question" onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une question…" value={search} /></label><span>{score.excludedCount} N/A · exclus du calcul</span></div>
      <div className="ia-rating-guide">Conforme = barème · Incomplet = moitié du barème · Non Conforme = 0 · N/A = hors calcul</div>
      <div className="ia-grid-scroll" tabIndex={0} aria-label="Grille d’audit, défilement horizontal disponible">
        <table className="ia-audit-table"><caption className="ia-sr-only">Grille d’audit {currentSite?.name} {draftAudit.year}</caption><colgroup><col className="ia-col-ref" /><col className="ia-col-question" /><col className="ia-col-guidance" /><col className="ia-col-points" /><col className="ia-col-answer" /><col className="ia-col-observation" /><col className="ia-col-actions" /></colgroup><thead><tr><th scope="col">Réf.</th><th scope="col">Question</th><th scope="col">Éléments à vérifier</th><th scope="col">Barème</th><th scope="col">Réponse</th><th scope="col">Observations</th><th scope="col">Actions</th></tr></thead><tbody>
          {visibleRows.map((row, index) => {
            const rowFindings = allFindingsForAudit.filter((finding) => finding.questionId === row.id);
            return <Fragment key={row.id}>
              {index === 0 || visibleRows[index - 1].section !== row.section ? <tr className="ia-chapter-row"><th colSpan={7} scope="colgroup">{row.section}</th></tr> : null}
              <tr className="ia-answer-row"><td><span className="ia-reference">{row.reference || '—'}</span></td><th scope="row"><CompactAuditText text={row.question || 'Nouvelle question'} id={`question-${row.id}-tooltip`} /></th><td className="ia-guidance-cell"><CompactAuditText text={row.guidance || '—'} id={`guidance-${row.id}-tooltip`} /></td><td className="ia-points-cell">{row.maxPoints} pts</td><td><label className="ia-sr-only" htmlFor={`answer-${row.id}`}>Réponse {row.reference || row.question}</label><select className={`ia-answer-select is-${row.answer || 'empty'}`} disabled={!editable || busy} id={`answer-${row.id}`} onChange={(event) => editAnswer(row.id, { answer: event.target.value as AuditAnswerValue || null })} value={row.answer || ''}><option value="">Choisir…</option>{ANSWERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td><td><label className="ia-sr-only" htmlFor={`observation-${row.id}`}>Observations · {row.reference || row.question}</label><input disabled={!editable || busy} id={`observation-${row.id}`} onChange={(event) => editAnswer(row.id, { observation: event.target.value })} placeholder="Constat ou preuve…" title={row.observation || undefined} type="text" value={row.observation} /></td><td><div className="ia-question-actions">{canManage ? <button aria-label={`Émettre un écart ${row.reference || row.question}`} className="is-secondary" disabled={busy || !row.question.trim()} onClick={() => openFinding(row)} type="button"><Plus size={14} />Écart</button> : null}{editable ? <button aria-label={`Modifier la question ${row.reference || row.question}`} className="ia-icon-button" disabled={busy} onClick={() => { setNewRow(false); setQuestionDraft(structuredClone(row)); setError(''); }} title="Modifier la question" type="button"><Pencil size={14} /></button> : null}{rowFindings.length ? <button className="ia-finding-link" disabled={busy || hasUnsavedChanges} onClick={() => setTab('findings')} type="button"><AlertTriangle size={13} /><span aria-hidden="true">{rowFindings.length}</span><span className="ia-sr-only">{rowFindings.length} écart{rowFindings.length > 1 ? 's' : ''} émis</span></button> : null}</div></td></tr>
            </Fragment>;
          })}
        </tbody></table>
      </div>
      {!visibleRows.length ? <EmptyState label="Aucune question ne correspond à ce filtre" /> : null}
      {editable ? <footer className="ia-save-actions ia-audit-save"><button className="is-secondary" disabled={busy} onClick={() => { setQuestionDraft({ ...newQuestion(section || draftAudit.rows.at(-1)?.section), answer: null, observation: '' }); setNewRow(true); setError(''); }} type="button"><Plus size={16} />Ajouter une ligne à l’audit</button>{draftAudit.status === 'planned' ? <button className="is-secondary" disabled={busy} onClick={() => editAudit({ status: 'in_progress', performedOn: draftAudit.performedOn || today() })} type="button">Démarrer l’audit</button> : null}{auditDirty ? <button className="is-secondary" disabled={busy} onClick={() => { setDraftAudit(selectedAudit ? structuredClone(selectedAudit) : null); setAuditDirty(false); }} type="button">Annuler</button> : null}<button disabled={!auditDirty || busy} onClick={() => void saveDraft()} type="button"><Save size={16} />Enregistrer les réponses</button><button className="is-secondary" disabled={busy} onClick={() => setCompleteOpen(true)} type="button"><CheckCircle2 size={16} />Finaliser l’audit</button></footer> : null}
    </section> : <EmptyState label="Planifiez un audit pour commencer à remplir une grille" /> : null}

    {tab === 'findings' ? <section className="ia-panel"><header className="ia-panel-header"><div><h2>Synthèse des écarts</h2><p>Non conformités majeures, mineures et remarques avec leur suivi de traitement.</p></div><label className="ia-compact-field">Afficher<select onChange={(event) => setFindingFilter(event.target.value)} value={findingFilter}><option value="">Tous les écarts</option><option value="pending">Non clôturés</option>{Object.entries(SEVERITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></header><div className="ia-findings-list">{findings.map((finding) => {
      const linkedAudit = data.audits.find((audit) => audit.id === finding.auditId);
      const linkedRow = linkedAudit?.rows.find((row) => row.id === finding.questionId);
      const overdue = Boolean(finding.dueOn && finding.dueOn < today()) && !['resolved', 'closed'].includes(finding.status);
      const events = data.events.filter((event) => event.findingId === finding.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const canTreat = canManage || data.permissions.treatableFindingIds.includes(finding.id);
      return <article className="ia-finding" key={finding.id}><header><div><span className={`ia-badge is-${finding.severity}`}>{SEVERITIES[finding.severity]}</span><span className={`ia-badge is-${finding.status}`}>{FINDING_STATUSES[finding.status]}</span></div><strong>{finding.reference || 'Sans référence'}</strong></header><h3>{finding.description}</h3>{linkedRow ? <p className="ia-finding-question">{linkedRow.section} · {linkedRow.question}</p> : null}<PhotoGallery photos={finding.photos} label="Photos du constat" /><div className="ia-finding-info"><span><small>Responsable de traitement</small><strong>{finding.assigneeLabel}</strong></span><span className={overdue ? 'is-overdue' : ''}><small>Échéance de traitement</small><strong>{finding.dueOn ? dateLabel(finding.dueOn) : 'Sans échéance'}{overdue ? ' · En retard' : ''}</strong></span>{canTreat ? <button className="is-secondary" disabled={busy} onClick={() => { setError(''); setTreatmentFiles([]); setTreatmentForm({ status: finding.status === 'open' ? 'in_progress' : finding.status === 'closed' ? 'open' : finding.status, treatment: '' }); setTreatmentFinding(finding); }} type="button"><Pencil size={15} />Suivre le traitement</button> : null}</div>{finding.treatment ? <p className="ia-treatment-note"><strong>Dernier traitement</strong>{finding.treatment}</p> : null}<details className="ia-finding-history"><summary>Historique du traitement ({events.length})</summary>{events.length ? <ol>{events.map((event) => <li key={event.id}><div><strong>{event.actorName || 'Responsable de traitement'}</strong><small>{dateLabel(event.createdAt)} · {FINDING_STATUSES[event.status]}</small></div><p>{event.treatment}</p><PhotoGallery photos={event.photos} label={event.status === 'closed' ? 'Photos de clôture' : 'Photos du traitement'} /></li>)}</ol> : <p>Aucun traitement enregistré pour le moment.</p>}</details></article>;
    })}{!findings.length ? <EmptyState label="Aucun écart pour cet audit et ce filtre" description="Émettez un écart depuis une ligne de la grille d’audit pour le suivre ici." /> : null}</div></section> : null}

    {tab === 'chart' ? <section className="ia-panel"><header className="ia-panel-header"><div><h2>Évolution des scores</h2><p>Comparaison avec l’audit réalisé du même site l’année précédente.</p></div></header>{draftAudit?.status === 'completed' && comparison ? <div className="ia-chart-content">
      <div className="ia-chart-summary"><div><small>Audit {draftAudit.year}</small><strong>{percent(comparison.current.percentage)}</strong><span>{comparison.current.earnedPoints} / {comparison.current.maxPoints} points applicables</span></div><div><small>Audit {draftAudit.year - 1}</small><strong>{comparison.previous ? percent(comparison.previous.percentage) : '—'}</strong><span>{comparison.previousAudit ? `Réalisé le ${dateLabel(comparison.previousAudit.performedOn)}` : 'Aucun audit réalisé cette année-là'}</span></div><div><small>Évolution globale</small><strong className={comparison.delta !== null && comparison.delta < 0 ? 'is-negative' : 'is-positive'}>{deltaLabel(comparison.delta)}</strong><span>Points de pourcentage · même site</span></div></div>
      {!comparison.previousAudit ? <p className="ia-chart-notice">Aucun audit réalisé pour {currentSite?.name} en {draftAudit.year - 1}. Le score précédent reste absent de la comparaison.</p> : null}
      <ChapterRadar audit={draftAudit} comparison={comparison} />
      <p className="ia-chart-footnote">Les N/A sont exclus du barème. Chaque score est calculé sur les questions applicables de l’audit concerné.</p>
    </div> : <EmptyState label="Le graphique est disponible après la réalisation de l’audit" description="Finalisez la grille pour conserver les réponses et comparer les scores annuels." />}</section> : null}

    {newAuditSite ? <AppDialog title={`Planifier · ${newAuditSite.name}`} description="Les questions seront copiées dans l’audit. Vous pourrez les adapter pendant sa préparation." onClose={() => setNewAuditSite(null)} onSubmit={(event) => void createAudit(event)} isBusy={busy} footer={<div className="ia-dialog-actions"><button className="is-secondary" disabled={busy} onClick={() => setNewAuditSite(null)} type="button">Annuler</button><button disabled={busy || !newAuditForm.templateId} type="submit"><CalendarDays size={16} />Planifier l’audit</button></div>}><DialogError error={error} /><div className="ia-form-grid"><label className="ia-full">Grille de référence<select required value={newAuditForm.templateId} onChange={(event) => setNewAuditForm({ ...newAuditForm, templateId: event.target.value })}><option value="">Choisir une grille</option>{data.templates.filter((template) => template.active && (!template.siteId || template.siteId === newAuditSite.id)).map((template) => <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>)}</select></label><label>Année de campagne<input max="2200" min="2000" required type="number" value={newAuditForm.year} onChange={(event) => setNewAuditForm({ ...newAuditForm, year: event.target.value })} /></label><label>Date planifiée<input required type="date" value={newAuditForm.plannedOn} onChange={(event) => setNewAuditForm({ ...newAuditForm, plannedOn: event.target.value })} /></label><label className="ia-full">Auditeur<input required value={newAuditForm.auditorName} onChange={(event) => setNewAuditForm({ ...newAuditForm, auditorName: event.target.value })} /></label></div>{newAuditForm.plannedOn ? <p className="ia-form-help">Fenêtre : {dateLabel(annualAuditWindow(newAuditSite, Number(newAuditForm.year), newAuditForm.plannedOn).opensOn)} au {dateLabel(annualAuditWindow(newAuditSite, Number(newAuditForm.year), newAuditForm.plannedOn).closesOn)}</p> : null}</AppDialog> : null}
    {siteEditor ? <AppDialog title={`Date anniversaire · ${siteEditor.name}`} description="Cette date définit la prochaine échéance annuelle et sa fenêtre de trois mois avant / après." isBusy={busy} onClose={() => setSiteEditor(null)} onSubmit={(event) => { event.preventDefault(); void mutate(async () => { if (context.previewMode) setData((current) => current ? { ...current, sites: current.sites.map((site) => site.id === siteEditor.id ? siteEditor : site) } : current); else { await saveAuditSite(context.client, siteEditor); await refresh(); } setSiteEditor(null); }, 'Date anniversaire mise à jour.'); }} footer={<div className="ia-dialog-actions"><button disabled={busy} type="submit"><Save size={16} />Enregistrer la date</button></div>}><DialogError error={error} /><label>Date anniversaire de référence<input required type="date" value={siteEditor.anniversaryOn || ''} onChange={(event) => setSiteEditor({ ...siteEditor, anniversaryOn: event.target.value })} /></label></AppDialog> : null}
    {duplicateOpen ? <AppDialog title="Créer une grille personnalisée" description="Partez de la grille sélectionnée puis adaptez les questions pour le navire ou le site choisi." isBusy={busy} onClose={() => setDuplicateOpen(false)} onSubmit={(event) => void duplicateTemplate(event)} footer={<div className="ia-dialog-actions"><button disabled={busy} type="submit"><Copy size={16} />Créer la grille</button></div>}><DialogError error={error} /><div className="ia-form-grid"><label className="ia-full">Nom de la nouvelle grille<input placeholder="Ex. Grille LE ROZEL" required value={duplicateForm.name} onChange={(event) => setDuplicateForm({ ...duplicateForm, name: event.target.value })} /></label><label className="ia-full">Site / Navire<select value={duplicateForm.siteId} onChange={(event) => setDuplicateForm({ ...duplicateForm, siteId: event.target.value })}><option value="">Grille commune</option>{sortedSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label></div></AppDialog> : null}
    {questionDraft ? <AppDialog title={newRow ? 'Ajouter une question à l’audit' : 'Modifier la question'} isBusy={busy} onClose={() => setQuestionDraft(null)} onSubmit={applyQuestion} footer={<div className="ia-dialog-actions"><button className="is-secondary" disabled={busy} onClick={() => setQuestionDraft(null)} type="button">Annuler</button><button disabled={busy} type="submit">{newRow ? 'Ajouter la question' : 'Appliquer les modifications'}</button></div>}><DialogError error={error} /><div className="ia-editor-fields"><label>Chapitre<input required value={questionDraft.section} onChange={(event) => setQuestionDraft({ ...questionDraft, section: event.target.value })} /></label><label>Référence<input value={questionDraft.reference} onChange={(event) => setQuestionDraft({ ...questionDraft, reference: event.target.value })} /></label><label>Barème maximum<input min="0" step="0.5" required type="number" value={questionDraft.maxPoints} onChange={(event) => setQuestionDraft({ ...questionDraft, maxPoints: Number(event.target.value) })} /></label><label className="ia-full">Question<textarea required rows={2} value={questionDraft.question} onChange={(event) => setQuestionDraft({ ...questionDraft, question: event.target.value })} /></label><label className="ia-full">Consignes / éléments à vérifier<textarea rows={3} value={questionDraft.guidance} onChange={(event) => setQuestionDraft({ ...questionDraft, guidance: event.target.value })} /></label>{!newRow ? <button className="ia-text-danger" disabled={busy || allFindingsForAudit.some((finding) => finding.questionId === questionDraft.id)} title={allFindingsForAudit.some((finding) => finding.questionId === questionDraft.id) ? 'Cette ligne est liée à un écart et doit être conservée.' : undefined} onClick={() => { if (!draftAudit || allFindingsForAudit.some((finding) => finding.questionId === questionDraft.id)) return; editAudit({ rows: draftAudit.rows.filter((row) => row.id !== questionDraft.id) }); setQuestionDraft(null); }} type="button"><Trash2 size={15} />Supprimer cette ligne</button> : null}</div></AppDialog> : null}
    {findingRow ? <AppDialog title={`Émettre un écart · ${findingRow.reference || 'question'}`} description={findingRow.question} isBusy={busy} onClose={() => setFindingRow(null)} onSubmit={(event) => void emitFinding(event)} footer={<div className="ia-dialog-actions"><button className="is-secondary" disabled={busy} onClick={() => setFindingRow(null)} type="button">Annuler</button><button disabled={busy} type="submit"><AlertTriangle size={16} />Enregistrer l’écart</button></div>}><DialogError error={error} /><div className="ia-form-grid"><label className="ia-full">Type d’écart<select value={findingForm.severity} onChange={(event) => changeSeverity(event.target.value as AuditFindingSeverity)}>{Object.entries(SEVERITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="ia-full">Description du constat<textarea required rows={3} value={findingForm.description} onChange={(event) => setFindingForm({ ...findingForm, description: event.target.value })} /></label><label className="ia-full">Responsable de traitement<select required value={findingForm.target} onChange={(event) => setFindingForm({ ...findingForm, target: event.target.value })}><option value="">Désigner une personne ou une fonction</option>{sortedSites.filter((site) => site.kind === 'vessel' && site.vesselId).map((site) => <optgroup key={site.id} label={`Fonctions · ${site.name}`}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={`role:${value}:${site.vesselId}`}>{label} {site.name}</option>)}</optgroup>)}<optgroup label="Personnes">{data.people.map((person) => <option key={person.id} value={`person:${person.id}`}>{person.name}{person.functionLabel ? ` · ${person.functionLabel}` : ''}</option>)}</optgroup></select></label>{findingForm.severity !== 'remark' ? <><label>Délai de traitement<input max="3650" min="1" step="1" required type="number" value={findingForm.delayValue} onChange={(event) => setFindingForm({ ...findingForm, delayValue: event.target.value })} /></label><label>Unité du délai<select value={findingForm.delayUnit} onChange={(event) => setFindingForm({ ...findingForm, delayUnit: event.target.value as AuditDeadlineUnit })}><option value="days">Jour(s)</option><option value="weeks">Semaine(s)</option><option value="months">Mois</option></select></label><p className="ia-computed-deadline"><small>Échéance calculée</small><strong>{dateLabel(findingDueOn)}</strong></p></> : <p className="ia-form-help ia-full">Aucun délai imposé pour une remarque. Son traitement et sa clôture restent facultatifs.</p>}<div className="ia-full"><PhotoUpload files={findingFiles} label="Photos du constat (facultatif)" disabled={busy} onChange={(files) => chooseFiles(files, 'finding')} /></div></div></AppDialog> : null}
    {treatmentFinding ? <AppDialog title="Suivi du traitement" description={treatmentFinding.description} isBusy={busy} onClose={() => setTreatmentFinding(null)} onSubmit={(event) => void saveTreatment(event)} footer={<div className="ia-dialog-actions"><button disabled={busy} type="submit"><Save size={16} />Enregistrer le traitement</button></div>}><DialogError error={error} /><div className="ia-form-grid"><label className="ia-full">Avancement<select value={treatmentForm.status} onChange={(event) => setTreatmentForm({ ...treatmentForm, status: event.target.value as AuditFindingStatus })}>{Object.entries(FINDING_STATUSES).filter(([value]) => value !== 'closed' || (canManage && (treatmentFinding.status === 'resolved' || (treatmentFinding.severity === 'remark' && treatmentFinding.status !== 'closed')))).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="ia-full">Traitement / preuve de correction<textarea placeholder="Action menée, vérification, preuve ou motif de réouverture…" rows={4} value={treatmentForm.treatment} onChange={(event) => setTreatmentForm({ ...treatmentForm, treatment: event.target.value })} /></label><div className="ia-full"><PhotoUpload files={treatmentFiles} label={treatmentForm.status === 'closed' ? 'Photos de clôture (facultatif)' : 'Photos du traitement (facultatif)'} disabled={busy} onChange={(files) => chooseFiles(files, 'treatment')} /></div></div><p className="ia-form-help">Responsable : {treatmentFinding.assigneeLabel} · {treatmentFinding.dueOn ? `Échéance : ${dateLabel(treatmentFinding.dueOn)}` : 'Sans échéance'}. {treatmentForm.status === 'closed' ? 'Aucune photo ou note supplémentaire n’est obligatoire pour clôturer.' : 'Renseignez une note ou joignez une photo pour documenter le traitement.'}</p></AppDialog> : null}
    {completeOpen && draftAudit ? <AppDialog title="Finaliser l’audit" description="Les réponses, questions, barèmes et observations seront conservés et figés. Le traitement des écarts reste accessible dans la synthèse." isBusy={busy} onClose={() => setCompleteOpen(false)} footer={<div className="ia-dialog-actions"><button className="is-secondary" disabled={busy} onClick={() => setCompleteOpen(false)} type="button">Revenir à la grille</button><button disabled={busy || completionIssues(draftAudit).length > 0} onClick={() => void mutate(async () => { await persistAudit({ ...draftAudit, status: 'completed', completedAt: new Date().toISOString() }); setCompleteOpen(false); }, 'Audit réalisé. Les réponses sont conservées et les écarts restent suivis.')} type="button"><CheckCircle2 size={16} />Confirmer la réalisation</button></div>}><DialogError error={error} /><div className="ia-completion-score"><strong>{percent(score.percentage)}</strong><span>{score.answeredCount} / {score.totalCount} réponses · {allFindingsForAudit.length} écarts émis</span></div>{completionIssues(draftAudit).length ? <ul className="ia-completion-issues">{completionIssues(draftAudit).map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p>La grille est complète et prête à être conservée.</p>}</AppDialog> : null}
  </section>;
}

function EmptyState({ label, description }: { label: string; description?: string }) { return <div className="ia-empty"><ClipboardCheck size={30} /><h3>{label}</h3>{description ? <p>{description}</p> : null}</div>; }

function DialogError({ error }: { error: string }) { return error ? <p className="ia-alert is-error" role="alert">{error}</p> : null; }

const PLANNING_MONTHS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

/** Calendar-day positions avoid local DST offsets, including a window crossing New Year. */
function yearPosition(year: number, date: string): number {
  const start = Date.UTC(year, 0, 1);
  return (Date.parse(`${date}T00:00:00Z`) - start) / (Date.UTC(year + 1, 0, 1) - start) * 100;
}

function AnnualAuditTimeline({ year, site, window, audit }: { year: number; site: AuditSite; window: ReturnType<typeof annualAuditWindow>; audit?: InternalAudit }) {
  const start = window.opensOn ? Math.max(0, yearPosition(year, window.opensOn)) : 0;
  const end = window.closesOn ? Math.min(100, yearPosition(year, window.closesOn) + 100 / (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365)) : 0;
  const target = window.targetOn ? yearPosition(year, window.targetOn) : null;
  const auditDate = audit?.status === 'completed' ? audit.performedOn : audit?.plannedOn;
  const auditPosition = auditDate ? yearPosition(year, auditDate) : null;
  const now = today();
  const description = window.targetOn ? `Date cible ${dateLabel(window.targetOn)}. Fenêtre du ${dateLabel(window.opensOn)} au ${dateLabel(window.closesOn)}.` : 'Date anniversaire à définir.';
  return <div className="ia-year-track" role="img" aria-label={`Calendrier ${year} de ${site.name}. ${description}${auditDate ? ` Audit ${audit?.status === 'completed' ? 'réalisé' : 'planifié'} le ${dateLabel(auditDate)}.` : ''}`}>
    {PLANNING_MONTHS.map((month, index) => <i aria-hidden="true" className="ia-year-gridline" key={month} style={{ left: `${yearPosition(year, `${year}-${String(index + 1).padStart(2, '0')}-01`)}%` }} />)}
    {window.targetOn && end > start ? <span aria-hidden="true" className="ia-year-window" style={{ left: `${start}%`, width: `${end - start}%` }} /> : null}
    {target !== null ? <span aria-hidden="true" className="ia-year-target" style={{ left: `${target}%` }} title={`Date cible : ${dateLabel(window.targetOn)}`} /> : null}
    {now.startsWith(String(year)) ? <span aria-hidden="true" className="ia-year-today" style={{ left: `${yearPosition(year, now)}%` }} title={`Aujourd’hui : ${dateLabel(now)}`} /> : null}
    {auditPosition !== null ? <span aria-hidden="true" className={`ia-year-audit${audit?.status === 'completed' ? ' is-completed' : ''}${auditPosition < 0 || auditPosition >= 100 ? ' is-outside' : ''}`} style={{ left: `${Math.max(1, Math.min(99, auditPosition))}%` }} title={`${audit?.status === 'completed' ? 'Réalisé' : 'Planifié'} le ${dateLabel(auditDate ?? null)}${auditPosition < 0 || auditPosition >= 100 ? ' · hors de l’année affichée' : ''}`}>{auditPosition < 0 ? '←' : auditPosition >= 100 ? '→' : audit?.status === 'completed' ? '✓' : ''}</span> : null}
    {!window.targetOn ? <span className="ia-year-unplanned">Date anniversaire à définir</span> : null}
  </div>;
}

function chapterScoreLabel(value: number | null, audit: InternalAudit | null, section: string): string {
  return value !== null ? percent(value) : audit?.rows.some((row) => row.section === section) ? 'N/A' : 'Absent';
}

function ChapterRadar({ audit, comparison }: { audit: InternalAudit; comparison: ReturnType<typeof compareAuditScores> }) {
  const chapters = comparison.sections;
  const center = 240;
  const radius = 160;
  const point = (index: number, value: number, distance = radius) => {
    const angle = index * 2 * Math.PI / Math.max(1, chapters.length) - Math.PI / 2;
    return { x: center + Math.cos(angle) * distance * value / 100, y: center + Math.sin(angle) * distance * value / 100 };
  };
  function series(name: 'current' | 'previous') {
    const points = chapters.map((row, index) => row[name] === null ? null : point(index, row[name]));
    const complete = points.length >= 3 && points.every((value) => value !== null);
    return <g className={`ia-radar-series is-${name}`}>
      {complete ? <polygon points={points.map((value) => `${value!.x},${value!.y}`).join(' ')} /> : points.map((value, index) => {
        const next = points[(index + 1) % points.length];
        return value && next && points.length > 1 ? <line key={`edge-${index}`} x1={value.x} y1={value.y} x2={next.x} y2={next.y} /> : null;
      })}
      {points.map((value, index) => value ? <circle key={chapters[index].section} cx={value.x} cy={value.y} r={name === 'previous' ? 5.5 : 3.8} data-score={chapters[index][name]}><title>{`${chapters[index].section} · ${name === 'current' ? audit.year : audit.year - 1} : ${percent(chapters[index][name])}`}</title></circle> : null)}
    </g>;
  }
  return <section className="ia-radar-panel" aria-labelledby="audit-radar-heading">
    <header><div><h3 id="audit-radar-heading">Conformité par chapitre ISM</h3><p>Une même échelle de 0 à 100 % pour comparer les deux campagnes.</p></div><div className="ia-radar-legend"><span><i />Audit {audit.year}</span><span><i className="is-previous" />Audit {audit.year - 1}</span></div></header>
    <div className="ia-radar-layout"><div className="ia-radar-visual">
      <svg className="ia-radar" viewBox="0 0 480 480" role="img" aria-label={`Scores par chapitre : audit ${audit.year} et année ${audit.year - 1}`}>
        <desc>Un point au centre représente un score de zéro. Les chapitres sans score ne sont pas tracés. Les valeurs détaillées figurent dans le tableau adjacent.</desc>
        {[25, 50, 75, 100].map((value) => <g className="ia-radar-ring" key={value}><circle cx={center} cy={center} r={radius * value / 100} /><text x={center + 7} y={center - radius * value / 100 + 12}>{value} %</text></g>)}
        {chapters.map((row, index) => {
          const axis = point(index, 100);
          const label = point(index, 100, radius + 29);
          const chapterNumber = row.section.match(/^(\d+)\./)?.[1];
          return <g className="ia-radar-axis" key={row.section}><line x1={center} y1={center} x2={axis.x} y2={axis.y} /><text x={label.x} y={label.y + 4} textAnchor="middle"><title>{row.section}</title>{chapterNumber ? `ISM ${chapterNumber}` : `C${index + 1}`}</text></g>;
        })}
        <text className="ia-radar-zero" x={center + 9} y={center + 17}>0 %</text>
        {series('previous')}{series('current')}
      </svg><p className="ia-radar-help">0 % est un score réel. N/A ou Absent : aucun point tracé ; la ligne s’interrompt.</p>
    </div><div className="ia-radar-table-scroll"><table className="ia-radar-table"><caption>Scores par chapitre · campagnes {audit.year} et {audit.year - 1}</caption><thead><tr><th scope="col">Chapitre ISM</th><th scope="col">{audit.year}</th><th scope="col">{audit.year - 1}</th><th scope="col">Évolution</th></tr></thead><tbody>{chapters.map((row) => <tr key={row.section}><th scope="row">{row.section}</th><td>{chapterScoreLabel(row.current, audit, row.section)}</td><td>{chapterScoreLabel(row.previous, comparison.previousAudit, row.section)}</td><td className={row.delta !== null && row.delta < 0 ? 'is-negative' : 'is-positive'}>{deltaLabel(row.delta)}</td></tr>)}</tbody></table><p className="ia-radar-help">N/A : aucune question applicable. Absent : chapitre ou audit non disponible pour cette année.</p></div></div>
  </section>;
}

function PhotoGallery({ photos = [], label }: { photos?: AuditPhoto[]; label: string }) {
  if (!photos.length) return null;
  return <div className="ia-photo-gallery" aria-label={label}><strong>{label}</strong><div>{photos.map((photo) => photo.url ? <a href={photo.url} key={photo.id} rel="noreferrer" target="_blank" title={`Ouvrir ${photo.fileName}`}><img alt={photo.fileName} loading="lazy" src={photo.url} /><span>{photo.fileName}</span></a> : <span key={photo.id}>{photo.fileName} · aperçu indisponible</span>)}</div></div>;
}

function PhotoUpload({ files, label, onChange, disabled }: { files: File[]; label: string; onChange: (files: File[]) => void; disabled: boolean }) {
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file)); setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  return <div className="ia-photo-upload"><label><span><Camera aria-hidden="true" size={16} />{label}</span><input accept="image/jpeg,image/png,image/webp" disabled={disabled} multiple onChange={(event) => { onChange([...files, ...Array.from(event.target.files || [])]); event.target.value = ''; }} type="file" /></label><p>JPEG, PNG ou WebP · 10 Mo maximum par photo · jusqu’à 10 photos.</p>{files.length ? <ul>{files.map((file, index) => <li key={`${file.name}-${index}`}><img alt={`Aperçu ${file.name}`} src={previews[index]} /><span>{file.name}</span><button aria-label={`Retirer ${file.name}`} className="ia-icon-button" disabled={disabled} onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))} type="button"><X size={14} /></button></li>)}</ul> : null}</div>;
}

function CompactAuditText({ text, id }: { text: string; id: string }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return <span className="ia-cell-preview" tabIndex={0} title={text} aria-describedby={hovered || focused ? id : undefined} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}><span className="ia-cell-line">{text}</span><span className="ia-cell-full" hidden={!hovered && !focused} id={id} role="tooltip">{text}</span></span>;
}
