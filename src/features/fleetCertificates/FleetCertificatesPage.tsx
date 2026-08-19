import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertCircle, CalendarPlus, CheckCircle2, Download,
  ExternalLink, FileCheck2, FilePlus2, FileText, Filter, Flag, Image,
  Plus, RefreshCw, Search, Ship, Trash2, UploadCloud, UserRound, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ModuleRibbon, ModuleRibbonCommand, ModuleRibbonGroup } from '../../components/ModuleRibbon';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  buildFleetCertificateFileName, createFleetCertificateDocument, deleteFleetCertificateDocuments,
  downloadFleetCertificateDocuments, fetchFleetCertificateDocumentNames, fetchFleetCertificates,
  getDefaultFleetCertificateExpiryDate,
  getEffectiveFleetCertificateStatus, openFleetCertificateDocument, submitFleetCertificateRenewal,
  normalizeFleetCertificateDocumentName,
  type FleetCertificateRecord,
} from './fleetCertificateQueries';
import {
  addFleetFindingComment, createFleetCertificateFinding, deleteFleetCertificateFinding,
  fetchFleetCertificateFindings, fetchFleetFindingResponsibles, FLEET_FINDING_LABELS,
  FLEET_FINDING_STATUS_LABELS, openFleetFindingAttachment, updateFleetCertificateFinding,
  uploadFleetFindingAttachment, type FleetCertificateFinding, type FleetFindingAttachmentKind,
  type FleetFindingResponsible, type FleetFindingStatus, type FleetFindingType,
} from './fleetCertificateFindings';
import {
  downloadFleetFindingReport,
  generateFleetFindingReport,
  loadFleetFindingReportImages,
} from './fleetCertificateFindingReport';
import {
  downloadFleetCertificateVisitReport,
  generateFleetCertificateVisitReport,
} from './fleetCertificateVisitReport';
import { FleetCertificateLibraryTree } from './FleetCertificateLibraryTree';
import {
  createDefaultFleetCertificateDocumentPath,
  FleetCertificateDocumentFields,
  type FleetCertificateDocumentPath,
} from './FleetCertificateDocumentFields';
import {
  FleetCertificateReportDialog,
  resolveFleetCertificateReportSelection,
  type FleetCertificateReportSelection,
} from './FleetCertificateReportDialog';
import { FleetCertificateDeadlinesByScope, FleetCertificateFindingsByScope } from './FleetCertificateScopeViews';
import { FleetCertificateVisitCalendar } from './FleetCertificateVisitCalendar';
import { FleetCertificateVisitForm } from './FleetCertificateVisitForm';
import {
  fetchFleetCertificateVisits, fetchFleetServiceProviders, saveFleetCertificateVisit,
  type FleetCertificateVisit, type FleetServiceProvider, type SaveFleetCertificateVisitInput,
} from './fleetCertificateVisits';

interface FleetCertificatesPageProps { client?: SupabaseClient; roles?: RoleKey[] }

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
    <section aria-label={title} aria-modal="true" className="fcx-modal" role="dialog"><header><div><small>Certificats flotte</small><h2>{title}</h2></div><button aria-label="Fermer" onClick={onClose}><X size={20} /></button></header>{children}</section>
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

function DocumentForm({ certificates, documentNames, onClose, onSave }: { certificates: FleetCertificateRecord[]; documentNames: string[]; onClose: () => void; onSave: (form: FormData) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const vessels = useMemo(() => Array.from(new Map(certificates.filter((item) => item.vesselId).map((item) => [item.vesselId, item])).values()), [certificates]);
  const categories = useMemo(() => Array.from(new Map(certificates.map((item) => [item.categoryKey, { key: item.categoryKey, label: item.categoryLabel }])).values())
    .sort((left, right) => left.label.localeCompare(right.label, 'fr', { numeric: true })), [certificates]);
  const vesselLabels = useMemo(() => certificates.flatMap((item) => [item.vesselName, item.vesselAcronym]), [certificates]);
  const suggestedNames = useMemo(() => Array.from(new Set([...documentNames, ...certificates.map((item) => item.documentTitle)]
    .map((name) => normalizeFleetCertificateDocumentName(name, vesselLabels)).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, 'fr')), [certificates, documentNames, vesselLabels]);
  const [vesselId, setVesselId] = useState(String(vessels[0]?.vesselId || ''));
  const [documentTitle, setDocumentTitle] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [fileName, setFileName] = useState('document.pdf');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); try { await onSave(new FormData(event.currentTarget)); onClose(); } finally { setSaving(false); } }
  const selectedVessel = vessels.find((vessel) => String(vessel.vesselId) === vesselId);
  const canonicalTitle = normalizeFleetCertificateDocumentName(documentTitle, vesselLabels);
  const finalFileName = selectedVessel && canonicalTitle && issuedOn
    ? buildFleetCertificateFileName({ vesselName: selectedVessel.vesselName, documentTitle: canonicalTitle }, issuedOn, fileName)
    : '';
  return <Modal title="Ajouter un document" onClose={onClose}><form className="fcx-form" onSubmit={submit}>
    <div className="fcx-form-grid"><label>Navire<select name="vesselId" onChange={(event) => setVesselId(event.target.value)} required value={vesselId}>{vessels.map((vessel) => <option key={vessel.vesselId} value={vessel.vesselId || ''}>{vessel.vesselName}</option>)}</select></label><label>Catégorie<select defaultValue="" name="category" required><option disabled value="">Sélectionner une catégorie</option>{categories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}</select></label></div>
    <label>Nom du document<input aria-label="Nom du document" list="fleet-certificate-document-names" name="title" onChange={(event) => setDocumentTitle(event.target.value)} placeholder="Ex. Certificat de Franc-Bord" required value={documentTitle} /><datalist id="fleet-certificate-document-names">{suggestedNames.map((name) => <option key={name} value={name} />)}</datalist><small className="fcx-field-help">Choisissez un nom existant ou saisissez-en un nouveau.</small></label>
    <div className="fcx-form-grid"><label>Date d’émission<input name="issued" onChange={(event) => { const value = event.target.value; setIssuedOn(value); setExpiresOn(getDefaultFleetCertificateExpiryDate(value)); }} required type="date" value={issuedOn} /></label><label>Date d’échéance (facultative)<input aria-label="Date d’échéance (facultative)" name="expires" onChange={(event) => setExpiresOn(event.target.value)} type="date" value={expiresOn} /></label></div>
    {finalFileName && <p className="fcx-file-name-preview"><FileText size={16} /><span>Nom final du fichier<strong>{finalFileName}</strong></span></p>}
    <label className="fcx-drop"><UploadCloud size={22} /><span>PDF, image ou Excel · 50 Mo maximum</span><input accept=".pdf,.png,.jpg,.jpeg,.xlsx" name="file" onChange={(event) => setFileName(event.target.files?.[0]?.name || 'document.pdf')} required type="file" /></label>
    <footer><button onClick={onClose} type="button">Annuler</button><button className="fcx-primary" disabled={saving} type="submit"><FilePlus2 size={16} /> {saving ? 'Ajout…' : 'Ajouter le document'}</button></footer>
  </form></Modal>;
}

function RenewalForm({ certificate, onClose, onSave }: { certificate: FleetCertificateRecord; onClose: () => void; onSave: (form: FormData) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [fileName, setFileName] = useState('document.pdf');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); try { await onSave(new FormData(event.currentTarget)); onClose(); } finally { setSaving(false); } }
  const finalFileName = issuedOn ? buildFleetCertificateFileName(certificate, issuedOn, fileName) : '';
  return <Modal title="Renouveler le certificat" onClose={onClose}><form className="fcx-form" onSubmit={submit}>
    <p className="fcx-form-context"><RefreshCw size={16} /> {certificate.vesselName} · {certificate.documentTitle}</p>
    <div className="fcx-form-grid"><label>Date d’émission<input name="issued" onChange={(event) => { const value = event.target.value; setIssuedOn(value); setExpiresOn(getDefaultFleetCertificateExpiryDate(value)); }} required type="date" value={issuedOn} /></label><label>Nouvelle échéance (facultative)<input aria-label="Nouvelle échéance (facultative)" name="expires" onChange={(event) => setExpiresOn(event.target.value)} type="date" value={expiresOn} /></label></div>
    {finalFileName && <p className="fcx-file-name-preview"><FileText size={16} /><span>Nom final du fichier<strong>{finalFileName}</strong></span></p>}
    <label>Note de renouvellement<textarea name="notes" rows={3} /></label>
    <label className="fcx-drop"><UploadCloud size={22} /><span>Nouveau certificat signé</span><input accept=".pdf,.png,.jpg,.jpeg,.xlsx" name="file" onChange={(event) => setFileName(event.target.files?.[0]?.name || 'document.pdf')} required type="file" /></label>
    <footer><button onClick={onClose} type="button">Annuler</button><button className="fcx-primary" disabled={saving} type="submit"><RefreshCw size={16} /> {saving ? 'Renouvellement…' : 'Enregistrer la nouvelle version'}</button></footer>
  </form></Modal>;
}

function VisitTargetForm({ certificates, onClose, onSelect }: {
  certificates: FleetCertificateRecord[];
  onClose: () => void;
  onSelect: (certificateId: number) => void;
}) {
  const [path, setPath] = useState<FleetCertificateDocumentPath>(() => createDefaultFleetCertificateDocumentPath(certificates));
  const selectedCertificate = certificates.find((certificate) => certificate.id === path.certificateId);
  return <Modal title="Choisir le document de la visite" onClose={onClose}><form className="fcx-form fcx-visit-target-form" onSubmit={(event) => { event.preventDefault(); if (path.certificateId) onSelect(path.certificateId); }}>
    <div className="fcx-dialog-section-title"><span>1</span><div><h3>Document concerné</h3><p>Sélectionnez successivement le navire, la catégorie puis le document.</p></div></div>
    <FleetCertificateDocumentFields certificates={certificates} onChange={setPath} value={path} />
    {selectedCertificate ? <p className="fcx-visit-target-summary"><CalendarPlus size={18} /><span><small>Visite à programmer</small><b>{selectedCertificate.documentTitle}</b><em>{selectedCertificate.vesselName} · {selectedCertificate.categoryLabel}</em></span></p> : null}
    <footer><button onClick={onClose} type="button">Annuler</button><button className="fcx-primary" type="submit">Continuer</button></footer>
  </form></Modal>;
}

type FleetCertificateWorkspaceTab = 'findings' | 'deadlines' | 'visits' | 'preview';

function formatFileSize(value: number | null): string {
  if (!value) return 'Non renseignée';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} Ko`;
  return `${(value / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

function FleetCertificateDocumentPreview({
  certificate,
  error,
  isLoading,
  onDownload,
  previewUrl,
}: {
  certificate: FleetCertificateRecord | null;
  error: string;
  isLoading: boolean;
  onDownload: (certificate: FleetCertificateRecord) => void;
  previewUrl: string;
}) {
  if (!certificate) {
    return <div className="fcx-preview-empty"><FileCheck2 size={30} /><h3>Sélectionnez un document</h3><p>Cliquez sur une ligne ou sur son titre dans la bibliothèque pour l’afficher ici.</p></div>;
  }

  const isImage = certificate.mimeType.startsWith('image/');
  const canEmbed = isImage || certificate.mimeType === 'application/pdf' || certificate.fileName.toLowerCase().endsWith('.pdf');

  return <div className="fcx-document-preview">
    <section className="fcx-preview-stage" aria-label={`Aperçu de ${certificate.documentTitle}`}>
      <header><span><FileText size={17} /><strong>{certificate.fileName || certificate.documentTitle}</strong></span><button onClick={() => onDownload(certificate)} type="button"><Download size={16} /> Télécharger</button></header>
      <div>
        {isLoading ? <div className="fcx-preview-status"><RefreshCw className="spin" /> Chargement de l’aperçu…</div> : null}
        {!isLoading && error ? <div className="fcx-preview-status is-error"><AlertCircle /> {error}</div> : null}
        {!isLoading && !error && previewUrl && isImage ? <img alt={`Aperçu de ${certificate.documentTitle}`} src={previewUrl} /> : null}
        {!isLoading && !error && previewUrl && canEmbed && !isImage ? <iframe src={previewUrl} title={`Aperçu de ${certificate.documentTitle}`} /> : null}
        {!isLoading && !error && previewUrl && !canEmbed ? <div className="fcx-preview-status"><FileText /> Ce format ne peut pas être prévisualisé. Utilisez Télécharger.</div> : null}
      </div>
    </section>
    <aside className="fcx-preview-metadata">
      <h3>Informations du document</h3>
      <dl>
        <div><dt>Navire</dt><dd>{certificate.vesselName}</dd></div>
        <div><dt>Catégorie</dt><dd>{certificate.categoryLabel}</dd></div>
        <div><dt>Document</dt><dd>{certificate.documentTitle}</dd></div>
        <div><dt>Date d’émission</dt><dd>{formatDate(certificate.issuedOn)}</dd></div>
        <div><dt>Date d’échéance</dt><dd>{formatDate(certificate.expiresOn)}</dd></div>
        <div><dt>Version</dt><dd>v{certificate.currentVersionNo}</dd></div>
        <div><dt>Fichier</dt><dd>{formatFileSize(certificate.fileSizeBytes)}</dd></div>
      </dl>
      <button className="fcx-secondary" onClick={() => onDownload(certificate)} type="button"><Download size={16} /> Télécharger le document</button>
    </aside>
  </div>;
}

export function FleetCertificatesPage({ client, roles }: FleetCertificatesPageProps) {
  const outlet = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outlet?.client || supabase;
  const effectiveRoles = roles || outlet?.roles || [];
  const manager = canManage(effectiveRoles);
  const [certificates, setCertificates] = useState<FleetCertificateRecord[]>([]);
  const [findings, setFindings] = useState<FleetCertificateFinding[]>([]);
  const [responsibles, setResponsibles] = useState<FleetFindingResponsible[]>([]);
  const [providers, setProviders] = useState<FleetServiceProvider[]>([]);
  const [visits, setVisits] = useState<FleetCertificateVisit[]>([]);
  const [documentNames, setDocumentNames] = useState<string[]>([]);
  const [selectedCertificateId, setSelectedCertificateId] = useState<number | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<number>>(() => new Set());
  const [selectedFindingId, setSelectedFindingId] = useState<number | null>(null);
  const [scopeVesselName, setScopeVesselName] = useState('');
  const [scopeCategoryKey, setScopeCategoryKey] = useState('');
  const [scopeCategoryLabel, setScopeCategoryLabel] = useState('');
  const [activeTab, setActiveTab] = useState<FleetCertificateWorkspaceTab>('findings');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'expired' | 'upcoming' | 'actions'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'finding' | 'document' | 'renewal' | 'report' | 'visit-target' | 'visit' | null>(null);
  const [visitCertificateId, setVisitCertificateId] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadKind, setUploadKind] = useState<FleetFindingAttachmentKind>('finding');

  const load = useCallback(async () => {
    const [loadedCertificates, loadedFindings, loadedResponsibles, loadedProviders, loadedVisits, loadedDocumentNames] = await Promise.all([
      fetchFleetCertificates(effectiveClient), fetchFleetCertificateFindings(effectiveClient), fetchFleetFindingResponsibles(effectiveClient),
      fetchFleetServiceProviders(effectiveClient), fetchFleetCertificateVisits(effectiveClient), fetchFleetCertificateDocumentNames(effectiveClient),
    ]);
    setCertificates(loadedCertificates); setFindings(loadedFindings); setResponsibles(loadedResponsibles);
    setProviders(loadedProviders); setVisits(loadedVisits); setDocumentNames(loadedDocumentNames);
    setSelectedCertificateId((current) => current && loadedCertificates.some((item) => item.id === current) ? current : null);
    setSelectedDocumentIds((current) => new Set(Array.from(current).filter((id) => loadedCertificates.some((item) => item.id === id))));
    setSelectedFindingId((current) => current && loadedFindings.some((item) => item.id === current) ? current : null);
  }, [effectiveClient]);

  useEffect(() => { let active = true; setIsLoading(true); load().catch(() => active && setError('Impossible de charger les certificats et les écarts.')).finally(() => active && setIsLoading(false)); return () => { active = false; }; }, [load]);
  const selectedCertificate = certificates.find((item) => item.id === selectedCertificateId) || null;
  const certificateFindings = findings.filter((item) => item.certificateId === selectedCertificateId);
  const selectedFinding = certificateFindings.find((item) => item.id === selectedFindingId) || certificateFindings[0] || null;
  useEffect(() => { if (selectedFinding && selectedFinding.id !== selectedFindingId) setSelectedFindingId(selectedFinding.id); }, [selectedFinding, selectedFindingId]);
  useEffect(() => {
    if (activeTab !== 'preview' || !selectedCertificate) {
      setPreviewUrl('');
      setPreviewError('');
      setIsPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewUrl('');
    setPreviewError('');
    setIsPreviewLoading(true);
    openFleetCertificateDocument(effectiveClient, selectedCertificate)
      .then((url) => { if (!cancelled) setPreviewUrl(url); })
      .catch((caught) => { if (!cancelled) setPreviewError(caught instanceof Error ? caught.message : 'Aperçu indisponible.'); })
      .finally(() => { if (!cancelled) setIsPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, effectiveClient, selectedCertificate]);

  const active = useMemo(() => certificates.filter((item) => item.isActiveFleet), [certificates]);
  const upcoming = useMemo(() => active.filter((item) => item.expiresOn && daysFromToday(item.expiresOn) >= 0 && daysFromToday(item.expiresOn) <= 90), [active]);
  const openFindings = findings.filter((item) => item.status !== 'closed');
  const findingCountByCertificate = useMemo(() => {
    const counts = new Map<number, number>();
    openFindings.forEach((finding) => counts.set(finding.certificateId, (counts.get(finding.certificateId) || 0) + 1));
    return counts;
  }, [openFindings]);
  const filtered = useMemo(() => active.filter((item) => {
    const q = search.trim().toLocaleLowerCase('fr');
    if (q && !`${item.vesselName} ${item.documentTitle} ${item.categoryLabel}`.toLocaleLowerCase('fr').includes(q)) return false;
    if (statusFilter === 'expired') return getEffectiveFleetCertificateStatus(item) === 'expired';
    if (statusFilter === 'upcoming') return upcoming.some((up) => up.id === item.id);
    if (statusFilter === 'actions') return openFindings.some((finding) => finding.certificateId === item.id);
    return true;
  }), [active, openFindings, search, statusFilter, upcoming]);
  const scopedCertificates = useMemo(() => active.filter((item) => (
    (!scopeVesselName || item.vesselName === scopeVesselName)
    && (!scopeCategoryKey || item.categoryKey === scopeCategoryKey)
  )), [active, scopeCategoryKey, scopeVesselName]);
  const scopedCertificateIds = useMemo(
    () => new Set(scopedCertificates.map((item) => item.id)),
    [scopedCertificates],
  );
  const deadlineCertificates = useMemo(() => scopedCertificates
    .filter((item) => item.expiresOn && daysFromToday(item.expiresOn) <= 90)
    .sort((left, right) => left.expiresOn.localeCompare(right.expiresOn)), [scopedCertificates]);
  const selectedDocuments = useMemo(() => active.filter((item) => selectedDocumentIds.has(item.id)), [active, selectedDocumentIds]);
  const scopedOpenFindings = useMemo(
    () => openFindings.filter((item) => scopedCertificateIds.has(item.certificateId)),
    [openFindings, scopedCertificateIds],
  );
  const scopedVisits = useMemo(
    () => visits.filter((visit) => scopedCertificateIds.has(visit.certificateId)),
    [scopedCertificateIds, visits],
  );
  const workspaceFindings = selectedCertificate ? certificateFindings : scopedOpenFindings;
  const scopeLabel = scopeCategoryKey
    ? `${scopeVesselName} · ${scopeCategoryLabel}`
    : scopeVesselName || 'Toute la flotte';

  async function run(action: () => Promise<void>, success: string, reload = true) {
    setError(''); setMessage('');
    try { await action(); setMessage(success); if (reload) await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Action impossible.'); }
  }

  function selectCertificate(certificate: FleetCertificateRecord, tab: FleetCertificateWorkspaceTab = 'preview') {
    setSelectedCertificateId(certificate.id);
    setSelectedFindingId(null);
    setActiveTab(tab);
  }

  function clearDocumentSelectionForScope() {
    setSelectedCertificateId(null);
    setSelectedFindingId(null);
    if (activeTab === 'preview') setActiveTab('findings');
  }

  function selectVesselScope(vesselName: string) {
    const clearScope = scopeVesselName === vesselName && !scopeCategoryKey;
    setScopeVesselName(clearScope ? '' : vesselName);
    setScopeCategoryKey('');
    setScopeCategoryLabel('');
    clearDocumentSelectionForScope();
  }

  function selectCategoryScope(vesselName: string, categoryKey: string, categoryLabel: string) {
    const clearCategory = scopeVesselName === vesselName && scopeCategoryKey === categoryKey;
    setScopeVesselName(vesselName);
    setScopeCategoryKey(clearCategory ? '' : categoryKey);
    setScopeCategoryLabel(clearCategory ? '' : categoryLabel);
    clearDocumentSelectionForScope();
  }

  function resetScope() {
    setScopeVesselName('');
    setScopeCategoryKey('');
    setScopeCategoryLabel('');
    clearDocumentSelectionForScope();
  }

  function toggleDocumentSelection(certificateId: number) {
    setSelectedDocumentIds((current) => {
      const next = new Set(current);
      if (next.has(certificateId)) next.delete(certificateId);
      else next.add(certificateId);
      return next;
    });
  }

  function downloadDocuments(documents: FleetCertificateRecord[]) {
    void run(() => downloadFleetCertificateDocuments(effectiveClient, documents), documents.length > 1 ? 'Archive de documents préparée.' : 'Document téléchargé.', false);
  }

  function deleteCertificate(certificate: FleetCertificateRecord) {
    if (!window.confirm(`Supprimer définitivement « ${certificate.documentTitle} » et toutes ses versions ?`)) return;
    void run(async () => {
      await deleteFleetCertificateDocuments(effectiveClient, [certificate.id]);
      setSelectedDocumentIds((current) => { const next = new Set(current); next.delete(certificate.id); return next; });
      if (selectedCertificateId === certificate.id) setSelectedCertificateId(null);
    }, 'Document supprimé.');
  }

  function renewCertificate(certificate: FleetCertificateRecord) {
    setSelectedCertificateId(certificate.id);
    setModal('renewal');
  }

  async function generateReport(selection: FleetCertificateReportSelection) {
    const reportScope = resolveFleetCertificateReportSelection(active, findings, selection);
    setError('');
    setMessage('');
    try {
      const attachmentImages = selection.includeFindings
        ? await loadFleetFindingReportImages(effectiveClient, reportScope.findings)
        : {};
      const report = await generateFleetFindingReport({
        ...reportScope,
        attachmentImages,
        includeDocuments: selection.includeDocuments,
        includeFindings: selection.includeFindings,
      });
      downloadFleetFindingReport(report);
      setMessage('Rapport BBTM généré.');
    } catch (caught) {
      throw caught instanceof Error ? caught : new Error('Impossible de générer le rapport.');
    }
  }

  async function generateVisitReport(
    input: SaveFleetCertificateVisitInput,
    reportDate: string,
    includeSubjects: boolean,
  ) {
    const certificate = certificates.find((item) => item.id === input.certificateId);
    if (!certificate) throw new Error('Le document de la visite est introuvable.');
    const scopedFindings = findings.filter((finding) => finding.certificateId === certificate.id);
    const attachmentImages = includeSubjects
      ? await loadFleetFindingReportImages(effectiveClient, scopedFindings)
      : {};
    const report = await generateFleetCertificateVisitReport({
      certificate,
      visit: input,
      providers,
      findings: scopedFindings,
      attachmentImages,
      reportDate,
      includeSubjects,
    });
    downloadFleetCertificateVisitReport(report);
    setMessage('Planning des visites BBTM généré.');
  }

  if (isLoading) return <main className="fcx-page fcx-loading"><RefreshCw className="spin" /> Chargement du registre certificats…</main>;

  return <main className="fcx-page">
    {(error || message) && <div className={`fcx-toast ${error ? 'is-error' : ''}`}><span>{error || message}</span><button onClick={() => { setError(''); setMessage(''); }}><X size={16} /></button></div>}
    <header className="fcx-hero fcx-compact-hero"><div><span className="fcx-eyebrow">CONFORMITÉ · FLOTTE</span><h1>Certificats flotte</h1><p>Bibliothèque, échéances, visites et traitement documentaire dans un espace unique.</p></div></header>
    <ModuleRibbon ariaLabel="Menu des certificats flotte" className="fcx-certificates-ribbon">
      <ModuleRibbonGroup label="Gestion documentaire">
        {manager ? <ModuleRibbonCommand icon={<FilePlus2 aria-hidden="true" size={22} />} label="Ajouter un document" onClick={() => setModal('document')} /> : null}
        {manager ? <ModuleRibbonCommand icon={<CalendarPlus aria-hidden="true" size={22} />} label="Programmer une visite" onClick={() => setModal('visit-target')} /> : null}
      </ModuleRibbonGroup>
      <ModuleRibbonGroup label="Rapports">
        <ModuleRibbonCommand icon={<FileText aria-hidden="true" size={22} />} label="Générer un rapport" onClick={() => setModal('report')} />
      </ModuleRibbonGroup>
    </ModuleRibbon>

    <section className="fcx-workbench">
      <section className="fcx-library fcx-workbench-library">
        <header><div><h2>Bibliothèque documentaire</h2><p>{filtered.length} document(s) affiché(s) · {selectedDocuments.length} sélectionné(s)</p></div></header>
        <div className="fcx-library-controls">
          <label><Search size={18} /><input aria-label="Rechercher dans la bibliothèque documentaire" onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un certificat, un navire…" value={search} /></label>
          <div aria-label="Filtrer la bibliothèque"><Filter size={16} /><button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>Tous</button><button className={statusFilter === 'expired' ? 'active' : ''} onClick={() => setStatusFilter('expired')}>Échus</button><button className={statusFilter === 'upcoming' ? 'active' : ''} onClick={() => setStatusFilter('upcoming')}>À venir</button><button className={statusFilter === 'actions' ? 'active' : ''} onClick={() => setStatusFilter('actions')}>Avec actions</button></div>
        </div>
        <FleetCertificateLibraryTree key={`${search}|${statusFilter}`} canManage={manager} certificates={filtered} findingCountByCertificate={findingCountByCertificate} formatDate={formatDate} onDelete={deleteCertificate} onDownload={(certificate) => downloadDocuments([certificate])} onDownloadSelected={() => downloadDocuments(selectedDocuments)} onRenew={renewCertificate} onSchedule={(certificate) => { setVisitCertificateId(certificate.id); setModal('visit'); }} onSelect={selectCertificate} onSelectCategory={selectCategoryScope} onSelectVessel={selectVesselScope} onToggleSelection={toggleDocumentSelection} revealMatches={Boolean(search.trim()) || statusFilter !== 'all'} selectedCertificateId={selectedCertificateId} selectedDocumentIds={selectedDocumentIds} selectedScopeCategoryKey={scopeCategoryKey} selectedScopeVesselName={scopeVesselName} />
      </section>

      <section className="fcx-workspace-card">
        <div aria-label="Navigation du suivi documentaire" className="fcx-workspace-tabs" role="tablist">
          <button aria-selected={activeTab === 'findings'} className={activeTab === 'findings' ? 'active' : ''} onClick={() => setActiveTab('findings')} role="tab">Pilotage du traitement</button>
          <button aria-selected={activeTab === 'deadlines'} className={activeTab === 'deadlines' ? 'active' : ''} onClick={() => setActiveTab('deadlines')} role="tab">Échéances à venir</button>
          <button aria-selected={activeTab === 'visits'} className={activeTab === 'visits' ? 'active' : ''} onClick={() => setActiveTab('visits')} role="tab">Visites prestataires</button>
          <button aria-selected={activeTab === 'preview'} className={activeTab === 'preview' ? 'active' : ''} onClick={() => setActiveTab('preview')} role="tab">Aperçu du document</button>
        </div>
        <div className="fcx-workspace-scope"><span>Périmètre&nbsp;: <strong>{scopeLabel}</strong></span>{scopeVesselName ? <button onClick={resetScope} type="button">Afficher toute la flotte</button> : null}</div>

        <div className="fcx-workspace-panel" role="tabpanel">
          {activeTab === 'findings' ? <div className="fcx-command-actions">
            <header className="fcx-command-actions-head"><div><span>Pilotage du traitement</span><h2>{selectedCertificate ? selectedCertificate.documentTitle : 'Écarts & actions flotte'}</h2><p>{selectedCertificate ? `${selectedCertificate.vesselName} · ${selectedCertificate.categoryLabel}` : 'Constats, prescriptions et conditions à lever'}</p></div>{manager && selectedCertificate ? <button className="fcx-primary" onClick={() => setModal('finding')}><Plus size={16} /> Nouvel écart</button> : null}</header>
            <div className="fcx-finding-summary"><span><b>{workspaceFindings.filter((item) => item.status !== 'closed').length}</b> ouverts</span><span className="red"><b>{workspaceFindings.filter((item) => item.findingType === 'major_non_conformity' && item.status !== 'closed').length}</b> majeurs</span><span className="amber"><b>{workspaceFindings.filter(isOverdue).length}</b> en retard</span><span className="green"><b>{workspaceFindings.length ? Math.round(workspaceFindings.reduce((sum, item) => sum + item.progress, 0) / workspaceFindings.length) : 0}%</b> traités</span></div>
            {selectedCertificate ? <div className="fcx-finding-workspace"><div className="fcx-finding-list"><div className="fcx-finding-columns"><span>Écart</span><span>Échéance</span><span>Responsable</span><span>Avancement</span></div>{certificateFindings.map((finding) => <button className={selectedFinding?.id === finding.id ? 'selected' : ''} key={finding.id} onClick={() => setSelectedFindingId(finding.id)}><span className="fcx-finding-name"><i className={typeTone(finding.findingType)}>{finding.findingType === 'class_condition' ? 'CC' : finding.findingType === 'prescription' ? 'P' : finding.findingType === 'finding' ? 'F' : 'NC'}</i><span><b>{finding.title}</b><small>{finding.reference} · {FLEET_FINDING_LABELS[finding.findingType]}</small></span></span><em className={isOverdue(finding) ? 'late' : ''}>{formatDate(finding.treatmentDueOn)}</em><span className="fcx-person"><UserRound size={14} />{finding.responsibleName}</span><span className="fcx-progress"><i><u style={{ width: `${finding.progress}%` }} /></i><small>{finding.progress}%</small></span></button>)}{!certificateFindings.length && <div className="fcx-empty"><CheckCircle2 /> Aucun écart rattaché à ce certificat.</div>}</div>
              <aside className="fcx-finding-detail">{selectedFinding ? <><header><div><span className={`fcx-badge ${typeTone(selectedFinding.findingType)}`}>{FLEET_FINDING_LABELS[selectedFinding.findingType]}</span><small>{selectedFinding.reference}</small><h2>{selectedFinding.title}</h2></div>{manager ? <button title="Supprimer l’écart" onClick={() => window.confirm('Supprimer cet écart et ses preuves ?') && run(() => deleteFleetCertificateFinding(effectiveClient, selectedFinding.id), 'Écart supprimé.')}><Trash2 size={17} /></button> : null}</header><p className="fcx-description">{selectedFinding.description}</p>
                <div className="fcx-detail-grid"><label>État<select value={selectedFinding.status} onChange={(event) => run(() => updateFleetCertificateFinding(effectiveClient, selectedFinding.id, { status: event.target.value as FleetFindingStatus }), 'État mis à jour.')}><option value="declared">À affecter</option><option value="assigned">Assigné</option><option value="in_progress">En cours</option><option value="pending_validation">À valider</option><option value="closed">Clôturé</option></select></label><label>Responsable<select value={selectedFinding.responsiblePersonId || ''} onChange={(event) => { const id = Number(event.target.value) || null; const person = responsibles.find((item) => item.id === id); run(() => updateFleetCertificateFinding(effectiveClient, selectedFinding.id, { responsiblePersonId: id, responsibleName: person?.name || 'Non assigné' }), 'Responsable mis à jour.'); }}><option value="">Non assigné</option>{responsibles.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Échéance<input type="date" value={selectedFinding.treatmentDueOn} onChange={(event) => run(() => updateFleetCertificateFinding(effectiveClient, selectedFinding.id, { treatmentDueOn: event.target.value }), 'Échéance mise à jour.')} /></label><label>Avancement <b>{selectedFinding.progress}%</b><input min="0" max="100" step="10" type="range" value={selectedFinding.progress} onChange={(event) => run(() => updateFleetCertificateFinding(effectiveClient, selectedFinding.id, { progress: Number(event.target.value) }), 'Avancement mis à jour.')} /></label></div>
                <section className="fcx-evidence"><header><div><h3>Constat & preuves</h3><p>Photos ou documents liés à l’écart</p></div></header><div className="fcx-evidence-grid">{(['finding', 'treatment'] as FleetFindingAttachmentKind[]).map((kind) => <div key={kind}><strong>{kind === 'finding' ? 'Constat initial' : 'Preuve du traitement'}</strong>{selectedFinding.attachments.filter((item) => item.kind === kind).map((attachment) => <button key={attachment.id} onClick={() => run(() => openFleetFindingAttachment(effectiveClient, attachment), 'Pièce ouverte.')}><span className="fcx-thumb">{attachment.mimeType.startsWith('image/') ? <Image size={22} /> : <FileText size={22} />}</span><span><b>{attachment.originalFileName}</b><small>{formatDate(attachment.createdAt)}</small></span><ExternalLink size={14} /></button>)}<button className="fcx-add-proof" onClick={() => { setUploadKind(kind); fileInput.current?.click(); }}><Plus size={15} /> Ajouter {kind === 'finding' ? 'une pièce' : 'une preuve'}</button></div>)}</div><input ref={fileInput} hidden accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) run(() => uploadFleetFindingAttachment(effectiveClient, selectedFinding, selectedCertificate.vesselAcronym, uploadKind, file), 'Pièce ajoutée.'); event.target.value = ''; }} /></section>
                <section className="fcx-followup"><h3>Suivi du traitement</h3><form onSubmit={(event) => { event.preventDefault(); if (!comment.trim()) return; run(() => addFleetFindingComment(effectiveClient, selectedFinding, comment), 'Note ajoutée.'); setComment(''); }}><input onChange={(event) => setComment(event.target.value)} placeholder="Ajouter une note de suivi…" value={comment} /><button className="fcx-primary"><Plus size={15} /> Ajouter</button></form><div>{selectedFinding.events.slice(0, 5).map((event) => <p key={event.id}><i /><span><b>{event.note || FLEET_FINDING_STATUS_LABELS[selectedFinding.status]}</b><small><strong>{event.authorName}</strong> · {new Date(event.createdAt).toLocaleString('fr-FR')}</small></span></p>)}</div></section>
              </> : <div className="fcx-empty"><Flag /> Sélectionnez un écart.</div>}</aside></div> : <FleetCertificateFindingsByScope certificates={scopedCertificates} findings={scopedOpenFindings} formatDate={formatDate} isOverdue={isOverdue} onSelectFinding={(certificateId, findingId) => { setSelectedCertificateId(certificateId); setSelectedFindingId(findingId); }} typeTone={typeTone} />}
          </div> : null}

          {activeTab === 'deadlines' ? <div className="fcx-deadline-workspace"><header><div><span>Échéances à venir</span><h2>Documents à renouveler</h2><p>Documents échus ou arrivant à échéance dans les 90 jours</p></div><strong>{deadlineCertificates.length}</strong></header><FleetCertificateDeadlinesByScope certificates={deadlineCertificates} daysFromToday={daysFromToday} formatDate={formatDate} onSelectDocument={selectCertificate} /></div> : null}

          {activeTab === 'visits' ? <FleetCertificateVisitCalendar embedded canManage={manager} onSchedule={() => setModal('visit-target')} onSelectDocument={(certificateId) => { const certificate = certificates.find((item) => item.id === certificateId); if (certificate) selectCertificate(certificate); }} visits={scopedVisits} /> : null}

          {activeTab === 'preview' ? <FleetCertificateDocumentPreview certificate={selectedCertificate} error={previewError} isLoading={isPreviewLoading} onDownload={(certificate) => downloadDocuments([certificate])} previewUrl={previewUrl} /> : null}
        </div>
      </section>
    </section>
    {modal === 'finding' && selectedCertificate && <FindingForm certificate={selectedCertificate} responsibles={responsibles} onClose={() => setModal(null)} onSave={(values) => run(async () => { const person = responsibles.find((item) => item.id === values.responsibleId); await createFleetCertificateFinding(effectiveClient, selectedCertificate.companyId, { certificateId: selectedCertificate.id, findingType: values.type, title: values.title, description: values.description, detectedOn: TODAY, treatmentDueOn: values.due, responsiblePersonId: values.responsibleId, responsibleName: person?.name }); }, 'Écart créé.')} />}
    {modal === 'document' && <DocumentForm certificates={certificates} documentNames={documentNames} onClose={() => setModal(null)} onSave={(form) => run(async () => { const vessel = certificates.find((item) => item.vesselId === Number(form.get('vesselId')))!; const categoryKey = String(form.get('category')); const category = certificates.find((item) => item.categoryKey === categoryKey); const documentTitle = normalizeFleetCertificateDocumentName(String(form.get('title')), certificates.flatMap((item) => [item.vesselName, item.vesselAcronym])); await createFleetCertificateDocument(effectiveClient, { companyId: vessel.companyId, vesselId: vessel.vesselId!, vesselName: vessel.vesselName, vesselAcronym: vessel.vesselAcronym, categoryKey, categoryLabel: category?.categoryLabel || categoryKey, documentTitle, issuedOn: String(form.get('issued')), expiresOn: String(form.get('expires')), file: form.get('file') as File }); }, 'Document ajouté.')} />}
    {modal === 'renewal' && selectedCertificate && <RenewalForm certificate={selectedCertificate} onClose={() => setModal(null)} onSave={(form) => run(() => submitFleetCertificateRenewal(effectiveClient, selectedCertificate, { issuedOn: String(form.get('issued')), expiresOn: String(form.get('expires')), notes: String(form.get('notes')), file: form.get('file') as File }), 'Renouvellement enregistré.')} />}
    {modal === 'report' && <FleetCertificateReportDialog certificates={active} findings={findings} onClose={() => setModal(null)} onGenerate={generateReport} />}
    {modal === 'visit-target' && <VisitTargetForm certificates={active} onClose={() => setModal(null)} onSelect={(certificateId) => { setVisitCertificateId(certificateId); setModal('visit'); }} />}
    {modal === 'visit' && certificates.find((certificate) => certificate.id === visitCertificateId) && <FleetCertificateVisitForm certificate={certificates.find((certificate) => certificate.id === visitCertificateId)!} providers={providers} onClose={() => setModal(null)} onExport={generateVisitReport} onSave={(input) => run(() => saveFleetCertificateVisit(effectiveClient, input).then(() => undefined), 'Visite prestataire programmée.')} />}
  </main>;
}
