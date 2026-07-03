import type { SupabaseClient } from '@supabase/supabase-js';
import { Briefcase, ClipboardList, FileText, Ship, Upload, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  buildProjectMetrics,
  createProject,
  fetchProjectsData,
  type ClientRecord,
  type CreateProjectInput,
  type ProjectDocumentRecord,
  type ProjectRecord,
  type ProjectsData,
} from './projectQueries';

interface ProjectsPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

interface ProjectFilterState {
  search: string;
  status: string;
  clientName: string;
  vesselName: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_PROJECTS_DATA: ProjectsData = {
  clients: [],
  contractDocuments: [],
  projectDocuments: [],
  projects: [],
};

const EMPTY_FILTERS: ProjectFilterState = {
  search: '',
  status: '',
  clientName: '',
  vesselName: '',
  dateFrom: '',
  dateTo: '',
};

const EMPTY_PROJECT_FORM: CreateProjectInput = {
  clientName: '',
  description: '',
  endsOn: '',
  primaryVesselName: '',
  projectCode: '',
  secondaryVesselName: '',
  startsOn: '',
  status: 'A planifier',
  title: '',
};

const PROJECT_STATUS_OPTIONS = ['A planifier', 'Offre Transmise', 'Contrat Signe', 'Valide', 'Facture'];

function canManageProjects(roles: RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction');
}

function displayText(value: string): string {
  return value || '-';
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'fr'));
}

function sortProjects(projects: ProjectRecord[]): ProjectRecord[] {
  return [...projects].sort(
    (left, right) =>
      right.startsOn.localeCompare(left.startsOn) ||
      left.projectCode.localeCompare(right.projectCode, 'fr') ||
      left.title.localeCompare(right.title, 'fr'),
  );
}

function sortDocuments(documents: ProjectDocumentRecord[]): ProjectDocumentRecord[] {
  return [...documents].sort(
    (left, right) =>
      left.projectCode.localeCompare(right.projectCode, 'fr') ||
      left.projectTitle.localeCompare(right.projectTitle, 'fr') ||
      left.title.localeCompare(right.title, 'fr'),
  );
}

function sortClients(clients: ClientRecord[]): ClientRecord[] {
  return [...clients].sort((left, right) => left.name.localeCompare(right.name, 'fr'));
}

function getVesselNames(project: ProjectRecord): string[] {
  return [project.primaryVesselName, project.secondaryVesselName].filter(Boolean);
}

function projectMatchesDateFilters(project: ProjectRecord, filters: ProjectFilterState): boolean {
  const projectStart = project.startsOn || project.endsOn;
  const projectEnd = project.endsOn || project.startsOn;

  if (filters.dateFrom && projectEnd && projectEnd < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && projectStart && projectStart > filters.dateTo) {
    return false;
  }

  return true;
}

function projectMatchesStructuredFilters(project: ProjectRecord, filters: ProjectFilterState): boolean {
  if (filters.status && project.status !== filters.status) {
    return false;
  }

  if (filters.clientName && project.clientName !== filters.clientName) {
    return false;
  }

  if (filters.vesselName && !getVesselNames(project).includes(filters.vesselName)) {
    return false;
  }

  return projectMatchesDateFilters(project, filters);
}

function projectMatchesFilters(project: ProjectRecord, filters: ProjectFilterState): boolean {
  if (!projectMatchesStructuredFilters(project, filters)) {
    return false;
  }

  if (!filters.search) {
    return true;
  }

  const searchable = normalizeSearchValue(
    [
      project.title,
      project.projectCode,
      project.clientName,
      project.primaryVesselName,
      project.secondaryVesselName,
      project.status,
      project.description,
      project.sourceLabel,
    ].join(' '),
  );

  return searchable.includes(normalizeSearchValue(filters.search));
}

function findDocumentProject(document: ProjectDocumentRecord, projects: ProjectRecord[]): ProjectRecord | undefined {
  return projects.find(
    (project) =>
      (document.projectId && project.id === document.projectId) ||
      (document.projectCode && project.projectCode === document.projectCode) ||
      (document.projectTitle && project.title === document.projectTitle),
  );
}

function documentMatchesFilters(
  document: ProjectDocumentRecord,
  projects: ProjectRecord[],
  filters: ProjectFilterState,
): boolean {
  const relatedProject = findDocumentProject(document, projects);
  const hasStructuredFilters = Boolean(filters.status || filters.clientName || filters.vesselName || filters.dateFrom || filters.dateTo);

  if (hasStructuredFilters && (!relatedProject || !projectMatchesStructuredFilters(relatedProject, filters))) {
    return false;
  }

  if (!filters.search) {
    return true;
  }

  const searchable = normalizeSearchValue(
    [
      document.title,
      document.projectCode,
      document.projectTitle,
      document.categoryKey,
      document.notes,
      document.sourceLabel,
      relatedProject?.title,
      relatedProject?.description,
      relatedProject?.clientName,
      relatedProject?.primaryVesselName,
      relatedProject?.secondaryVesselName,
      relatedProject?.status,
    ].join(' '),
  );

  return searchable.includes(normalizeSearchValue(filters.search));
}

function formatProjectPeriod(project: ProjectRecord): string {
  if (project.startsOn && project.endsOn) {
    return `${project.startsOn} au ${project.endsOn}`;
  }

  return project.startsOn || project.endsOn || '-';
}

function renderDocumentRows(documents: ProjectDocumentRecord[]) {
  return documents.map((document) => (
    <tr key={document.id}>
      <th scope="row">
        <span className="project-document-title">
          <FileText aria-hidden="true" size={16} />
          {document.title}
        </span>
        {document.notes ? <small>{document.notes}</small> : null}
      </th>
      <td>
        <strong>{displayText(document.projectCode)}</strong>
        <small>{displayText(document.projectTitle)}</small>
      </td>
      <td>{displayText(document.categoryKey)}</td>
      <td>{displayText(document.sourceLabel)}</td>
      <td>
        {document.fileUrl ? (
          <a className="hr-document-link" href={document.fileUrl} rel="noreferrer" target="_blank">
            {`Ouvrir le fichier ${document.title}`}
          </a>
        ) : (
          '-'
        )}
      </td>
    </tr>
  ));
}

export function ProjectsPage({ client, roles }: ProjectsPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManageProjects(effectiveRoles);
  const [projectsData, setProjectsData] = useState<ProjectsData>(EMPTY_PROJECTS_DATA);
  const [filters, setFilters] = useState<ProjectFilterState>(EMPTY_FILTERS);
  const [projectForm, setProjectForm] = useState<CreateProjectInput>(EMPTY_PROJECT_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setErrorMessage(null);

    fetchProjectsData(effectiveClient)
      .then((loadedData) => {
        if (isMounted) {
          setProjectsData({
            clients: sortClients(loadedData.clients),
            contractDocuments: sortDocuments(loadedData.contractDocuments),
            projectDocuments: sortDocuments(loadedData.projectDocuments),
            projects: sortProjects(loadedData.projects),
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage('Impossible de charger les projets.');
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
  }, [effectiveClient]);

  const filteredProjects = useMemo(
    () => projectsData.projects.filter((project) => projectMatchesFilters(project, filters)),
    [filters, projectsData.projects],
  );
  const filteredProjectDocuments = useMemo(
    () =>
      projectsData.projectDocuments.filter((document) =>
        documentMatchesFilters(document, projectsData.projects, filters),
      ),
    [filters, projectsData.projectDocuments, projectsData.projects],
  );
  const filteredContractDocuments = useMemo(
    () =>
      projectsData.contractDocuments.filter((document) =>
        documentMatchesFilters(document, projectsData.projects, filters),
      ),
    [filters, projectsData.contractDocuments, projectsData.projects],
  );
  const metrics = useMemo(
    () =>
      buildProjectMetrics({
        clients: projectsData.clients,
        contractDocuments: filteredContractDocuments,
        projectDocuments: filteredProjectDocuments,
        projects: filteredProjects,
      }),
    [filteredContractDocuments, filteredProjectDocuments, filteredProjects, projectsData.clients],
  );
  const statusOptions = useMemo(
    () => uniqueSorted([...projectsData.projects.map((project) => project.status), ...PROJECT_STATUS_OPTIONS]),
    [projectsData.projects],
  );
  const clientOptions = useMemo(
    () => uniqueSorted([...projectsData.projects.map((project) => project.clientName), ...projectsData.clients.map((client) => client.name)]),
    [projectsData.clients, projectsData.projects],
  );
  const vesselOptions = useMemo(
    () => uniqueSorted(projectsData.projects.flatMap((project) => getVesselNames(project))),
    [projectsData.projects],
  );
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const hasVisibleData =
    filteredProjects.length > 0 || filteredProjectDocuments.length > 0 || filteredContractDocuments.length > 0;

  function updateFilterValue(key: keyof ProjectFilterState, value: string) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  }

  function updateProjectFormValue(key: keyof CreateProjectInput, value: string) {
    setProjectForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const project = await createProject(effectiveClient, projectForm);
      setProjectsData((currentData) => ({
        ...currentData,
        projects: sortProjects([...currentData.projects, project]),
      }));
      setProjectForm(EMPTY_PROJECT_FORM);
      setStatusMessage('Projet ajoute.');
    } catch {
      setErrorMessage("Impossible d'ajouter ce projet.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="admin-state">Chargement des projets...</div>;
  }

  return (
    <section className="projects-page">
      <div className="admin-header">
        <div>
          <p className="module-family">Operations</p>
          <h1>Projets</h1>
        </div>
        <div className="projects-summary-grid">
          <div className="planning-summary" aria-label="Projets actifs">
            <Briefcase aria-hidden="true" size={18} />
            <strong>{metrics.activeProjects}</strong>
            <span>actifs</span>
          </div>
          <div className="planning-summary" aria-label="Documents projets">
            <FileText aria-hidden="true" size={18} />
            <strong>{metrics.projectDocumentCount}</strong>
            <span>projets</span>
          </div>
          <div className="planning-summary" aria-label="Documents contractuels">
            <ClipboardList aria-hidden="true" size={18} />
            <strong>{metrics.contractDocumentCount}</strong>
            <span>contrats</span>
          </div>
          <div className="planning-summary" aria-label="Clients actifs">
            <Users aria-hidden="true" size={18} />
            <strong>{metrics.clientCount}</strong>
            <span>clients</span>
          </div>
        </div>
      </div>

      <div className="admin-notices" aria-live="polite">
        {statusMessage ? <p className="admin-success">{statusMessage}</p> : null}
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      <div className="planning-filter-panel projects-filter-panel" aria-label="Filtres projets">
        <label>
          Recherche projets
          <input
            onChange={(event) => updateFilterValue('search', event.target.value)}
            placeholder="Projet, client, navire..."
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
          Projet jusqu'au
          <input onChange={(event) => updateFilterValue('dateTo', event.target.value)} type="date" value={filters.dateTo} />
        </label>
        <button disabled={!hasActiveFilters} onClick={() => setFilters(EMPTY_FILTERS)} type="button">
          Reinitialiser
        </button>
      </div>

      <div className="planning-toolbar">
        <span className={isManager ? 'planning-mode-write' : 'planning-mode-read'}>
          {isManager ? 'Modification' : 'Lecture seule'}
        </span>
      </div>

      {isManager ? (
        <form className="planning-form projects-form" onSubmit={handleCreateProject}>
          <div className="planning-form-title">
            <Upload aria-hidden="true" size={18} />
            <strong>Nouveau projet</strong>
          </div>
          <label>
            Numero projet
            <input onChange={(event) => updateProjectFormValue('projectCode', event.target.value)} value={projectForm.projectCode} />
          </label>
          <label>
            Titre projet
            <input onChange={(event) => updateProjectFormValue('title', event.target.value)} required value={projectForm.title} />
          </label>
          <label>
            Client projet
            <input
              list="project-client-options"
              onChange={(event) => updateProjectFormValue('clientName', event.target.value)}
              value={projectForm.clientName}
            />
          </label>
          <datalist id="project-client-options">
            {projectsData.clients.map((clientOption) => (
              <option key={clientOption.id} value={clientOption.name} />
            ))}
          </datalist>
          <label>
            Navire principal projet
            <input
              onChange={(event) => updateProjectFormValue('primaryVesselName', event.target.value)}
              value={projectForm.primaryVesselName}
            />
          </label>
          <label>
            Navire secondaire projet
            <input
              onChange={(event) => updateProjectFormValue('secondaryVesselName', event.target.value)}
              value={projectForm.secondaryVesselName}
            />
          </label>
          <label>
            Debut projet
            <input onChange={(event) => updateProjectFormValue('startsOn', event.target.value)} type="date" value={projectForm.startsOn} />
          </label>
          <label>
            Fin projet
            <input onChange={(event) => updateProjectFormValue('endsOn', event.target.value)} type="date" value={projectForm.endsOn} />
          </label>
          <label>
            Statut projet
            <select onChange={(event) => updateProjectFormValue('status', event.target.value)} value={projectForm.status}>
              {PROJECT_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description projet
            <input onChange={(event) => updateProjectFormValue('description', event.target.value)} value={projectForm.description} />
          </label>
          <button disabled={isSaving} type="submit">
            Ajouter projet
          </button>
        </form>
      ) : null}

      {!hasVisibleData ? (
        <div className="admin-state">Aucun projet a afficher.</div>
      ) : (
        <div className="projects-sections">
          {filteredProjects.length > 0 ? (
            <section className="projects-panel" aria-labelledby="projects-list-title">
              <div className="procedures-section-heading">
                <h2 id="projects-list-title">Portefeuille projets</h2>
                <span>{filteredProjects.length} projet(s)</span>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table projects-table">
                  <thead>
                    <tr>
                      <th scope="col">Projet</th>
                      <th scope="col">Numero</th>
                      <th scope="col">Client</th>
                      <th scope="col">Navire</th>
                      <th scope="col">Periode</th>
                      <th scope="col">Statut</th>
                      <th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map((project) => (
                      <tr key={project.id}>
                        <th scope="row">
                          <span className="project-title">
                            <Briefcase aria-hidden="true" size={16} />
                            {project.title}
                          </span>
                          {project.description ? <small>{project.description}</small> : null}
                        </th>
                        <td>{displayText(project.projectCode)}</td>
                        <td>{displayText(project.clientName)}</td>
                        <td>
                          <span className="project-vessel">
                            <Ship aria-hidden="true" size={15} />
                            {displayText(project.primaryVesselName)}
                          </span>
                          {project.secondaryVesselName ? <small>{project.secondaryVesselName}</small> : null}
                        </td>
                        <td>{formatProjectPeriod(project)}</td>
                        <td>
                          <span className="project-status-chip">{displayText(project.status)}</span>
                        </td>
                        <td>{displayText(project.sourceLabel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {filteredProjectDocuments.length > 0 ? (
            <section className="projects-panel" aria-labelledby="project-documents-title">
              <div className="procedures-section-heading">
                <h2 id="project-documents-title">Documents Projets</h2>
                <span>{filteredProjectDocuments.length} fichier(s)</span>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table projects-table">
                  <thead>
                    <tr>
                      <th scope="col">Document</th>
                      <th scope="col">Projet</th>
                      <th scope="col">Categorie</th>
                      <th scope="col">Source</th>
                      <th scope="col">Fichier</th>
                    </tr>
                  </thead>
                  <tbody>{renderDocumentRows(filteredProjectDocuments)}</tbody>
                </table>
              </div>
            </section>
          ) : null}

          {filteredContractDocuments.length > 0 ? (
            <section className="projects-panel" aria-labelledby="contract-documents-title">
              <div className="procedures-section-heading">
                <h2 id="contract-documents-title">Documents Contractuels</h2>
                <span>{filteredContractDocuments.length} fichier(s)</span>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table projects-table">
                  <thead>
                    <tr>
                      <th scope="col">Document</th>
                      <th scope="col">Projet</th>
                      <th scope="col">Categorie</th>
                      <th scope="col">Source</th>
                      <th scope="col">Fichier</th>
                    </tr>
                  </thead>
                  <tbody>{renderDocumentRows(filteredContractDocuments)}</tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
