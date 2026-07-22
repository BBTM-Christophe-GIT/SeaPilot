import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Briefcase,
  Archive,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Download,
  ExternalLink,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { ClientEditor, ProjectEditor, ProjectPlanningEditor } from './ProjectEditors';
import { PROJECT_DOCUMENT_TYPES, type ProjectGeneratedDocumentKind } from './projectDocumentTypes';
import { archiveProject } from './projectMutations';
import { deduplicateProjectDocuments, getSharePointDocumentLinkState } from './projectDocuments';
import {
  buildProjectMetrics,
  fetchProjectsData,
  type ClientRecord,
  type ProjectContractRecord,
  type ProjectDocumentRecord,
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
  projectContracts: [],
  projectDocuments: [],
  planningOccurrences: [],
  projects: [],
  warnings: [],
  vessels: [],
};

const PROJECTS_PER_PAGE = 40;
const PROJECT_DOCUMENTS_SHAREPOINT_URL = 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets';
const CONTRACT_DOCUMENTS_SHAREPOINT_URL = 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels';

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

const PROJECT_DETAIL_TABS = [
  { id: 'contract', label: 'Contrat' },
  { id: 'operations', label: 'Opérations' },
  { id: 'documents', label: 'Génération documentaire' },
  { id: 'commercial', label: 'Offre commerciale' },
  { id: 'planning', label: 'Planning' },
  { id: 'identification', label: 'Identification' },
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
  documents,
  emptyLabel,
}: {
  documents: ProjectDocumentRecord[];
  emptyLabel: string;
}) {
  if (documents.length === 0) {
    return <p className="project-section-empty">{emptyLabel}</p>;
  }

  return (
    <>
      <p className="project-document-help">
        SeaPilot ouvre l’URL SharePoint d’origine sans télécharger le fichier. Si Microsoft 365 demande une connexion,
        authentifiez-vous avec votre compte autorisé. Un fichier signalé introuvable peut avoir été déplacé ou supprimé et
        nécessite un rafraîchissement des métadonnées.
      </p>
      <ul className="project-document-list">
        {documents.map((document) => {
          const linkState = getSharePointDocumentLinkState(document.fileUrl);
          const metadata = [
            document.categoryKey,
            document.fileExtension || document.mimeType,
            formatFileSize(document.fileSizeBytes),
            document.sourceModifiedAt ? `modifié le ${formatDate(document.sourceModifiedAt)}` : '',
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
              {linkState.status === 'available' ? (
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

function SupplytimePreview({ project, contract }: { project: ProjectRecord; contract?: ProjectContractRecord }) {
  const groups = useMemo(() => buildSupplytimePreview(project, contract), [contract, project]);
  const populatedCount = groups.flatMap((group) => group.fields).filter((field) => field.value).length;

  return (
    <div className="project-supplytime">
      <div className="project-supplytime-heading">
        <div>
          <h4>Aperçu SUPPLYTIME 2017</h4>
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
  projectDocuments,
  contractDocuments,
  contractUnavailable,
  projectDocumentsUnavailable,
  contractDocumentsUnavailable,
  generatingDocument,
  isManager,
  onGenerateDocument,
  planningOccurrences,
}: {
  project: ProjectRecord;
  contract?: ProjectContractRecord;
  client?: ClientRecord;
  projectDocuments: ProjectDocumentRecord[];
  contractDocuments: ProjectDocumentRecord[];
  contractUnavailable: boolean;
  projectDocumentsUnavailable: boolean;
  contractDocumentsUnavailable: boolean;
  generatingDocument: ProjectGeneratedDocumentKind | null;
  isManager: boolean;
  onGenerateDocument: (kind: ProjectGeneratedDocumentKind, planningOccurrenceId: number | null) => void;
  planningOccurrences: ProjectPlanningOccurrenceRecord[];
}) {
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>('contract');
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<number | null>(planningOccurrences[0]?.id ?? null);
  useEffect(() => {
    setSelectedOccurrenceId(planningOccurrences[0]?.id ?? null);
  }, [planningOccurrences, project.id]);
  const projectStart = project.deliveryAt || project.charterStartsAt || project.startsOn;
  const projectEnd = project.redeliveryAt || project.charterEndsAt || project.endsOn;
  const extension = [
    contract?.extensionCount === null || contract?.extensionCount === undefined
      ? ''
      : `${contract.extensionCount} prolongation(s)`,
    contract?.extensionDuration === null || contract?.extensionDuration === undefined
      ? ''
      : `${contract.extensionDuration} ${contract.extensionUnit}`.trim(),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="project-detail" aria-label={`Détails du projet ${project.projectCode || project.title}`}>
      {contractUnavailable ? (
        <p className="project-partial-state" role="status">
          Les informations contractuelles et SUPPLYTIME sont temporairement indisponibles. Les autres sections restent consultables.
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

      {activeTab === 'planning' ? (
      <section aria-label="Planning" className="project-detail-section">
        <div className="project-section-heading">
          <strong>Planning du projet</strong>
          <span>{planningOccurrences.length} opération(s)</span>
        </div>
        <dl className="project-detail-grid">
          <DetailField label="Période de référence" value={formatPeriod(project.startsOn, project.endsOn)} wide />
          <DetailField label="Livraison" value={formatDate(project.deliveryAt)} />
          <DetailField label="Port de livraison" value={displayText(project.deliveryPort)} />
          <DetailField label="Début d’affrètement" value={formatDate(project.charterStartsAt)} />
          <DetailField label="Fin d’affrètement" value={formatDate(project.charterEndsAt)} />
          <DetailField label="Restitution" value={formatDate(project.redeliveryAt)} />
          <DetailField label="Port de restitution" value={displayText(project.redeliveryPort)} />
          <DetailField label="Période opérationnelle" value={formatPeriod(projectStart, projectEnd)} wide />
          <DetailField label="Prolongations" value={displayText(extension)} />
          <DetailField label="Extension automatique" value={displayText(contract?.autoExtensionPeriod)} />
          <DetailField label="Maximum de prolongation" value={contract?.maxExtensionDays === null || contract?.maxExtensionDays === undefined ? 'Non renseigné' : `${contract.maxExtensionDays} jours`} />
        </dl>
        {planningOccurrences.length > 0 ? (
          <ul className="project-planning-occurrences">
            {planningOccurrences.map((occurrence) => (
              <li key={occurrence.id}>
                <CalendarDays aria-hidden="true" size={18} />
                <div>
                  <strong>{formatPeriod(occurrence.startsOn, occurrence.endsOn)}</strong>
                  <span>{displayText(occurrence.primaryVesselName)} · {displayText(occurrence.status)}</span>
                  {occurrence.description ? <small>{occurrence.description}</small> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="project-section-empty">Aucune opération planning associée.</p>
        )}
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
            <strong>Documents du projet</strong>
            <span>Chaque document validé est classé dans SharePoint · Documents Projets.</span>
          </div>
          <a href={PROJECT_DOCUMENTS_SHAREPOINT_URL} rel="noreferrer" target="_blank">
            <ExternalLink aria-hidden="true" size={15} /> Ouvrir SharePoint
          </a>
        </div>
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
          {PROJECT_DOCUMENT_TYPES.map((definition) => (
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
      <section aria-label="Opérations" className="project-detail-section">
        <dl className="project-detail-grid">
          <DetailField label="Zone d’opération" value={displayText(project.operationArea)} wide />
          <DetailField label="Période maximale d’audit" value={displayText(contract?.maxAuditPeriod)} />
          <DetailField label="Description / commentaires" value={displayText(project.description)} wide />
        </dl>
        <h4>Documents Projets</h4>
        {projectDocumentsUnavailable ? (
          <p className="project-section-empty">Documents projets indisponibles en raison d’une erreur de chargement.</p>
        ) : (
          <ProjectDocuments documents={projectDocuments} emptyLabel="Aucun document projet associé." />
        )}
        <a className="project-sharepoint-folder-link" href={PROJECT_DOCUMENTS_SHAREPOINT_URL} rel="noreferrer" target="_blank">
          <ExternalLink aria-hidden="true" size={15} /> Ouvrir Documents Projets
        </a>
      </section>
      ) : null}

      {activeTab === 'contract' ? (
      <section aria-label="Contrat" className="project-detail-section">
        {!contractUnavailable ? <SupplytimePreview contract={contract} project={project} /> : null}
        <h4>Documents contractuels</h4>
        {contractDocumentsUnavailable ? (
          <p className="project-section-empty">Documents contractuels indisponibles en raison d’une erreur de chargement.</p>
        ) : (
          <ProjectDocuments documents={contractDocuments} emptyLabel="Aucun document contractuel associé." />
        )}
        <p className="project-document-help">
          Le BIMCO utilise les deux fonds SUPPLYTIME 2017 du module SPFx et les clauses générales assainies du modèle fourni. Les fichiers générés sont classés dans SharePoint ; Supabase ne conserve que leurs métadonnées.
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
  const [projectsData, setProjectsData] = useState<ProjectsData>(EMPTY_PROJECTS_DATA);
  const [filters, setFilters] = useState<ProjectFilterState>(EMPTY_PROJECT_FILTERS);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projectEditorOpen, setProjectEditorOpen] = useState(false);
  const [clientEditorOpen, setClientEditorOpen] = useState(false);
  const [planningEditorOpen, setPlanningEditorOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRecord | undefined>();
  const [editingClient, setEditingClient] = useState<ClientRecord | undefined>();
  const [mutationMessage, setMutationMessage] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [lastStoredDocument, setLastStoredDocument] = useState<{ fileName: string; webUrl: string } | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
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
  const unresolvedDocumentCount = [...projectDocumentSet.documents, ...contractDocumentSet.documents].filter(
    (document) => document.projectId === null,
  ).length;
  const duplicateDocumentCount = projectDocumentSet.duplicateCount + contractDocumentSet.duplicateCount;
  const pageCount = Math.max(1, Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE));
  const safePage = Math.min(currentPage, pageCount - 1);
  const visibleProjects = filteredProjects.slice(safePage * PROJECTS_PER_PAGE, (safePage + 1) * PROJECTS_PER_PAGE);
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const contractTypeOptions = useMemo(
    () => uniqueSorted(projectsData.projects.map((project) => project.contractType)),
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

  function openClientEditor(clientRecord?: ClientRecord) {
    setMutationError('');
    setEditingClient(clientRecord);
    setClientEditorOpen(true);
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
      const generated = await generateProjectDocument(kind, {
        client: selectedClient,
        contract: selectedContract,
        occurrence,
        project: selectedProject,
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
        setLastStoredDocument({ fileName: stored.fileName, webUrl: stored.webUrl });
        setMutationMessage(`${stored.fileName} généré et classé automatiquement dans SharePoint.`);
        setLoadAttempt((attempt) => attempt + 1);
      } catch (storageError) {
        downloadGeneratedProjectDocument(generated);
        setMutationMessage(`${generated.fileName} généré et téléchargé localement.`);
        setMutationError(storageError instanceof Error ? storageError.message : 'Le classement SharePoint a échoué.');
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
      <div className="admin-header">
        <div>
          <p className="module-family">MODULE</p>
          <h1>Projets</h1>
          <p className="projects-header-subtitle">Liste BBTM · projets, missions, offres et contrats.</p>
        </div>
        <div className="projects-summary-grid">
          <div className="planning-summary" aria-label="Projets actifs">
            <Briefcase aria-hidden="true" size={18} />
            <strong>{metrics.activeProjects}</strong>
            <span>actifs</span>
          </div>
          <div className="planning-summary" aria-label="Projets affichés">
            <CalendarDays aria-hidden="true" size={18} />
            <strong>{metrics.totalProjects}</strong>
            <span>affichés</span>
          </div>
          <div className="planning-summary" aria-label="Documents projets">
            <FileText aria-hidden="true" size={18} />
            <strong>{warningIsPresent(projectsData, 'projectDocuments') ? '—' : metrics.projectDocumentCount}</strong>
            <span>documents</span>
          </div>
          <div className="planning-summary" aria-label="Documents contractuels">
            <ClipboardList aria-hidden="true" size={18} />
            <strong>{warningIsPresent(projectsData, 'contractDocuments') ? '—' : metrics.contractDocumentCount}</strong>
            <span>contrats</span>
          </div>
          <div className="planning-summary" aria-label="Clients représentés">
            <Users aria-hidden="true" size={18} />
            <strong>{warningIsPresent(projectsData, 'clients') ? '—' : metrics.clientCount}</strong>
            <span>clients</span>
          </div>
        </div>
      </div>

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

      <div className="planning-filter-panel projects-filter-panel" aria-label="Filtres projets">
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
      </div>

      {isManager ? (
        <div className="planning-toolbar">
          <div className="project-write-actions">
            <button onClick={() => openClientEditor()} type="button"><Users aria-hidden="true" size={16} /> Nouveau client</button>
            <button onClick={() => openProjectEditor()} type="button"><Plus aria-hidden="true" size={16} /> Nouveau projet</button>
            <button disabled={!selectedProject || Boolean(selectedProject.archivedAt)} onClick={() => selectedProject && openProjectEditor(selectedProject)} type="button"><Pencil aria-hidden="true" size={16} /> Modifier le projet</button>
            <button disabled={!selectedClient} onClick={() => selectedClient && openClientEditor(selectedClient)} type="button"><Pencil aria-hidden="true" size={16} /> Modifier le client</button>
            <button className="is-danger" disabled={!selectedProject || Boolean(selectedProject.archivedAt) || isArchiving} onClick={archiveSelectedProject} type="button"><Archive aria-hidden="true" size={16} /> Archiver</button>
          </div>
        </div>
      ) : null}

      {mutationMessage ? <p className="project-mutation-success" role="status">{mutationMessage}</p> : null}
      {lastStoredDocument ? (
        <a className="project-stored-document-link" href={lastStoredDocument.webUrl} rel="noreferrer" target="_blank">
          <ExternalLink aria-hidden="true" size={15} /> Ouvrir {lastStoredDocument.fileName} dans SharePoint
        </a>
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
        <div className="projects-read-layout">
          <section className="projects-panel project-list-panel" aria-labelledby="projects-list-title">
            <div className="procedures-section-heading">
              <h2 id="projects-list-title">Portefeuille projets</h2>
              <span>{filteredProjects.length} projet(s)</span>
            </div>
            <ul className="project-catalog-list">
              {visibleProjects.map((project) => {
                const isSelected = selectedProject?.id === project.id;
                const occurrences = projectsData.planningOccurrences.filter((occurrence) => occurrence.projectId === project.id);
                return (
                  <li className={isSelected ? 'is-selected' : undefined} key={project.id}>
                    <div className="project-catalog-row">
                      <button
                        aria-label={`${project.title}${project.projectCode}`}
                        aria-pressed={isSelected}
                        className="project-select-button"
                        onClick={() => setSelectedProjectId(project.id)}
                        type="button"
                      >
                        <span className="project-title">
                          <Briefcase aria-hidden="true" size={16} />
                          {project.projectCode ? `${project.projectCode} - ` : ''}{project.title}
                        </span>
                        <small>Détail de la mission : {project.description || 'Non renseigné'}</small>
                      </button>
                      <div className="project-catalog-actions">
                        {isManager ? (
                          <button
                            aria-label={`Nouvelle opération ${project.projectCode || project.title}`}
                            onClick={() => {
                              setSelectedProjectId(project.id);
                              setPlanningEditorOpen(true);
                            }}
                            type="button"
                          >
                            <CalendarPlus aria-hidden="true" size={15} /> Nouvelle opération
                          </button>
                        ) : null}
                        <span>{displayText(project.clientName)}</span>
                        <span className="project-status-chip">{project.archivedAt ? 'Archivé' : displayText(project.status)}</span>
                        <strong>{occurrences.length}</strong>
                      </div>
                    </div>
                    {occurrences.length > 0 ? (
                      <ul className="project-catalog-occurrences">
                        {occurrences.map((occurrence) => (
                          <li key={occurrence.id}>
                            <CalendarDays aria-hidden="true" size={16} />
                            <span>Date de début <strong>{formatDate(occurrence.startsOn)}</strong></span>
                            <span>Navire <strong>{displayText(occurrence.primaryVesselName)}</strong></span>
                            <small>{displayText(occurrence.status)}</small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="project-catalog-empty">Aucun enregistrement planning associé.</p>
                    )}
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
              contract={selectedContract}
              contractDocuments={selectedContractDocuments}
              contractDocumentsUnavailable={warningIsPresent(projectsData, 'contractDocuments')}
              contractUnavailable={warningIsPresent(projectsData, 'projectContracts')}
              generatingDocument={generatingDocument}
              isManager={isManager}
              onGenerateDocument={(kind, planningOccurrenceId) => void generateSelectedProjectDocument(kind, planningOccurrenceId)}
              planningOccurrences={selectedPlanningOccurrences}
              project={selectedProject}
              projectDocuments={selectedProjectDocuments}
              projectDocumentsUnavailable={warningIsPresent(projectsData, 'projectDocuments')}
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
          onClose={() => setProjectEditorOpen(false)}
          onSaved={(result) => {
            setProjectEditorOpen(false);
            setSelectedProjectId(result.id);
            setMutationMessage(`${result.projectCode || result.title} enregistré dans Supabase.`);
            setLoadAttempt((attempt) => attempt + 1);
          }}
          project={editingProject}
          statuses={statusOptions}
          vessels={projectsData.vessels}
        />
      ) : null}
      {clientEditorOpen ? (
        <ClientEditor
          client={effectiveClient}
          clientRecord={editingClient}
          onClose={() => setClientEditorOpen(false)}
          onSaved={() => {
            setClientEditorOpen(false);
            setMutationMessage('Client enregistré dans Supabase.');
            setLoadAttempt((attempt) => attempt + 1);
          }}
        />
      ) : null}
      {planningEditorOpen && selectedProject ? (
        <ProjectPlanningEditor
          client={effectiveClient}
          onClose={() => setPlanningEditorOpen(false)}
          onSaved={() => {
            setPlanningEditorOpen(false);
            setMutationMessage('Opération ajoutée au Planning Supabase.');
            setLoadAttempt((attempt) => attempt + 1);
          }}
          project={selectedProject}
          vessels={projectsData.vessels}
        />
      ) : null}
    </section>
  );
}
