import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Download, FilePlus2, FileText, FolderOpen, Pencil, Plus, Ship, Upload, X } from 'lucide-react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { AppDialog } from '../../components/AppDialog';
import { compareFleetAssets, fleetIllustration } from '../fleet/fleetDisplay';
import { auditDueOnFromDuration, todayAuditParis, type AuditAssigneeRole, type AuditDeadlineUnit, type AuditFindingStatus } from '../internalAudits/internalAuditModel';
import type { AppShellOutletContext } from '../shell/AppShell';
import { DOCUMENTARY_AUDIT_LABELS, DOCUMENTARY_FINDING_LABELS, DOCUMENTARY_STATUS_LABELS, defaultDocumentaryDuration, documentaryFindingIssues, documentaryFindingOverdue, type AuditAttachment, type DocumentaryAudit, type DocumentaryAuditData, type DocumentaryAuditKind, type DocumentaryFinding, type DocumentaryFindingCategory, type DocumentaryFindingEvent } from './documentaryAuditModel';
import { DOCUMENTARY_AUDIT_FILE_ACCEPT, documentaryFileMime, downloadDocumentaryFile, validateDocumentaryFiles } from './documentaryAuditFiles';
import { addDocumentaryTreatment, fetchDocumentaryAuditData, saveDocumentaryAudit, saveDocumentaryFinding } from './documentaryAuditQueries';
import { createDocumentaryAuditPreviewData } from './documentaryAuditPreview';
import './documentaryAudits.css';

const roleLabels: Record<AuditAssigneeRole, string> = { captain: 'Capitaines', chief_engineer: 'Chefs Mécaniciens', crew: 'Équipage' };
const categories = Object.keys(DOCUMENTARY_FINDING_LABELS) as DocumentaryFindingCategory[];
const statuses: AuditFindingStatus[] = ['open', 'in_progress', 'resolved'];

function dateLabel(value: string | null): string {
  if (!value) return 'Non renseignée';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Non renseignée' : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(date);
}
function fileSize(size: number): string {
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo` : `${Math.max(1, Math.ceil(size / 1024))} Ko`;
}
function errorLabel(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'L’opération a échoué. Réessayez.';
}
async function previewAttachments(files: readonly File[]): Promise<AuditAttachment[]> {
  return Promise.all(files.map(async (file) => {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Impossible de lire ${file.name}.`));
      reader.readAsDataURL(file);
    });
    const id = crypto.randomUUID();
    return { id, fileName: file.name, storagePath: `preview/${id}`, mimeType: documentaryFileMime(file), sizeBytes: file.size, url };
  }));
}

function FilePicker({ files, onChange, onError, onValidatingChange, busy, label = 'Photos et documents (facultatifs)' }: { files: File[]; onChange: (files: File[]) => void; onError: (error: string) => void; onValidatingChange: (validating: boolean) => void; busy: boolean; label?: string }) {
  const [validating, setValidating] = useState(false);
  return <div className="da-upload"><label><span><Upload size={15} />{label}</span><input type="file" multiple accept={DOCUMENTARY_AUDIT_FILE_ACCEPT} disabled={busy || validating} onChange={async (event) => {
    const additions = Array.from(event.target.files || []);
    event.target.value = '';
    setValidating(true); onValidatingChange(true);
    try { const next = [...files, ...additions]; await validateDocumentaryFiles(next); onChange(next); onError(''); }
    catch (error) { onError(errorLabel(error)); }
    finally { setValidating(false); onValidatingChange(false); }
  }} /></label><p>PDF, Word, Excel, PowerPoint, TXT, CSV, JPEG, PNG ou WebP. 25 Mo par document, 10 Mo par photo ; 10 fichiers par ajout.</p>
    {files.length > 0 && <ul>{files.map((file, index) => <li key={`${file.name}-${index}`}><FileText size={14} /><span>{file.name} · {fileSize(file.size)}</span><button type="button" className="da-icon-button" aria-label={`Retirer ${file.name}`} disabled={busy || validating} onClick={() => onChange(files.filter((_, i) => i !== index))}><X size={14} /></button></li>)}</ul>}
  </div>;
}
function FileList({ files, onDownload, busy }: { files: readonly AuditAttachment[]; onDownload: (file: AuditAttachment) => void; busy: boolean }) {
  return <div className="da-file-list">{files.map((file) => <article className="da-file" key={file.id}>
    {file.mimeType.startsWith('image/') && file.url ? <img src={file.url} alt={file.fileName} loading="lazy" /> : <FileText size={22} />}
    <div><strong>{file.fileName}</strong><small>{fileSize(file.sizeBytes)} · {file.fileName.split('.').at(-1)?.toUpperCase()}</small></div>
    <button type="button" className="is-secondary da-icon-button" aria-label={`Télécharger ${file.fileName}`} title="Télécharger" disabled={busy} onClick={() => onDownload(file)}><Download size={16} /></button>
  </article>)}</div>;
}

interface FindingForm { existing: DocumentaryFinding | null; category: DocumentaryFindingCategory; reference: string; description: string; target: string; openedOn: string; delayEnabled: boolean; amount: string; unit: AuditDeadlineUnit }

export function DocumentaryAuditsPage({ kind }: { kind: DocumentaryAuditKind }) {
  const context = useOutletContext<AppShellOutletContext>();
  return <DocumentaryWorkspace key={kind} kind={kind} context={context} />;
}

function DocumentaryWorkspace({ kind, context }: { kind: DocumentaryAuditKind; context: AppShellOutletContext }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<DocumentaryAuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedYear, setYear] = useState(Number(todayAuditParis().slice(0, 4)));
  const [siteId, setSiteId] = useState('');
  const [tab, setTab] = useState<'documents' | 'findings'>('documents');
  const [filter, setFilter] = useState('all');
  const [auditEditor, setAuditEditor] = useState<DocumentaryAudit | null>(null);
  const [uploadAudit, setUploadAudit] = useState<DocumentaryAudit | null>(null);
  const [findingForm, setFindingForm] = useState<FindingForm | null>(null);
  const [treatmentFinding, setTreatmentFinding] = useState<DocumentaryFinding | null>(null);
  const [treatmentStatus, setTreatmentStatus] = useState<AuditFindingStatus>('in_progress');
  const [treatmentNote, setTreatmentNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [filesValidating, setFilesValidating] = useState(false);
  const previewCanManage = context.roles.some((role) => ['admin', 'direction', 'armement'].includes(role));

  useEffect(() => {
    let active = true;
    const request = context.previewMode ? Promise.resolve(createDocumentaryAuditPreviewData(kind)) : fetchDocumentaryAuditData(context.client, kind);
    request.then((result) => {
      if (active) setData(context.previewMode ? { ...result, permissions: { canManage: previewCanManage, treatableFindingIds: previewCanManage ? result.permissions.treatableFindingIds : [] } } : result);
    }).catch((issue: unknown) => { if (active) setError(errorLabel(issue)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [context.client, context.previewMode, kind, previewCanManage]);

  const vessels = useMemo(() => (data?.sites || []).filter((site) => site.kind === 'vessel' && site.companyId === data?.companyId).sort(compareFleetAssets), [data?.sites, data?.companyId]);
  const scopedAudits = (data?.audits || []).filter((item) => item.kind === kind && item.companyId === data?.companyId && vessels.some((vessel) => vessel.id === item.siteId));
  const hasAuditLink = searchParams.has('audit');
  const requestedAuditId = searchParams.get('audit');
  const linkedAudit = requestedAuditId ? scopedAudits.find((item) => item.id === requestedAuditId) : undefined;
  const year = linkedAudit?.year ?? selectedYear;
  const site = vessels.find((vessel) => vessel.id === (linkedAudit?.siteId || siteId)) || vessels[0];
  const audit = hasAuditLink ? linkedAudit : scopedAudits.find((item) => item.siteId === site?.id && item.year === year);
  const auditFindings = data?.findings.filter((item) => item.auditId === audit?.id) || [];
  const displayedFindings = auditFindings.filter((item) => filter === 'all' || (filter === 'pending' ? item.status !== 'closed' : item.category === filter));
  const canManage = Boolean(data?.permissions.canManage);
  const years = [...new Set([year, ...scopedAudits.map((item) => item.year), ...Array.from({ length: 9 }, (_, i) => Number(todayAuditParis().slice(0, 4)) - 3 + i)])].sort((a, b) => b - a);
  const openedOn = findingForm?.openedOn || todayAuditParis();
  const duration = findingForm?.delayEnabled && findingForm.category !== 'remark' ? { amount: Number(findingForm.amount), unit: findingForm.unit } : null;
  const dueOn = auditDueOnFromDuration(openedOn, duration);

  function changeSelection(nextYear: number, nextSiteId: string) {
    setYear(nextYear); setSiteId(nextSiteId); setFilter('all');
    if (hasAuditLink) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('audit');
      setSearchParams(nextParams, { replace: true });
    }
  }

  async function refreshAfterSave(success: string) {
    setMessage(success);
    if (context.previewMode) return;
    try { setData(await fetchDocumentaryAuditData(context.client, kind)); }
    catch { setError(`${success} L’actualisation de l’affichage a échoué. Rechargez la page pour obtenir les dernières données.`); }
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (issue) { setError(errorLabel(issue)); }
    finally { setBusy(false); }
  }
  function startAuditEditor(existing?: DocumentaryAudit) {
    if (!data || !site || !canManage) return;
    setError(''); setMessage('');
    setAuditEditor(existing ? { ...existing } : { id: crypto.randomUUID(), companyId: data.companyId, kind, siteId: site.id, year, title: `${DOCUMENTARY_AUDIT_LABELS[kind]} · ${site.name} · ${year}`, plannedOn: null, auditedOn: null, auditorName: context.currentPerson ? `${context.currentPerson.firstName} ${context.currentPerson.lastName}`.trim() : '', files: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  async function submitAudit(event: FormEvent) {
    event.preventDefault();
    if (!auditEditor || !canManage || !auditEditor.title.trim()) return;
    await perform(async () => {
      const payload = { ...auditEditor, title: auditEditor.title.trim(), auditorName: auditEditor.auditorName.trim(), updatedAt: new Date().toISOString() };
      const saved = context.previewMode ? payload : await saveDocumentaryAudit(context.client, payload);
      setData((current) => current && { ...current, audits: [...current.audits.filter((item) => item.id !== saved.id), saved] });
      setAuditEditor(null);
      await refreshAfterSave('Dossier enregistré.');
    });
  }
  async function submitDocuments(event: FormEvent) {
    event.preventDefault();
    if (!uploadAudit || !canManage || !files.length || filesValidating) return;
    await perform(async () => {
      await validateDocumentaryFiles(files);
      const saved = context.previewMode ? { ...uploadAudit, files: [...uploadAudit.files, ...await previewAttachments(files)], updatedAt: new Date().toISOString() } : await saveDocumentaryAudit(context.client, uploadAudit, files);
      setData((current) => current && { ...current, audits: current.audits.map((item) => item.id === saved.id ? saved : item) });
      setUploadAudit(null); setFiles([]);
      await refreshAfterSave('Documents ajoutés au dossier.');
    });
  }
  function startFinding(existing?: DocumentaryFinding) {
    if (!audit || !canManage || existing?.status === 'closed') return;
    const defaults = defaultDocumentaryDuration(existing?.category || 'finding');
    setError(''); setMessage(''); setFiles([]);
    setFindingForm({ existing: existing || null, category: existing?.category || 'finding', reference: existing?.reference || '', description: existing?.description || '', target: existing ? existing.assigneePersonId ? `person:${existing.assigneePersonId}` : `role:${existing.assigneeRole}:${existing.assigneeVesselId}` : '', openedOn: existing?.openedOn || todayAuditParis(), delayEnabled: existing ? existing.treatmentDelayValue !== null : Boolean(defaults), amount: String(existing?.treatmentDelayValue || defaults?.amount || 1), unit: existing?.treatmentDelayUnit || defaults?.unit || 'weeks' });
  }
  function changeCategory(category: DocumentaryFindingCategory) {
    const defaults = defaultDocumentaryDuration(category);
    setFindingForm((form) => form && { ...form, category, delayEnabled: Boolean(defaults), amount: String(defaults?.amount || 1), unit: defaults?.unit || 'weeks' });
  }
  async function submitFinding(event: FormEvent) {
    event.preventDefault();
    if (!findingForm || !audit || !data || !canManage || findingForm.existing?.status === 'closed' || filesValidating) return;
    const [targetType, targetValue, targetVessel] = findingForm.target.split(':');
    const person = data.people.find((item) => item.id === Number(targetValue));
    const targetSite = vessels.find((item) => item.vesselId === Number(targetVessel));
    const role = targetType === 'role' ? targetValue as AuditAssigneeRole : null;
    const existing = findingForm.existing;
    const payload: DocumentaryFinding = { id: existing?.id || crypto.randomUUID(), companyId: data.companyId, auditId: audit.id, reference: findingForm.reference.trim(), category: findingForm.category, description: findingForm.description.trim(), assigneePersonId: targetType === 'person' ? Number(targetValue) : null, assigneeRole: role, assigneeVesselId: targetType === 'role' ? Number(targetVessel) : null, assigneeLabel: targetType === 'person' ? person?.name || '' : role && targetSite ? `${roleLabels[role]} ${targetSite.name}` : '', openedOn, dueOn, treatmentDelayValue: duration?.amount ?? null, treatmentDelayUnit: duration?.unit ?? null, status: existing?.status || 'open', treatment: existing?.treatment || '', resolvedAt: existing?.resolvedAt || null, closedAt: existing?.closedAt || null, files: existing?.files || [] };
    const issues = documentaryFindingIssues(payload);
    if (issues.length) { setError(issues.join(' ')); return; }
    await perform(async () => {
      await validateDocumentaryFiles(files);
      const saved = context.previewMode ? { ...payload, files: [...payload.files, ...await previewAttachments(files)] } : await saveDocumentaryFinding(context.client, payload, files);
      setData((current) => current && { ...current, findings: [...current.findings.filter((item) => item.id !== saved.id), saved] });
      setFindingForm(null); setFiles([]); setTab('findings');
      await refreshAfterSave('Écart enregistré.');
    });
  }
  function canTreat(finding: DocumentaryFinding) {
    return canManage || (finding.status !== 'closed' && Boolean(data?.permissions.treatableFindingIds.includes(finding.id)));
  }
  function startTreatment(finding: DocumentaryFinding) {
    if (!canTreat(finding)) return;
    setError(''); setMessage(''); setFiles([]); setTreatmentNote('');
    setTreatmentStatus(finding.status === 'closed' ? 'open' : finding.status === 'resolved' ? 'resolved' : 'in_progress');
    setTreatmentFinding(finding);
  }
  async function submitTreatment(event: FormEvent) {
    event.preventDefault();
    if (!treatmentFinding || !canTreat(treatmentFinding) || filesValidating) return;
    if (!treatmentNote.trim() && !files.length && treatmentStatus !== 'closed') { setError('Décrivez le traitement ou joignez une photo ou un document.'); return; }
    const note = treatmentNote.trim() || (treatmentStatus === 'closed' ? 'Écart clôturé.' : 'Pièces jointes au traitement.');
    await perform(async () => {
      await validateDocumentaryFiles(files);
      const saved: DocumentaryFindingEvent = context.previewMode ? { id: crypto.randomUUID(), findingId: treatmentFinding.id, actorId: null, actorName: context.currentPerson ? `${context.currentPerson.firstName} ${context.currentPerson.lastName}`.trim() : 'Démonstration', createdAt: new Date().toISOString(), status: treatmentStatus, treatment: note, files: await previewAttachments(files) } : await addDocumentaryTreatment(context.client, treatmentFinding.id, treatmentStatus, note, files);
      setData((current) => current && { ...current, events: [...current.events, saved], findings: current.findings.map((item) => item.id === saved.findingId ? { ...item, status: saved.status, treatment: saved.treatment, resolvedAt: saved.status === 'resolved' || saved.status === 'closed' ? item.resolvedAt || saved.createdAt : null, closedAt: saved.status === 'closed' ? saved.createdAt : null } : item) });
      setTreatmentFinding(null); setFiles([]); setTreatmentNote('');
      await refreshAfterSave('Suivi enregistré.');
    });
  }
  async function loadFile(file: AuditAttachment): Promise<Blob> {
    if (!context.previewMode) return downloadDocumentaryFile(context.client, file);
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`Impossible de télécharger ${file.fileName}.`);
    return response.blob();
  }
  async function download(file: AuditAttachment) {
    await perform(async () => {
      const blob = await loadFile(file);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = file.fileName; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  async function exportReport(findingId?: string) {
    if (!audit || !site || !data) return;
    await perform(async () => {
      const { downloadDocumentaryAuditReport } = await import('./documentaryAuditReport');
      await downloadDocumentaryAuditReport({ audit, site, findings: auditFindings, events: data.events.filter((event) => auditFindings.some((finding) => finding.id === event.findingId)), findingId, loadFile });
      setMessage('Rapport PDF téléchargé.');
    });
  }
  const dialogFooter = (close: () => void, label: string, disabled = false) => <div className="da-dialog-actions"><button type="button" className="is-secondary" disabled={busy || filesValidating} onClick={close}>Annuler</button><button type="submit" disabled={busy || filesValidating || disabled}>{busy ? 'Enregistrement…' : filesValidating ? 'Vérification des fichiers…' : label}</button></div>;
  const dialogError = error ? <p className="da-alert is-error" role="alert">{error}</p> : null;

  if (!loading && data && hasAuditLink && !linkedAudit) return <div className="documentary-audits-page">
    <header className="da-header"><div><p className="da-eyebrow">Audits</p><h1>{DOCUMENTARY_AUDIT_LABELS[kind]}</h1></div></header>
    <section className="da-empty"><FolderOpen size={38} /><p role="alert">L’audit demandé n’est pas accessible dans cette rubrique.</p><button type="button" disabled={busy || filesValidating} onClick={() => {
      setAuditEditor(null); setUploadAudit(null); setFindingForm(null); setTreatmentFinding(null); setFiles([]); setFilter('all'); setError(''); setMessage('');
      const nextParams = new URLSearchParams(searchParams); nextParams.delete('audit'); setSearchParams(nextParams, { replace: true });
    }}>Retour aux dossiers</button></section>
  </div>;

  return <div className="documentary-audits-page">
    <header className="da-header"><div><p className="da-eyebrow">Audits</p><h1>{DOCUMENTARY_AUDIT_LABELS[kind]}</h1><p>Documents et suivi des écarts, par navire et par année.</p></div><label className="da-year">Année<select aria-label="Année des audits" value={year} disabled={busy} onChange={(event) => changeSelection(Number(event.target.value), site?.id || '')}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></header>
    {error && !auditEditor && !uploadAudit && !findingForm && !treatmentFinding && <p className="da-alert is-error" role="alert"><AlertCircle size={16} />{error}</p>}
    {message && <p className="da-alert is-success" role="status"><CheckCircle2 size={16} />{message}</p>}
    {loading ? <p className="da-loading" role="status">Chargement des dossiers d’audit…</p> : !vessels.length ? <section className="da-empty"><Ship size={35} /><h2>Aucun navire disponible</h2><p>Les dossiers apparaîtront ici pour les navires auxquels vous avez accès.</p></section> : <div className="da-workspace">
      <aside className="da-vessels" aria-label="Navires"><header><h2>Navires</h2><span>{vessels.length}</span></header><div className="da-vessel-list">{vessels.map((vessel) => {
        const folder = scopedAudits.find((item) => item.siteId === vessel.id && item.year === year);
        const image = fleetIllustration(vessel);
        return <button type="button" className="da-vessel-button" key={vessel.id} aria-pressed={vessel.id === site?.id} disabled={busy} onClick={() => changeSelection(year, vessel.id)}><span className="da-vessel-image">{image ? <img src={image} alt="" /> : <Ship size={21} />}</span><span><strong>{vessel.name}</strong><small>{folder ? `${folder.files.length} document${folder.files.length > 1 ? 's' : ''} · ${data?.findings.filter((finding) => finding.auditId === folder.id).length || 0} écart(s)` : 'Dossier à créer'}</small></span></button>;
      })}</div></aside>
      <section className="da-detail">{audit ? <>
        <header className="da-audit-header"><div><p className="da-audit-label">{site?.name} · {year}</p><h2>{audit.title}</h2><p className="da-audit-dates"><span>Date prévue : <strong>{audit.plannedOn ? dateLabel(audit.plannedOn) : 'Non planifié'}</strong></span><span>Réalisé le : {dateLabel(audit.auditedOn)}</span><span>Auditeur : {audit.auditorName || 'Non renseigné'}</span></p></div><div className="da-header-actions">{canManage && <button type="button" className="is-secondary da-icon-button" aria-label="Modifier le dossier" title="Modifier le dossier" disabled={busy} onClick={() => startAuditEditor(audit)}><Pencil size={16} /></button>}<button type="button" className="is-secondary" disabled={busy} onClick={() => exportReport()}><Download size={15} />Exporter le rapport PDF</button></div></header>
        <nav className="da-tabs" aria-label="Contenu du dossier"><button type="button" aria-current={tab === 'documents' ? 'page' : undefined} onClick={() => setTab('documents')}>Documents <span>{audit.files.length}</span></button><button type="button" aria-current={tab === 'findings' ? 'page' : undefined} onClick={() => setTab('findings')}>Écarts <span>{auditFindings.length}</span></button></nav>
        {tab === 'documents' ? <section className="da-section"><div className="da-section-toolbar"><p>Les documents réunis dans ce dossier constituent l’audit.</p>{canManage && <button type="button" disabled={busy} onClick={() => { setError(''); setFiles([]); setUploadAudit(audit); }}><FilePlus2 size={16} />Ajouter des documents</button>}</div>{audit.files.length ? <FileList files={audit.files} busy={busy} onDownload={download} /> : <div className="da-empty"><FolderOpen size={31} /><h3>Aucun document pour cet audit</h3><p>Ajoutez le rapport et ses pièces complémentaires dans ce dossier annuel.</p></div>}</section> : <section className="da-section"><div className="da-section-toolbar"><label><span className="da-sr-only">Filtrer les écarts</span><select aria-label="Filtrer les écarts" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Tous les écarts</option><option value="pending">Non clôturés</option>{categories.map((category) => <option key={category} value={category}>{DOCUMENTARY_FINDING_LABELS[category]}</option>)}</select></label>{canManage && <button type="button" disabled={busy} onClick={() => startFinding()}><Plus size={16} />Créer un écart</button>}</div>
          {displayedFindings.length ? <div className="da-finding-list">{displayedFindings.map((finding) => {
            const history = (data?.events.filter((event) => event.findingId === finding.id) || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            const overdue = documentaryFindingOverdue(finding);
            return <article className="da-finding" key={finding.id} aria-label={finding.reference || finding.description}><header><div className="da-finding-badges"><span className={`da-badge is-${finding.category}`}>{DOCUMENTARY_FINDING_LABELS[finding.category]}</span><span className={`da-badge is-${finding.status}`}>{DOCUMENTARY_STATUS_LABELS[finding.status]}</span></div><span className="da-reference">{finding.reference}</span></header><h3>{finding.description}</h3><div className="da-finding-meta"><span><small>Responsable</small><strong>{finding.assigneeLabel}</strong></span><span className={overdue ? 'is-overdue' : undefined}><small>Échéance</small><strong>{finding.dueOn ? `${dateLabel(finding.dueOn)}${overdue ? ' · En retard' : ''}` : 'Sans échéance'}</strong></span><span><small>Créé le</small><strong>{dateLabel(finding.openedOn)}</strong></span></div>
              {finding.files.length > 0 && <div className="da-attached-files"><strong>Pièces jointes au constat</strong><FileList files={finding.files} busy={busy} onDownload={download} /></div>}
              {finding.treatment && <p className="da-last-treatment">{finding.treatment}</p>}
              <div className="da-actions">{canTreat(finding) && <button type="button" disabled={busy} onClick={() => startTreatment(finding)}>{finding.status === 'closed' ? 'Réouvrir l’écart' : 'Suivre le traitement'}</button>}{canManage && finding.status !== 'closed' && <button type="button" className="is-secondary" disabled={busy} onClick={() => startFinding(finding)}><Pencil size={14} />Modifier le constat</button>}<button type="button" className="is-secondary" disabled={busy} onClick={() => exportReport(finding.id)}><Download size={14} />Exporter cet écart</button></div>
              {history.length > 0 && <details className="da-history"><summary>Historique du traitement ({history.length})</summary><ol>{history.map((event) => <li key={event.id}><header><strong>{event.actorName} · {DOCUMENTARY_STATUS_LABELS[event.status]}</strong><small>{dateLabel(event.createdAt)}</small></header><p>{event.treatment}</p>{event.files.length > 0 && <FileList files={event.files} busy={busy} onDownload={download} />}</li>)}</ol></details>}
            </article>;
          })}</div> : <div className="da-empty"><CheckCircle2 size={31} /><h3>{auditFindings.length ? 'Aucun écart pour ce filtre' : 'Aucun écart enregistré'}</h3><p>Les constats, responsables et traitements de cet audit seront réunis ici.</p></div>}
        </section>}
      </> : <section className="da-empty"><FolderOpen size={38} /><h2>{site?.name} · {year}</h2><h3>Aucun dossier d’audit pour cette année</h3><p>{canManage ? 'Créez le dossier, puis ajoutez les documents et les éventuels écarts de cet audit.' : 'Le dossier sera disponible dès sa création par un gestionnaire.'}</p>{canManage && <button type="button" disabled={busy} onClick={() => startAuditEditor()}><Plus size={16} />Créer le dossier</button>}</section>}</section>
    </div>}
    {auditEditor && <AppDialog title={data?.audits.some((item) => item.id === auditEditor.id) ? 'Modifier le dossier d’audit' : 'Créer le dossier d’audit'} description={`${DOCUMENTARY_AUDIT_LABELS[kind]} · ${vessels.find((item) => item.id === auditEditor.siteId)?.name} · ${auditEditor.year}`} isBusy={busy} onClose={() => setAuditEditor(null)} onSubmit={submitAudit} footer={dialogFooter(() => setAuditEditor(null), 'Enregistrer le dossier')}>
      {dialogError}<div className="da-form-grid">
        <label className="da-full">Titre du dossier<input value={auditEditor.title} required maxLength={200} disabled={busy} onChange={(event) => setAuditEditor({ ...auditEditor, title: event.target.value })} /></label>
        <label>Date prévue (facultative)<input type="date" value={auditEditor.plannedOn || ''} disabled={busy} onChange={(event) => setAuditEditor({ ...auditEditor, plannedOn: event.target.value || null })} /></label>
        <label>Date de l’audit<input type="date" value={auditEditor.auditedOn || ''} disabled={busy} onChange={(event) => setAuditEditor({ ...auditEditor, auditedOn: event.target.value || null })} /></label>
        <label className="da-full">Auditeur<input value={auditEditor.auditorName} maxLength={200} disabled={busy} onChange={(event) => setAuditEditor({ ...auditEditor, auditorName: event.target.value })} /></label>
      </div><p className="da-form-help">Le navire, l’année et le type d’audit identifient ce dossier. Les documents s’ajoutent une fois le dossier créé. La date prévue inscrit l’audit dans le planning global ; laissez-la vide pour ne pas le planifier.</p>
    </AppDialog>}
    {uploadAudit && <AppDialog title="Ajouter des documents au dossier" description={uploadAudit.title} isBusy={busy || filesValidating} onClose={() => { setUploadAudit(null); setFiles([]); }} onSubmit={submitDocuments} footer={dialogFooter(() => { setUploadAudit(null); setFiles([]); }, 'Ajouter les documents', !files.length)}>{dialogError}<FilePicker files={files} onChange={setFiles} onError={setError} onValidatingChange={setFilesValidating} busy={busy} label="Documents de l’audit" /></AppDialog>}
    {findingForm && <AppDialog title={findingForm.existing ? 'Modifier le constat' : 'Créer un écart'} description={audit?.title} size="lg" isBusy={busy || filesValidating} onClose={() => { setFindingForm(null); setFiles([]); }} onSubmit={submitFinding} footer={dialogFooter(() => { setFindingForm(null); setFiles([]); }, 'Enregistrer l’écart')}>
      {dialogError}<div className="da-form-grid"><label>Catégorie<select value={findingForm.category} disabled={busy} onChange={(event) => changeCategory(event.target.value as DocumentaryFindingCategory)}>{categories.map((category) => <option key={category} value={category}>{DOCUMENTARY_FINDING_LABELS[category]}</option>)}</select></label><label>Référence (facultative)<input value={findingForm.reference} maxLength={120} disabled={busy} onChange={(event) => setFindingForm({ ...findingForm, reference: event.target.value })} /></label><label className="da-full">Description du constat<textarea value={findingForm.description} rows={3} maxLength={10000} required disabled={busy} onChange={(event) => setFindingForm({ ...findingForm, description: event.target.value })} /></label><label className="da-full">Responsable de traitement<select required value={findingForm.target} disabled={busy} onChange={(event) => setFindingForm({ ...findingForm, target: event.target.value })}><option value="">Choisir une personne ou une fonction</option><optgroup label="Personnes">{data?.people.map((person) => <option key={person.id} value={`person:${person.id}`}>{person.name}{person.functionLabel ? ` · ${person.functionLabel}` : ''}</option>)}</optgroup>{vessels.filter((vessel) => vessel.vesselId).map((vessel) => <optgroup label={vessel.name} key={vessel.id}>{(Object.keys(roleLabels) as AuditAssigneeRole[]).map((role) => <option key={role} value={`role:${role}:${vessel.vesselId}`}>{roleLabels[role]} {vessel.name}</option>)}</optgroup>)}</select></label>
        {findingForm.category === 'finding' && <label className="da-full da-delay-toggle"><input type="checkbox" checked={findingForm.delayEnabled} disabled={busy} onChange={(event) => setFindingForm({ ...findingForm, delayEnabled: event.target.checked })} />Prévoir un délai de traitement (facultatif)</label>}
        {findingForm.delayEnabled && findingForm.category !== 'remark' && <><label>Délai de traitement<input type="number" min={1} max={3650} step={1} required value={findingForm.amount} disabled={busy} onChange={(event) => setFindingForm({ ...findingForm, amount: event.target.value })} /></label><label>Unité du délai<select value={findingForm.unit} disabled={busy} onChange={(event) => setFindingForm({ ...findingForm, unit: event.target.value as AuditDeadlineUnit })}><option value="days">Jour(s)</option><option value="weeks">Semaine(s)</option><option value="months">Mois</option></select></label></>}
        <div className="da-full da-deadline"><strong>{dueOn ? `Échéance calculée : ${dateLabel(dueOn)}` : 'Sans échéance de traitement'}</strong><small>Constat créé le {dateLabel(openedOn)}{findingForm.category === 'remark' ? ' · La clôture d’une remarque est facultative.' : ''}</small></div><div className="da-full"><FilePicker files={files} onChange={setFiles} onError={setError} onValidatingChange={setFilesValidating} busy={busy} /></div>{findingForm.existing?.files.length ? <div className="da-full da-attached-files"><strong>Pièces jointes conservées</strong><FileList files={findingForm.existing.files} busy={busy} onDownload={download} /></div> : null}
      </div>
    </AppDialog>}
    {treatmentFinding && <AppDialog title={treatmentFinding.status === 'closed' ? 'Réouvrir l’écart' : 'Suivre le traitement'} description={treatmentFinding.description} size="lg" isBusy={busy || filesValidating} onClose={() => { setTreatmentFinding(null); setFiles([]); }} onSubmit={submitTreatment} footer={dialogFooter(() => { setTreatmentFinding(null); setFiles([]); }, 'Enregistrer le suivi')}>
      {dialogError}<div className="da-form-grid"><label className="da-full">Avancement<select value={treatmentStatus} disabled={busy} onChange={(event) => setTreatmentStatus(event.target.value as AuditFindingStatus)}>{statuses.filter((status) => treatmentFinding.status !== 'closed' || status !== 'resolved').map((status) => <option key={status} value={status}>{DOCUMENTARY_STATUS_LABELS[status]}</option>)}{canManage && (treatmentFinding.status === 'resolved' || treatmentFinding.category === 'remark' && treatmentFinding.status !== 'closed') && <option value="closed">{DOCUMENTARY_STATUS_LABELS.closed}</option>}</select></label><label className="da-full">Traitement / commentaire<textarea value={treatmentNote} rows={3} maxLength={10000} disabled={busy} onChange={(event) => setTreatmentNote(event.target.value)} /></label><div className="da-full"><FilePicker files={files} onChange={setFiles} onError={setError} onValidatingChange={setFilesValidating} busy={busy} label="Photos et documents du traitement ou de la clôture (facultatifs)" /></div></div><p className="da-form-help">Le suivi conserve l’auteur, la date, le commentaire et les pièces jointes de chaque intervention.{treatmentStatus === 'closed' ? ' Le commentaire de clôture est facultatif.' : ' Renseignez un commentaire ou une pièce jointe.'}</p>
    </AppDialog>}
  </div>;
}
