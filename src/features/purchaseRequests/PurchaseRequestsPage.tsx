import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  PackageCheck,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Ship,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AppDialog } from '../../components/AppDialog';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  buildPurchaseRequestMetrics,
  createPurchaseRequest,
  fetchCurrentAssignedVessel,
  fetchPurchaseRequests,
  fetchPurchaseVessels,
  transitionPurchaseRequest,
  type CreatePurchaseRequestInput,
  type PurchaseRequestAction,
  type PurchaseRequestRecord,
  type PurchaseRequestStage,
  type PurchaseVesselOption,
} from './purchaseRequestQueries';

interface PurchaseRequestsPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

interface PurchaseFilters {
  category: string;
  urgentOnly: boolean;
  vesselName: string;
}

interface ActionDialogState {
  action: PurchaseRequestAction;
  comment: string;
  effectiveDate: string;
  title: string;
}

const PAGE_SIZE = 10;
const STAGE_LABELS: Record<PurchaseRequestStage, string> = {
  to_process: 'À traiter',
  ordered: 'En commande',
  receiving: 'À réception',
  completed: 'Traitées',
};

const EMPTY_FORM: CreatePurchaseRequestInput = {
  amountHt: '',
  categoryLabel: 'Approvisionnement',
  currency: 'EUR',
  deliveryDetails: '',
  deliveryLocation: 'A bord',
  description: '',
  expectedDeliveryOn: '',
  quantity: '1',
  rebillingLabel: '',
  reference: '',
  requestedOn: new Date().toISOString().slice(0, 10),
  requesterName: '',
  requestNumber: '',
  supplierName: '',
  title: '',
  unitLabel: 'Unité',
  unitPriceHt: '',
  urgent: false,
  urgencyReason: '',
  vesselId: null,
  websiteUrl: '',
};

const WIZARD_STEPS = ['Demandeur', 'Besoin', 'Prix', 'Livraison', 'Notes', 'Pièces jointes'];

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function canProcess(roles: RoleKey[]): boolean {
  return roles.some((role) => ['admin', 'direction', 'armement', 'capitaine'].includes(role));
}

function canCreate(roles: RoleKey[], functionLabel: string): boolean {
  return canProcess(roles) || normalize(functionLabel).includes('chef mecanicien');
}

function formatDate(value: string, includeTime = false): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', includeTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function htmlToText(value: string): string {
  if (!value) return '';
  if (typeof document === 'undefined') return value.replace(/<[^>]*>/g, ' ');
  const node = document.createElement('div');
  node.innerHTML = value;
  return (node.textContent || '').replace(/\s+/g, ' ').trim();
}

function categoryKind(category: string): 'supply' | 'service' {
  const value = normalize(category);
  return value.includes('prestation') || value.includes('service') || value.includes('visite') ? 'service' : 'supply';
}

function requestStateLabel(request: PurchaseRequestRecord): string {
  if (request.urgent && request.stage === 'to_process') return 'Urgente';
  if (request.stage === 'completed') return request.receivedOn ? 'Reçue' : 'Terminée';
  if (request.stage === 'receiving') return 'En attente';
  if (request.stage === 'ordered') return 'En cours';
  return request.approvalStatus ? request.approvalStatus.replace('Demande ', '') : 'En attente';
}

function WorkflowStep({
  active,
  complete,
  icon,
  label,
  meta,
  rejected,
}: {
  active: boolean;
  complete: boolean;
  icon: ReactNode;
  label: string;
  meta: string;
  rejected?: boolean;
}) {
  return (
    <div className={`purchase-workflow-step${active ? ' is-active' : ''}${complete ? ' is-complete' : ''}${rejected ? ' is-rejected' : ''}`}>
      <span className="purchase-workflow-icon">{icon}</span>
      <strong>{label}</strong>
      <small>{meta}</small>
    </div>
  );
}

export function PurchaseRequestsPage({ client, roles }: PurchaseRequestsPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const currentPerson = outletContext?.currentPerson || null;
  const processingAllowed = canProcess(effectiveRoles);
  const creationAllowed = canCreate(effectiveRoles, currentPerson?.functionLabel || '');
  const captainView = effectiveRoles.includes('capitaine');

  const [requests, setRequests] = useState<PurchaseRequestRecord[]>([]);
  const [vessels, setVessels] = useState<PurchaseVesselOption[]>([]);
  const [activeStage, setActiveStage] = useState<PurchaseRequestStage>('to_process');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PurchaseFilters>({ category: '', urgentOnly: false, vesselName: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [requestForm, setRequestForm] = useState<CreatePurchaseRequestInput>(EMPTY_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const initialStageResolved = useRef(false);

  const loadData = useCallback(async (initial = false) => {
    if (initial) setIsLoading(true);
    setErrorMessage(null);
    try {
      const [loadedRequests, loadedVessels, assignedVessel] = await Promise.all([
        fetchPurchaseRequests(effectiveClient),
        fetchPurchaseVessels(effectiveClient),
        captainView && currentPerson
          ? fetchCurrentAssignedVessel(effectiveClient, currentPerson.id).catch(() => null)
          : Promise.resolve(null),
      ]);
      setRequests(loadedRequests);
      setVessels(loadedVessels);
      setSelectedId((current) => current && loadedRequests.some((request) => request.id === current) ? current : loadedRequests[0]?.id || null);
      if (initial && assignedVessel) {
        setFilters((current) => ({ ...current, vesselName: assignedVessel.name }));
        setRequestForm((current) => ({ ...current, vesselId: assignedVessel.id }));
      }
    } catch {
      setErrorMessage("Impossible de charger les demandes d'achat.");
    } finally {
      if (initial) setIsLoading(false);
    }
  }, [captainView, currentPerson, effectiveClient]);

  useEffect(() => { void loadData(true); }, [loadData]);

  const categories = useMemo(() => Array.from(new Set(requests.map((request) => request.categoryLabel).filter(Boolean))).sort(), [requests]);
  const vesselNames = useMemo(() => Array.from(new Set(requests.map((request) => request.vesselName).filter(Boolean))).sort(), [requests]);
  const baseRequests = useMemo(() => requests.filter((request) => {
    if (filters.vesselName && request.vesselName !== filters.vesselName) return false;
    if (filters.category && request.categoryLabel !== filters.category) return false;
    if (filters.urgentOnly && !request.urgent) return false;
    if (!search.trim()) return true;
    const searchable = [request.requestNumber, request.title, request.reference, request.vesselName, request.supplierName, request.requesterName].join(' ');
    return normalize(searchable).includes(normalize(search.trim()));
  }), [filters, requests, search]);
  const stageCounts = useMemo(() => ({
    to_process: baseRequests.filter((request) => request.stage === 'to_process').length,
    ordered: baseRequests.filter((request) => request.stage === 'ordered').length,
    receiving: baseRequests.filter((request) => request.stage === 'receiving').length,
    completed: baseRequests.filter((request) => request.stage === 'completed').length,
  }), [baseRequests]);
  const visibleRequests = useMemo(() => baseRequests.filter((request) => request.stage === activeStage), [activeStage, baseRequests]);
  const pageCount = Math.max(1, Math.ceil(visibleRequests.length / PAGE_SIZE));
  const paginatedRequests = visibleRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedRequest = visibleRequests.find((request) => request.id === selectedId) || paginatedRequests[0] || null;
  const metrics = useMemo(() => buildPurchaseRequestMetrics(baseRequests), [baseRequests]);

  useEffect(() => {
    setPage(1);
    const first = baseRequests.find((request) => request.stage === activeStage);
    if (!initialStageResolved.current && baseRequests.length) {
      initialStageResolved.current = true;
      const initialStage = (Object.keys(STAGE_LABELS) as PurchaseRequestStage[])
        .find((stage) => baseRequests.some((request) => request.stage === stage));
      if (initialStage && initialStage !== activeStage) {
        setActiveStage(initialStage);
        return;
      }
    }
    setSelectedId(first?.id || null);
  }, [activeStage, baseRequests]);

  function updateForm<K extends keyof CreatePurchaseRequestInput>(key: K, value: CreatePurchaseRequestInput[K]) {
    setRequestForm((current) => ({ ...current, [key]: value }));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (wizardStep < WIZARD_STEPS.length - 1) {
      setWizardStep((current) => current + 1);
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const created = await createPurchaseRequest(effectiveClient, requestForm, files);
      setShowCreateDialog(false);
      setRequestForm(EMPTY_FORM);
      setFiles([]);
      setWizardStep(0);
      setActiveStage('to_process');
      setSelectedId(created.id);
      setStatusMessage(`Demande #${created.requestNumber} créée et équipes de traitement notifiées.`);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de créer la demande.");
    } finally {
      setIsSaving(false);
    }
  }

  async function runAction(action: PurchaseRequestAction, options: { comment?: string; effectiveDate?: string } = {}) {
    if (!selectedRequest) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await transitionPurchaseRequest(effectiveClient, selectedRequest.id, action, options);
      setActionDialog(null);
      setStatusMessage('Le suivi de la demande a été actualisé.');
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Action impossible.');
    } finally {
      setIsSaving(false);
    }
  }

  function primaryAction(request: PurchaseRequestRecord) {
    if (!processingAllowed || request.stage === 'completed') return null;
    if (request.stage === 'to_process') return <button className="purchase-action-primary" onClick={() => void runAction('take_charge')} type="button"><ClipboardCheck size={16} />Prendre en charge</button>;
    if (request.stage === 'ordered') return <button className="purchase-action-primary" onClick={() => setActionDialog({ action: 'plan_delivery', comment: '', effectiveDate: request.expectedDeliveryOn, title: 'Planifier la livraison à bord' })} type="button"><Truck size={16} />Planifier la livraison à bord</button>;
    return <button className="purchase-action-primary" onClick={() => void runAction('mark_received')} type="button"><PackageCheck size={16} />Reçu à bord</button>;
  }

  if (isLoading) return <div className="admin-state">Chargement des demandes d'achat…</div>;

  return (
    <section className="purchase-page purchase-workspace">
      <header className="purchase-topbar">
        <div>
          <h1>Demandes d’achat</h1>
          <p>{metrics.openRequestCount} demandes ouvertes · {metrics.urgentCount} urgentes</p>
        </div>
        <div className="purchase-topbar-actions">
          <label className="purchase-search"><Search size={17} /><input aria-label="Rechercher les demandes" onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par demande, article, navire…" value={search} /></label>
          <button className={showFilters ? 'is-active' : ''} onClick={() => setShowFilters((current) => !current)} type="button"><SlidersHorizontal size={17} />Filtres</button>
          {creationAllowed ? <button className="purchase-new-button" onClick={() => setShowCreateDialog(true)} type="button"><Plus size={18} />Nouvelle demande</button> : null}
        </div>
      </header>

      {showFilters ? (
        <div className="purchase-modern-filters">
          <label>Navire<select aria-label="Filtrer par navire" onChange={(event) => setFilters((current) => ({ ...current, vesselName: event.target.value }))} value={filters.vesselName}><option value="">Tous les navires</option>{vesselNames.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label>Catégorie<select aria-label="Filtrer par catégorie" onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))} value={filters.category}><option value="">Toutes les catégories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="purchase-urgent-toggle"><input checked={filters.urgentOnly} onChange={(event) => setFilters((current) => ({ ...current, urgentOnly: event.target.checked }))} type="checkbox" />Urgences uniquement</label>
          <button onClick={() => setFilters({ category: '', urgentOnly: false, vesselName: captainView ? filters.vesselName : '' })} type="button">Réinitialiser</button>
        </div>
      ) : null}

      <div className="admin-notices" aria-live="polite">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      <div className="purchase-master-detail">
        <section className="purchase-list-panel" aria-label="Liste des demandes d'achat">
          <div className="purchase-tabs" role="tablist">
            {(Object.keys(STAGE_LABELS) as PurchaseRequestStage[]).map((stage) => (
              <button aria-selected={activeStage === stage} className={activeStage === stage ? 'is-active' : ''} key={stage} onClick={() => setActiveStage(stage)} role="tab" type="button">
                {STAGE_LABELS[stage]} <span>{stageCounts[stage]}</span>
              </button>
            ))}
          </div>
          <div className="purchase-list-head"><span>Demande</span><span>Navire</span><span>Catégorie</span><span>Livraison prévue</span><span>État</span></div>
          <div className="purchase-list-body">
            {paginatedRequests.length ? paginatedRequests.map((request) => (
              <button className={`purchase-list-row${selectedRequest?.id === request.id ? ' is-selected' : ''}`} key={request.id} onClick={() => setSelectedId(request.id)} type="button">
                <span className="purchase-request-name">{request.urgent ? <i aria-label="Urgent" /> : null}<strong>#{request.requestNumber}</strong><small>{request.title}</small></span>
                <span>{request.vesselName || '—'}</span>
                <span><em className={`purchase-category is-${categoryKind(request.categoryLabel)}`}>{categoryKind(request.categoryLabel) === 'service' ? 'Prestation' : 'Fourniture'}</em></span>
                <span>{formatDate(request.expectedDeliveryOn)}</span>
                <span className={`purchase-list-state is-${request.stage}`}>{request.urgent && request.stage === 'to_process' ? <strong>Urgente</strong> : <strong>{STAGE_LABELS[request.stage].replace('À ', '')}</strong>}<small>{requestStateLabel(request)}</small></span>
              </button>
            )) : <div className="purchase-empty">Aucune demande dans cette étape.</div>}
          </div>
          <footer className="purchase-pagination">
            <span>{visibleRequests.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, visibleRequests.length)} sur ${visibleRequests.length}` : '0 demande'}</span>
            <div><button aria-label="Page précédente" disabled={page === 1} onClick={() => setPage((current) => current - 1)} type="button"><ChevronLeft size={16} /></button>{Array.from({ length: Math.min(pageCount, 4) }, (_, index) => index + 1).map((number) => <button className={page === number ? 'is-active' : ''} key={number} onClick={() => setPage(number)} type="button">{number}</button>)}<button aria-label="Page suivante" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)} type="button"><ChevronRight size={16} /></button></div>
          </footer>
        </section>

        <section className="purchase-detail-panel" aria-label={selectedRequest ? `Demande ${selectedRequest.requestNumber}` : 'Détail de la demande'}>
          {selectedRequest ? <>
            <header className="purchase-detail-header">
              <div><h2>#{selectedRequest.requestNumber} · {selectedRequest.title}</h2><div className="purchase-detail-meta"><span><Ship size={15} />{selectedRequest.vesselName || 'Sans navire'}</span><em className={`purchase-category is-${categoryKind(selectedRequest.categoryLabel)}`}>{categoryKind(selectedRequest.categoryLabel) === 'service' ? 'Prestation' : 'Fourniture'}</em><span><CircleUserRound size={15} />{selectedRequest.requesterName || 'Demandeur'}</span><span><CalendarDays size={15} />{formatDate(selectedRequest.requestedOn)}</span></div></div>
              <div className="purchase-detail-actions">
                {processingAllowed && selectedRequest.stage === 'to_process' ? <>
                  <button className="is-danger-ghost" onClick={() => setActionDialog({ action: 'refuse', comment: '', effectiveDate: '', title: 'Refuser la demande' })} type="button"><X size={15} />Refuser</button>
                  <button onClick={() => setActionDialog({ action: 'request_information', comment: '', effectiveDate: '', title: 'Demander un complément' })} type="button">Demander un complément</button>
                  <button className="is-approve" onClick={() => void runAction('approve')} type="button"><Check size={15} />Approuver</button>
                </> : null}
                {primaryAction(selectedRequest)}
              </div>
            </header>

            <div className="purchase-workflow" aria-label="Avancement de la demande">
              <WorkflowStep active={false} complete icon={<FileCheck2 size={22} />} label="Demande créée" meta={`${formatDate(selectedRequest.createdAt, true)} · ${selectedRequest.requesterName || 'Demandeur'}`} />
              <span className={`purchase-workflow-line${selectedRequest.stage !== 'to_process' ? ' is-complete' : ''}`} />
              <WorkflowStep active={selectedRequest.stage === 'to_process'} complete={selectedRequest.stage !== 'to_process'} icon={<ShieldCheck size={22} />} label={normalize(selectedRequest.approvalStatus).includes('refuse') ? 'Refusée' : 'Approbation'} meta={selectedRequest.approvalStatus || 'En attente de décision'} rejected={normalize(selectedRequest.approvalStatus).includes('refuse')} />
              <span className={`purchase-workflow-line${['receiving', 'completed'].includes(selectedRequest.stage) ? ' is-complete' : ''}`} />
              <WorkflowStep active={selectedRequest.stage === 'ordered'} complete={['receiving', 'completed'].includes(selectedRequest.stage)} icon={<ShoppingCart size={22} />} label="Commande" meta={selectedRequest.orderedOn ? formatDate(selectedRequest.orderedOn) : selectedRequest.stage === 'ordered' ? 'En cours' : 'À venir'} />
              <span className={`purchase-workflow-line${selectedRequest.stage === 'completed' ? ' is-complete' : ''}`} />
              <WorkflowStep active={selectedRequest.stage === 'receiving'} complete={selectedRequest.stage === 'completed'} icon={<PackageCheck size={22} />} label="Réception" meta={selectedRequest.receivedOn ? formatDate(selectedRequest.receivedOn) : selectedRequest.expectedDeliveryOn ? `Prévue ${formatDate(selectedRequest.expectedDeliveryOn)}` : 'À venir'} />
            </div>

            <div className="purchase-detail-section"><h3>Besoin</h3><p>{htmlToText(selectedRequest.description) || selectedRequest.urgencyReason || 'Aucune description complémentaire.'}</p>{selectedRequest.reference ? <dl><div><dt>Référence</dt><dd>{selectedRequest.reference}</dd></div><div><dt>Quantité</dt><dd>{selectedRequest.quantity || '—'} {selectedRequest.unitLabel}</dd></div><div><dt>Fournisseur</dt><dd>{selectedRequest.supplierName || 'À définir'}</dd></div><div><dt>Montant HT</dt><dd>{selectedRequest.amountHt.toLocaleString('fr-FR', { style: 'currency', currency: selectedRequest.currency || 'EUR' })}</dd></div></dl> : null}</div>
            <div className="purchase-detail-section"><h3>Livraison à bord</h3><dl><div><dt>Navire</dt><dd>{selectedRequest.vesselName || '—'}</dd></div><div><dt>Lieu de livraison</dt><dd>{selectedRequest.deliveryLocation || '—'}</dd></div><div><dt>Date souhaitée</dt><dd>{formatDate(selectedRequest.expectedDeliveryOn)}</dd></div><div><dt>Responsable</dt><dd>{selectedRequest.ownerName || 'Non attribué'}</dd></div><div><dt>Précision</dt><dd>{selectedRequest.deliveryDetails || '—'}</dd></div><div><dt>Traitement</dt><dd>{selectedRequest.processingComment || '—'}</dd></div></dl></div>
            <details className="purchase-attachments" open><summary><span>Pièces jointes</span><strong><Paperclip size={16} />{selectedRequest.attachments.length} fichier{selectedRequest.attachments.length > 1 ? 's' : ''}</strong><ChevronDown size={16} /></summary><div>{selectedRequest.attachments.length ? selectedRequest.attachments.map((attachment) => <a href={attachment.downloadUrl} key={attachment.id} rel="noreferrer" target="_blank">{attachment.isImage ? <ImageIcon size={18} /> : <FileText size={18} />}<span><strong>{attachment.title}</strong><small>{attachment.sourceKind === 'sharepoint' ? 'SharePoint' : 'SeaPilot'}</small></span></a>) : <p>Aucune pièce jointe.</p>}</div></details>
            <div className="purchase-activity"><h3>Activité</h3><ol><li className="is-primary"><i /><div><strong>Demande créée</strong><small>{formatDate(selectedRequest.createdAt, true)} par {selectedRequest.requesterName || 'le demandeur'}</small></div><span>Demandeur</span></li>{selectedRequest.events.filter((event) => event.eventType !== 'created').map((event) => <li key={event.id}><i /><div><strong>{event.statusLabel}</strong><small>{formatDate(event.createdAt, true)}{event.actorName ? ` par ${event.actorName}` : ''}</small></div><span>{event.comment || event.actorName || 'Suivi'}</span></li>)}{selectedRequest.approvalHistory && !selectedRequest.events.length ? <li className={normalize(selectedRequest.approvalStatus).includes('refuse') ? 'is-danger' : ''}><i /><div><strong>{selectedRequest.approvalStatus || 'Approbation'}</strong><small>{selectedRequest.approvalHistory}</small></div><span>{selectedRequest.approvalReason || selectedRequest.approverName}</span></li> : null}</ol></div>
          </> : <div className="purchase-empty-detail"><ShoppingCart size={34} /><p>Sélectionnez une demande pour afficher son suivi.</p></div>}
        </section>
      </div>

      {showCreateDialog ? <AppDialog description="Le formulaire crée la demande puis ajoute les fichiers et photos." eyebrow="Nouvelle demande" footer={<div className="purchase-wizard-footer"><button className="is-secondary" disabled={isSaving} onClick={() => wizardStep ? setWizardStep((current) => current - 1) : setShowCreateDialog(false)} type="button">{wizardStep ? 'Précédent' : 'Annuler'}</button><button className="is-primary" disabled={isSaving || !requestForm.title.trim()} type="submit">{wizardStep === WIZARD_STEPS.length - 1 ? <><Plus size={17} />Créer la demande</> : <>Suivant<ChevronRight size={17} /></>}</button></div>} isBusy={isSaving} onClose={() => setShowCreateDialog(false)} onSubmit={handleCreate} size="xl" title="Créer une demande d’achat">
        <div className="purchase-wizard"><aside><small>Création</small><strong>Demande achat</strong><nav>{WIZARD_STEPS.map((step, index) => <button className={wizardStep === index ? 'is-active' : ''} key={step} onClick={() => setWizardStep(index)} type="button"><span>{index + 1}</span>{step}</button>)}</nav></aside><section>
          {wizardStep === 0 ? <div className="purchase-wizard-card"><h3><CircleUserRound size={20} />Demandeur</h3><div className="purchase-form-grid"><label>Émetteur<input onChange={(event) => updateForm('requesterName', event.target.value)} placeholder={currentPerson ? `${currentPerson.firstName} ${currentPerson.lastName}` : 'Prénom NOM'} value={requestForm.requesterName} /></label><label>Navire<select onChange={(event) => updateForm('vesselId', event.target.value ? Number(event.target.value) : null)} value={requestForm.vesselId || ''}><option value="">Sélectionner</option>{vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label></div></div> : null}
          {wizardStep === 1 ? <div className="purchase-wizard-card"><h3><FileText size={20} />Description du besoin</h3><div className="purchase-form-grid"><label>Désignation *<input required onChange={(event) => updateForm('title', event.target.value)} placeholder="Ex. Filtre centrale hydraulique" value={requestForm.title} /></label><label>Référence<input onChange={(event) => updateForm('reference', event.target.value)} value={requestForm.reference} /></label><label>Catégorie<select onChange={(event) => updateForm('categoryLabel', event.target.value)} value={requestForm.categoryLabel}><option>Approvisionnement</option><option>Approvisionnement - EPI</option><option>Prestataire de Service</option><option>Autre</option></select></label><label>Quantité<input inputMode="decimal" onChange={(event) => updateForm('quantity', event.target.value)} value={requestForm.quantity} /></label><label>Unité / conditionnement<select onChange={(event) => updateForm('unitLabel', event.target.value)} value={requestForm.unitLabel}><option>Unité</option><option>Mètre</option><option>Lot</option><option>Boîte</option><option>Litre</option></select></label><label>Fournisseur<input onChange={(event) => updateForm('supplierName', event.target.value)} placeholder="Ex. SERVAUX" value={requestForm.supplierName} /></label></div></div> : null}
          {wizardStep === 2 ? <div className="purchase-wizard-card"><h3>€ Prix</h3><div className="purchase-form-grid"><label>Prix unitaire HT<input inputMode="decimal" onChange={(event) => updateForm('unitPriceHt', event.target.value)} value={requestForm.unitPriceHt} /></label><label>Prix total HT<input inputMode="decimal" onChange={(event) => updateForm('amountHt', event.target.value)} value={requestForm.amountHt} /></label><label>Refacturation<select onChange={(event) => updateForm('rebillingLabel', event.target.value)} value={requestForm.rebillingLabel}><option value="">Sélectionner</option><option>GOURY</option><option>LE ROZEL</option><option>Client</option><option>Non refacturable</option></select></label></div></div> : null}
          {wizardStep === 3 ? <div className="purchase-wizard-card"><h3><Truck size={20} />Livraison</h3><div className="purchase-form-grid"><label>Lieu de livraison<select onChange={(event) => updateForm('deliveryLocation', event.target.value)} value={requestForm.deliveryLocation}><option>A bord</option><option>Armement - Cherbourg</option><option>Yard - Le Havre</option></select></label><label>Précision lieu<input onChange={(event) => updateForm('deliveryDetails', event.target.value)} value={requestForm.deliveryDetails} /></label><label>Date souhaitée<input onChange={(event) => updateForm('expectedDeliveryOn', event.target.value)} type="date" value={requestForm.expectedDeliveryOn} /></label></div></div> : null}
          {wizardStep === 4 ? <div className="purchase-wizard-card"><h3><ClipboardCheck size={20} />Notes</h3><label className="purchase-checkbox"><input checked={requestForm.urgent} onChange={(event) => updateForm('urgent', event.target.checked)} type="checkbox" />Commande urgente</label><label>Justifier l’urgence<textarea disabled={!requestForm.urgent} onChange={(event) => updateForm('urgencyReason', event.target.value)} value={requestForm.urgencyReason} /></label><label>Commentaire<textarea onChange={(event) => updateForm('description', event.target.value)} value={requestForm.description} /></label></div> : null}
          {wizardStep === 5 ? <div className="purchase-wizard-card"><h3><Paperclip size={20} />Liens et pièces jointes</h3><div className="purchase-form-grid"><label>Site internet<input onChange={(event) => updateForm('websiteUrl', event.target.value)} placeholder="https://…" type="url" value={requestForm.websiteUrl} /></label><label>Pièces jointes<input accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} type="file" /></label></div>{files.length ? <ul className="purchase-file-list">{files.map((file) => <li key={`${file.name}-${file.size}`}><Paperclip size={15} />{file.name}<span>{Math.ceil(file.size / 1024)} Ko</span></li>)}</ul> : null}</div> : null}
        </section></div>
      </AppDialog> : null}

      {actionDialog ? <AppDialog footer={<div className="app-dialog__actions"><button className="is-secondary" onClick={() => setActionDialog(null)} type="button">Annuler</button><button className="is-primary" disabled={isSaving || (['refuse', 'request_information'].includes(actionDialog.action) && !actionDialog.comment.trim()) || (actionDialog.action === 'plan_delivery' && !actionDialog.effectiveDate)} onClick={() => void runAction(actionDialog.action, { comment: actionDialog.comment, effectiveDate: actionDialog.effectiveDate })} type="button">Confirmer</button></div>} icon={actionDialog.action === 'refuse' ? <AlertTriangle size={20} /> : <ClipboardCheck size={20} />} isBusy={isSaving} onClose={() => setActionDialog(null)} size="sm" title={actionDialog.title}>
        {actionDialog.action === 'plan_delivery' ? <label>Date de livraison<input onChange={(event) => setActionDialog((current) => current ? { ...current, effectiveDate: event.target.value } : current)} type="date" value={actionDialog.effectiveDate} /></label> : <label>{actionDialog.action === 'refuse' ? 'Justification du refus' : 'Complément demandé'}<textarea onChange={(event) => setActionDialog((current) => current ? { ...current, comment: event.target.value } : current)} value={actionDialog.comment} /></label>}
      </AppDialog> : null}
    </section>
  );
}
