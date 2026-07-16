import { RadioTower } from 'lucide-react';
import { formatPlanningDateTime } from './planningDates';
import type { PlanningVersionRecord } from './planningQueries';

interface PlanningPublicationPanelProps {
  release: PlanningVersionRecord | null;
  canPublish: boolean;
  isSaving: boolean;
  onPublish: () => Promise<void>;
}

export function PlanningPublicationPanel({
  release,
  canPublish,
  isSaving,
  onPublish,
}: PlanningPublicationPanelProps) {
  return (
    <section aria-label="Diffusion du planning" className="planning-publication-panel is-global">
      <div className="planning-publication-state">
        <span aria-hidden="true" className="planning-publication-lock">
          <RadioTower size={18} />
        </span>
        <div>
          <p>Diffusion du planning</p>
          <strong>{release ? `Version ${release.versionNumber}` : 'Aucune version diffusée'}</strong>
        </div>
        <span className={`planning-publication-badge ${release ? 'is-published' : 'is-preparation'}`}>
          {release ? 'Publiée' : 'Brouillon'}
        </span>
      </div>

      <div className="planning-publication-scope">
        <span>Dernière publication</span>
        <strong>{release ? formatPlanningDateTime(release.createdAt) : 'Pas encore publiée'}</strong>
        {release ? <small>{`Diffusée par ${release.createdByName || 'utilisateur autorisé'}`}</small> : null}
      </div>

      {canPublish ? (
        <div className="planning-publication-actions">
          <button className="is-primary" disabled={isSaving} onClick={() => void onPublish()} type="button">
            <RadioTower aria-hidden="true" size={16} />
            {isSaving ? 'Diffusion…' : 'Diffuser le Planning'}
          </button>
        </div>
      ) : (
        <p className="planning-publication-note">
          {release
            ? 'Vous consultez la dernière version diffusée.'
            : 'Aucune version du planning n’est encore disponible.'}
        </p>
      )}
    </section>
  );
}
