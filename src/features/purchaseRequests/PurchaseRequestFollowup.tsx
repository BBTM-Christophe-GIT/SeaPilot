import { MessageSquare, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { PurchaseRequestEvent, PurchaseRequestRecord } from './purchaseRequestQueries';
import './purchaseRequestFollowup.css';

interface PurchaseRequestFollowupProps {
  request: PurchaseRequestRecord;
  canComment: boolean;
  isBusy?: boolean;
  onAddComment: (comment: string) => Promise<void>;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'Date inconnue';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris',
  }).format(date);
}

function eventLabel(event: PurchaseRequestEvent): string {
  if (event.eventType === 'comment_added') return 'Commentaire';
  if (event.eventType === 'created') return 'Demande créée';
  return event.statusLabel || 'Mise à jour';
}

export function PurchaseRequestFollowup({ request, canComment, isBusy = false, onAddComment }: PurchaseRequestFollowupProps) {
  const [comment, setComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const saving = useRef(false);
  const events = [...request.events];
  if (!events.some((event) => event.eventType === 'created')) {
    events.push({
      id: -1, eventType: 'created', statusLabel: 'Demande créée',
      actorName: request.requesterName || 'Demandeur', comment: '',
      createdAt: request.createdAt, effectiveOn: request.requestedOn,
    });
  }
  events.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || b.id - a.id);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || isBusy || !comment.trim()) return;
    saving.current = true;
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await onAddComment(comment.trim());
      setComment('');
      setSuccess(true);
    } catch (cause) {
      setError(cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string'
        ? cause.message : 'Impossible d’enregistrer le commentaire.');
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  return (
    <section className="purchase-followup" aria-label="Suivi de la demande">
      <h3><MessageSquare aria-hidden="true" size={17} />Suivi de la demande</h3>
      {canComment ? (
        <form className="purchase-followup-form" onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor={`purchase-followup-comment-${request.id}`}>Commentaire de suivi</label>
          <textarea
            disabled={isBusy || isSaving}
            id={`purchase-followup-comment-${request.id}`}
            maxLength={4000}
            onChange={(event) => { setComment(event.target.value); setSuccess(false); }}
            placeholder="Ajouter une information, une relance ou un point sur la livraison…"
            required
            rows={3}
            value={comment}
          />
          <div className="purchase-followup-submit">
            <small>{comment.length.toLocaleString('fr-FR')} / 4 000 caractères</small>
            <button disabled={isBusy || isSaving || !comment.trim()} type="submit">
              <Plus aria-hidden="true" size={16} />{isSaving ? 'Enregistrement…' : 'Ajouter le commentaire'}
            </button>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div role="status">{success ? <p className="admin-success">Commentaire ajouté au suivi.</p> : null}</div>
        </form>
      ) : null}
      <ol className="purchase-followup-events" aria-label="Historique du suivi">
        {events.map((event) => (
          <li className={event.eventType === 'comment_added' ? 'is-comment' : ''} key={event.id}>
            <span className="purchase-followup-dot" aria-hidden="true" />
            <article>
              <header><strong>{eventLabel(event)}</strong><time dateTime={event.createdAt}>{formatTimestamp(event.createdAt)}</time></header>
              <small className="purchase-followup-author">{event.actorName || 'Auteur non renseigné'}</small>
              {event.comment ? <p>{event.comment}</p> : null}
            </article>
          </li>
        ))}
      </ol>
      {request.approvalHistory && request.events.every((event) => event.eventType === 'comment_added') ? <p className="purchase-followup-legacy"><strong>{request.approvalStatus || 'Approbation'}</strong><br />{request.approvalHistory}{request.approverName ? <><br />{request.approverName}</> : null}{request.approvalReason ? <><br />{request.approvalReason}</> : null}</p> : null}
    </section>
  );
}
