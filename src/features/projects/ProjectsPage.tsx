import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Archive,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Files,
  Download,
  ExternalLink,
  Filter,
  Info,
  Pencil,
  PackageCheck,
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
import { AppDialog } from '../../components/AppDialog';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { ProjectEditor, ProjectPlanningEditor } from './ProjectEditors';
import { ProjectStoredDocumentLink } from './ProjectStoredDocumentLink';
import type { StoredProjectDocument } from './projectDocumentStorage';
import { ClientCatalogDialog, ServiceCatalogDialog, TowedAssetCatalogDialog } from './ProjectCatalogDialogs';
import { ProjectBillingPanel } from './ProjectBillingPanel';
import {
  BAREBOAT_CONTRACT_TYPE,
  BIMCO_CONTRACT_TYPE,
  normalizeProjectContractType,
  PROJECT_CONTRACT_TYPES,
  TOWAGE_CONTRACT_TYPE,
} from './projectContractOptions';
import { PROJECT_DOCUMENT_TYPES, type ProjectGeneratedDocumentKind } from './projectDocumentTypes';
import type { ProjectDocumentLanguage } from './projectDocumentGeneration';
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
  type ProjectTowedAssetRecord,
  type ProjectsData,
  type ProjectsDataSource,
} from './projectQueries';
import { BIMCO_P144_GROUPS } from './projectContractModels';
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

type ProjectDocumentDownloadMode = 'document' | 'bundle';

interface ProjectDocumentEmissionRequest {
  kind: ProjectGeneratedDocumentKind;
  planningOccurrenceId: number | null;
}

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

type ProjectContractVariant = 'towage' | 'bareboat' | 'time-charter' | 'bimco';
type ProjectDetailTab =
  | 'identification'
  | 'operations'
  | 'billing'
  | 'offer-contract'
  | 'documents'
  | 'towage-parties'
  | 'towage-route'
  | 'towage-terms'
  | 'towage-signatures'
  | 'bareboat-vessel'
  | 'bareboat-duration'
  | 'bareboat-terms'
  | 'bareboat-signatures'
  | 'time-charter-vessel'
  | 'time-charter-operations'
  | 'time-charter-rates'
  | 'time-charter-clauses'
  | 'bimco-boxes-01-12'
  | 'bimco-boxes-13-21'
  | 'bimco-boxes-22-34'
  | 'bimco-signatures'
  | 'bimco-annexes';

interface ProjectDetailTabDefinition {
  description?: string;
  group?: string;
  icon: typeof FileText;
  id: ProjectDetailTab;
  label: string;
}

const PROJECT_CONTRACT_VARIANTS: ReadonlyArray<{
  documentKind: ProjectGeneratedDocumentKind;
  id: ProjectContractVariant;
  label: string;
}> = [
  { documentKind: 'towage_contract', id: 'towage', label: 'Contrat de remorquage' },
  { documentKind: 'bareboat_charter', id: 'bareboat', label: 'Affrètement coque nue' },
  { documentKind: 'bimco_supplytime', id: 'time-charter', label: 'Affrètement à temps' },
  { documentKind: 'bimco_supplytime', id: 'bimco', label: 'BIMCO' },
];

const PROJECT_BASE_TABS: ProjectDetailTabDefinition[] = [
  { icon: Users, id: 'identification', label: 'Identité' },
  { icon: CalendarDays, id: 'operations', label: 'Opérations' },
  { icon: ReceiptText, id: 'billing', label: 'Facturation' },
  { icon: FileText, id: 'offer-contract', label: 'Offre & contrat' },
];

const PROJECT_CONTRACT_TABS: Record<ProjectContractVariant, ProjectDetailTabDefinition[]> = {
  towage: [
    { group: 'Contrat de remorquage', icon: Ship, id: 'towage-parties', label: 'Parties & convoi' },
    { group: 'Contrat de remorquage', icon: CalendarDays, id: 'towage-route', label: 'Itinéraire & délais' },
    { group: 'Contrat de remorquage', icon: ReceiptText, id: 'towage-terms', label: 'Tarifs & conditions' },
    { group: 'Contrat de remorquage', icon: PackageCheck, id: 'towage-signatures', label: 'Signatures' },
  ],
  bareboat: [
    { group: 'Affrètement coque nue', icon: Ship, id: 'bareboat-vessel', label: 'Navire & livraison' },
    { group: 'Affrètement coque nue', icon: CalendarDays, id: 'bareboat-duration', label: 'Durée & loyers' },
    { group: 'Affrètement coque nue', icon: Info, id: 'bareboat-terms', label: 'Assurance & droit' },
    { group: 'Affrètement coque nue', icon: PackageCheck, id: 'bareboat-signatures', label: 'Signatures' },
  ],
  'time-charter': [
    { group: 'Affrètement à temps', icon: Ship, id: 'time-charter-vessel', label: 'Navire & période' },
    { group: 'Affrètement à temps', icon: CalendarDays, id: 'time-charter-operations', label: 'Exploitation' },
    { group: 'Affrètement à temps', icon: ReceiptText, id: 'time-charter-rates', label: 'Conditions tarifaires' },
    { group: 'Affrètement à temps', icon: PackageCheck, id: 'time-charter-clauses', label: 'Clauses & signatures' },
  ],
  bimco: [
    { group: 'BIMCO', icon: ClipboardList, id: 'bimco-boxes-01-12', label: 'Cases 1–12' },
    { group: 'BIMCO', icon: ClipboardList, id: 'bimco-boxes-13-21', label: 'Cases 13–21' },
    { group: 'BIMCO', icon: ClipboardList, id: 'bimco-boxes-22-34', label: 'Cases 22–34' },
    { group: 'BIMCO', icon: PackageCheck, id: 'bimco-signatures', label: 'Signatures' },
    { group: 'BIMCO', icon: Files, id: 'bimco-annexes', label: 'Annexes' },
  ],
};

function projectContractVariant(contractType?: string | null): ProjectContractVariant | null {
  const lowered = contractType?.trim().toLocaleLowerCase('fr-FR') || '';
  if (lowered.includes('remorquage')) return 'towage';
  if (lowered.includes('affrètement à temps')) return 'time-charter';
  if (lowered.includes('coque nue') || lowered.includes("contrat d'affrètement") || lowered.includes('contrat d’affrètement')) {
    return 'bareboat';
  }
  if (lowered.includes('bimco') || lowered.includes('supplytime')) return 'bimco';
  return null;
}

function projectDetailTabs(variant: ProjectContractVariant | null): ProjectDetailTabDefinition[] {
  return [
    ...PROJECT_BASE_TABS,
    ...(variant ? PROJECT_CONTRACT_TABS[variant] : []),
    { icon: Files, id: 'documents', label: 'Documents' },
  ];
}

function ProjectDetailTabs({
  activeTab,
  onChange,
  tabs,
}: {
  activeTab: ProjectDetailTab;
  onChange: (tab: ProjectDetailTab) => void;
  tabs: ProjectDetailTabDefinition[];
}) {
  function moveFocus(currentTab: ProjectDetailTab, direction: -1 | 1) {
    const currentIndex = tabs.findIndex((tab) => tab.id === currentTab);
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    onChange(nextTab.id);
    window.requestAnimationFrame(() => document.getElementById(`project-tab-${nextTab.id}`)?.focus());
  }

  return (
    <div aria-label="Sections du projet" className="project-detail-tabs" role="tablist">
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        const startsGroup = Boolean(tab.group && tab.group !== tabs[index - 1]?.group);
        return (
          <div className="project-detail-tab-item" key={tab.id}>
            {startsGroup ? <span className="project-detail-tab-group">{tab.group}</span> : null}
            <button
              aria-controls="project-detail-panel"
              aria-selected={activeTab === tab.id}
              id={`project-tab-${tab.id}`}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  moveFocus(tab.id, 1);
                } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  moveFocus(tab.id, -1);
                } else if (event.key === 'Home' || event.key === 'End') {
                  event.preventDefault();
                  const target = event.key === 'Home' ? tabs[0] : tabs.at(-1)!;
                  onChange(target.id);
                  window.requestAnimationFrame(() => document.getElementById(`project-tab-${target.id}`)?.focus());
                }
              }}
              role="tab"
              tabIndex={activeTab === tab.id ? 0 : -1}
              type="button"
            >
              <Icon aria-hidden="true" size={19} />
              <span>{tab.label}</span>
            </button>
          </div>
        );
      })}
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

interface ProjectInformationField {
  label: string;
  value: string | number | null | undefined;
  wide?: boolean;
}

function ProjectContractInformation({
  description,
  fields,
  title,
}: {
  description: string;
  fields: ProjectInformationField[];
  title: string;
}) {
  return (
    <section aria-label={title} className="project-detail-section project-contract-information">
      <div className="project-context-heading">
        <div>
          <span>Informations enregistrées</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <dl className="project-detail-grid">
        {fields.map((field) => (
          <DetailField key={field.label} label={field.label} value={displayText(field.value)} wide={field.wide} />
        ))}
      </dl>
    </section>
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
        BBTM ouvre en priorité la copie privée Supabase. Les documents non encore migrés utilisent leur lien SharePoint
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

function ProjectDocumentEmissionDialog({
  attachmentCount,
  definition,
  isBusy,
  language,
  mode,
  onClose,
  onConfirm,
  onLanguageChange,
  onModeChange,
}: {
  attachmentCount: number;
  definition: (typeof PROJECT_DOCUMENT_TYPES)[number];
  isBusy: boolean;
  language: ProjectDocumentLanguage;
  mode: ProjectDocumentDownloadMode;
  onClose: () => void;
  onConfirm: () => void;
  onLanguageChange: (language: ProjectDocumentLanguage) => void;
  onModeChange: (mode: ProjectDocumentDownloadMode) => void;
}) {
  return (
    <AppDialog
      description={`Le document « ${definition.label} » sera généré depuis les informations enregistrées et classé dans l’espace privé BBTM.`}
      eyebrow="Projet · Émission documentaire"
      footer={(
        <div className="app-dialog__actions">
          <button className="is-secondary" disabled={isBusy} onClick={onClose} type="button">Annuler</button>
          <button className="is-primary" disabled={isBusy} onClick={onConfirm} type="button">
            <Download aria-hidden="true" size={16} />
            {isBusy ? 'Émission en cours…' : 'Émettre et télécharger'}
          </button>
        </div>
      )}
      icon={<FileText aria-hidden="true" size={20} />}
      isBusy={isBusy}
      onClose={onClose}
      size="sm"
      title={`Émettre : ${definition.label}`}
    >
      {definition.kind === 'offer' ? (
        <div aria-label="Langue de l’offre commerciale" className="project-document-language-options" role="radiogroup">
          <strong>Langue du document</strong>
          <div>
            <label className={language === 'fr' ? 'is-selected' : undefined}>
              <input
                checked={language === 'fr'}
                disabled={isBusy}
                name="project-document-language"
                onChange={() => onLanguageChange('fr')}
                type="radio"
                value="fr"
              />
              <span><strong>Français</strong><small>Libellés et dates en français.</small></span>
            </label>
            <label className={language === 'en' ? 'is-selected' : undefined}>
              <input
                checked={language === 'en'}
                disabled={isBusy}
                name="project-document-language"
                onChange={() => onLanguageChange('en')}
                type="radio"
                value="en"
              />
              <span><strong>English</strong><small>Traduction anglaise des libellés standards. Les textes libres restent modifiables tels que saisis.</small></span>
            </label>
          </div>
        </div>
      ) : null}
      <div aria-label="Contenu du téléchargement" className="project-document-delivery-options" role="radiogroup">
        <label className={mode === 'document' ? 'is-selected' : undefined}>
          <input
            checked={mode === 'document'}
            disabled={isBusy}
            name="project-document-download-mode"
            onChange={() => onModeChange('document')}
            type="radio"
            value="document"
          />
          <FileText aria-hidden="true" size={22} />
          <span>
            <strong>Document seul</strong>
            <small>Télécharger uniquement le document généré au format {definition.extension.toUpperCase()}.</small>
          </span>
        </label>
        <label className={mode === 'bundle' ? 'is-selected' : undefined}>
          <input
            checked={mode === 'bundle'}
            disabled={isBusy || attachmentCount === 0}
            name="project-document-download-mode"
            onChange={() => onModeChange('bundle')}
            type="radio"
            value="bundle"
          />
          <Files aria-hidden="true" size={22} />
          <span>
            <strong>Document + pièces jointes</strong>
            <small>
              {attachmentCount > 0
                ? `Télécharger une archive ZIP avec ${attachmentCount} pièce${attachmentCount > 1 ? 's' : ''} jointe${attachmentCount > 1 ? 's' : ''}.`
                : 'Aucune pièce jointe privée n’est classée sur ce projet.'}
            </small>
          </span>
        </label>
      </div>
    </AppDialog>
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
  towedAsset,
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
  towedAsset?: ProjectTowedAssetRecord;
}) {
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>('identification');
  const savedContractVariant = projectContractVariant(project.contractType);
  const [selectedContractVariant, setSelectedContractVariant] = useState<ProjectContractVariant | null>(savedContractVariant);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<number | null>(planningOccurrences[0]?.id ?? null);
  const detailTabs = useMemo(() => projectDetailTabs(selectedContractVariant), [selectedContractVariant]);
  const projectAttachments = useMemo(
    () => operationDocuments.filter((document) => (
      document.documentType === 'project_attachment' && document.planningOccurrenceId === null
    )),
    [operationDocuments],
  );
  useEffect(() => {
    setSelectedOccurrenceId(planningOccurrences[0]?.id ?? null);
  }, [planningOccurrences, project.id]);
  useEffect(() => {
    setSelectedContractVariant(savedContractVariant);
    setActiveTab('identification');
  }, [project.id, savedContractVariant]);
  useEffect(() => {
    if (!detailTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('offer-contract');
    }
  }, [activeTab, detailTabs]);
  const projectStart = project.deliveryAt || project.charterStartsAt || project.startsOn;
  const projectEnd = project.redeliveryAt || project.charterEndsAt || project.endsOn;
  const selectedContractDefinition = PROJECT_CONTRACT_VARIANTS.find((definition) => definition.id === selectedContractVariant);
  const selectedContractKind = selectedContractDefinition?.documentKind;
  const supplytime = contract?.supplytimeData || {};
  const supplytimePreview = useMemo(() => buildSupplytimePreview(project, contract), [contract, project]);
  const bimcoPreviewFields = supplytimePreview.flatMap((group) => group.fields);
  const activeBimcoFields = activeTab === 'bimco-boxes-01-12'
    ? bimcoPreviewFields.filter((field) => {
        const boxNumber = Number(/^box(\d+)/.exec(field.key)?.[1]);
        return boxNumber >= 1 && boxNumber <= 12;
      })
    : activeTab === 'bimco-boxes-13-21'
      ? bimcoPreviewFields.filter((field) => {
          const boxNumber = Number(/^box(\d+)/.exec(field.key)?.[1]);
          return boxNumber >= 13 && boxNumber <= 21;
        })
      : activeTab === 'bimco-boxes-22-34'
        ? bimcoPreviewFields.filter((field) => {
            const boxNumber = Number(/^box(\d+)/.exec(field.key)?.[1]);
            return boxNumber >= 22 && boxNumber <= 34;
          })
        : activeTab === 'bimco-signatures'
          ? bimcoPreviewFields.filter((field) => field.key.startsWith('signature_'))
          : [];
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
        <ProjectDetailTabs activeTab={activeTab} onChange={setActiveTab} tabs={detailTabs} />
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

      {activeTab === 'offer-contract' ? (
      <section aria-label="Offre et contrat" className="project-detail-section project-offer-contract-panel">
        <div className="project-context-heading">
          <div>
            <span>Parcours documentaire</span>
            <h3>Offre & contrat</h3>
            <p>L’offre commerciale est facultative. Le contrat peut être préparé directement et un seul type de contrat est retenu pour le projet.</p>
          </div>
        </div>

        <div className="project-offer-document-row">
          <span className="project-offer-document-icon"><FileText aria-hidden="true" size={22} /></span>
          <div>
            <strong>Offre commerciale</strong>
            <span>Document facultatif, indépendant du contrat sélectionné.</span>
            <small>Les offres déjà émises restent accessibles dans Documents.</small>
          </div>
          {isManager ? (
            <button
              disabled={generatingDocument !== null}
              onClick={() => onGenerateDocument('offer', selectedOccurrenceId)}
              type="button"
            >
              <Download aria-hidden="true" size={15} />
              {generatingDocument === 'offer' ? 'Émission et classement…' : 'Émettre le document'}
            </button>
          ) : null}
        </div>

        <fieldset className="project-contract-selector">
          <legend>Choisir le contrat</legend>
          <p>Sélectionnez exactement un type de contrat. Les rubriques de consultation s’adaptent immédiatement au choix.</p>
          <div role="radiogroup" aria-label="Type de contrat à préparer">
            {PROJECT_CONTRACT_VARIANTS.map((definition) => {
              const Icon = definition.id === 'bimco'
                ? ClipboardList
                : definition.id === 'time-charter'
                  ? CalendarDays
                  : Ship;
              return (
                <label className={selectedContractVariant === definition.id ? 'is-selected' : undefined} key={definition.id}>
                  <input
                    checked={selectedContractVariant === definition.id}
                    disabled={!isManager}
                    name={`project-contract-${project.id}`}
                    onChange={() => setSelectedContractVariant(definition.id)}
                    type="radio"
                    value={definition.id}
                  />
                  <Icon aria-hidden="true" size={22} />
                  <span>{definition.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="project-contract-next-step">
          <div>
            <Info aria-hidden="true" size={20} />
            <span>
              <strong>{selectedContractDefinition ? selectedContractDefinition.label : 'Aucun contrat sélectionné'}</strong>
              <small>Les informations saisies restent consultables dans les rubriques dédiées à gauche.</small>
            </span>
          </div>
          {isManager ? (
            <button
              disabled={!selectedContractKind || generatingDocument !== null}
              onClick={() => selectedContractKind && onGenerateDocument(selectedContractKind, selectedOccurrenceId)}
              type="button"
            >
              <Download aria-hidden="true" size={15} />
              {selectedContractKind && generatingDocument === selectedContractKind ? 'Émission et classement…' : 'Émettre le contrat'}
            </button>
          ) : null}
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
        <div className="project-generated-document-note">
          <span>La préparation d’une offre ou d’un contrat s’effectue depuis la rubrique « Offre & contrat ».</span>
          <button onClick={() => setActiveTab('offer-contract')} type="button">Ouvrir Offre & contrat</button>
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

      {activeTab === 'towage-parties' ? (
        <ProjectContractInformation
          description="Les parties au contrat et les caractéristiques enregistrées pour le convoi remorqué."
          fields={[
            { label: 'Armateur', value: contract?.ownerIdentity, wide: true },
            { label: 'Affréteur / client', value: project.clientName },
            { label: 'Remorqueur', value: project.primaryVesselName },
            { label: 'Remorqué', value: towedAsset?.name },
            { label: 'Type de remorqué', value: towedAsset?.assetType },
            { label: 'Dimensions', value: towedAsset ? `${towedAsset.lengthOverallM ?? '—'} m × ${towedAsset.breadthOverallM ?? '—'} m` : '' },
            { label: 'Conditions du remorqué', value: supplytime.towed_conditions, wide: true },
          ]}
          title="Parties & convoi"
        />
      ) : null}

      {activeTab === 'towage-route' ? (
        <ProjectContractInformation
          description="Le voyage prévu, les créneaux et les temps d’opérations associés au remorquage."
          fields={[
            { label: 'Prise en charge', value: project.deliveryPort },
            { label: 'Créneau de départ', value: supplytime.departure_window || formatDate(projectStart) },
            { label: 'Destination', value: project.redeliveryPort },
            { label: 'Créneau d’arrivée', value: supplytime.arrival_window || formatDate(projectEnd) },
            { label: 'Temps de connexion', value: supplytime.connection_time },
            { label: 'Temps de déconnexion', value: supplytime.disconnection_time },
          ]}
          title="Itinéraire & délais"
        />
      ) : null}

      {activeTab === 'towage-terms' ? (
        <ProjectContractInformation
          description="Les éléments financiers et les conditions particulières conservés avec le contrat de remorquage."
          fields={[
            { label: 'Tarif forfaitaire HT', value: formatMoney(contract?.charterHire ?? null, contract?.hireCurrency || 'EUR') },
            { label: 'Coûts additionnels facultatifs', value: supplytime.optional_costs, wide: true },
            { label: 'Conditions de paiement', value: supplytime.box23_payment, wide: true },
            { label: 'Frais additionnels', value: supplytime.additional_charges, wide: true },
            { label: 'Conditions particulières', value: supplytime.special_conditions, wide: true },
          ]}
          title="Tarifs & conditions"
        />
      ) : null}

      {activeTab === 'towage-signatures' ? (
        <ProjectContractInformation
          description="Les signataires prévus pour l’affréteur et l’armateur."
          fields={[
            { label: 'Signataire de l’affréteur', value: supplytime.charterer_signatory || client?.representedBy },
            { label: 'Signataire de l’armateur', value: supplytime.owner_signatory },
          ]}
          title="Signatures"
        />
      ) : null}

      {activeTab === 'bareboat-vessel' ? (
        <ProjectContractInformation
          description="Le navire affrété et les modalités de livraison et de restitution enregistrées."
          fields={[
            { label: 'Navire affrété', value: project.primaryVesselName },
            { label: 'Livraison', value: `${formatDate(project.deliveryAt)} · ${project.deliveryPort}` },
            { label: 'Livraison sur camion', value: supplytime.bareboat_delivery_by_truck === 'true' ? 'Oui' : 'Non' },
            { label: 'Restitution', value: `${formatDate(project.redeliveryAt)} · ${project.redeliveryPort}` },
            { label: 'Refit / année de construction', value: supplytime.bareboat_refit_details },
            { label: 'Limites d’exploitation', value: supplytime.bareboat_operating_limits, wide: true },
          ]}
          title="Navire & livraison"
        />
      ) : null}

      {activeTab === 'bareboat-duration' ? (
        <ProjectContractInformation
          description="Les dates, la durée et les montants contractuels de l’affrètement coque nue."
          fields={[
            { label: 'Lieu de signature', value: supplytime.bareboat_contract_place },
            { label: 'Date de signature', value: supplytime.bareboat_contract_date },
            { label: 'Durée minimale', value: supplytime.bareboat_minimum_duration },
            { label: 'Options de prolongation', value: supplytime.bareboat_extension_options, wide: true },
            { label: 'Indemnité de fin anticipée', value: supplytime.bareboat_early_termination_indemnity, wide: true },
            { label: 'Loyer journalier', value: formatMoney(contract?.charterHire ?? null, contract?.hireCurrency || 'EUR', contract?.hireUnit || 'jour') },
            { label: 'Frais de mobilisation', value: formatMoney(contract?.mobilisationFee ?? null, contract?.feeCurrency || 'EUR') },
            { label: 'Frais de démobilisation', value: formatMoney(contract?.demobilisationFee ?? null, contract?.feeCurrency || 'EUR') },
          ]}
          title="Durée & loyers"
        />
      ) : null}

      {activeTab === 'bareboat-terms' ? (
        <ProjectContractInformation
          description="Les responsabilités d’assurance et le cadre juridique saisis pour le contrat."
          fields={[
            { label: 'Identité du propriétaire', value: contract?.ownerIdentity, wide: true },
            { label: 'Identité de l’affréteur', value: supplytime.bareboat_charterer_identity, wide: true },
            { label: 'Valeur à assurer', value: supplytime.bareboat_insured_value },
            { label: 'Assurance à la charge de', value: supplytime.bareboat_insurance_payer },
            { label: 'Loi applicable', value: supplytime.bareboat_applicable_law },
            { label: 'Juridiction compétente', value: supplytime.bareboat_jurisdiction },
          ]}
          title="Assurance & droit"
        />
      ) : null}

      {activeTab === 'bareboat-signatures' ? (
        <ProjectContractInformation
          description="Les représentants qui signeront le contrat d’affrètement coque nue."
          fields={[
            { label: 'Signataire de l’affréteur', value: supplytime.bareboat_charterer_signatory || client?.representedBy },
            { label: 'Signataire du propriétaire', value: supplytime.bareboat_owner_signatory },
            { label: 'Fonction du signataire propriétaire', value: supplytime.bareboat_owner_signatory_function },
          ]}
          title="Signatures"
        />
      ) : null}

      {activeTab === 'time-charter-vessel' ? (
        <ProjectContractInformation
          description="Le navire, les parties et la période retenue pour l’affrètement à temps."
          fields={[
            { label: 'Armateur', value: contract?.ownerIdentity, wide: true },
            { label: 'Affréteur / client', value: project.clientName },
            { label: 'Navire principal', value: project.primaryVesselName },
            { label: 'Second navire', value: project.secondaryVesselName },
            { label: 'Début d’affrètement', value: formatDate(projectStart) },
            { label: 'Fin d’affrètement', value: formatDate(projectEnd) },
          ]}
          title="Navire & période"
        />
      ) : null}

      {activeTab === 'time-charter-operations' ? (
        <ProjectContractInformation
          description="Le périmètre d’emploi et les capacités opérationnelles enregistrées pour le navire."
          fields={[
            { label: 'Zone d’opération', value: project.operationArea, wide: true },
            { label: 'Affectation du navire limitée à', value: contract?.vesselAssignmentLimit, wide: true },
            { label: 'Support ROV', value: project.isRovSupport ? 'Oui' : 'Non' },
            { label: 'Support plongée', value: project.isDivingSupport ? 'Oui' : 'Non' },
            { label: 'Fuel', value: supplytime.box19_special_fuel, wide: true },
          ]}
          title="Exploitation"
        />
      ) : null}

      {activeTab === 'time-charter-rates' ? (
        <ProjectContractInformation
          description="Les montants et modalités tarifaires applicables à l’affrètement à temps."
          fields={[
            { label: 'Mobilisation', value: formatMoney(contract?.mobilisationFee ?? null, contract?.feeCurrency || 'EUR') },
            { label: 'Démobilisation', value: formatMoney(contract?.demobilisationFee ?? null, contract?.feeCurrency || 'EUR') },
            { label: 'Loyer d’affrètement', value: formatMoney(contract?.charterHire ?? null, contract?.hireCurrency || 'EUR', contract?.hireUnit) },
            { label: 'Loyer en prolongation', value: formatMoney(contract?.extensionHire ?? null, contract?.hireCurrency || 'EUR', contract?.hireUnit) },
            { label: 'Modalités de paiement', value: supplytime.box23_payment, wide: true },
          ]}
          title="Conditions tarifaires"
        />
      ) : null}

      {activeTab === 'time-charter-clauses' ? (
        <ProjectContractInformation
          description="Les prolongations, audits, clauses particulières et signatures enregistrés."
          fields={[
            { label: 'Nombre de prolongations', value: contract?.extensionCount },
            { label: 'Durée de prolongation', value: [contract?.extensionDuration, contract?.extensionUnit].filter(Boolean).join(' ') },
            { label: 'Période de reconduction', value: contract?.autoExtensionPeriod },
            { label: 'Maximum de jours', value: contract?.maxExtensionDays },
            { label: 'Période maximale d’audit', value: contract?.maxAuditPeriod },
            { label: 'Clauses additionnelles', value: supplytime.box34_additional_clauses, wide: true },
            { label: 'Signature armateur', value: supplytime.signature_owners },
            { label: 'Signature affréteur', value: supplytime.signature_charterers },
          ]}
          title="Clauses & signatures"
        />
      ) : null}

      {activeBimcoFields.length > 0 ? (
        <ProjectContractInformation
          description="Les données métier et les valeurs historiques enregistrées dans les cases du formulaire BIMCO."
          fields={activeBimcoFields.map((field) => ({ label: field.label, value: field.value, wide: true }))}
          title={detailTabs.find((tab) => tab.id === activeTab)?.label || 'BIMCO'}
        />
      ) : null}

      {activeTab === 'bimco-annexes' ? (
        <ProjectContractInformation
          description="Les pièces et informations annexes conservées avec le contrat BIMCO."
          fields={BIMCO_P144_GROUPS.find((group) => group.id === 'annexes')?.fields.map((field) => ({
            label: field.label,
            value: supplytime[field.key],
            wide: true,
          })) || []}
          title="Annexes"
        />
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
  const [serviceCatalogOpen, setServiceCatalogOpen] = useState(false);
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
  const [documentEmissionRequest, setDocumentEmissionRequest] = useState<ProjectDocumentEmissionRequest | null>(null);
  const [documentDownloadMode, setDocumentDownloadMode] = useState<ProjectDocumentDownloadMode>('document');
  const [documentLanguage, setDocumentLanguage] = useState<ProjectDocumentLanguage>('fr');
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
  const selectedTowedAsset = selectedContract?.towedAssetId
    ? projectsData.towedAssets.find((asset) => asset.id === selectedContract.towedAssetId)
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
  const selectedProjectAttachments = selectedOperationDocuments.filter((document) => (
    document.documentType === 'project_attachment' && document.planningOccurrenceId === null
  ));
  const selectedGeneratedDocumentKind = generatedDocumentKindForContract(selectedProject?.contractType);
  const documentEmissionDefinition = documentEmissionRequest
    ? PROJECT_DOCUMENT_TYPES.find((definition) => definition.kind === documentEmissionRequest.kind)
    : undefined;
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

  function openProjectDocumentEmission(kind: ProjectGeneratedDocumentKind, planningOccurrenceId: number | null) {
    setMutationError('');
    setDocumentDownloadMode('document');
    setDocumentLanguage('fr');
    setDocumentEmissionRequest({ kind, planningOccurrenceId });
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
      + 'Les documents déjà classés resteront conservés dans BBTM au niveau du projet.',
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
        'Opération supprimée du Planning. Ses documents restent conservés dans BBTM.',
      );
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Impossible de supprimer l’opération.");
    } finally {
      setDeletingOccurrenceId(null);
    }
  }

  async function generateSelectedProjectDocument(
    kind: ProjectGeneratedDocumentKind,
    planningOccurrenceId: number | null,
    downloadMode: ProjectDocumentDownloadMode,
    language: ProjectDocumentLanguage,
  ) {
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
        language,
        towedAsset: projectsData.towedAssets.find((asset) => asset.id === selectedContract?.towedAssetId),
        vessel: projectsData.vessels.find((vessel) => vessel.id === selectedProject.primaryVesselId),
        vesselCertificates,
      });
      let storedDocument: StoredProjectDocument | null = null;
      const warnings: string[] = [];
      try {
        const { storeGeneratedProjectDocument } = await import('./projectDocumentStorage');
        storedDocument = await storeGeneratedProjectDocument(effectiveClient, {
          document: generated,
          documentType: kind,
          planningOccurrenceId,
          projectId: selectedProject.id,
          revision: 1,
        });
        setLastStoredDocument(storedDocument);
        setLoadAttempt((attempt) => attempt + 1);
      } catch (storageError) {
        warnings.push(storageError instanceof Error ? storageError.message : 'Le classement BBTM a échoué.');
      }

      let bundled = false;
      if (downloadMode === 'bundle') {
        try {
          const { createProjectDocumentBundle } = await import('./projectDocumentStorage');
          const bundle = await createProjectDocumentBundle(effectiveClient, {
            attachments: selectedProjectAttachments,
            document: generated,
          });
          downloadGeneratedProjectDocument(bundle);
          bundled = true;
        } catch (bundleError) {
          downloadGeneratedProjectDocument(generated);
          warnings.push(
            `${bundleError instanceof Error ? bundleError.message : 'La préparation des pièces jointes a échoué.'} Le document seul a été téléchargé.`,
          );
        }
      } else {
        downloadGeneratedProjectDocument(generated);
      }

      const storageLabel = storedDocument
        ? 'généré et classé dans l’espace privé BBTM'
        : 'généré';
      const downloadLabel = bundled
        ? `téléchargé avec ${selectedProjectAttachments.length} pièce${selectedProjectAttachments.length > 1 ? 's' : ''} jointe${selectedProjectAttachments.length > 1 ? 's' : ''}`
        : 'téléchargé';
      setMutationMessage(`${generated.fileName} ${storageLabel}, puis ${downloadLabel}.`);
      setMutationError(warnings.join(' '));
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Impossible de générer le document.');
    } finally {
      setGeneratingDocument(null);
      setDocumentEmissionRequest(null);
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
            label="Émettre le document"
            onClick={() => openProjectDocumentEmission(
              selectedGeneratedDocumentKind,
              selectedGeneratedDocumentKind === 'offer' ? null : selectedPlanningOccurrences[0]?.id ?? null,
            )}
          />
          <ProjectRibbonButton icon={<Share2 aria-hidden="true" size={20} />} label="Ouvrir SharePoint" onClick={() => window.open(PROJECT_DOCUMENTS_SHAREPOINT_URL, '_blank', 'noopener,noreferrer')} />
        </ProjectRibbonGroup>
        <ProjectRibbonGroup label="Facturation">
          <ProjectRibbonLink icon={<ReceiptText aria-hidden="true" size={20} />} label="Éléments de facturation" to={billingElementsUrl()} />
          <ProjectRibbonButton disabled={!isManager} icon={<PackageCheck aria-hidden="true" size={20} />} label="Liste des prestations" onClick={() => setServiceCatalogOpen(true)} />
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
              onGenerateDocument={openProjectDocumentEmission}
              onEditProject={() => openProjectEditor(selectedProject)}
              onOpenPlanning={(occurrence) => window.location.assign(planningOperationUrl(occurrence.id))}
              operationDocuments={selectedOperationDocuments}
              planningOccurrences={selectedPlanningOccurrences}
              project={selectedProject}
              projectDocuments={selectedProjectDocuments}
              towedAsset={selectedTowedAsset}
            />
          ) : null}
        </div>
      )}

      {documentEmissionRequest && documentEmissionDefinition ? (
        <ProjectDocumentEmissionDialog
          attachmentCount={selectedProjectAttachments.length}
          definition={documentEmissionDefinition}
          isBusy={generatingDocument !== null}
          language={documentLanguage}
          mode={documentDownloadMode}
          onClose={() => setDocumentEmissionRequest(null)}
          onConfirm={() => void generateSelectedProjectDocument(
            documentEmissionRequest.kind,
            documentEmissionRequest.planningOccurrenceId,
            documentDownloadMode,
            documentLanguage,
          )}
          onLanguageChange={setDocumentLanguage}
          onModeChange={setDocumentDownloadMode}
        />
      ) : null}

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
      {serviceCatalogOpen ? (
        <ServiceCatalogDialog
          canManage={isManager}
          client={effectiveClient}
          onClose={() => setServiceCatalogOpen(false)}
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
              setMutationMessage((message) => `${message} ${uploads.stored.length} document(s) classé(s) dans BBTM.`);
            }
            if (uploads.failed.length > 0) {
              setMutationError(`${uploads.failed.length} document(s) n’ont pas pu être classés dans BBTM.`);
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
