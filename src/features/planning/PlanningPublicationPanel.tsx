import { Archive, CheckCircle2, ChevronDown, LockKeyhole, Send, ShieldCheck, UnlockKeyhole } from 'lucide-react';
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

const ACTION_DESCRIPTIONS: Record<PlanningPublicationAction, string> = {
  submit: 'Envoie la période au circuit de validation.',
  validate: 'Confirme que la période peut être publiée.',
  publish: 'Crée et verrouille une nouvelle version.',
  reopen: 'Déverrouille la période avec une justification.',
  archive: 'Clôture la période avec une justification.',
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
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const actions = planningPublicationActions(publication, allowedActions);
  const primaryAction = actions.find((action) => action !== 'reopen' && action !== 'archive') || null;
  const menuActions = primaryAction ? actions.filter((action) => action !== primaryAction) : actions;
  const locked = isPlanningPublicationLocked(publication);
  const startsOn = publication?.startsOn || range.start;
  const endsOn = publication?.endsOn || range.end;

  async function runAction(action: PlanningPublicationAction) {
    if ((action === 'reopen' || action === 'archive') && comment.trim().length < 10) {
      setValidationMessage(`Indiquez un motif d’au moins 10 caractères pour ${action === 'archive' ? 'archiver' : 'réouvrir'} la période.`);
      return;
    }
    setValidationMessage(null);
    if (await onAction(action, comment)) {
      setComment('');
      setIsActionsOpen(false);
    }
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
          <div className="planning-publication-action-buttons">
            {primaryAction ? (
              <button
                className="is-primary"
                disabled={isSaving}
                onClick={() => void runAction(primaryAction)}
                type="button"
              >
                <PublicationActionIcon action={primaryAction} />
                {ACTION_LABELS[primaryAction]}
              </button>
            ) : null}
            {menuActions.length ? <div className="planning-publication-action-menu">
              <button
                aria-label={`Afficher ${menuActions.length} autre${menuActions.length > 1 ? 's' : ''} action${menuActions.length > 1 ? 's' : ''} de publication`}
                aria-expanded={isActionsOpen}
                className="is-secondary"
                onClick={() => setIsActionsOpen((current) => !current)}
                type="button"
              >
                Autres actions ({menuActions.length}) <ChevronDown aria-hidden="true" size={15} />
              </button>
              {isActionsOpen ? (
                <div aria-label="Autres actions de publication" className="planning-publication-action-popover" role="group">
                  <header><strong>Autres actions disponibles</strong><small>Le rôle de chaque action est détaillé ci-dessous.</small></header>
                  {primaryAction ? <p><span>{ACTION_LABELS[primaryAction]}</span><small>{ACTION_DESCRIPTIONS[primaryAction]} Bouton principal.</small></p> : null}
                  {menuActions.map((action) => (
                    <button aria-label={ACTION_LABELS[action]} disabled={isSaving} key={action} onClick={() => void runAction(action)} type="button">
                      <PublicationActionIcon action={action} />
                      <span><strong>{ACTION_LABELS[action]}</strong><small>{ACTION_DESCRIPTIONS[action]}</small></span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div> : null}
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
