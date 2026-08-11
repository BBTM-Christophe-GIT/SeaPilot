import { CalendarPlus, Mail, MapPin, Phone, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { FleetCertificateRecord } from './fleetCertificateQueries';
import type {
  FleetServiceProvider,
  SaveFleetCertificateVisitInput,
} from './fleetCertificateVisits';

interface AssignmentState {
  key: string;
  providerId: string;
  specialtyId: string;
  contactId: string;
}

function defaultDateTime(offsetDays: number): string {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  value.setHours(9, 0, 0, 0);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function makeAssignment(provider?: FleetServiceProvider): AssignmentState {
  return {
    key: crypto.randomUUID(),
    providerId: provider ? String(provider.id) : '',
    specialtyId: provider?.specialties[0] ? String(provider.specialties[0].id) : '',
    contactId: provider?.contacts[0] ? String(provider.contacts[0].id) : '',
  };
}

export function FleetCertificateVisitForm({
  certificate,
  providers,
  onClose,
  onSave,
}: {
  certificate: FleetCertificateRecord;
  providers: FleetServiceProvider[];
  onClose: () => void;
  onSave: (input: SaveFleetCertificateVisitInput) => Promise<void>;
}) {
  const [scheduledStart, setScheduledStart] = useState(() => defaultDateTime(7));
  const [scheduledEnd, setScheduledEnd] = useState(() => defaultDateTime(7).replace('09:00', '11:00'));
  const [location, setLocation] = useState(certificate.visitLocation);
  const [purpose, setPurpose] = useState(`Visite ${certificate.documentTitle}`);
  const [notes, setNotes] = useState('');
  const [assignments, setAssignments] = useState<AssignmentState[]>(() => [makeAssignment(providers[0])]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const providerById = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers]);

  function changeProvider(key: string, providerId: string) {
    const provider = providerById.get(Number(providerId));
    setAssignments((current) => current.map((assignment) => assignment.key === key ? {
      ...assignment,
      providerId,
      specialtyId: provider?.specialties[0] ? String(provider.specialties[0].id) : '',
      contactId: provider?.contacts[0] ? String(provider.contacts[0].id) : '',
    } : assignment));
  }

  function patchAssignment(key: string, patch: Partial<AssignmentState>) {
    setAssignments((current) => current.map((assignment) => (
      assignment.key === key ? { ...assignment, ...patch } : assignment
    )));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        certificateId: certificate.id,
        scheduledStart,
        scheduledEnd,
        location,
        purpose,
        notes,
        assignments: assignments.map((assignment) => ({
          providerId: Number(assignment.providerId),
          specialtyId: Number(assignment.specialtyId),
          contactId: Number(assignment.contactId) || null,
        })),
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de programmer la visite.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="fcx-visit-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section aria-modal="true" className="fcx-visit-drawer" role="dialog" aria-label="Programmer une visite prestataire">
      <header><div><small>Certificats flotte</small><h2>Programmer une visite</h2></div><button aria-label="Fermer" onClick={onClose}><X size={19} /></button></header>
      <form onSubmit={submit}>
        <div className="fcx-visit-context"><CalendarPlus size={18} /><span><b>{certificate.documentTitle}</b><small>{certificate.vesselName} · {certificate.categoryLabel}</small></span></div>
        {error && <p className="fcx-visit-error" role="alert">{error}</p>}
        <div className="fcx-form-grid"><label>Début<input required type="datetime-local" value={scheduledStart} onChange={(event) => setScheduledStart(event.target.value)} /></label><label>Fin<input type="datetime-local" value={scheduledEnd} onChange={(event) => setScheduledEnd(event.target.value)} /></label></div>
        <label>Lieu de visite<div className="fcx-input-icon"><MapPin size={15} /><input maxLength={250} placeholder="Ex. Port du Havre" value={location} onChange={(event) => setLocation(event.target.value)} /></div></label>
        <label>Objet<input maxLength={250} required value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label>

        <fieldset className="fcx-visit-providers"><legend>Prestataires</legend>
          {assignments.map((assignment, index) => {
            const provider = providerById.get(Number(assignment.providerId));
            const contact = provider?.contacts.find((item) => item.id === Number(assignment.contactId));
            return <div className="fcx-visit-provider" key={assignment.key}>
              <div className="fcx-visit-provider-title"><b>Prestataire {index + 1}</b>{assignments.length > 1 && <button aria-label={`Retirer le prestataire ${index + 1}`} onClick={() => setAssignments((current) => current.filter((item) => item.key !== assignment.key))} type="button"><Trash2 size={14} /></button>}</div>
              <div className="fcx-form-grid"><label>Prestataire<select required value={assignment.providerId} onChange={(event) => changeProvider(assignment.key, event.target.value)}><option value="">Choisir…</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Spécialité<select required value={assignment.specialtyId} onChange={(event) => patchAssignment(assignment.key, { specialtyId: event.target.value })}><option value="">Choisir…</option>{provider?.specialties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
              <label>Contact<select value={assignment.contactId} onChange={(event) => patchAssignment(assignment.key, { contactId: event.target.value })}><option value="">Contact général</option>{provider?.contacts.map((item) => <option key={item.id} value={item.id}>{item.name}{item.role ? ` · ${item.role}` : ''}</option>)}</select></label>
              {provider && <div className="fcx-provider-details"><span><MapPin size={13} />{[provider.address, provider.city].filter(Boolean).join(', ') || 'Adresse non renseignée'}</span>{contact?.email || provider.email ? <a href={`mailto:${contact?.email || provider.email}`}><Mail size={13} />{contact?.email || provider.email}</a> : null}{contact?.phone || provider.phone ? <a href={`tel:${contact?.phone || provider.phone}`}><Phone size={13} />{contact?.phone || provider.phone}</a> : null}</div>}
            </div>;
          })}
          <button className="fcx-add-provider" disabled={assignments.length >= 10 || !providers.length} onClick={() => setAssignments((current) => [...current, makeAssignment()])} type="button"><Plus size={15} /> Ajouter un prestataire</button>
        </fieldset>
        <label>Notes<textarea maxLength={2000} placeholder="Informations complémentaires…" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <footer><button onClick={onClose} type="button">Annuler</button><button className="fcx-primary" disabled={saving || !providers.length} type="submit">{saving ? 'Enregistrement…' : 'Enregistrer la visite'}</button></footer>
      </form>
    </section>
  </div>;
}
