import type { SupabaseClient } from '@supabase/supabase-js';
import { ReceiptText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AppDialog } from '../../components/AppDialog';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { ProjectBillingPanel, type ProjectBillingSectionVisibility } from './ProjectBillingPanel';
import {
  fetchProjectsData,
  type ProjectContractRecord,
  type ProjectPlanningOccurrenceRecord,
  type ProjectRecord,
  type ProjectsData,
} from './projectQueries';

interface BillingElementsPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

const EMPTY_BILLING_PROJECTS: Pick<ProjectsData, 'projects' | 'projectContracts' | 'planningOccurrences'> = {
  projects: [],
  projectContracts: [],
  planningOccurrences: [],
};

const BILLING_CATEGORIES: Array<{
  id: keyof ProjectBillingSectionVisibility;
  label: string;
  description: string;
}> = [
  {
    id: 'services',
    label: 'Services refacturables',
    description: 'Frais fournisseurs et pièces justificatives du mois.',
  },
  {
    id: 'bbtm',
    label: 'Prestation BBTM',
    description: 'Montant unitaire, quantité et total de la prestation interne.',
  },
  {
    id: 'billingElements',
    label: 'Éléments de facturation',
    description: 'Loyers, opérations, aperçu et export du document client.',
  },
];

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function canManageBilling(roles: RoleKey[]): boolean {
  return roles.includes('admin') || roles.includes('direction');
}

function sortBillingProjects(projects: ProjectRecord[]): ProjectRecord[] {
  return projects
    .filter((project) => !project.archivedAt)
    .sort((left, right) => (
      left.projectCode.localeCompare(right.projectCode, 'fr', { numeric: true })
      || left.title.localeCompare(right.title, 'fr')
    ));
}

export function BillingElementsPage({ client, roles }: BillingElementsPageProps) {
  const navigate = useNavigate();
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const [data, setData] = useState(EMPTY_BILLING_PROJECTS);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [visibleSections, setVisibleSections] = useState<ProjectBillingSectionVisibility>({
    services: true,
    bbtm: true,
    billingElements: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError('');

    fetchProjectsData(effectiveClient)
      .then((loadedData) => {
        if (!isMounted) return;
        setData({
          projects: sortBillingProjects(loadedData.projects),
          projectContracts: loadedData.projectContracts,
          planningOccurrences: loadedData.planningOccurrences,
        });
      })
      .catch((caught: unknown) => {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : 'Impossible de charger les projets à facturer.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, [effectiveClient]);

  const selectedProject = useMemo(
    () => data.projects.find((project) => project.id === selectedProjectId),
    [data.projects, selectedProjectId],
  );
  const selectedContract: ProjectContractRecord | undefined = selectedProject
    ? data.projectContracts.find((contract) => contract.projectId === selectedProject.id && !contract.archivedAt)
    : undefined;
  const selectedOperations: ProjectPlanningOccurrenceRecord[] = selectedProject
    ? data.planningOccurrences.filter((operation) => operation.projectId === selectedProject.id)
    : [];
  const hasVisibleSection = Object.values(visibleSections).some(Boolean);
  const projectsUrl = new URLSearchParams(window.location.search).get('preview') === '1'
    ? '/modules/projects?preview=1'
    : '/modules/projects';

  function toggleSection(section: keyof ProjectBillingSectionVisibility) {
    setVisibleSections((current) => ({ ...current, [section]: !current[section] }));
  }

  return (
    <AppDialog
      description="Sélectionnez un projet, un mois et les catégories à afficher. Les données et exports sont ceux de la section Facturation de la fiche projet."
      eyebrow="Facturation"
      footer={(
        <div className="billing-elements-footer">
          <span>{selectedProject ? `${selectedProject.projectCode} · ${selectedMonth}` : 'Aucun projet sélectionné'}</span>
          <button className="is-secondary" onClick={() => navigate(projectsUrl)} type="button">Fermer</button>
        </div>
      )}
      icon={<ReceiptText aria-hidden="true" size={20} />}
      onClose={() => navigate(projectsUrl)}
      size="fullscreen"
      title="Éléments de facturation"
    >
      <div className="billing-elements-workspace">
        <section aria-label="Sélection de la facturation" className="billing-elements-selection">
          <div className="billing-elements-primary-filters">
            <label>
              Projet
              <select
                onChange={(event) => setSelectedProjectId(event.target.value ? Number(event.target.value) : null)}
                value={selectedProjectId ?? ''}
              >
                <option value="">Sélectionner un projet…</option>
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.projectCode} — {project.title}</option>
                ))}
              </select>
            </label>
            <label>
              Mois de facturation
              <input
                onChange={(event) => setSelectedMonth(event.target.value.slice(0, 7) || currentMonth())}
                type="month"
                value={selectedMonth}
              />
            </label>
          </div>

          <fieldset className="billing-elements-categories">
            <legend>Catégories affichées</legend>
            {BILLING_CATEGORIES.map((category) => (
              <label className={visibleSections[category.id] ? 'is-selected' : ''} key={category.id}>
                <input
                  checked={visibleSections[category.id]}
                  onChange={() => toggleSection(category.id)}
                  type="checkbox"
                />
                <span><strong>{category.label}</strong><small>{category.description}</small></span>
              </label>
            ))}
          </fieldset>
        </section>

        {isLoading ? <div className="admin-state" role="status">Chargement des projets…</div> : null}
        {error ? <p className="project-billing-error" role="alert">{error}</p> : null}
        {!isLoading && !error && !selectedProject ? (
          <div className="billing-elements-empty">
            <ReceiptText aria-hidden="true" size={28} />
            <strong>Sélectionnez un projet</strong>
            <span>Ses éléments de facturation mensuelle apparaîtront dans cette fenêtre.</span>
          </div>
        ) : null}
        {selectedProject && !hasVisibleSection ? (
          <div className="billing-elements-empty">
            <strong>Aucune catégorie sélectionnée</strong>
            <span>Cochez au moins une catégorie pour afficher la facturation.</span>
          </div>
        ) : null}
        {selectedProject && hasVisibleSection ? (
          <ProjectBillingPanel
            client={effectiveClient}
            contract={selectedContract}
            initialMonth={selectedMonth}
            isManager={canManageBilling(effectiveRoles)}
            key={`${selectedProject.id}-${selectedMonth}`}
            operations={selectedOperations}
            project={selectedProject}
            showMonthSelector={false}
            visibleSections={visibleSections}
          />
        ) : null}
      </div>
    </AppDialog>
  );
}
