import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Archive,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Download,
  ExternalLink,
  Filter,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  ReceiptText,
  RotateCcw,
  Rows3,
  Share2,
  Ship,
  Trash2,
  Users,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { ProjectEditor, ProjectPlanningEditor } from './ProjectEditors';
import { ProjectStoredDocumentLink } from './ProjectStoredDocumentLink';
import type { StoredProjectDocument } from './projectDocumentStorage';
import { ClientCatalogDialog, TowedAssetCatalogDialog } from './ProjectCatalogDialogs';
import { ProjectBillingPanel } from './ProjectBillingPanel';
import {
  BAREBOAT_CONTRACT_TYPE,
  BIMCO_CONTRACT_TYPE,
  normalizeProjectContractType,
  PROJECT_CONTRACT_TYPES,
  TOWAGE_CONTRACT_TYPE,
} from './projectContractOptions';
import { PROJECT_DOCUMENT_TYPES, type ProjectGeneratedDocumentKind } from './projectDocumentTypes';
import { archiveProject, deleteProjectPlanningOccurrence } from './projectMutations';
import { deduplicateProjectDocuments, getSharePointDocumentLinkState } from './projectDocuments';
import { fetchProjectDocumentEmitter } from './projectCommercialOffer';
import {
  buildProjectMetrics,
  fetchProjectVesselCertificates,
  fetchProjectsData,
  type ClientRecord,
  type ProjectContractRecord,
  type ProjectDocumentRecord,
  type ProjectOperationDocumentRecord,
  type ProjectPlanningOccurrenceRecord,
  type ProjectRecord,
  type ProjectsData,
  type ProjectsDataSource,
} from './projectQueries';
import {
  buildSupplytimePreview,
  documentBelongsToProject,
  EMPTY_PROJECT_FILTERS,
  filterDocumentsForProjects,
  getProjectVesselNames,
  projectMatchesFilters,
  resolveSelectedProject,
  sortProjects,
  uniqueSorted,
  type ProjectFilterState,
} from './projectReadModel';

interface ProjectsPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

const EMPTY_PROJECTS_DATA: ProjectsData = {
  clients: [],
  contractDocuments: [],
  operationDocuments: [],
  projectContracts: [],
  contractHirePeriods: [],
  projectDocuments: [],
  planningOccurrences: [],
  projects: [],
  towedAssets: [],
  warnings: [],
  vessels: [],
};

const PROJECTS_PER_PAGE = 40;
const PROJECT_DOCUMENTS_SHAREPOINT_URL = 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets';
const CONTRACT_DOCUMENTS_SHAREPOINT_URL = 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels';

function generatedDocumentKindForContract(contractType?: string | null): ProjectGeneratedDocumentKind {
  const normalized = normalizeProjectContractType(contractType);
  if (normalized === BIMCO_CONTRACT_TYPE) return 'bimco_supplytime';
  if (normalized === TOWAGE_CONTRACT_TYPE) return 'towage_contract';
  if (normalized === BAREBOAT_CONTRACT_TYPE) return 'bareboat_charter';
  return 'offer';
}

function displayText(value: string | number | null | undefined): string {
  return value === '' || value === null || value === undefined ? 'Non renseigné' : String(value);
}

function formatDate(value: string): string {
  if (!value) {
    return 'Non renseignée';
  }

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'medium',
        ...(dateOnly ? {} : { timeStyle: 'short' as const }),
      }).format(date);
}

function formatPeriod(start: string, end: string): string {
  if (start && end) {
    return `${formatDate(start)} au ${formatDate(end)}`;
  }

  return start ? `À partir du ${formatDate(start)}` : end ? `Jusqu’au ${formatDate(end)}` : 'Non renseignée';
}

function formatMoney(value: number | null, currency: string, unit = ''): string {
  if (value === null) {
    return 'Non renseigné';
  }

  const formatted = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
  return [formatted, currency, unit ? `/ ${unit}` : ''].filter(Boolean).join(' ');
}

function planningOperationUrl(occurrenceId: number): string {
  const parameters = new URLSearchParams({ planningOccurrenceId: String(occurrenceId) });
  if (new URLSearchParams(window.location.search).get('preview') === '1') {
    parameters.set('preview', '1');
  }
  return `/modules/planning?${parameters.toString()}`;
}

function billingElementsUrl(): string {
  return new URLSearchParams(window.location.search).get('preview') === '1'
    ? '/modules/billingElements?preview=1'
    : '/modules/billingElements';
}

function formatFileSize(value: number | null): string {
  if (value === null) {
    return '';
  }

  if (value < 1024) {
    return `${value} octets`;
  }

  const units = ['Ko', 'Mo', 'Go'];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(size)} ${units[unitIndex]}`;
}

function sortDocuments(documents: ProjectDocumentRecord[]): ProjectDocumentRecord[] {
  return [...documents].sort(
    (left, right) =>
      right.sourceModifiedAt.localeCompare(left.sourceModifiedAt) || left.title.localeCompare(right.title, 'fr'),
  );
}

function sortClients(clients: ClientRecord[]): ClientRecord[] {
  return [...clients].sort((left, right) => left.name.localeCompare(right.name, 'fr'));
}

function sortPlanningOccurrences(occurrences: ProjectPlanningOccurrenceRecord[]): ProjectPlanningOccurrenceRecord[] {
  return [...occurrences].sort(
    (left, right) => left.startsOn.localeCompare(right.startsOn) || left.id - right.id,
  );
}

function technicalErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return `Impossible de charger les projets depuis Supabase. ${error.message}`;
  }

  return 'Impossible de charger les projets depuis Supabase. Réessayez ou contactez un administrateur.';
}

function warningIsPresent(data: ProjectsData, source: ProjectsDataSource): boolean {
  return data.warnings.some((warning) => warning.source === source);
}

function canManageProjects(roles: RoleKey[]): boolean {
  return roles.includes('admin') || roles.includes('direction');
}

function ProjectRibbonGroup({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div aria-label={label} className="project-ribbon-group" role="group">
      <div className="project-ribbon-actions">{children}</div>
      <span className="project-ribbon-group-label">{label}</span>
    </div>
  );
}

function ProjectRibbonButton({
  icon,
  label,
  ...buttonProps
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode; label: string }) {
  return (
    <button className="project-ribbon-command" type="button" {...buttonProps}>
      <span className="project-ribbon-command-icon">{icon}</span>
      <span className="project-ribbon-command-label">{label}</span>
    </button>
  );
}

function ProjectRibbonLink({ icon, label, to }: { icon: React.ReactNode; label: string; to: string }) {
  return (
    <a className="project-ribbon-command" href={to}>
      <span className="project-ribbon-command-icon">{icon}</span>
      <span className="project-ribbon-command-label">{label}</span>
    </a>
  );
}

const PROJECT_DETAIL_TABS = [
  { id: 'identification', label: 'Identité & contrat' },
  { id: 'operations', label: 'Opérations' },
  { id: 'billing', label: 'Facturation' },
  { id: 'commercial', label: 'Conditions commerciales' },
  { id: 'contract', label: 'Document contractuel' },
  { id: 'documents', label: 'Documents' },
] as const;

type ProjectDetailTab = (typeof PROJECT_DETAIL_TABS)[number]['id'];

function ProjectDetailTabs({
  activeTab,
  onChange,
}: {
  activeTab: ProjectDetailTab;
  onChange: (tab: ProjectDetailTab) => void;
}) {
  function moveFocus(currentTab: ProjectDetailTab, direction: -1 | 1) {
    const currentIndex = PROJECT_DETAIL_TABS.findIndex((tab) => tab.id === currentTab);
    const nextIndex = (currentIndex + direction + PROJECT_DETAIL_TABS.length) % PROJECT_DETAIL_TABS.length;
    const nextTab = PROJECT_DETAIL_TABS[nextIndex];
    onChange(nextTab.id);
    window.requestAnimationFrame(() => document.getElementById(`project-tab-${nextTab.id}`)?.focus());
  }

  return (
    <div aria-label="Sections du projet" className="project-detail-tabs" role="tablist">
      {PROJECT_DETAIL_TABS.map((tab) => (
        <button
          aria-controls="project-detail-panel"
          aria-selected={activeTab === tab.id}
          id={`project-tab-${tab.id}`}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              moveFocus(tab.id, 1);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              moveFocus(tab.id, -1);
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault();
              const target = event.key === 'Home' ? PROJECT_DETAIL_TABS[0] : PROJECT_DETAIL_TABS.at(-1)!;
              onChange(target.id);
              window.requestAnimationFrame(() => document.getElementById(`project-tab-${target.id}`)?.focus());
            }
          }}
          role="tab"
          tabIndex={activeTab === tab.id ? 0 : -1}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function DetailField({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'project-detail-field is-wide' : 'project-detail-field'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ProjectDocuments({
  client,
  documents,
  emptyLabel,
}: {
  client: SupabaseClient;
  documents: ProjectDocumentRecord[];
  emptyLabel: string;
}) {
  if (documents.length === 0) {
    return <p className="project-section-empty">{emptyLabel}</p>;
  }

  return (
    <>
      <p className="project-document-help">
        SeaPilot ouvre en priorité la copie privée Supabase. Les documents non encore migrés utilisent leur lien SharePoint
        d’origine et peuvent demander une authentification Microsoft 365.
      </p>
      <ul className="project-document-list">
        {documents.map((document) => {
          const linkState = getSharePointDocumentLinkState(document.fileUrl);
          const metadata = [
            document.categoryKey,
            document.fileExtension || document.mimeType,
            formatFileSize(document.fileSizeBytes),
            document.sourceModifiedAt ? `modifié le ${formatDate(document.sourceModifiedAt)}` : '',
            document.storageBucket && document.storagePath ? 'Stockage Supabase' : 'Source SharePoint',
          ].filter(Boolean);

          return (
            <li key={document.id}>
              <FileText aria-hidden="true" size={18} />
              <div>
                <strong>{document.fileName || document.title}</strong>
                {metadata.length > 0 ? <span>{metadata.join(' · ')}</span> : null}
                {document.folderPath || document.notes ? <small>{document.folderPath || document.notes}</small> : null}
                {document.projectId === null ? (
                  <small className="project-document-warning">Rattachement au projet Supabase non résolu</small>
                ) : null}
              </div>
              {document.storageBucket && document.storagePath ? (
                <ProjectStoredDocumentLink
                  client={client}
                  document={{
                    fileName: document.fileName || document.title,
                    sharePointWebUrl: document.fileUrl,
                    storageBucket: document.storageBucket,
                    storagePath: document.storagePath,
                  }}
                />
              ) : linkState.status === 'available' ? (
                <a href={linkState.href} rel="noreferrer" target="_blank">
                  Ouvrir dans SharePoint
                  <span className="sr-only"> : {document.fileName || document.title}</span>
                </a>
              ) : (
                <span className="project-missing-link">
                  {linkState.status === 'missing' ? 'URL SharePoint absente' : 'URL SharePoint invalide ou non autorisée'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

const PROJECT_ATTACHMENT_CATEGORY_LABELS: Record<string, string> = {
  billing: 'Facturation',
  commercial_appendix: 'Prestation annexe',
  commercial_contract: 'Contrat',
  commercial_offer: 'Offre Commerciale',
  hse: 'HSE',
  hse_audits: 'Audits',
  hse_kpi: 'KPI',
  hse_minutes: 'Comptes Rendus',
  hse_procedure: 'Procédure',
  toilette_de_mer: 'Toilette de Mer',
  toilette_de_mer_attestation_expert_bv: 'Attestation Expert/BV',
};

function ProjectStoredAttachments({
  client,
  documents,
}: {
  client: SupabaseClient;
  documents: ProjectOperationDocumentRecord[];
}) {
  if (documents.length === 0) {
    return <p className="project-section-empty">Aucune pièce jointe classée depuis la fiche projet.</p>;
  }

  return (
    <>
      <p className="project-document-help">
        Ces pièces jointes sont conservées dans l’espace privé Supabase du projet. Le lien sécurisé est temporaire et
        réservé aux utilisateurs autorisés de la société.
      </p>
      <ul className="project-document-list">
        {documents.map((document) => {
          const category = document.categoryKey ? PROJECT_ATTACHMENT_CATEGORY_LABELS[document.categoryKey] : '';
          const subcategory = document.subcategoryKey
            ? PROJECT_ATTACHMENT_CATEGORY_LABELS[document.subcategoryKey]
            : '';
          const metadata = [
            category,
            subcategory,
            document.mimeType,
            formatFileSize(document.fileSizeBytes),
            document.createdAt ? `ajouté le ${formatDate(document.createdAt)}` : '',
          ].filter(Boolean);
          return (
            <li key={document.id}>
              <FileText aria-hidden="true" size={18} />
              <div>
                <strong>{document.fileName}</strong>
                {metadata.length > 0 ? <span>{metadata.join(' · ')}</span> : null}
                {document.expiresOn ? <small>Échéance : {formatDate(document.expiresOn)}</small> : null}
              </div>
              <ProjectStoredDocumentLink client={client} document={document} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SupplytimePreview({ project, contract }: { project: ProjectRecord; contract?: ProjectContractRecord }) {
  const groups = useMemo(() => buildSupplytimePreview(project, contract), [contract, project]);
  const populatedCount = groups.flatMap((group) => group.fields).filter((field) => field.value).length;

  return (
    <div className="project-supplytime">
      <div className="project-supplytime-heading">
        <div>
          <h4>Aperçu BIMCO</h4>
          <p>{`${populatedCount} zone(s) renseignée(s) sur 36. Les champs métier canoniques priment sur leur copie historique.`}</p>
        </div>
        <span>{contract?.supplytimeSchemaVersion || 'supplytime-2017-v1'}</span>
      </div>
      {groups.map((group, index) => (
        <details key={group.id} open={index === 0}>
          <summary>{group.label}</summary>
          <dl className="project-supplytime-grid">
            {group.fields.map((field) => (
              <DetailField
                key={field.key}
                label={field.label}
                value={
                  <>
                    <span>{displayText(field.value)}</span>
                    {field.source === 'canonical' ? <small>Donnée métier canonique</small> : null}
                    {field.source === 'supplytime' ? <small>Valeur contractuelle historique</small> : null}
                  </>
                }
                wide
              />
            ))}
          </dl>
        </details>
      ))}
    </div>
  );
}

function ProjectDetail({
  project,
  contract,
  client,
  supabaseClient,
  projectDocuments,
  contractDocuments,
  contractUnavailable,
  contractDocumentsUnavailable,
  generatingDocument,
  isManager,
  deletingOccurrenceId,
  onDeleteOccurrence,
  onEditOccurrence,
  onGenerateDocument,
  onEditProject,
  onOpenPlanning,
  operationDocuments,
  planningOccurrences,
}: {
  project: ProjectRecord;
  contract?: ProjectContractRecord;
  client?: ClientRecord;
  supabaseClient: SupabaseClient;
  projectDocuments: ProjectDocumentRecord[];
  contractDocuments: ProjectDocumentRecord[];
  contractUnavailable: boolean;
  contractDocumentsUnavailable: boolean;
  generatingDocument: ProjectGeneratedDocumentKind | null;
  isManager: boolean;
  deletingOccurrenceId: number | null;
  onDeleteOccurrence: (occurrence: ProjectPlanningOccurrenceRecord) => void;
  onEditOccurrence: (occurrence: ProjectPlanningOccurrenceRecord) => void;
  onGenerateDocument: (kind: ProjectGeneratedDocumentKind, planningOccurrenceId: number | null) => void;
  onEditProject: () => void;
  onOpenPlanning: (occurrence: ProjectPlanningOccurrenceRecord) => void;
  operationDocuments: ProjectOperationDocumentRecord[];
  planningOccurrences: ProjectPlanningOccurrenceRecord[];
}) {
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>('identification');
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<number | null>(planningOccurrences[0]?.id ?? null);
  const projectAttachments = useMemo(
    () => operationDocuments.filter((document) => (
      document.documentType === 'project_attachment' && document.planningOccurrenceId === null
    )),
    [operationDocuments],
  );
  useEffect(() => {
    setSelectedOccurrenceId(planningOccurrences[0]?.id ?? null);
  }, [planningOccurrences, project.id]);
  const projectStart = project.deliveryAt || project.charterStartsAt || project.startsOn;
  const projectEnd = project.redeliveryAt || project.charterEndsAt || project.endsOn;
  const generatedDocumentKind = generatedDocumentKindForContract(project.contractType);
  return (
    <article className="project-detail project-contract-sheet" aria-label={`Détails du contrat ${project.projectCode || project.title}`}>
      <header className="project-contract-header">
        <div className="project-contract-identity">
          <span className="project-contract-icon"><ClipboardList aria-hidden="true" size={22} /></span>
          <div>
            <div className="project-contract-title">
              <h2>{project.projectCode ? `${project.projectCode} – ` : ''}{project.title}</h2>
              <span className="project-status-chip">{project.archivedAt ? 'Archivé' : displayText(project.status)}</span>
            </div>
            <dl className="project-contract-summary">
              <DetailField label="Client" value={displayText(project.clientName)} />
              <DetailField label="Type" value={displayText(project.contractType)} />
              <DetailField label="Période" value={formatPeriod(projectStart, projectEnd)} />
              <DetailField
                label="Loyer du contrat"
                value={formatMoney(contract?.charterHire ?? null, contract?.hireCurrency || '', contract?.hireUnit)}
              />
            </dl>
          </div>
        </div>
        <div className="project-contract-header-actions">
          {isManager && !project.archivedAt ? <button onClick={onEditProject} type="button"><Pencil aria-hidden="true" size={15} /> Modifier</button> : null}
          <div className="project-contract-counts" aria-label="Indicateurs du contrat">
            <span><small>Opérations</small><strong>{planningOccurrences.length}</strong></span>
            <span><small>Documents</small><strong>{contractDocuments.length + projectDocuments.length + operationDocuments.length}</strong></span>
          </div>
        </div>
      </header>
      {contractUnavailable ? (
        <p className="project-partial-state" role="status">
          Les informations contractuelles et BIMCO sont temporairement indisponibles. Les autres sections restent consultables.
        </p>
      ) : !contract ? (
        <p className="project-partial-state" role="status">
          Aucune fiche contractuelle structurée n’est associée à ce projet.
        </p>
      ) : null}

      <div className="project-detail-tabs-shell">
        <ProjectDetailTabs activeTab={activeTab} onChange={setActiveTab} />
        <div
          aria-labelledby={`project-tab-${activeTab}`}
          className="project-detail-tab-panel"
          id="project-detail-panel"
          role="tabpanel"
          tabIndex={0}
        >

      {activeTab === 'identification' ? (
      <section aria-label="Identification" className="project-detail-section">
        <dl className="project-detail-grid">
          <DetailField label="Numéro" value={displayText(project.projectCode)} />
          <DetailField label="Statut" value={displayText(project.status)} />
          <DetailField label="Type de contrat" value={displayText(project.contractType)} />
          <DetailField label="Affréteur / client" value={displayText(project.clientName)} />
          <DetailField label="Armateur" value={displayText(contract?.ownerIdentity)} wide />
          <DetailField label="Navire principal" value={displayText(project.primaryVesselName)} />
          <DetailField label="Second navire" value={displayText(project.secondaryVesselName)} />
          <DetailField label="Affectation du navire limitée à" value={displayText(contract?.vesselAssignmentLimit)} wide />
          <DetailField label="Support ROV" value={project.isRovSupport ? 'Oui' : 'Non'} />
          <DetailField label="Support plongée" value={project.isDivingSupport ? 'Oui' : 'Non'} />
          {client ? (
            <DetailField
              label="Coordonnées client"
              value={[client.code, client.email, client.phone, client.city, client.country].filter(Boolean).join(' · ') || 'Non renseignées'}
              wide
            />
          ) : null}
        </dl>
      </section>
      ) : null}

      {activeTab === 'commercial' ? (
      <section aria-label="Offre commerciale" className="project-detail-section">
        <dl className="project-detail-grid">
          <DetailField label="Forfait mobilisation" value={formatMoney(contract?.mobilisationFee ?? null, contract?.feeCurrency || '')} />
          <DetailField label="Forfait démobilisation" value={formatMoney(contract?.demobilisationFee ?? null, contract?.feeCurrency || '')} />
          <DetailField label="Loyer d’affrètement" value={formatMoney(contract?.charterHire ?? null, contract?.hireCurrency || '', contract?.hireUnit)} />
          <DetailField label="Loyer en prolongation" value={formatMoney(contract?.extensionHire ?? null, contract?.hireCurrency || '', contract?.hireUnit)} />
        </dl>
        <div className="project-generated-document-note">
          <span>Rubriques commerciales reprises des offres historiques SharePoint. Le PDF est généré localement pour validation.</span>
          <a href={CONTRACT_DOCUMENTS_SHAREPOINT_URL} rel="noreferrer" target="_blank">
            <ExternalLink aria-hidden="true" size={15} /> Ouvrir Documents Contractuels
          </a>
        </div>
      </section>
      ) : null}

      {activeTab === 'documents' ? (
      <section aria-label="Génération documentaire" className="project-detail-section">
        <div className="project-section-heading">
          <div>
            <strong>Documents contractuels et modèles</strong>
            <span>Consultez les pièces jointes privées du projet et les documents historiques SharePoint.</span>
          </div>
          <a href={PROJECT_DOCUMENTS_SHAREPOINT_URL} rel="noreferrer" target="_blank">
            <ExternalLink aria-hidden="true" size={15} /> Ouvrir SharePoint
          </a>
        </div>
        <h4>Pièces jointes classées depuis la fiche projet</h4>
        <ProjectStoredAttachments client={supabaseClient} documents={projectAttachments} />
        <h4>Documents Projets historiques</h4>
        <ProjectDocuments client={supabaseClient} documents={projectDocuments} emptyLabel="Aucun document projet associé." />
        <h4>Documents contractuels</h4>
        {contractDocumentsUnavailable ? (
          <p className="project-section-empty">Documents contractuels indisponibles en raison d’une erreur de chargement.</p>
        ) : (
          <ProjectDocuments client={supabaseClient} documents={contractDocuments} emptyLabel="Aucun document contractuel associé." />
        )}
        <label className="project-document-occurrence-select">
          Mission / occurrence à reprendre dans le document
          <select
            onChange={(event) => setSelectedOccurrenceId(event.target.value ? Number(event.target.value) : null)}
            value={selectedOccurrenceId ?? ''}
          >
            <option value="">Période générale du projet</option>
            {planningOccurrences.map((occurrence) => (
              <option key={occurrence.id} value={occurrence.id}>
                {formatPeriod(occurrence.startsOn, occurrence.endsOn)} · {displayText(occurrence.primaryVesselName)}
              </option>
            ))}
          </select>
        </label>
        <div className="project-document-factory-grid">
          {PROJECT_DOCUMENT_TYPES.filter((definition) => definition.kind === generatedDocumentKind).map((definition) => (
            <article className={definition.available ? '' : 'is-pending'} key={definition.kind}>
              <FileText aria-hidden="true" size={22} />
              <div>
                <strong>{definition.label}</strong>
                <span>{definition.description}</span>
                <small>{definition.extension.toUpperCase()}</small>
              </div>
              {isManager ? (
                <button
                  disabled={!definition.available || generatingDocument !== null}
                  onClick={() => onGenerateDocument(definition.kind, selectedOccurrenceId)}
                  type="button"
                >
                  <Download aria-hidden="true" size={15} />
                  {generatingDocument === definition.kind ? 'Génération et classement…' : definition.available ? 'Générer et classer' : 'Modèle attendu'}
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      ) : null}

      {activeTab === 'operations' ? (
      <section aria-label="Opérations" className="project-detail-section project-operations-section">
        <div className="project-section-heading">
          <div>
            <strong>Calendrier des opérations</strong>
            <span>Un contrat peut regrouper plusieurs opérations indépendantes dans le Planning.</span>
          </div>
          <a href={PROJECT_DOCUMENTS_SHAREPOINT_URL} rel="noreferrer" target="_blank">
            <ExternalLink aria-hidden="true" size={15} /> Documents Projets
          </a>
        </div>
        {planningOccurrences.length > 0 ? (
          <div className="project-operations-table-scroll">
            <table className="project-operations-table">
              <thead>
                <tr>
                  <th>Mission / opération</th>
                  <th>Début</th>
                  <th>Fin</th>
                  <th>Navires</th>
                  {isManager ? <th>Loyer d’affrètement</th> : null}
                  <th>Documents</th>
                  <th>Statut Planning</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {planningOccurrences.map((occurrence) => {
                  const documents = operationDocuments.filter(
                    (document) => document.planningOccurrenceId === occurrence.id,
                  );
                  return (
                    <tr key={occurrence.id}>
                      <td>
                        <strong>{occurrence.description || `${project.projectCode || 'Projet'} · Opération ${occurrence.id}`}</strong>
                        <small>Occurrence #{occurrence.id}</small>
                      </td>
                      <td>{formatDate(occurrence.startsOn)}</td>
                      <td>{formatDate(occurrence.endsOn)}</td>
                      <td>{displayText((occurrence.vesselNames || [occurrence.primaryVesselName]).filter(Boolean).join(' / '))}</td>
                      {isManager ? (
                        <td>
                          <strong>{formatMoney(occurrence.charterHire, occurrence.hireCurrency, occurrence.hireUnit)}</strong>
                          <small>{occurrence.charterHireOverride ? 'Tarif personnalisé' : 'Barème contractuel'}</small>
                        </td>
                      ) : null}
                      <td>
                        {documents.length > 0 ? (
                          <div className="project-operation-document-links">
                            {documents.map((document) => (
                              <ProjectStoredDocumentLink client={supabaseClient} document={document} includeIcon key={document.id} />
                            ))}
                          </div>
                        ) : <span className="project-operation-no-document">0 fichier</span>}
                      </td>
                      <td><span className="project-status-chip">{displayText(occurrence.status)}</span></td>
                      <td>
                        <div className="project-operation-actions">
                          {isManager ? (
                            <>
                              <button
                                disabled={deletingOccurrenceId === occurrence.id}
                                onClick={() => onEditOccurrence(occurrence)}
                                type="button"
                              >
                                <Pencil aria-hidden="true" size={14} /> Modifier
                              </button>
                              <button
                                aria-label={`Supprimer l’opération ${occurrence.description || `#${occurrence.id}`}`}
                                className="is-danger"
                                disabled={deletingOccurrenceId !== null}
                                onClick={() => onDeleteOccurrence(occurrence)}
                                type="button"
                              >
                                <Trash2 aria-hidden="true" size={14} />
                                {deletingOccurrenceId === occurrence.id ? 'Suppression…' : 'Supprimer'}
                              </button>
                            </>
                          ) : null}
                          <button onClick={() => onOpenPlanning(occurrence)} type="button">
                            <CalendarDays aria-hidden="true" size={14} /> Ouvrir dans le planning
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="project-section-empty">Aucune opération Planning n’est encore associée à ce contrat.</p>
        )}
      </section>
      ) : null}

      {activeTab === 'billing' ? (
        <ProjectBillingPanel
          client={supabaseClient}
          contract={contract}
          isManager={isManager}
          operations={planningOccurrences}
          project={project}
        />
      ) : null}

      {activeTab === 'contract' ? (
      <section aria-label="Contrat" className="project-detail-section">
        {!contractUnavailable ? <SupplytimePreview contract={contract} project={project} /> : null}
        <h4>Documents contractuels</h4>
        {contractDocumentsUnavailable ? (
          <p className="project-section-empty">Documents contractuels indisponibles en raison d’une erreur de chargement.</p>
        ) : (
          <ProjectDocuments client={supabaseClient} documents={contractDocuments} emptyLabel="Aucun document contractuel associé." />
        )}
        <p className="project-document-help">
          Le BIMCO reprend les quatre pages particulières du P144 et les clauses générales du document de référence fourni.
          Les documents contractuels migrés sont conservés dans l’espace privé Supabase ; leur provenance SharePoint reste tracée.
        </p>
      </section>
      ) : null}
        </div>
      </div>
    </article>
  );
}

export function ProjectsPage({ client, roles }: ProjectsPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManageProjects(effectiveRoles);
  const creationQueryHandled = useRef(false);
  const creationRequest = useMemo(() => {
    const parameters = new URLSearchParams(window.location.search);
    const vesselId = Number(parameters.get('vesselId'));
    const operationDate = parameters.get('operationDate') || '';
    return {
      open: parameters.get('newProject') === '1',
      operation: operationDate && Number.isInteger(vesselId) && vesselId > 0
        ? { endsOn: operationDate, startsOn: operationDate, vesselIds: [vesselId] }
        : undefined,
    };
  }, []);
  const [projectsData, setProjectsData] = useState<ProjectsData>(EMPTY_PROJECTS_DATA);
  const [filters, setFilters] = useState<ProjectFilterState>(EMPTY_PROJECT_FILTERS);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projectEditorOpen, setProjectEditorOpen] = useState(false);
  const [clientCatalogOpen, setClientCatalogOpen] = useState(false);
  const [towedAssetCatalogOpen, setTowedAssetCatalogOpen] = useState(false);
  const [planningEditorOpen, setPlanningEditorOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compactDensity, setCompactDensity] = useState(true);
  const [editingProject, setEditingProject] = useState<ProjectRecord | undefined>();
  const [editingOccurrence, setEditingOccurrence] = useState<ProjectPlanningOccurrenceRecord | undefined>();
  const [mutationMessage, setMutationMessage] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [lastStoredDocument, setLastStoredDocument] = useState<StoredProjectDocument | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [deletingOccurrenceId, setDeletingOccurrenceId] = useState<number | null>(null);
  const [generatingDocument, setGeneratingDocument] = useState<ProjectGeneratedDocumentKind | null>(null);
  const deferredSearch = useDeferredValue(filters.search);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    fetchProjectsData(effectiveClient)
      .then((loadedData) => {
        if (isMounted) {
          setProjectsData({
            ...loadedData,
            clients: sortClients(loadedData.clients),
            contractDocuments: sortDocuments(loadedData.contractDocuments),
            operationDocuments: [...loadedData.operationDocuments].sort(
              (left, right) => right.createdAt.localeCompare(left.createdAt) || left.fileName.localeCompare(right.fileName, 'fr'),
            ),
            planningOccurrences: sortPlanningOccurrences(loadedData.planningOccurrences),
            projectDocuments: sortDocuments(loadedData.projectDocuments),
            projects: sortProjects(loadedData.projects),
          });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setErrorMessage(technicalErrorMessage(error));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveClient, loadAttempt]);

  useEffect(() => {
    if (isLoading || !isManager || !creationRequest.open || creationQueryHandled.current) return;
    creationQueryHandled.current = true;
    openProjectEditor();
  }, [creationRequest.open, isLoading, isManager]);

  const effectiveFilters = useMemo(() => ({ ...filters, search: deferredSearch }), [deferredSearch, filters]);
  const projectDocumentSet = useMemo(
    () => deduplicateProjectDocuments(projectsData.projectDocuments),
    [projectsData.projectDocuments],
  );
  const contractDocumentSet = useMemo(
    () => deduplicateProjectDocuments(projectsData.contractDocuments),
    [projectsData.contractDocuments],
  );
  const filteredProjects = useMemo(
    () => projectsData.projects.filter((project) => projectMatchesFilters(project, effectiveFilters)),
    [effectiveFilters, projectsData.projects],
  );
  const filteredProjectDocuments = useMemo(
    () => filterDocumentsForProjects(projectDocumentSet.documents, filteredProjects),
    [filteredProjects, projectDocumentSet.documents],
  );
  const filteredContractDocuments = useMemo(
    () => filterDocumentsForProjects(contractDocumentSet.documents, filteredProjects),
    [contractDocumentSet.documents, filteredProjects],
  );
  const filteredClients = useMemo(
    () =>
      projectsData.clients.filter((clientRecord) =>
        filteredProjects.some(
          (project) => project.clientId === clientRecord.id || project.clientName === clientRecord.name,
        ),
      ),
    [filteredProjects, projectsData.clients],
  );
  const metrics = useMemo(
    () =>
      buildProjectMetrics({
        ...projectsData,
        clients: filteredClients,
        contractDocuments: filteredContractDocuments,
        projectDocuments: filteredProjectDocuments,
        projects: filteredProjects,
      }),
    [filteredClients, filteredContractDocuments, filteredProjectDocuments, filteredProjects, projectsData],
  );
  const statusOptions = useMemo(
    () => uniqueSorted(projectsData.projects.map((project) => project.status)),
    [projectsData.projects],
  );
  const clientOptions = useMemo(
    () =>
      uniqueSorted([
        ...projectsData.projects.map((project) => project.clientName),
        ...projectsData.clients.map((clientRecord) => clientRecord.name),
      ]),
    [projectsData.clients, projectsData.projects],
  );
  const vesselOptions = useMemo(
    () => uniqueSorted(projectsData.projects.flatMap((project) => getProjectVesselNames(project))),
    [projectsData.projects],
  );
  const selectedProject = resolveSelectedProject(filteredProjects, selectedProjectId);
  const selectedContract = selectedProject
    ? projectsData.projectContracts.find((contract) => contract.projectId === selectedProject.id && !contract.archivedAt)
    : undefined;
  const selectedClient = selectedProject
    ? projectsData.clients.find(
        (clientRecord) => clientRecord.id === selectedProject.clientId || clientRecord.name === selectedProject.clientName,
      )
    : undefined;
  const selectedProjectDocuments = selectedProject
    ? projectDocumentSet.documents.filter((document) => documentBelongsToProject(document, selectedProject))
    : [];
  const selectedContractDocuments = selectedProject
    ? contractDocumentSet.documents.filter((document) => documentBelongsToProject(document, selectedProject))
    : [];
  const selectedPlanningOccurrences = selectedProject
    ? projectsData.planningOccurrences.filter((occurrence) => occurrence.projectId === selectedProject.id)
    : [];
  const selectedOperationDocuments = selectedProject
    ? projectsData.operationDocuments.filter((document) => document.projectId === selectedProject.id)
    : [];
  const selectedGeneratedDocumentKind = generatedDocumentKindForContract(selectedProject?.contractType);
  const unresolvedDocumentCount = [...projectDocumentSet.documents, ...contractDocumentSet.documents].filter(
    (document) => document.projectId === null,
  ).length;
  const duplicateDocumentCount = projectDocumentSet.duplicateCount + contractDocumentSet.duplicateCount;
  const pageCount = Math.max(1, Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE));
  const safePage = Math.min(currentPage, pageCount - 1);
  const visibleProjects = filteredProjects.slice(safePage * PROJECTS_PER_PAGE, (safePage + 1) * PROJECTS_PER_PAGE);
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const contractTypeOptions = useMemo(
    () => uniqueSorted([
      ...PROJECT_CONTRACT_TYPES,
      ...projectsData.projects.map((project) => normalizeProjectContractType(project.contractType)),
    ]),
    [projectsData.projects],
  );

  function updateFilterValue(key: keyof ProjectFilterState, value: string) {
    setCurrentPage(0);
    setFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  }

  function resetFilters() {
    setCurrentPage(0);
    setFilters(EMPTY_PROJECT_FILTERS);
  }

  function openProjectEditor(project?: ProjectRecord) {
    setMutationError('');
    setEditingProject(project);
    setProjectEditorOpen(true);
  }

  function openPlanningEditor(occurrence?: ProjectPlanningOccurrenceRecord) {
    setMutationError('');
    setEditingOccurrence(occurrence);
    setPlanningEditorOpen(true);
  }

  async function archiveSelectedProject() {
    if (!selectedProject || !window.confirm(`Archiver ${selectedProject.projectCode || selectedProject.title} ?`)) return;
    setMutationError('');
    setMutationMessage('');
    setIsArchiving(true);
    try {
      await archiveProject(effectiveClient, selectedProject.id);
      setSelectedProjectId(null);
      setMutationMessage('Projet archivé dans Supabase.');
      setLoadAttempt((attempt) => attempt + 1);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Impossible d’archiver le projet.");
    } finally {
      setIsArchiving(false);
    }
  }

  async function deletePlanningOccurrence(occurrence: ProjectPlanningOccurrenceRecord) {
    if (!selectedProject) return;
    const operationLabel = occurrence.description || `Occurrence #${occurrence.id}`;
    const confirmed = window.confirm(
      `Supprimer définitivement l’opération « ${operationLabel} » du Planning ?\n\n`
      + 'Les documents déjà classés resteront conservés dans SeaPilot au niveau du projet.',
    );
    if (!confirmed) return;

    setMutationError('');
    setMutationMessage('');
    setDeletingOccurrenceId(occurrence.id);
    try {
      await deleteProjectPlanningOccurrence(effectiveClient, {
        occurrenceId: occurrence.id,
        projectId: selectedProject.id,
      });
      setProjectsData((currentData) => ({
        ...currentData,
        operationDocuments: currentData.operationDocuments.filter(
          (document) => document.planningOccurrenceId !== occurrence.id,
        ),
        planningOccurrences: currentData.planningOccurrences.filter((item) => item.id !== occurrence.id),
      }));
      if (editingOccurrence?.id === occurrence.id) {
        setPlanningEditorOpen(false);
        setEditingOccurrence(undefined);
      }
      setMutationMessage(
        'Opération supprimée du Planning. Ses documents restent conservés dans SeaPilot.',
      );
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Impossible de supprimer l’opération.");
    } finally {
      setDeletingOccurrenceId(null);
    }
  }

  async function generateSelectedProjectDocument(kind: ProjectGeneratedDocumentKind, planningOccurrenceId: number | null) {
    if (!selectedProject) return;
    setMutationError('');
    setMutationMessage('');
    setLastStoredDocument(null);
    setGeneratingDocument(kind);
    try {
      const { downloadGeneratedProjectDocument, generateProjectDocument } = await import('./projectDocumentGeneration');
      const occurrence = planningOccurrenceId
        ? selectedPlanningOccurrences.find((item) => item.id === planningOccurrenceId)
        : undefined;
      const emitter = kind === 'offer' || kind === 'towage_contract' || kind === 'bareboat_charter'
        ? await fetchProjectDocumentEmitter(effectiveClient).catch(() => undefined)
        : undefined;
      const vesselCertificates = kind === 'bareboat_charter'
        ? selectedProject.primaryVesselId
          ? await fetchProjectVesselCertificates(effectiveClient, selectedProject.primaryVesselId)
          : []
        : undefined;
      const generated = await generateProjectDocument(kind, {
        client: selectedClient,
        contract: selectedContract,
        emitter,
        occurrence,
        project: selectedProject,
        towedAsset: projectsData.towedAssets.find((asset) => asset.id === selectedContract?.towedAssetId),
        vessel: projectsData.vessels.find((vessel) => vessel.id === selectedProject.primaryVesselId),
        vesselCertificates,
      });
      try {
        const { storeGeneratedProjectDocument } = await import('./projectDocumentStorage');
        const stored = await storeGeneratedProjectDocument(effectiveClient, {
          document: generated,
          documentType: kind,
          planningOccurrenceId,
          projectId: selectedProject.id,
          revision: 1,
        });
        setLastStoredDocument(stored);
        setMutationMessage(`${stored.fileName} généré et classé dans l’espace privé SeaPilot.`);
        setLoadAttempt((attempt) => attempt + 1);
      } catch (storageError) {
        downloadGeneratedProjectDocument(generated);
        setMutationMessage(`${generated.fileName} généré et téléchargé localement.`);
        setMutationError(storageError instanceof Error ? storageError.message : 'Le classement SeaPilot a échoué.');
      }
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Impossible de générer le document.');
    } finally {
      setGeneratingDocument(null);
    }
  }

  if (isLoading) {
    return (
      <div className="admin-state" role="status">
        Chargement des projets depuis Supabase…
      </div>
    );
  }

  if (errorMessage) {
    return (
      <section className="projects-page">
        <div className="admin-header">
          <div>
            <p className="module-family">Opérations</p>
            <h1>Projets</h1>
          </div>
        </div>
        <div className="project-error-state" role="alert">
          <Info aria-hidden="true" size={22} />
          <div>
            <strong>Erreur de chargement</strong>
            <p>{errorMessage}</p>
            <button onClick={() => setLoadAttempt((attempt) => attempt + 1)} type="button">
              <RefreshCw aria-hidden="true" size={16} />
              Réessayer
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="projects-page">
      <header className="project-module-header">
        <div>
          <p className="module-family">MODULE</p>
          <h1>Projets</h1>
          <p className="projects-header-subtitle">Contrats, opérations, loyers et documents associés.</p>
        </div>
        <div className="project-compact-metrics" aria-label="Indicateurs des contrats">
          <span><strong>{metrics.activeProjects}</strong> actifs</span>
          <span><strong>{metrics.totalProjects}</strong> contrats</span>
          <span><strong>{projectsData.planningOccurrences.length}</strong> opérations</span>
          <span><strong>{metrics.projectDocumentCount + projectsData.operationDocuments.length}</strong> documents projets</span>
        </div>
      </header>

      <nav aria-label="Commandes du module Projets" className="project-command-ribbon">
        <ProjectRibbonGroup label="Portefeuille">
          <ProjectRibbonButton disabled={!isManager} icon={<Plus aria-hidden="true" size={20} />} label="Nouveau projet" onClick={() => openProjectEditor()} />
          <ProjectRibbonButton disabled={!isManager || !selectedProject || Boolean(selectedProject.archivedAt)} icon={<Pencil aria-hidden="true" size={20} />} label="Modifier le projet" onClick={() => selectedProject && openProjectEditor(selectedProject)} />
          <ProjectRibbonButton disabled={!isManager || !selectedProject || Boolean(selectedProject.archivedAt) || isArchiving} icon={<Archive aria-hidden="true" size={20} />} label="Archiver" onClick={archiveSelectedProject} />
          <ProjectRibbonButton icon={<RefreshCw aria-hidden="true" size={20} />} label="Actualiser" onClick={() => setLoadAttempt((attempt) => attempt + 1)} />
        </ProjectRibbonGroup>
        <ProjectRibbonGroup label="Référentiels & opérations">
          <ProjectRibbonButton disabled={!isManager} icon={<Users aria-hidden="true" size={20} />} label="Liste des clients" onClick={() => setClientCatalogOpen(true)} />
          <ProjectRibbonButton disabled={!isManager} icon={<Ship aria-hidden="true" size={20} />} label="Liste des remorqués" onClick={() => setTowedAssetCatalogOpen(true)} />
          <ProjectRibbonButton disabled={!isManager || !selectedProject || Boolean(selectedProject.archivedAt)} icon={<CalendarPlus aria-hidden="true" size={20} />} label="Nouvelle opération" onClick={() => openPlanningEditor()} />
        </ProjectRibbonGroup>
        <ProjectRibbonGroup label="Documents">
          <ProjectRibbonButton
            disabled={!isManager || !selectedProject || generatingDocument !== null}
            icon={<FileText aria-hidden="true" size={20} />}
            label="Générer le document"
            onClick={() => void generateSelectedProjectDocument(
              selectedGeneratedDocumentKind,
              selectedGeneratedDocumentKind === 'offer' ? null : selectedPlanningOccurrences[0]?.id ?? null,
            )}
          />
          <ProjectRibbonButton icon={<Share2 aria-hidden="true" size={20} />} label="Ouvrir SharePoint" onClick={() => window.open(PROJECT_DOCUMENTS_SHAREPOINT_URL, '_blank', 'noopener,noreferrer')} />
        </ProjectRibbonGroup>
        <ProjectRibbonGroup label="Facturation">
          <ProjectRibbonLink icon={<ReceiptText aria-hidden="true" size={20} />} label="Éléments de facturation" to={billingElementsUrl()} />
        </ProjectRibbonGroup>
        <ProjectRibbonGroup label="Affichage">
          <ProjectRibbonButton aria-pressed={filtersOpen} icon={<Filter aria-hidden="true" size={20} />} label="Filtres" onClick={() => setFiltersOpen((open) => !open)} />
          <ProjectRibbonButton disabled={!hasActiveFilters} icon={<RotateCcw aria-hidden="true" size={20} />} label="Réinitialiser" onClick={resetFilters} />
          <ProjectRibbonButton aria-pressed={compactDensity} icon={<Rows3 aria-hidden="true" size={20} />} label="Densité" onClick={() => setCompactDensity((compact) => !compact)} />
        </ProjectRibbonGroup>
      </nav>

      {projectsData.warnings.length > 0 ? (
        <div className="project-partial-state" role="status">
          <strong>Consultation partielle.</strong>{' '}
          {`Le chargement de ${projectsData.warnings.map((warning) => warning.label).join(', ')} a échoué.`}
        </div>
      ) : null}

      {unresolvedDocumentCount > 0 || duplicateDocumentCount > 0 ? (
        <aside className="project-document-state" role="status">
          <Info aria-hidden="true" size={18} />
          <div>
            <strong>Métadonnées documentaires à contrôler</strong>
            {unresolvedDocumentCount > 0 ? (
              <span>{`${unresolvedDocumentCount} document(s) sans rattachement Supabase résolu.`}</span>
            ) : null}
            {duplicateDocumentCount > 0 ? (
              <span>{`${duplicateDocumentCount} doublon(s) de métadonnées masqué(s) dans la consultation.`}</span>
            ) : null}
          </div>
        </aside>
      ) : null}

      {filtersOpen ? <div className="planning-filter-panel projects-filter-panel" aria-label="Filtres contrats">
        <label>
          Recherche projets
          <input
            onChange={(event) => updateFilterValue('search', event.target.value)}
            placeholder="Projet, client, navire, zone…"
            type="search"
            value={filters.search}
          />
        </label>
        <label>
          Filtre statut projet
          <select onChange={(event) => updateFilterValue('status', event.target.value)} value={filters.status}>
            <option value="">Tous les statuts</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtre client projet
          <select onChange={(event) => updateFilterValue('clientName', event.target.value)} value={filters.clientName}>
            <option value="">Tous les clients</option>
            {clientOptions.map((clientName) => (
              <option key={clientName} value={clientName}>
                {clientName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtre navire projet
          <select onChange={(event) => updateFilterValue('vesselName', event.target.value)} value={filters.vesselName}>
            <option value="">Tous les navires</option>
            {vesselOptions.map((vesselName) => (
              <option key={vesselName} value={vesselName}>
                {vesselName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Projet depuis
          <input onChange={(event) => updateFilterValue('dateFrom', event.target.value)} type="date" value={filters.dateFrom} />
        </label>
        <label>
          Projet jusqu’au
          <input onChange={(event) => updateFilterValue('dateTo', event.target.value)} type="date" value={filters.dateTo} />
        </label>
        <button disabled={!hasActiveFilters} onClick={resetFilters} type="button">
          Réinitialiser
        </button>
      </div> : null}

      {mutationMessage ? <p className="project-mutation-success" role="status">{mutationMessage}</p> : null}
      {lastStoredDocument ? (
        <span className="project-stored-document-link">
          <ProjectStoredDocumentLink client={effectiveClient} document={{
            fileName: lastStoredDocument.fileName,
            storageBucket: lastStoredDocument.storageBucket,
            storagePath: lastStoredDocument.storagePath,
          }} includeIcon />
        </span>
      ) : null}
      {mutationError ? <p className="form-error" role="alert">{mutationError}</p> : null}

      {projectsData.projects.length === 0 ? (
        <div className="admin-state">Aucun projet n’est disponible dans Supabase.</div>
      ) : filteredProjects.length === 0 ? (
        <div className="admin-state">
          <div>
            <strong>Aucun projet ne correspond aux filtres.</strong>
            <button className="project-inline-action" onClick={resetFilters} type="button">
              Réinitialiser les filtres
            </button>
          </div>
        </div>
      ) : (
        <div className={`projects-read-layout project-contract-workspace${compactDensity ? ' is-compact' : ''}`}>
          <section className="projects-panel project-list-panel" aria-labelledby="projects-list-title">
            <div className="project-contract-list-heading">
              <div>
                <h2 id="projects-list-title">Portefeuille projet</h2>
                <span>{filteredProjects.length} projet(s)</span>
              </div>
              <label>
                <span className="sr-only">Rechercher un contrat</span>
                <input
                  onChange={(event) => updateFilterValue('search', event.target.value)}
                  placeholder="Pxxx – Nom du projet…"
                  type="search"
                  value={filters.search}
                />
              </label>
            </div>
            <ul className="project-catalog-list">
              {visibleProjects.map((project) => {
                const isSelected = selectedProject?.id === project.id;
                const occurrences = projectsData.planningOccurrences.filter((occurrence) => occurrence.projectId === project.id);
                return (
                  <li className={isSelected ? 'is-selected' : undefined} key={project.id}>
                    <button
                      aria-label={`${project.projectCode || ''} ${project.title}`}
                      aria-pressed={isSelected}
                      className="project-select-button project-contract-list-row"
                      onClick={() => setSelectedProjectId(project.id)}
                      type="button"
                    >
                      <span className="project-contract-list-title">
                        <strong>{project.projectCode ? `${project.projectCode} – ` : ''}{project.title}</strong>
                        <span className="project-status-chip">{project.archivedAt ? 'Archivé' : displayText(project.status)}</span>
                      </span>
                      <span className="project-contract-list-meta">
                        <span>{displayText(project.clientName)}</span>
                        <small>{occurrences.length} opération(s)</small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {pageCount > 1 ? (
              <nav className="project-pagination" aria-label="Pagination des projets">
                <button disabled={safePage === 0} onClick={() => setCurrentPage(safePage - 1)} type="button">
                  <ChevronLeft aria-hidden="true" size={16} />
                  Précédent
                </button>
                <span>{`Page ${safePage + 1} sur ${pageCount}`}</span>
                <button disabled={safePage === pageCount - 1} onClick={() => setCurrentPage(safePage + 1)} type="button">
                  Suivant
                  <ChevronRight aria-hidden="true" size={16} />
                </button>
              </nav>
            ) : null}
          </section>

          {selectedProject ? (
            <ProjectDetail
              client={selectedClient}
              supabaseClient={effectiveClient}
              contract={selectedContract}
              contractDocuments={selectedContractDocuments}
              contractDocumentsUnavailable={warningIsPresent(projectsData, 'contractDocuments')}
              contractUnavailable={warningIsPresent(projectsData, 'projectContracts')}
              deletingOccurrenceId={deletingOccurrenceId}
              generatingDocument={generatingDocument}
              isManager={isManager}
              onDeleteOccurrence={(occurrence) => void deletePlanningOccurrence(occurrence)}
              onEditOccurrence={openPlanningEditor}
              onGenerateDocument={(kind, planningOccurrenceId) => void generateSelectedProjectDocument(kind, planningOccurrenceId)}
              onEditProject={() => openProjectEditor(selectedProject)}
              onOpenPlanning={(occurrence) => window.location.assign(planningOperationUrl(occurrence.id))}
              operationDocuments={selectedOperationDocuments}
              planningOccurrences={selectedPlanningOccurrences}
              project={selectedProject}
              projectDocuments={selectedProjectDocuments}
            />
          ) : null}
        </div>
      )}

      {projectEditorOpen ? (
        <ProjectEditor
          client={effectiveClient}
          clients={projectsData.clients}
          contract={editingProject ? projectsData.projectContracts.find((item) => item.projectId === editingProject.id && !item.archivedAt) : undefined}
          contractTypes={contractTypeOptions}
          initialOperation={editingProject ? undefined : creationRequest.operation}
          onClose={() => setProjectEditorOpen(false)}
          onSaved={(result) => {
            setProjectEditorOpen(false);
            setSelectedProjectId(result.id);
            setMutationMessage(`${result.projectCode || result.title} enregistré dans Supabase.`);
            setLoadAttempt((attempt) => attempt + 1);
          }}
          project={editingProject}
          projectAttachments={editingProject
            ? selectedOperationDocuments.filter((document) => document.documentType === 'project_attachment')
            : []}
          statuses={statusOptions}
          towedAssets={projectsData.towedAssets}
          vessels={projectsData.vessels}
        />
      ) : null}
      {clientCatalogOpen ? (
        <ClientCatalogDialog
          canManage={isManager}
          client={effectiveClient}
          clients={projectsData.clients}
          onChanged={() => setLoadAttempt((attempt) => attempt + 1)}
          onClose={() => setClientCatalogOpen(false)}
        />
      ) : null}
      {towedAssetCatalogOpen ? (
        <TowedAssetCatalogDialog
          canManage={isManager}
          client={effectiveClient}
          onChanged={() => setLoadAttempt((attempt) => attempt + 1)}
          onClose={() => setTowedAssetCatalogOpen(false)}
          towedAssets={projectsData.towedAssets}
        />
      ) : null}
      {planningEditorOpen && selectedProject ? (
        <ProjectPlanningEditor
          canViewCharterHire={isManager}
          client={effectiveClient}
          contract={selectedContract}
          occurrence={editingOccurrence}
          onClose={() => {
            setPlanningEditorOpen(false);
            setEditingOccurrence(undefined);
          }}
          onSaved={(_occurrenceId, uploads) => {
            setPlanningEditorOpen(false);
            setEditingOccurrence(undefined);
            setMutationMessage(
              editingOccurrence
                ? 'Opération mise à jour dans le Planning.'
                : 'Opération ajoutée au Planning.',
            );
            if (uploads.stored.length > 0) {
              setMutationMessage((message) => `${message} ${uploads.stored.length} document(s) classé(s) dans SeaPilot.`);
            }
            if (uploads.failed.length > 0) {
              setMutationError(`${uploads.failed.length} document(s) n’ont pas pu être classés dans SeaPilot.`);
            }
            setLoadAttempt((attempt) => attempt + 1);
          }}
          operationDocuments={editingOccurrence
            ? selectedOperationDocuments.filter((document) => document.planningOccurrenceId === editingOccurrence.id)
            : []}
          project={selectedProject}
          vessels={projectsData.vessels}
        />
      ) : null}
    </section>
  );
}
