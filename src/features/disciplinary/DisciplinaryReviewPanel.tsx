import { useState } from 'react';
import { Field } from './DisciplinaryForm';
import { frenchDate, todayParis, type DisciplinaryCase } from './disciplinaryModel';
import { disciplinaryBodyToPlainText, disciplinaryBodyToHtml } from './disciplinaryRichText';
import { FIELD_LABELS, PROCEDURE_STEPS, type Collaboration, type Reviewer, type WorkflowAction } from './disciplinaryWorkflow';

function valueText(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return disciplinaryBodyToPlainText(String(value ?? '')) || 'Non renseigné';
}
function ReviewValue({ field, value }: { field: string | null; value: unknown }) {
  return ['facts', 'evidence', 'rules', 'sanctionDetails', 'body'].includes(field || '') && typeof value === 'string'
    ? <div className="disciplinary-rich-proposal" dangerouslySetInnerHTML={{ __html: disciplinaryBodyToHtml(value) }} />
    : <p>{valueText(value)}</p>;
}
const EVENT_LABELS: Record<string, string> = { new_letter: 'Nouveau courrier préparé', create: 'Dossier créé', save: 'Brouillon enregistré', proposed: 'Modifications proposées', share: 'Courrier partagé', comment: 'Commentaire ajouté', resolve: 'Décision sur une modification', issuer: 'Émetteur changé', validate: 'Courrier validé', procedure: 'Étape réalisée' };
export function DisciplinaryReviewPanel({ record, collaboration, reviewers, actorId, isAdmin, busy, onAction }: {
  record: DisciplinaryCase; collaboration: Collaboration; reviewers: Reviewer[]; actorId: string; isAdmin: boolean; busy: boolean;
  onAction: (action: WorkflowAction, payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [issuerId, setIssuerId] = useState(record.issuer_id);
  const isIssuer = record.issuer_id === actorId;
  const locked = record.workflow_status === 'validated';
  const canManage = isIssuer || isAdmin;
  return <div className="disciplinary-review-panel">
    <section><h3>Émetteur du courrier</h3><p>{reviewers.find((p) => p.id === record.issuer_id)?.name || 'Profil à réaffecter'}</p>
      {canManage && !locked ? <div className="disciplinary-actions"><Field label="Nouvel émetteur"><select disabled={busy} value={issuerId} onChange={(e) => setIssuerId(e.target.value)}>{reviewers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><button disabled={busy || issuerId === record.issuer_id} onClick={() => { if (window.confirm('Changer l’émetteur effacera la signature actuelle. Continuer ?')) void onAction('issuer', { issuer_id: issuerId }); }}>Changer l’émetteur</button></div> : null}
    </section>
    <section><h3>Partager pour commentaire ou modification</h3><p className="disciplinary-muted">Les destinataires recevront une notification dans leur cloche. Seuls les profils Administration et Direction autorisés sont proposés.</p>
      {canManage && !locked ? <><div className="disciplinary-recipient-list">{reviewers.filter((p) => p.id !== actorId).map((p) => <label className="disciplinary-check" key={p.id}><input type="checkbox" checked={recipients.includes(p.id)} disabled={busy} onChange={(e) => setRecipients((ids) => e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))} /><span>{p.name}<small>{p.function}</small></span></label>)}</div><button disabled={busy || !record.letter || !recipients.length} onClick={() => void onAction('share', { recipients }).then((ok) => { if (ok) setRecipients([]); })}>Partager et notifier</button>{!record.letter ? <p className="disciplinary-muted">L’émetteur doit d’abord générer et enregistrer le courrier.</p> : null}</> : null}
      {collaboration.participants.length ? <p className="disciplinary-muted">Partagé avec : {collaboration.participants.map((p) => reviewers.find((r) => r.id === p.user_id)?.name || 'Ancien participant').join(', ')}.</p> : null}
    </section>
    <section><h3>Commentaires et modifications</h3>
      <Field label="Votre commentaire"><textarea rows={3} maxLength={5000} value={comment} disabled={busy} onChange={(e) => setComment(e.target.value)} /></Field>
      <button disabled={busy || !comment.trim()} onClick={() => void onAction('comment', { comment }).then((ok) => { if (ok) setComment(''); })}>Ajouter le commentaire</button>
      {!collaboration.reviews.length ? <p className="disciplinary-muted">Aucun commentaire ni proposition pour ce dossier.</p> : null}
      {collaboration.reviews.map((review) => <article key={review.id} className="disciplinary-proposal">
        <header><strong>{review.author_name}</strong><small>{frenchDate(review.created_at)} · {review.kind === 'comment' ? 'Commentaire' : review.status === 'pending' ? 'À décider' : review.status === 'accepted' ? 'Acceptée' : 'Rejetée'}</small></header>
        {review.kind === 'comment' ? <p className="disciplinary-preserve-text">{review.comment}</p> : <><h4>{review.target === 'letter' ? 'Courrier' : 'Préparation'} · {FIELD_LABELS[review.field || ''] || review.field}</h4><div className="disciplinary-change-comparison"><div><small>Version actuelle à la proposition</small><ReviewValue field={review.field} value={review.before_value} /></div><div><small>Modification proposée</small><ReviewValue field={review.field} value={review.after_value} /></div></div>
          {isIssuer && !locked && review.status === 'pending' ? <div className="disciplinary-actions"><button disabled={busy} onClick={() => void onAction('resolve', { review_id: review.id, decision: 'accepted' })}>Accepter</button><button disabled={busy} onClick={() => void onAction('resolve', { review_id: review.id, decision: 'rejected' })}>Rejeter</button></div> : null}</>}
      </article>)}
    </section>
  </div>;
}
export function DisciplinaryTimeline({ collaboration, busy, onAction }: { collaboration: Collaboration; busy: boolean; onAction: (action: WorkflowAction, payload: Record<string, unknown>) => Promise<boolean> }) {
  const [step, setStep] = useState('facts');
  const [date, setDate] = useState(todayParis());
  const [note, setNote] = useState('');
  return <div><h3>Suivi de la procédure</h3><p className="disciplinary-muted">Consignez les étapes réellement effectuées. L’historique reste consultable et peut être complété après validation du courrier.</p>
    <div className="disciplinary-form"><Field label="Étape réalisée"><select value={step} disabled={busy} onChange={(e) => setStep(e.target.value)}>{Object.entries(PROCEDURE_STEPS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field><Field label="Date de réalisation"><input type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Note de suivi" wide><textarea rows={2} maxLength={5000} disabled={busy} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
    <button disabled={busy || !date} onClick={() => void onAction('procedure', { step, date, note }).then((ok) => { if (ok) setNote(''); })}>Ajouter au suivi</button>
    <ol className="disciplinary-timeline">{collaboration.events.map((event) => <li key={event.id}><strong>{event.kind === 'procedure' ? PROCEDURE_STEPS[event.detail.step] : EVENT_LABELS[event.kind] || event.kind}</strong><small>{frenchDate(event.detail.date || event.created_at)} · {event.actor_name}</small>{event.detail.note ? <p className="disciplinary-preserve-text">{event.detail.note}</p> : null}{event.kind === 'issuer' ? <p>{event.detail.issuer_name}</p> : null}{event.kind === 'resolve' ? <p>{FIELD_LABELS[event.detail.field] || event.detail.field} · {event.detail.decision === 'accepted' ? 'Acceptée' : 'Rejetée'}</p> : null}</li>)}</ol>
  </div>;
}
