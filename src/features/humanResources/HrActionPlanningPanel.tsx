import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarClock, CheckCircle2, MapPin, Pencil, Plus, X } from 'lucide-react';
import type { HrDocumentRecord } from './peopleQueries';
import {
  fetchHrActions, fetchHrReviewAppointments, saveHrAction, hrActionIssues, hrActionIsOverdue, hrActionToday,
  HR_ACTION_KIND_LABELS, HR_ACTION_STATUS_LABELS,
} from './hrActionPlanning';
import type { HrActionInput, HrActionRecord, HrActionKind, HrActionStatus, HrReviewAppointment } from './hrActionPlanning';
import './hrActionPlanning.css';

interface Props {
  client: SupabaseClient | null;
  personId: number;
  personName: string;
  documents?: HrDocumentRecord[];
  canEdit: boolean;
  onChange?: () => void;
}

function blankAction(personId: number): HrActionInput {
  return { personId, documentId: null, kind: 'certificate', title: '', status: 'planned',
    dueOn: '', scheduledOn: '', completedOn: '', location: '', ownerName: '', notes: '' };
}

function formatDate(value: string): string {
  return value ? new Intl.DateTimeFormat('fr-FR').format(new Date(`${value}T12:00:00Z`)) : 'À préciser';
}

export function HrActionPlanningPanel({ client, personId, personName, documents = [], canEdit, onChange }: Props) {
  const [actions, setActions] = useState<HrActionRecord[]>([]);
  const [reviews, setReviews] = useState<HrReviewAppointment[]>([]);
  const [reviewError, setReviewError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<HrActionInput | null>(null);
  const [editingId, setEditingId] = useState<number>();
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setMessage(''); setForm(null); setActions([]); setReviews([]); setReviewError('');
    if (!client) { setLoading(false); return; }
    fetchHrActions(client, personId).then((rows) => {
      if (active) setActions(rows);
    }).catch(() => {
      if (active) setError('Le suivi des actions RH n’a pas pu être chargé. Réessayez.');
    }).finally(() => { if (active) setLoading(false); });
    fetchHrReviewAppointments(client, personId).then((rows) => {
      if (active) setReviews(rows);
    }).catch(() => { if (active) setReviewError('Les entretiens n’ont pas pu être chargés. Consultez le module Entretiens.'); });
    return () => { active = false; };
  }, [client, personId, revision]);

  function update<K extends keyof HrActionInput>(key: K, value: HrActionInput[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !client || !canEdit || saving) return;
    const issues = hrActionIssues(form);
    if (issues.length) { setError(issues.join(' ')); return; }
    setSaving(true); setError('');
    try {
      const saved = await saveHrAction(client, form, editingId);
      setActions((current) => [...current.filter((row) => row.id !== saved.id), saved].sort((a, b) => a.id - b.id));
      setForm(null); setMessage('Action enregistrée et partagée avec l’équipe autorisée.');
      window.dispatchEvent(new CustomEvent('seapilot:hr-actions-changed')); onChange?.();
    } catch {
      setError('L’action n’a pas été enregistrée. Vérifiez vos droits et réessayez.');
    } finally { setSaving(false); }
  }

  const planned = actions.filter((action) => action.status === 'planned');

  return <section className="hr-actions" id="rh-actions" aria-label={`Actions RH de ${personName}`}>
    <div className="hr-actions__heading">
      <div><span className="hr-actions__eyebrow"><CalendarClock size={15} /> SUIVI PARTAGÉ</span>
        <h3>Actions et rendez-vous</h3><p>Les échéances, les rendez-vous et les réalisations restent distincts.</p></div>
      {canEdit && client ? <button className="sp-button sp-button--secondary" type="button" onClick={() => {
        setForm(blankAction(personId)); setEditingId(undefined); setError(''); setMessage('');
      }}><Plus size={16} /> Planifier une action</button> : null}
    </div>
    {error ? <div role="alert" className="hr-actions__error">{error}{!form ? <button type="button" onClick={() => setRevision((value) => value + 1)}>Réessayer</button> : null}</div> : null}
    {message ? <p role="status" className="hr-actions__success">{message}</p> : null}
    {loading ? <p role="status">Chargement du suivi…</p> : null}
    {reviewError ? <p className="hr-actions__hint">{reviewError} <a href={`/modules/annualReviews?person=${personId}`}>Ouvrir les entretiens</a></p> : null}
    {reviews.length ? <div className="hr-actions__list">{reviews.map((review) => {
      const held = Boolean(review.managerValidatedAt && review.managerValidatedAt.slice(0, 10) <= hrActionToday()) || review.status === 'archived';
      return <article key={`review-${review.id}`} className={`hr-actions__item ${held ? 'hr-actions__item--completed' : ''}`}>
        <div className="hr-actions__item-icon">{held ? <CheckCircle2 size={19} /> : <CalendarClock size={19} />}</div>
        <div className="hr-actions__item-body"><div className="hr-actions__item-title"><strong>Entretien annuel {review.year}</strong><span className="hr-actions__badge">{held ? (review.status === 'archived' ? 'Réalisé · archivé' : 'Réalisé · signature attendue') : ['scheduled', 'collaborator_submitted'].includes(review.status) ? 'Planifié' : 'Créneau à confirmer'}</span></div>
          <p>{review.startsAt ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(review.startsAt)) : 'Date à préciser'} · {review.location || 'Lieu à préciser'}</p>
          <a href={`/modules/annualReviews?review=${review.id}`}>Ouvrir l’entretien et son suivi →</a>
        </div>
      </article>;
    })}</div> : null}
    {!loading && !error && !actions.length && !reviews.length ? <div className="hr-actions__empty"><CalendarClock size={28} /><p>Aucun rendez-vous renseigné</p><span>Ajoutez une formation, une visite médicale ou un renouvellement.</span></div> : null}
    {!loading && actions.length ? <>
      <div className="hr-actions__summary"><span>{planned.length} action{planned.length > 1 ? 's' : ''} planifiée{planned.length > 1 ? 's' : ''}</span><span>{actions.filter((action) => action.status === 'completed').length} réalisée(s)</span></div>
      <div className="hr-actions__list">{actions.map((action) => <article key={action.id} className={`hr-actions__item hr-actions__item--${action.status}`}>
        <div className="hr-actions__item-icon">{action.status === 'completed' ? <CheckCircle2 size={19} /> : <CalendarClock size={19} />}</div>
        <div className="hr-actions__item-body"><div className="hr-actions__item-title"><strong>{action.title}</strong><span className={`hr-actions__badge ${hrActionIsOverdue(action) ? 'hr-actions__badge--late' : ''}`}>{hrActionIsOverdue(action) ? 'En retard · à confirmer' : HR_ACTION_STATUS_LABELS[action.status]}</span></div>
          <small>{HR_ACTION_KIND_LABELS[action.kind]}{action.ownerName ? ` · Suivi par ${action.ownerName}` : ''}</small>
          <p><CalendarClock size={14} /> {action.status === 'completed' ? `Réalisé le ${formatDate(action.completedOn)}` : `Rendez-vous : ${formatDate(action.scheduledOn)}`}{action.location ? <><MapPin size={14} /> {action.location}</> : <span> · Lieu à préciser</span>}</p>
          {action.dueOn ? <small>Échéance : {formatDate(action.dueOn)}</small> : null}
          {action.notes ? <p className="hr-actions__notes">{action.notes}</p> : null}
        </div>
        {canEdit && action.kind !== 'annual_review' ? <button className="hr-actions__edit" aria-label={`Modifier l’action ${action.title}`} type="button" onClick={() => { const { id, ...input } = action; setForm(input); setEditingId(id); setError(''); }}><Pencil size={16} /></button> : null}
      </article>)}</div>
    </> : null}
    {form && canEdit ? <form className="hr-actions__form" onSubmit={(event) => { void submit(event); }}>
      <div className="hr-actions__form-heading"><h4>{editingId ? 'Modifier l’action' : 'Nouvelle action'}</h4><button aria-label="Fermer le formulaire d’action" type="button" disabled={saving} onClick={() => setForm(null)}><X size={18} /></button></div>
      <div className="hr-actions__fields">
        <label>Type d’action<select value={form.kind} onChange={(event) => update('kind', event.target.value as HrActionKind)}>{Object.entries(HR_ACTION_KIND_LABELS).filter(([value]) => value !== 'annual_review' || form.kind === 'annual_review').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>État<select value={form.status} onChange={(event) => { const status = event.target.value as HrActionStatus; setForm((current) => current ? { ...current, status, completedOn: status === 'completed' ? current.completedOn || hrActionToday() : '' } : current); }}>{Object.entries(HR_ACTION_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="hr-actions__wide">Intitulé<input value={form.title} required maxLength={300} onChange={(event) => update('title', event.target.value)} placeholder="Ex. Revalidation du brevet de capitaine" /></label>
        <label>Document concerné<select value={form.documentId ?? ''} onChange={(event) => { const document = documents.find((row) => row.id === Number(event.target.value)); setForm((current) => current ? { ...current, documentId: document?.id ?? null, dueOn: document?.expiresOn || current.dueOn, title: current.title || document?.title || '' } : current); }}><option value="">Sans document lié</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label>
        <label>Échéance à respecter<input type="date" value={form.dueOn} onChange={(event) => update('dueOn', event.target.value)} /></label>
        <label>Date du rendez-vous<input type="date" required={form.status === 'planned'} value={form.scheduledOn} onChange={(event) => update('scheduledOn', event.target.value)} /></label>
        <label>Lieu / organisme<input value={form.location} required={form.status === 'planned'} maxLength={500} onChange={(event) => update('location', event.target.value)} placeholder="Centre de formation, port, visioconférence…" /></label>
        {form.status === 'completed' ? <label>Date de réalisation<input type="date" required max={hrActionToday()} value={form.completedOn} onChange={(event) => update('completedOn', event.target.value)} /></label> : null}
        <label>Responsable du suivi<input value={form.ownerName} maxLength={200} onChange={(event) => update('ownerName', event.target.value)} /></label>
        <label className="hr-actions__wide">Informations pour l’équipe<textarea value={form.notes} rows={3} maxLength={10000} onChange={(event) => update('notes', event.target.value)} placeholder="Inscription confirmée, convocation attendue, contact…" /></label>
      </div>
      <p className="hr-actions__hint">Une action réalisée ne renouvelle pas automatiquement le document : ajoutez le justificatif et sa nouvelle validité dans le dossier RH.</p>
      <p className="hr-actions__hint">Pour planifier un entretien annuel, <a href={`/modules/annualReviews?person=${personId}`}>utilisez le module Entretiens</a> : son rendez-vous apparaîtra ici.</p>
      <div className="hr-actions__form-buttons"><button type="button" className="sp-button sp-button--secondary" disabled={saving} onClick={() => setForm(null)}>Annuler</button><button type="submit" className="sp-button sp-button--primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer et partager'}</button></div>
    </form> : null}
  </section>;
}
