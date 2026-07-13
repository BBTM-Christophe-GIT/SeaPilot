import { Archive, CheckCircle2, LockKeyhole, Send, ShieldCheck, UnlockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { formatPlanningDate, type PlanningDateRange } from './planningModel';
import { formatPlanningDateTime } from './planningDates';
import {
  isPlanningPublicationLocked,
  planningPublicationActions,
  planningPublicationStatusLabel,
} from './planningPublication';
import type { PlanningPublicationAction, PlanningPublicationRecord } from './planningQueries';

const ACTION_LABELS: Record<PlanningPublicationAction, string> = {
  submit: 'Soumettre à validation',
  validate: 'Valider la période',
  publish: 'Publier la version',
  reopen: 'Réouvrir pour modification',
  archive: 'Archiver',
};

interface PlanningPublicationPanelProps {
  publication: PlanningPublicationRecord | null;
  range: PlanningDateRange;
  scopeLabel: string;
  canManage: boolean;
  allowedActions: PlanningPublicationAction[];
  isSaving: boolean;
  onAction: (action: PlanningPublicationAction, comment: string) => Promise<boolean>;
}

function PublicationActionIcon({ action }: { action: PlanningPublicationAction }) {
  if (action === 'submit') return <Send aria-hidden="true" size={16} />;
  if (action === 'validate') return <CheckCircle2 aria-hidden="true" size={16} />;
  if (action === 'publish') return <ShieldCheck aria-hidden="true" size={16} />;
  if (action === 'archive') return <Archive aria-hidden="true" size={16} />;
  return <UnlockKeyhole aria-hidden="true" size={16} />;
}

export function PlanningPublicationPanel({
  publication,
  range,
  scopeLabel,
  canManage,
  allowedActions,
  isSaving,
  onAction,
}: PlanningPublicationPanelProps) {
  const [comment, setComment] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const actions = planningPublicationActions(publication, allowedActions);
  const locked = isPlanningPublicationLocked(publication);
  const startsOn = publication?.startsOn || range.start;
  const endsOn = publication?.endsOn || range.end;

  async function runAction(action: PlanningPublicationAction) {
    if ((action === 'reopen' || action === 'archive') && comment.trim().length < 10) {
      setValidationMessage(`Indiquez un motif d’au moins 10 caractères pour ${action === 'archive' ? 'archiver' : 'réouvrir'} la période.`);
      return;
    }
    setValidationMessage(null);
    if (await onAction(action, comment)) setComment('');
  }

  return (
    <section className={`planning-publication-panel${locked ? ' is-locked' : ''}`} aria-label="Pilotage de publication">
      <div className="planning-publication-state">
        <span className="planning-publication-lock" aria-label={locked ? 'Période verrouillée' : 'Période modifiable'}>
          {locked ? <LockKeyhole aria-hidden="true" size={18} /> : <UnlockKeyhole aria-hidden="true" size={18} />}
        </span>
        <div>
          <p>Publication du planning</p>
          <strong>{publication ? planningPublicationStatusLabel(publication.status) : 'En préparation'}</strong>
        </div>
        <span className={`planning-publication-badge is-${publication?.status || 'preparation'}`}>
          {publication?.currentVersion ? `Version ${publication.currentVersion}` : 'Non publié'}
        </span>
      </div>

      <div className="planning-publication-scope">
        <span>{publication?.vesselId === null ? 'Flotte complète' : scopeLabel}</span>
        <strong>{formatPlanningDate(startsOn)} — {formatPlanningDate(endsOn)}</strong>
        {publication?.publishedAt ? (
          <small>{`Publié par ${publication.publishedByName || 'utilisateur autorisé'} · ${formatPlanningDateTime(publication.publishedAt)}`}</small>
        ) : publication?.validatedAt ? (
          <small>{`Validé par ${publication.validatedByName || 'utilisateur autorisé'} · ${formatPlanningDateTime(publication.validatedAt)}`}</small>
        ) : publication?.submittedAt ? (
          <small>{`Soumis par ${publication.submittedByName || 'utilisateur autorisé'} · ${formatPlanningDateTime(publication.submittedAt)}`}</small>
        ) : null}
        {publication?.comment ? <small title={publication.comment}>{publication.comment}</small> : null}
      </div>

      {canManage && actions.length ? (
        <div className="planning-publication-actions">
          <label>
            <span className="sr-only">Commentaire de publication</span>
            <input
              aria-label="Commentaire de publication"
              onChange={(event) => setComment(event.target.value)}
              placeholder={actions.includes('reopen') || actions.includes('archive') ? 'Motif obligatoire pour réouvrir ou archiver…' : 'Commentaire de workflow…'}
              value={comment}
            />
          </label>
          <div>
            {actions.map((action) => (
              <button
                className={action === 'reopen' || action === 'archive' ? 'is-secondary' : 'is-primary'}
                disabled={isSaving}
                key={action}
                onClick={() => void runAction(action)}
                type="button"
              >
                <PublicationActionIcon action={action} />
                {ACTION_LABELS[action]}
              </button>
            ))}
          </div>
          {validationMessage ? <small className="form-error">{validationMessage}</small> : null}
        </div>
      ) : (
        <p className="planning-publication-note">
          {locked
            ? 'Les événements de cette période sont protégés côté serveur.'
            : publication
              ? 'Cette période n’est pas verrouillée.'
              : 'Aucune version n’a encore été publiée pour cette période.'}
        </p>
      )}
    </section>
  );
}
