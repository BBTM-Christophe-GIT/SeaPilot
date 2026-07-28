import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CalendarCheck2,
  Download,
  FileText,
  Mail,
  MapPin,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Ship,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { formatPlanningDateTime, utcToPlanningLocalDateTime } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import type { PlanningVessel } from './planningQueries';
import {
  createPlanningVisitAttachmentUrl,
  deletePlanningVesselVisit,
  PLANNING_VISIT_TYPES,
  planningVisitTypeLabel,
  savePlanningVesselVisit,
  uploadPlanningVisitAttachments,
  type PlanningServiceProvider,
  type PlanningVesselVisit,
  type PlanningVisitType,
} from './planningVisitQueries';

interface VisitFormState {
  visitType: PlanningVisitType;
  providerId: string;
  comments: string;
  scheduledAt: string[];
}

function defaultScheduledAt(): string {
  const date = new Date();
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function initialForm(visit: PlanningVesselVisit | null, providers: PlanningServiceProvider[]): VisitFormState {
  return visit ? {
    visitType: visit.visitType,
    providerId: String(visit.providerId),
    comments: visit.comments,
    scheduledAt: visit.occurrences.map((occurrence) => utcToPlanningLocalDateTime(occurrence.scheduledAt)),
  } : {
    visitType: PLANNING_VISIT_TYPES[0],
    providerId: providers[0] ? String(providers[0].id) : '',
    comments: '',
    scheduledAt: [defaultScheduledAt()],
  };
}

export function PlanningVisitsPanel({
  client,
  vessel,
  providers,
  visit,
  canEdit,
  canDelete,
  onClose,
  onSaved,
}: {
  client: SupabaseClient;
  vessel: PlanningVessel;
  providers: PlanningServiceProvider[];
  visit: PlanningVesselVisit | null;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(visit === null);
  const [form, setForm] = useState<VisitFormState>(() => initialForm(visit, providers));
  const [files, setFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const provider = useMemo(
    () => providers.find((item) => item.id === Number(form.providerId)) || visit?.provider || null,
    [form.providerId, providers, visit?.provider],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback(null);
    try {
      const visitId = await savePlanningVesselVisit(client, {
        id: visit?.id,
        vesselId: vessel.id,
        visitType: form.visitType,
        providerId: Number(form.providerId),
        comments: form.comments,
        scheduledAt: form.scheduledAt,
      });
      if (files.length) await uploadPlanningVisitAttachments(client, visitId, files);
      await onSaved();
      setFeedback({ message: 'Visite / Audit enregistré au niveau du navire.', error: false });
      onClose();
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, 'Impossible d’enregistrer la visite ou l’audit.'), error: true });
    } finally {
      setIsSaving(false);
    }
  }

  async function removeVisit() {
    if (!visit || !window.confirm(`Supprimer définitivement « ${planningVisitTypeLabel(visit.visitType)} » pour ${vessel.name} ?`)) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      await deletePlanningVesselVisit(client, visit);
      await onSaved();
      onClose();
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, 'Impossible de supprimer la visite ou l’audit.'), error: true });
    } finally {
      setIsSaving(false);
    }
  }

  async function openAttachment(attachment: PlanningVesselVisit['attachments'][number]) {
    try {
      const url = await createPlanningVisitAttachmentUrl(client, attachment);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setFeedback({ message: planningErrorMessage(error, 'Impossible d’ouvrir la pièce jointe.'), error: true });
    }
  }

  return (
    <div className="planning-dialog-backdrop is-side-panel" role="presentation">
      <section aria-label="Visite ou audit du navire" aria-modal="true" className="planning-dialog is-side-panel planning-visits-panel" role="dialog">
        <header>
          <div><CalendarCheck2 aria-hidden="true" size={21} /><span><small>Planning · Ligne du navire</small><h2>{visit ? planningVisitTypeLabel(visit.visitType) : 'Nouvelle Visite / Audit'}</h2></span></div>
          <button aria-label="Fermer" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button>
        </header>

        <div className="planning-visits-vessel"><Ship aria-hidden="true" size={17} /><span><small>Navire</small><strong>{vessel.name}</strong></span></div>
        {feedback ? <p className={feedback.error ? 'form-error planning-p12-feedback' : 'admin-success planning-p12-feedback'} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p> : null}

        {isEditing ? (
          <form className="planning-visits-form" onSubmit={submit}>
            <label>Type de visite<select required value={form.visitType} onChange={(event) => setForm({ ...form, visitType: event.target.value as PlanningVisitType })}>{PLANNING_VISIT_TYPES.map((type) => <option key={type} value={type}>{planningVisitTypeLabel(type)}</option>)}</select></label>
            <label>Prestataire<select required value={form.providerId} onChange={(event) => setForm({ ...form, providerId: event.target.value })}><option value="">Choisir un prestataire</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>

            <fieldset className="planning-visits-dates">
              <legend>Date de la ou des visite(s)</legend>
              {form.scheduledAt.map((dateTime, index) => (
                <div key={`${index}-${dateTime}`}>
                  <input aria-label={`Date et heure de la visite ${index + 1}`} required type="datetime-local" value={dateTime} onChange={(event) => setForm({ ...form, scheduledAt: form.scheduledAt.map((value, current) => current === index ? event.target.value : value) })} />
                  {form.scheduledAt.length > 1 ? <button aria-label={`Retirer la visite ${index + 1}`} className="is-secondary" onClick={() => setForm({ ...form, scheduledAt: form.scheduledAt.filter((_, current) => current !== index) })} type="button"><Trash2 aria-hidden="true" size={15} /></button> : null}
                </div>
              ))}
              <button className="is-secondary planning-visits-add-date" disabled={form.scheduledAt.length >= 10} onClick={() => setForm({ ...form, scheduledAt: [...form.scheduledAt, form.scheduledAt.at(-1) || defaultScheduledAt()] })} type="button"><Plus aria-hidden="true" size={15} />Ajouter une date</button>
            </fieldset>

            <label>Commentaires<textarea maxLength={2000} rows={4} value={form.comments} onChange={(event) => setForm({ ...form, comments: event.target.value })} /></label>
            <label className="planning-visits-file"><Paperclip aria-hidden="true" size={17} /><span>Pièces jointes<small>PDF, images, Word ou Excel · 20 Mo maximum par fichier</small></span><input accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} type="file" /></label>
            {files.length ? <ul className="planning-visits-pending-files">{files.map((file) => <li key={`${file.name}-${file.size}`}><FileText aria-hidden="true" size={14} />{file.name}</li>)}</ul> : null}
            <footer><button className="is-secondary" onClick={visit ? () => setIsEditing(false) : onClose} type="button">Annuler</button><button disabled={isSaving || !providers.length} type="submit">{isSaving ? 'Enregistrement…' : 'Enregistrer'}</button></footer>
          </form>
        ) : visit ? (
          <div className="planning-visits-detail">
            <section><h3>Dates prévues</h3><ol>{visit.occurrences.map((occurrence) => <li key={occurrence.id}><CalendarCheck2 aria-hidden="true" size={16} /><strong>{formatPlanningDateTime(occurrence.scheduledAt)}</strong></li>)}</ol></section>
            <section><h3>Prestataire</h3><div className="planning-visits-provider-card"><strong>{provider?.name || 'Prestataire non renseigné'}</strong>{provider?.activity || provider?.serviceType ? <small>{provider.activity || provider.serviceType}</small> : null}<dl>{provider?.address || provider?.city ? <div><dt><MapPin aria-hidden="true" size={15} />Adresse</dt><dd>{[provider.address, provider.city].filter(Boolean).join(', ')}</dd></div> : null}{provider?.phone ? <div><dt><Phone aria-hidden="true" size={15} />Téléphone</dt><dd><a href={`tel:${provider.phone}`}>{provider.phone}</a></dd></div> : null}{provider?.companyEmail ? <div><dt><Mail aria-hidden="true" size={15} />E-mail</dt><dd><a href={`mailto:${provider.companyEmail}`}>{provider.companyEmail}</a></dd></div> : null}{provider?.contactName ? <div><dt>Contact</dt><dd>{provider.contactName}{provider.contactRole ? ` · ${provider.contactRole}` : ''}{provider.contactPhone ? <><br /><a href={`tel:${provider.contactPhone}`}>{provider.contactPhone}</a></> : null}{provider.contactEmail ? <><br /><a href={`mailto:${provider.contactEmail}`}>{provider.contactEmail}</a></> : null}</dd></div> : null}</dl></div></section>
            {visit.comments ? <section><h3>Commentaires</h3><p>{visit.comments}</p></section> : null}
            {visit.attachments.length ? <section><h3>Pièces jointes</h3><div className="planning-visits-attachments">{visit.attachments.map((attachment) => <button key={attachment.id} onClick={() => void openAttachment(attachment)} type="button"><FileText aria-hidden="true" size={16} /><span>{attachment.originalFileName}</span><Download aria-hidden="true" size={15} /></button>)}</div></section> : null}
            <footer>{canDelete ? <button className="is-danger" disabled={isSaving} onClick={() => void removeVisit()} type="button"><Trash2 aria-hidden="true" size={15} />Supprimer</button> : <span />}{canEdit ? <button onClick={() => setIsEditing(true)} type="button"><Pencil aria-hidden="true" size={15} />Modifier</button> : null}</footer>
          </div>
        ) : null}
      </section>
    </div>
  );
}
