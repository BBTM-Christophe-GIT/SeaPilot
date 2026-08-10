import type { SupabaseClient } from '@supabase/supabase-js';
import { ChevronRight, FolderKanban, Info, LockKeyhole, Pencil, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { daysBetween, formatPlanningDate } from './planningDates';
import {
  fetchPlanningProjectCatalog,
  type PlanningProjectCatalogRecord,
} from './planningProjectCatalog';
import type { PlanningVessel } from './planningQueries';

interface PlanningProjectPickerDialogProps {
  canCreateProject: boolean;
  client: SupabaseClient;
  date: string;
  editable: boolean;
  onClose: () => void;
  onCreateProject: () => void;
  onSelectProject: (project: PlanningProjectCatalogRecord) => void;
  vessel: PlanningVessel;
}

function projectDuration(project: PlanningProjectCatalogRecord): string {
  if (!project.startsOn) return 'Durée contractuelle à définir';
  const duration = daysBetween(project.startsOn, project.endsOn || project.startsOn) + 1;
  return `Durée contractuelle : ${duration} jour${duration > 1 ? 's' : ''}`;
}

function statusTone(status: string): string {
  const normalized = status.trim().toLocaleLowerCase('fr-FR');
  if (normalized.includes('confirm') || normalized.includes('valid') || normalized.includes('sign')) return 'is-confirmed';
  if (normalized.includes('cours')) return 'is-active';
  return 'is-planned';
}

export function PlanningProjectPickerDialog({
  canCreateProject,
  client,
  date,
  editable,
  onClose,
  onCreateProject,
  onSelectProject,
  vessel,
}: PlanningProjectPickerDialogProps) {
  const [projects, setProjects] = useState<PlanningProjectCatalogRecord[]>([]);
  const [query, setQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    fetchPlanningProjectCatalog(client)
      .then((loadedProjects) => {
        if (active) setProjects(loadedProjects);
      })
      .catch((error) => {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger les projets.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client]);

  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fr-FR');
    if (!needle) return projects;
    return projects.filter((project) => [
      project.projectCode,
      project.title,
      project.clientName,
      project.status,
      project.description,
    ].some((value) => value.toLocaleLowerCase('fr-FR').includes(needle)));
  }, [projects, query]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;

  return (
    <div className="planning-project-picker-backdrop" role="presentation">
      <section aria-label="Rattacher l’opération à un projet" aria-modal="true" className="planning-project-picker" role="dialog">
        <header>
          <span>
            <strong>Nouvelle opération</strong>
            <small>{vessel.name} · {formatPlanningDate(date)}</small>
          </span>
          <div>
            <em className={editable ? 'is-editable' : 'is-readonly'}>
              {editable ? <Pencil aria-hidden="true" size={14} /> : <LockKeyhole aria-hidden="true" size={14} />}
              {editable ? 'Mode modification' : 'Mode lecture seule'}
            </em>
            <button aria-label="Fermer" onClick={onClose} type="button">
              <X aria-hidden="true" size={20} />
            </button>
          </div>
        </header>

        <main className="planning-project-picker-catalog">
          <div className="planning-project-picker-tools">
            <label>
              <Search aria-hidden="true" size={19} />
              <input
                aria-label="Rechercher un projet par mot-clé"
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher un projet ou contrat"
                type="search"
                value={query}
              />
            </label>
            <button
              className="is-create"
              disabled={!canCreateProject}
              onClick={onCreateProject}
              title={canCreateProject ? 'Créer un nouveau projet ou contrat' : 'Réservé aux profils Admin et Direction'}
              type="button"
            >
              <Plus aria-hidden="true" size={18} />
              Créer un nouveau projet
            </button>
          </div>

          {isLoading ? <div className="planning-project-picker-state" role="status">Chargement des projets…</div> : null}
          {!isLoading && !visibleProjects.length ? (
            <div className="planning-project-picker-state">
              <FolderKanban aria-hidden="true" size={28} />
              <strong>Aucun projet trouvé</strong>
              <span>Modifiez la recherche ou créez un nouveau Projet/Contrat.</span>
            </div>
          ) : null}
          {!isLoading && visibleProjects.length ? (
            <div aria-label="Liste des projets" className="planning-project-picker-list" role="listbox">
              {visibleProjects.map((project) => {
                const selected = selectedProjectId === project.id;
                return (
                  <button
                    aria-selected={selected}
                    className={selected ? 'is-selected' : ''}
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                    role="option"
                    type="button"
                  >
                    <span className="planning-project-picker-icon"><FolderKanban aria-hidden="true" size={20} /></span>
                    <span className="planning-project-picker-copy">
                      <strong>{project.projectCode ? `${project.projectCode} · ` : ''}{project.title}</strong>
                      <small>
                        Client : {project.clientName || 'Non renseigné'}
                        <i>·</i>
                        {projectDuration(project)}
                      </small>
                    </span>
                    <em className={statusTone(project.status)}>{project.status}</em>
                    <ChevronRight aria-hidden="true" size={18} />
                  </button>
                );
              })}
            </div>
          ) : null}
        </main>

        {errorMessage ? <p className="planning-project-picker-error" role="alert">{errorMessage}</p> : null}
        <footer>
          <p><Info aria-hidden="true" size={17} />Chaque opération reste reliée au Projet/Contrat sélectionné.</p>
          <span>
            <button className="is-secondary" onClick={onClose} type="button">Annuler</button>
            <button
              disabled={!editable || selectedProject === null}
              onClick={() => selectedProject && onSelectProject(selectedProject)}
              type="button"
            >
              Continuer
            </button>
          </span>
        </footer>
      </section>
    </div>
  );
}
