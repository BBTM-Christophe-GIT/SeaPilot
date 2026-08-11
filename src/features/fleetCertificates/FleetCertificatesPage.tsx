import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertCircle, ArrowLeft, CalendarClock, CheckCircle2, ChevronDown, CircleDot, Clock3, Download,
  ExternalLink, FileCheck2, FilePlus2, FileText, Filter, Flag, Image,
  Plus, RefreshCw, Search, Ship, Trash2, UploadCloud, UserRound, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  createFleetCertificateDocument, deleteFleetCertificateDocuments, fetchFleetCertificates,
  getEffectiveFleetCertificateStatus, openFleetCertificateDocument, submitFleetCertificateRenewal,
  type FleetCertificateRecord,
} from './fleetCertificateQueries';
import {
  addFleetFindingComment, createFleetCertificateFinding, deleteFleetCertificateFinding,
  fetchFleetCertificateFindings, fetchFleetFindingResponsibles, FLEET_FINDING_LABELS,
  FLEET_FINDING_STATUS_LABELS, openFleetFindingAttachment, updateFleetCertificateFinding,
  uploadFleetFindingAttachment, type FleetCertificateFinding, type FleetFindingAttachmentKind,
  type FleetFindingResponsible, type FleetFindingStatus, type FleetFindingType,
} from './fleetCertificateFindings';
import { downloadFleetFindingReport, generateFleetFindingReport } from './fleetCertificateFindingReport';
import { FleetCertificateLibraryTree } from './FleetCertificateLibraryTree';

interface FleetCertificatesPageProps { client?: SupabaseClient; roles?: RoleKey[] }
type DetailTab = 'overview' | 'deadlines' | 'findings' | 'versions';

const TODAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
const TYPES = Object.entries(FLEET_FINDING_LABELS) as Array<[FleetFindingType, string]>;

function canManage(roles: RoleKey[]): boolean {
  return roles.some((role) => ['admin', 'direction', 'armement'].includes(role));
}

function formatDate(value: string): string {
  if (!value) return 'Non renseignée';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function daysFromToday(value: string): number {
  return Math.ceil((new Date(`${value}T12:00:00`).getTime() - new Date(`${TODAY}T12:00:00`).getTime()) / 86_400_000);
}

function isOverdue(finding: FleetCertificateFinding): boolean {
  return finding.status !== 'closed' && Boolean(finding.treatmentDueOn && finding.treatmentDueOn < TODAY);
}

function typeTone(type: FleetFindingType): string {
  if (type === 'major_non_conformity') return 'red';
  if (type === 'minor_non_conformity' || type === 'class_condition') return 'amber';
  return 'blue';
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="fcx-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section aria-modal="true" className="fcx-modal" role="dialog"><header><div><small>Certificats flotte</small><h2>{title}</h2></div><button aria-label="Fermer" onClick={onClose}><X size={20} /></button></header>{children}</section>
  </div>;
}

function FindingForm({ certificate, responsibles, onClose, onSave }: {
  certificate: FleetCertificateRecord; responsibles: FleetFindingResponsible[]; onClose: () => void;
  onSave: (values: { type: FleetFindingType; title: string; description: string; due: string; responsibleId: number | null }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true);
    try { await onSave({ type: form.get('type') as FleetFindingType, title: String(form.get('title')), description: String(form.get('description')), due: String(form.get('due')), responsibleId: Number(form.get('responsible')) || null }); onClose(); } finally { setSaving(false); }
  }
  return <Modal title="Déclarer un écart" onClose={onClose}><form className="fcx-form" onSubmit={submit}>
    <p className="fcx-form-context"><Ship size={16} /> {certificate.vesselName} · {certificate.documentTitle}</p>
    <label>Type<select name="type">{TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>Objet<input name="title" placeholder="Ex. Corrosion du support bâbord" required /></label>
    <label>Description<textarea name="description" placeholder="Décrivez le constat, son emplacement et l’action attendue…" rows={4} required /></label>
    <div className="fcx-form-grid"><label>Échéance de traitement<input name="due" required type="date" /></label><label>Responsable<select defaultValue="" name="responsible"><option value="">À affecter</option>{responsibles.map((person) => <option key={person.id} value={person.id}>{person.name} — {person.functionLabel}</option>)}</select></label></div>
    <footer><button onClick={onClose} type="button">Annuler</button><button className="fcx-primary" disabled={saving} type="submit"><Flag size={16} /> {saving ? 'Création…' : 'Créer l’écart'}</button></footer>
  </form></Modal>;
}

function DocumentForm({ certificates, onClose, onSave }: { certificates: FleetCertificateRecord[]; onClose: () => void; onSave: (form: FormData) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); try { await onSave(new FormData(event.currentTarget)); onClose(); } finally { setSaving(false); } }
  const vessels = Array.from(new Map(certificates.map((item) => [item.vesselId, item])).values());
  return <Modal title="Ajouter un document" onClose={onClose}><form className="fcx-form" onSubmit={submit}>
    <div className="fcx-form-grid"><label>Navire<select name="vesselId" required>{vessels.map((vessel) => <option key={vessel.vesselId} value={vessel.vesselId || ''}>{vessel.vesselName}</option>)}</select></label><label>Catégorie<input name="category" placeholder="Ex. 02 - Sécurité" required /></label></div>
    <label>Nom du document<input name="title" placeholder="Ex. Certificat de Franc-Bord" required /></label>
    <div className="fcx-form-grid"><label>Date d’émission<input name="issued" type="date" /></label><label>Date d’échéance<input name="expires" type="date" /></label></div>
    <label className="fcx-drop"><UploadCloud size={22} /><span>PDF, image ou Excel · 50 Mo maximum</span><input accept=".pdf,.png,.jpg,.jpeg,.xlsx" name="file" required type="file" /></label>
    <footer><button onClick={onClose} type="button">Annuler</button><button className="fcx-primary" disabled={saving} type="submit"><FilePlus2 size={16} /> {saving ? 'Ajout…' : 'Ajouter le document'}</button></footer>
  </form></Modal>;
}

function RenewalForm({ certificate, onClose, onSave }: { certificate: FleetCertificateRecord; onClose: () => void; onSave: (form: FormData) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); try { await onSave(new FormData(event.currentTarget)); onClose(); } finally { setSaving(false); } }
  return <Modal title="Renouveler le certificat" onClose={onClose}><form className="fcx-form" onSubmit={submit}>
    <p className="fcx-form-context"><RefreshCw size={16} /> {certificate.vesselName} · {certificate.documentTitle}</p>
    <div className="fcx-form-grid"><label>Date d’émission<input name="issued" type="date" /></label><label>Nouvelle échéance<input name="expires" required type="date" /></label></div>
    <label>Note de renouvellement<textarea name="notes" rows={3} /></label>
    <label className="fcx-drop"><UploadCloud size={22} /><span>Nouveau certificat signé</span><input accept=".pdf,.png,.jpg,.jpeg,.xlsx" name="file" required type="file" /></label>
    <footer><button onClick={onClose} type="button">Annuler</button><button className="fcx-primary" disabled={saving} type="submit"><RefreshCw size={16} /> {saving ? 'Renouvellement…' : 'Enregistrer la nouvelle version'}</button></footer>
  </form></Modal>;
}

export function FleetCertificatesPage({ client, roles }: FleetCertificatesPageProps) {
  const outlet = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outlet?.client || supabase;
  const effectiveRoles = roles || outlet?.roles || [];
  const manager = canManage(effectiveRoles);
  const [certificates, setCertificates] = useState<FleetCertificateRecord[]>([]);
  const [findings, setFindings] = useState<FleetCertificateFinding[]>([]);
  const [responsibles, setResponsibles] = useState<FleetFindingResponsible[]>([]);
  const [selectedCertificateId, setSelectedCertificateId] = useState<number | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<number | null>(null);
  const [tab, setTab] = useState<DetailTab>('findings');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'expired' | 'upcoming' | 'actions'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'finding' | 'document' | 'renewal' | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [comment, setComment] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadKind, setUploadKind] = useState<FleetFindingAttachmentKind>('finding');

  const load = useCallback(async () => {
    const [loadedCertificates, loadedFindings, loadedResponsibles] = await Promise.all([
      fetchFleetCertificates(effectiveClient), fetchFleetCertificateFindings(effectiveClient), fetchFleetFindingResponsibles(effectiveClient),
    ]);
    setCertificates(loadedCertificates); setFindings(loadedFindings); setResponsibles(loadedResponsibles);
    setSelectedFindingId((current) => current && loadedFindings.some((item) => item.id === current) ? current : null);
  }, [effectiveClient]);

  useEffect(() => { let active = true; setIsLoading(true); load().catch(() => active && setError('Impossible de charger les certificats et les écarts.')).finally(() => active && setIsLoading(false)); return () => { active = false; }; }, [load]);
  const selectedCertificate = certificates.find((item) => item.id === selectedCertificateId) || null;
  const certificateFindings = findings.filter((item) => item.certificateId === selectedCertificateId);
  const selectedFinding = certificateFindings.find((item) => item.id === selectedFindingId) || certificateFindings[0] || null;
  useEffect(() => { if (selectedFinding && selectedFinding.id !== selectedFindingId) setSelectedFindingId(selectedFinding.id); }, [selectedFinding, selectedFindingId]);
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const content = document.querySelector<HTMLElement>('.content-area');
    if (content) content.scrollTop = 0;
  }, [selectedCertificateId]);

  const active = certificates.filter((item) => item.isActiveFleet);
  const expired = active.filter((item) => getEffectiveFleetCertificateStatus(item) === 'expired');
  const upcoming = active.filter((item) => item.expiresOn && daysFromToday(item.expiresOn) >= 0 && daysFromToday(item.expiresOn) <= 90);
  const openFindings = findings.filter((item) => item.status !== 'closed');
  const vesselCertificates = selectedCertificate
    ? active.filter((item) => item.vesselId === selectedCertificate.vesselId)
    : [];
  const filtered = useMemo(() => active.filter((item) => {
    const q = search.trim().toLocaleLowerCase('fr');
    if (q && !`${item.vesselName} ${item.documentTitle} ${item.categoryLabel}`.toLocaleLowerCase('fr').includes(q)) return false;
    if (statusFilter === 'expired') return getEffectiveFleetCertificateStatus(item) === 'expired';
    if (statusFilter === 'upcoming') return upcoming.some((up) => up.id === item.id);
    if (statusFilter === 'actions') return openFindings.some((finding) => finding.certificateId === item.id);
    return true;
  }), [active, openFindings, search, statusFilter, upcoming]);

  async function run(action: () => Promise<void>, success: string) {
    setError(''); setMessage('');
    try { await action(); setMessage(success); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Action impossible.'); }
  }

  async function openDocument(certificate: FleetCertificateRecord) {
    await run(async () => { const url = await openFleetCertificateDocument(effectiveClient, certificate); window.open(url, '_blank', 'noopener,noreferrer'); }, 'Document ouvert dans un nouvel onglet.');
  }

  async function generateReport(scope: 'finding' | 'certificate' | 'selected' | 'all') {
    setReportOpen(false);
    const filteredCertificateIds = new Set(filtered.map((item) => item.id));
    const scopedFindings = scope === 'finding' && selectedFinding
      ? [selectedFinding]
      : scope === 'certificate'
        ? certificateFindings
        : scope === 'selected'
          ? findings.filter((item) => filteredCertificateIds.has(item.certificateId))
          : findings;
    const certificateIds = new Set(scopedFindings.map((item) => item.certificateId));
    const scopedCertificates = certificates.filter((item) => certificateIds.has(item.id));
    await run(async () => {
      const report = await generateFleetFindingReport({ title: scope === 'finding' ? selectedFinding?.reference || 'Écart' : scope === 'certificate' ? selectedCertificate?.documentTitle || 'Certificat' : scope === 'selected' ? 'Documents filtrés' : 'Tous les écarts flotte', certificates: scopedCertificates, findings: scopedFindings });
      downloadFleetFindingReport(report);
    }, 'Rapport BBTM généré.');
  }

  if (isLoading) return <main className="fcx-page fcx-loading"><RefreshCw className="spin" /> Chargement du registre certificats…</main>;

  return <main className="fcx-page">
    {(error || message) && <div className={`fcx-toast ${error ? 'is-error' : ''}`}><span>{error || message}</span><button onClick={() => { setError(''); setMessage(''); }}><X size={16} /></button></div>}
    {!selectedCertificate ? <>
      <header className="fcx-hero">
        <div><span className="fcx-eyebrow">CONFORMITÉ · FLOTTE</span><h1>Certificats flotte</h1><p>Échéances, documents et écarts à traiter en un seul endroit.</p></div>
        <div className="fcx-hero-actions">{manager && <button className="fcx-secondary" onClick={() => setModal('document')}><FilePlus2 size={17} /> Ajouter un document</button>}<button className="fcx-primary" onClick={() => setStatusFilter('actions')}><Flag size={17} /> Voir les sujets à traiter</button></div>
      </header>
      <section className="fcx-kpis">
        <button className="danger" onClick={() => setStatusFilter('expired')}><AlertCircle /><span><strong>{expired.length}</strong> documents échus<small>À régulariser immédiatement</small></span></button>
        <button className="amber" onClick={() => setStatusFilter('upcoming')}><CalendarClock /><span><strong>{upcoming.length}</strong> échéances à 90 jours<small>Anticiper les renouvellements</small></span></button>
        <button className="blue" onClick={() => setStatusFilter('actions')}><Flag /><span><strong>{openFindings.length}</strong> sujets à traiter<small>{openFindings.filter(isOverdue).length} action(s) en retard</small></span></button>
        <button className="green" onClick={() => setStatusFilter('all')}><FileCheck2 /><span><strong>{active.length}</strong> documents suivis<small>{new Set(active.map((item) => item.vesselName)).size} navires actifs</small></span></button>
      </section>
      <section className="fcx-toolbar"><label><Search size={18} /><input onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un certificat, un navire…" value={search} /></label><div><Filter size={16} /><button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>Tous</button><button className={statusFilter === 'expired' ? 'active' : ''} onClick={() => setStatusFilter('expired')}>Échus</button><button className={statusFilter === 'upcoming' ? 'active' : ''} onClick={() => setStatusFilter('upcoming')}>À venir</button><button className={statusFilter === 'actions' ? 'active' : ''} onClick={() => setStatusFilter('actions')}>Avec actions</button></div></section>
      <section className="fcx-dashboard-grid">
        <article className="fcx-panel"><header><div><span className="fcx-panel-icon red"><Flag size={18} /></span><div><h2>Sujets à traiter</h2><p>Priorisés par niveau de risque et délai</p></div></div><strong>{openFindings.length}</strong></header><div className="fcx-action-list">
          {openFindings.slice().sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a))).slice(0, 7).map((finding) => { const cert = certificates.find((item) => item.id === finding.certificateId); return <button key={finding.id} onClick={() => { setSelectedCertificateId(finding.certificateId); setSelectedFindingId(finding.id); setTab('findings'); }}><span className={`fcx-type-dot ${typeTone(finding.findingType)}`} /><span className="fcx-action-main"><b>{finding.title}</b><small>{cert?.vesselName} · {cert?.documentTitle}</small></span><span className="fcx-action-meta"><em className={isOverdue(finding) ? 'late' : ''}>{isOverdue(finding) ? 'En retard' : formatDate(finding.treatmentDueOn)}</em><small>{finding.responsibleName}</small></span></button>; })}
          {!openFindings.length && <div className="fcx-empty"><CheckCircle2 /> Aucun écart ouvert.</div>}
        </div></article>
        <article className="fcx-panel"><header><div><span className="fcx-panel-icon amber"><CalendarClock size={18} /></span><div><h2>Échéances à venir</h2><p>Fenêtre glissante de 90 jours</p></div></div><strong>{upcoming.length}</strong></header><div className="fcx-deadline-list">
          {upcoming.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn)).slice(0, 7).map((certificate) => { const days = daysFromToday(certificate.expiresOn); return <button key={certificate.id} onClick={() => setSelectedCertificateId(certificate.id)}><span className={`fcx-days ${days <= 30 ? 'urgent' : ''}`}><b>J-{days}</b><small>{formatDate(certificate.expiresOn)}</small></span><span><b>{certificate.documentTitle}</b><small>{certificate.vesselName} · {certificate.categoryLabel}</small></span><ChevronDown className="rotate" size={17} /></button>; })}
        </div></article>
      </section>
      <section className="fcx-library"><header><div><h2>Bibliothèque documentaire</h2><p>{filtered.length} document(s) affiché(s)</p></div></header><FleetCertificateLibraryTree key={`${search}|${statusFilter}`} certificates={filtered} formatDate={formatDate} revealMatches={Boolean(search.trim()) || statusFilter !== 'all'} onSelect={setSelectedCertificateId} /></section>
    </> : <>
      <header className="fcx-detail-head"><button className="fcx-back" onClick={() => { setSelectedCertificateId(null); setSelectedFindingId(null); }}><ArrowLeft size={18} /> Retour au tableau de bord</button><div className="fcx-detail-title"><span className="fcx-file-icon"><FileCheck2 /></span><div><span>{selectedCertificate.vesselName} · {selectedCertificate.categoryLabel}</span><h1><button className="fcx-document-title-link" onClick={() => openDocument(selectedCertificate)} type="button">{selectedCertificate.documentTitle}<ExternalLink size={16} /></button></h1><p><CircleDot size={12} /> Version {selectedCertificate.currentVersionNo} · échéance {formatDate(selectedCertificate.expiresOn)}</p></div></div><div className="fcx-detail-actions">{manager && <button onClick={() => setModal('renewal')}><RefreshCw size={16} /> Renouveler</button>}<div className="fcx-report-wrap"><button className="fcx-primary" onClick={() => setReportOpen((value) => !value)}><Download size={16} /> Générer un rapport <ChevronDown size={15} /></button>{reportOpen && <div className="fcx-report-menu"><button disabled={!selectedFinding} onClick={() => generateReport('finding')}>Cet écart</button><button onClick={() => generateReport('certificate')}>Ce certificat</button><button onClick={() => generateReport('selected')}>Documents filtrés ({filtered.length})</button><button onClick={() => generateReport('all')}>Tous les écarts flotte</button></div>}</div>{manager && <button className="icon danger" title="Supprimer" onClick={() => window.confirm('Supprimer définitivement ce certificat et ses pièces ?') && run(() => deleteFleetCertificateDocuments(effectiveClient, [selectedCertificate.id]), 'Certificat supprimé.').then(() => setSelectedCertificateId(null))}><Trash2 size={17} /></button>}</div></header>
      <nav className="fcx-tabs">{([['overview', 'Aperçu'], ['deadlines', 'Échéances'], ['findings', `Écarts & actions (${certificateFindings.filter((item) => item.status !== 'closed').length})`], ['versions', 'Versions']] as Array<[DetailTab, string]>).map(([key, label]) => <button className={tab === key ? 'active' : ''} key={key} onClick={() => setTab(key)}>{label}</button>)}</nav>
      {tab === 'findings' ? <section className="fcx-findings">
        <div className="fcx-command-center">
          <article className="fcx-command-card fcx-command-library">
            <header><div><span>{selectedCertificate.vesselName}</span><h2>Bibliothèque documentaire</h2><p>{vesselCertificates.length} document(s) pour ce navire</p></div></header>
            <FleetCertificateLibraryTree key={selectedCertificate.vesselId || selectedCertificate.vesselName} certificates={vesselCertificates} formatDate={formatDate} revealMatches selectedCertificateId={selectedCertificate.id} onSelect={setSelectedCertificateId} />
          </article>
          <article className="fcx-command-card fcx-command-actions">
            <header className="fcx-command-actions-head"><div><span>Pilotage du traitement</span><h2>Écarts & actions</h2><p>Constats, prescriptions et conditions à lever</p></div>{manager && <button className="fcx-primary" onClick={() => setModal('finding')}><Plus size={16} /> Nouvel écart</button>}</header>
            <div className="fcx-finding-summary"><span><b>{certificateFindings.filter((item) => item.status !== 'closed').length}</b> ouverts</span><span className="red"><b>{certificateFindings.filter((item) => item.findingType === 'major_non_conformity' && item.status !== 'closed').length}</b> majeurs</span><span className="amber"><b>{certificateFindings.filter(isOverdue).length}</b> en retard</span><span className="green"><b>{certificateFindings.length ? Math.round(certificateFindings.reduce((sum, item) => sum + item.progress, 0) / certificateFindings.length) : 0}%</b> traités</span></div>
            <div className="fcx-finding-workspace"><div className="fcx-finding-list"><div className="fcx-finding-columns"><span>Écart</span><span>Échéance</span><span>Responsable</span><span>Avancement</span></div>{certificateFindings.map((finding) => <button className={selectedFinding?.id === finding.id ? 'selected' : ''} key={finding.id} onClick={() => setSelectedFindingId(finding.id)}><span className="fcx-finding-name"><i className={typeTone(finding.findingType)}>{finding.findingType === 'class_condition' ? 'CC' : finding.findingType === 'prescription' ? 'P' : finding.findingType === 'finding' ? 'F' : 'NC'}</i><span><b>{finding.title}</b><small>{finding.reference} · {FLEET_FINDING_LABELS[finding.findingType]}</small></span></span><em className={isOverdue(finding) ? 'late' : ''}>{formatDate(finding.treatmentDueOn)}</em><span className="fcx-person"><UserRound size={14} />{finding.responsibleName}</span><span className="fcx-progress"><i><u style={{ width: `${finding.progress}%` }} /></i><small>{finding.progress}%</small></span></button>)}{!certificateFindings.length && <div className="fcx-empty"><CheckCircle2 /> Aucun écart rattaché à ce certificat.</div>}</div>
              <aside className="fcx-finding-detail">{selectedFinding ? <><header><div><span className={`fcx-badge ${typeTone(selectedFinding.findingType)}`}>{FLEET_FINDING_LABELS[selectedFinding.findingType]}</span><small>{selectedFinding.reference}</small><h2>{selectedFinding.title}</h2></div>{manager && <button title="Supprimer l’écart" onClick={() => window.confirm('Supprimer cet écart et ses preuves ?') && run(() => deleteFleetCertificateFinding(effectiveClient, selectedFinding.id), 'Écart supprimé.')}><Trash2 size={17} /></button>}</header><p className="fcx-description">{selectedFinding.description}</p>
                <div className="fcx-detail-grid"><label>État<select value={selectedFinding.status} onChange={(event) => run(() => updateFleetCertificateFinding(effectiveClient, selectedFinding.id, { status: event.target.value as FleetFindingStatus }), 'État mis à jour.')}><option value="declared">À affecter</option><option value="assigned">Assigné</option><option value="in_progress">En cours</option><option value="pending_validation">À valider</option><option value="closed">Clôturé</option></select></label><label>Responsable<select value={selectedFinding.responsiblePersonId || ''} onChange={(event) => { const id = Number(event.target.value) || null; const person = responsibles.find((item) => item.id === id); run(() => updateFleetCertificateFinding(effectiveClient, selectedFinding.id, { responsiblePersonId: id, responsibleName: person?.name || 'Non assigné' }), 'Responsable mis à jour.'); }}><option value="">Non assigné</option>{responsibles.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Échéance<input type="date" value={selectedFinding.treatmentDueOn} onChange={(event) => run(() => updateFleetCertificateFinding(effectiveClient, selectedFinding.id, { treatmentDueOn: event.target.value }), 'Échéance mise à jour.')} /></label><label>Avancement <b>{selectedFinding.progress}%</b><input min="0" max="100" step="10" type="range" value={selectedFinding.progress} onChange={(event) => run(() => updateFleetCertificateFinding(effectiveClient, selectedFinding.id, { progress: Number(event.target.value) }), 'Avancement mis à jour.')} /></label></div>
                <section className="fcx-evidence"><header><div><h3>Constat & preuves</h3><p>Photos ou documents liés à l’écart</p></div></header><div className="fcx-evidence-grid">{(['finding', 'treatment'] as FleetFindingAttachmentKind[]).map((kind) => <div key={kind}><strong>{kind === 'finding' ? 'Constat initial' : 'Preuve du traitement'}</strong>{selectedFinding.attachments.filter((item) => item.kind === kind).map((attachment) => <button key={attachment.id} onClick={() => run(() => openFleetFindingAttachment(effectiveClient, attachment), 'Pièce ouverte.')}><span className="fcx-thumb">{attachment.mimeType.startsWith('image/') ? <Image size={22} /> : <FileText size={22} />}</span><span><b>{attachment.originalFileName}</b><small>{formatDate(attachment.createdAt)}</small></span><ExternalLink size={14} /></button>)}<button className="fcx-add-proof" onClick={() => { setUploadKind(kind); fileInput.current?.click(); }}><Plus size={15} /> Ajouter {kind === 'finding' ? 'une pièce' : 'une preuve'}</button></div>)}</div><input ref={fileInput} hidden accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) run(() => uploadFleetFindingAttachment(effectiveClient, selectedFinding, selectedCertificate.vesselAcronym, uploadKind, file), 'Pièce ajoutée.'); event.target.value = ''; }} /></section>
                <section className="fcx-followup"><h3>Suivi du traitement</h3><form onSubmit={(event) => { event.preventDefault(); if (!comment.trim()) return; run(() => addFleetFindingComment(effectiveClient, selectedFinding, comment), 'Note ajoutée.'); setComment(''); }}><input onChange={(event) => setComment(event.target.value)} placeholder="Ajouter une note de suivi…" value={comment} /><button className="fcx-primary"><Plus size={15} /> Ajouter</button></form><div>{selectedFinding.events.slice(0, 5).map((event) => <p key={event.id}><i /><span><b>{event.note || FLEET_FINDING_STATUS_LABELS[selectedFinding.status]}</b><small><strong>{event.authorName}</strong> · {new Date(event.createdAt).toLocaleString('fr-FR')}</small></span></p>)}</div></section>
              </> : <div className="fcx-empty"><Flag /> Sélectionnez un écart.</div>}</aside></div>
          </article>
        </div>
      </section> : <section className="fcx-overview"><article><h2>{tab === 'deadlines' ? 'Échéance et renouvellement' : tab === 'versions' ? 'Versions du document' : 'Informations du certificat'}</h2>{tab === 'deadlines' ? <div className="fcx-info-cards"><p><CalendarClock /><span><small>Échéance actuelle</small><b>{formatDate(selectedCertificate.expiresOn)}</b></span></p><p><Clock3 /><span><small>Statut du workflow</small><b>{selectedCertificate.workflowStatus}</b></span></p><p><UserRound /><span><small>Prestataire</small><b>{selectedCertificate.providerName || 'Non renseigné'}</b></span></p></div> : tab === 'versions' ? <div className="fcx-version-card"><FileText /><span><button className="fcx-version-title-link" onClick={() => openDocument(selectedCertificate)} type="button">{selectedCertificate.fileName}<ExternalLink size={14} /></button><small>Version {selectedCertificate.currentVersionNo} · active · mise à jour {formatDate(selectedCertificate.updatedAt)}</small></span></div> : <div className="fcx-info-cards"><p><Ship /><span><small>Navire</small><b>{selectedCertificate.vesselName}</b></span></p><p><FileText /><span><small>Catégorie</small><b>{selectedCertificate.categoryLabel}</b></span></p><p><CalendarClock /><span><small>Émis le</small><b>{formatDate(selectedCertificate.issuedOn)}</b></span></p></div>}</article></section>}
    </>}
    {modal === 'finding' && selectedCertificate && <FindingForm certificate={selectedCertificate} responsibles={responsibles} onClose={() => setModal(null)} onSave={(values) => run(async () => { const person = responsibles.find((item) => item.id === values.responsibleId); await createFleetCertificateFinding(effectiveClient, selectedCertificate.companyId, { certificateId: selectedCertificate.id, findingType: values.type, title: values.title, description: values.description, detectedOn: TODAY, treatmentDueOn: values.due, responsiblePersonId: values.responsibleId, responsibleName: person?.name }); }, 'Écart créé.')} />}
    {modal === 'document' && <DocumentForm certificates={certificates} onClose={() => setModal(null)} onSave={(form) => run(async () => { const vessel = certificates.find((item) => item.vesselId === Number(form.get('vesselId')))!; const category = String(form.get('category')); await createFleetCertificateDocument(effectiveClient, { companyId: vessel.companyId, vesselId: vessel.vesselId!, vesselName: vessel.vesselName, vesselAcronym: vessel.vesselAcronym, categoryKey: category.toLocaleLowerCase('fr').replace(/\s+/g, '-'), categoryLabel: category, documentTitle: String(form.get('title')), issuedOn: String(form.get('issued')), expiresOn: String(form.get('expires')), file: form.get('file') as File }); }, 'Document ajouté.')} />}
    {modal === 'renewal' && selectedCertificate && <RenewalForm certificate={selectedCertificate} onClose={() => setModal(null)} onSave={(form) => run(() => submitFleetCertificateRenewal(effectiveClient, selectedCertificate, { issuedOn: String(form.get('issued')), expiresOn: String(form.get('expires')), notes: String(form.get('notes')), file: form.get('file') as File }), 'Renouvellement enregistré.')} />}
  </main>;
}
