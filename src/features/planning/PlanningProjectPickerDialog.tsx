import type { SupabaseClient } from '@supabase/supabase-js';
import { ChevronRight, FolderKanban, Info, LockKeyhole, Pencil, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { daysBetween, formatPlanningDate } from './planningDates';
import {
  fetchPlanningProjectCatalog,
  createOutOfProjectPlanningOperation,
  createQuickPlanningProject,
  type PlanningProjectCatalogRecord,
} from './planningProjectCatalog';
import { PLANNING_OUT_OF_PROJECT_CODE, PLANNING_OUT_OF_PROJECT_NAME_MAX_LENGTH } from './planningOutOfProject';
import type { PlanningProjectRecord, PlanningVessel } from './planningQueries';
import './planningQuickProject.css';

interface PlanningProjectPickerDialogProps {
  canCreateProject: boolean;
  client: SupabaseClient;
  date: string;
  editable: boolean;
  onClose: () => void;
  onCreateProject: () => void;
  onOperationCreated: (project: PlanningProjectRecord) => void;
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
  onOperationCreated,
  onSelectProject,
  vessel,
}: PlanningProjectPickerDialogProps) {
  const [projects, setProjects] = useState<PlanningProjectCatalogRecord[]>([]);
  const [query, setQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [creationMode, setCreationMode] = useState<'quick-project' | 'out-of-project' | null>(null);
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const canCreate = canCreateProject && editable;
  const isOutOfProject = creationMode === 'out-of-project';
  const canSubmit = isOutOfProject ? editable : canCreate;

  function changeCreationMode(mode: typeof creationMode) {
    setTitle('');
    setErrorMessage('');
    setCreationMode(mode);
  }

  async function submitOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creationMode || !canSubmit || savingRef.current || !title.trim()) return;
    savingRef.current = true;
    setIsSaving(true);
    setErrorMessage('');
    try {
      const createOperation = isOutOfProject ? createOutOfProjectPlanningOperation : createQuickPlanningProject;
      const project = await createOperation(client, { title, vesselId: vessel.id, startsOn: date });
      onOperationCreated(project);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de créer cette opération.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchPlanningProjectCatalog(client)
      .then((loadedProjects) => {
        if (active) setProjects(loadedProjects);
      })
      .catch((error) => {
        if (active) setCatalogError(error instanceof Error ? error.message : 'Impossible de charger les projets.');
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
  const visibleError = creationMode ? errorMessage : catalogError;

  return (
    <div className="planning-project-picker-backdrop" role="presentation">
      <section aria-label={isOutOfProject ? 'Nouvelle opération hors projet' : 'Rattacher l’opération à un projet'} aria-modal="true" className="planning-project-picker" role="dialog">
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
            <button aria-label="Fermer" disabled={isSaving} onClick={onClose} type="button">
              <X aria-hidden="true" size={20} />
            </button>
          </div>
        </header>

        {creationMode ? (
          <form className="planning-quick-project-form" id="planning-operation-creation" onSubmit={(event) => void submitOperation(event)}>
            <h2>{isOutOfProject ? 'Hors Projet' : 'Projet rapide'}</h2>
            <p>{isOutOfProject
              ? <>Code projet <strong>{PLANNING_OUT_OF_PROJECT_CODE}</strong> · Gris anthracite</>
              : 'Indiquez le titre : le projet recevra automatiquement un numéro Pxxx et sera enregistré en brouillon.'}</p>
            <label htmlFor="planning-operation-creation-title">{isOutOfProject ? 'Nom du projet' : 'Titre du projet'}</label>
            <input autoFocus disabled={isSaving} id="planning-operation-creation-title" maxLength={isOutOfProject ? PLANNING_OUT_OF_PROJECT_NAME_MAX_LENGTH : 300} onChange={(event) => setTitle(event.target.value)} required value={title} />
            <small>{isOutOfProject
              ? <>L’opération sera ajoutée à {vessel.name} le {formatPlanningDate(date)}, pour une journée.</>
              : <>Il apparaîtra sur {vessel.name} le {formatPlanningDate(date)}, pour une journée, et dans la liste des projets. Vous pourrez le compléter ensuite.</>}</small>
          </form>
        ) : <main className="planning-project-picker-catalog">
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
              disabled={!canCreate}
              onClick={onCreateProject}
              title={canCreateProject ? 'Créer un nouveau projet ou contrat' : 'Réservé aux profils Admin et Direction'}
              type="button"
            >
              <Plus aria-hidden="true" size={18} />
              Créer un nouveau projet
            </button>
            <button className="is-create" disabled={!canCreate} onClick={() => changeCreationMode('quick-project')} type="button">
              <Plus aria-hidden="true" size={18} />
              Projet rapide
            </button>
            <button className="is-create" disabled={!editable} onClick={() => changeCreationMode('out-of-project')} type="button">
              <Plus aria-hidden="true" size={18} />
              Hors Projet
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
        </main>}

        {visibleError ? <p className="planning-project-picker-error" role="alert">{visibleError}</p> : null}
        <footer>
          <p><Info aria-hidden="true" size={17} />{creationMode ? 'Après la création, vous restez sur le planning.' : 'Sélectionnez un Projet/Contrat ou créez une opération hors projet.'}</p>
          <span>
            <button className="is-secondary" disabled={isSaving} onClick={creationMode ? () => changeCreationMode(null) : onClose} type="button">{creationMode ? 'Retour' : 'Annuler'}</button>
            {creationMode ? <button disabled={!canSubmit || isSaving || !title.trim()} form="planning-operation-creation" type="submit">{isSaving ? 'Création…' : isOutOfProject ? 'Créer l’opération' : 'Créer le projet'}</button> : <button
              disabled={!editable || selectedProject === null}
              onClick={() => selectedProject && onSelectProject(selectedProject)}
              type="button"
            >
              Continuer
            </button>}
          </span>
        </footer>
      </section>
    </div>
  );
}
