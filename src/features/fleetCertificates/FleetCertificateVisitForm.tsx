import {
  CalendarDays, CalendarPlus, Download, Mail, MapPin, Phone, Plus, Search, Trash2, X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { formatProjectPort, PROJECT_PORT_GROUPS } from '../projects/projectPorts';
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
  scheduledStart: string;
  scheduledEnd: string;
}

function defaultDateTime(hour: number): string {
  const value = new Date();
  value.setDate(value.getDate() + 7);
  value.setHours(hour, 0, 0, 0);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function makeAssignment(provider?: FleetServiceProvider): AssignmentState {
  return {
    key: crypto.randomUUID(),
    providerId: provider ? String(provider.id) : '',
    specialtyId: provider?.specialties[0] ? String(provider.specialties[0].id) : '',
    contactId: provider?.contacts[0] ? String(provider.contacts[0].id) : '',
    scheduledStart: defaultDateTime(9),
    scheduledEnd: defaultDateTime(11),
  };
}

function dayKey(value: string): string {
  return value.slice(0, 10);
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value: string): string {
  return value.slice(11, 16).replace(':', ' h ');
}

export function FleetCertificateVisitForm({
  certificate,
  providers,
  onClose,
  onExport,
  onSave,
}: {
  certificate: FleetCertificateRecord;
  providers: FleetServiceProvider[];
  onClose: () => void;
  onExport: (input: SaveFleetCertificateVisitInput, reportDate: string, includeSubjects: boolean) => Promise<void>;
  onSave: (input: SaveFleetCertificateVisitInput) => Promise<void>;
}) {
  const [location, setLocation] = useState(certificate.visitLocation);
  const [portSearch, setPortSearch] = useState(certificate.visitLocation);
  const [portsOpen, setPortsOpen] = useState(false);
  const [purpose, setPurpose] = useState(`Visite ${certificate.documentTitle}`);
  const [notes, setNotes] = useState('');
  const [assignments, setAssignments] = useState<AssignmentState[]>(() => [makeAssignment(providers[0])]);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [includeSubjects, setIncludeSubjects] = useState(true);
  const [reportDate, setReportDate] = useState(() => dayKey(defaultDateTime(9)));
  const [error, setError] = useState('');

  const providerById = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers]);
  const matchingPortGroups = useMemo(() => {
    const query = portSearch.trim().toLocaleLowerCase('fr');
    if (!query) return PROJECT_PORT_GROUPS;
    return PROJECT_PORT_GROUPS.map((group) => ({
      ...group,
      ports: group.ports.filter((port) => (
        `${group.department} ${formatProjectPort(port)}`.toLocaleLowerCase('fr').includes(query)
      )),
    })).filter((group) => group.ports.length);
  }, [portSearch]);
  const agendaDays = useMemo(() => {
    const days = new Map<string, AssignmentState[]>();
    assignments.forEach((assignment) => {
      if (!assignment.scheduledStart) return;
      const key = dayKey(assignment.scheduledStart);
      const items = days.get(key) || [];
      items.push(assignment);
      days.set(key, items);
    });
    return Array.from(days, ([date, items]) => ({
      date,
      items: items.slice().sort((left, right) => left.scheduledStart.localeCompare(right.scheduledStart)),
    })).sort((left, right) => left.date.localeCompare(right.date));
  }, [assignments]);

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

  function buildInput(): SaveFleetCertificateVisitInput {
    const starts = assignments.map((assignment) => assignment.scheduledStart).filter(Boolean).sort();
    const ends = assignments.map((assignment) => assignment.scheduledEnd).filter(Boolean).sort();
    return {
      certificateId: certificate.id,
      scheduledStart: starts[0] || '',
      scheduledEnd: ends.at(-1) || '',
      location,
      purpose,
      notes,
      assignments: assignments.map((assignment) => ({
        providerId: Number(assignment.providerId),
        specialtyId: Number(assignment.specialtyId),
        contactId: Number(assignment.contactId) || null,
        scheduledStart: assignment.scheduledStart,
        scheduledEnd: assignment.scheduledEnd,
      })),
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(buildInput());
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de programmer la visite.');
    } finally {
      setSaving(false);
    }
  }

  async function exportReport() {
    setExporting(true);
    setError('');
    try {
      await onExport(buildInput(), reportDate, includeSubjects);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de générer le planning.');
    } finally {
      setExporting(false);
    }
  }

  return <div className="fcx-visit-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section aria-modal="true" className="fcx-visit-dialog" role="dialog" aria-label="Programmer une visite prestataire">
      <header><div><small>Certificats flotte</small><h2>Programmer une visite</h2></div><button aria-label="Fermer" onClick={onClose}><X size={20} /></button></header>
      <form onSubmit={submit}>
        <section className="fcx-visit-step">
          <div className="fcx-dialog-section-title"><span>1</span><div><h3>Visite</h3><p>Confirmez le document, le lieu et l’objet de l’intervention.</p></div></div>
          <div className="fcx-visit-context"><CalendarPlus size={19} /><span><b>{certificate.documentTitle}</b><small>{certificate.vesselName} · {certificate.categoryLabel}</small></span></div>
          {error && <p className="fcx-visit-error" role="alert">{error}</p>}
          <div className="fcx-visit-main-fields">
            <label>Lieu de visite<div className="fcx-port-combobox"><div className="fcx-input-icon"><MapPin size={16} /><input aria-autocomplete="list" aria-controls="fleet-visit-port-list" aria-expanded={portsOpen} autoComplete="off" maxLength={250} placeholder="Rechercher un port, un département ou un LOCODE…" role="combobox" value={portSearch} onBlur={() => setPortsOpen(false)} onChange={(event) => { setPortSearch(event.target.value); setLocation(event.target.value); setPortsOpen(true); }} onFocus={() => setPortsOpen(true)} /></div>{portsOpen && <div className="fcx-port-results" id="fleet-visit-port-list" role="listbox"><div><Search size={14} /> Ports classés par département</div>{matchingPortGroups.map((group) => <section key={group.department}><h3>{group.department}</h3>{group.ports.map((port) => { const label = formatProjectPort(port); return <button key={`${port.port}-${port.locode}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setLocation(label); setPortSearch(label); setPortsOpen(false); }} role="option" type="button"><b>{port.port}</b><small>{port.municipality || port.locode.replace(/^([A-Z]{2})([A-Z0-9]{3})$/, '$1 $2')}</small></button>; })}</section>)}{!matchingPortGroups.length && <p>Aucun port ne correspond à cette recherche.</p>}</div>}</div></label>
            <label>Objet<input maxLength={250} required value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label>
          </div>
        </section>

        <div className="fcx-dialog-section-title"><span>2</span><div><h3>Prestataires et créneaux</h3><p>Ajoutez les intervenants, leurs spécialités et les horaires associés.</p></div></div>
        <fieldset className="fcx-visit-providers"><legend>Prestataires et créneaux d’intervention</legend>
          {assignments.map((assignment, index) => {
            const provider = providerById.get(Number(assignment.providerId));
            const contact = provider?.contacts.find((item) => item.id === Number(assignment.contactId));
            return <div className="fcx-visit-provider" key={assignment.key}>
              <div className="fcx-visit-provider-title"><b>Prestataire {index + 1}</b>{assignments.length > 1 && <button aria-label={`Retirer le prestataire ${index + 1}`} onClick={() => setAssignments((current) => current.filter((item) => item.key !== assignment.key))} type="button"><Trash2 size={14} /></button>}</div>
              <div className="fcx-form-grid"><label>Prestataire<select required value={assignment.providerId} onChange={(event) => changeProvider(assignment.key, event.target.value)}><option value="">Choisir…</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Spécialité<select required value={assignment.specialtyId} onChange={(event) => patchAssignment(assignment.key, { specialtyId: event.target.value })}><option value="">Choisir…</option>{provider?.specialties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
              <div className="fcx-form-grid"><label>Début de l’intervention<input required type="datetime-local" value={assignment.scheduledStart} onChange={(event) => { patchAssignment(assignment.key, { scheduledStart: event.target.value }); setReportDate(dayKey(event.target.value)); }} /></label><label>Fin de l’intervention<input required min={assignment.scheduledStart} type="datetime-local" value={assignment.scheduledEnd} onChange={(event) => patchAssignment(assignment.key, { scheduledEnd: event.target.value })} /></label></div>
              <label>Contact<select value={assignment.contactId} onChange={(event) => patchAssignment(assignment.key, { contactId: event.target.value })}><option value="">Contact général</option>{provider?.contacts.map((item) => <option key={item.id} value={item.id}>{item.name}{item.role ? ` · ${item.role}` : ''}</option>)}</select></label>
              {provider && <div className="fcx-provider-details"><span><MapPin size={13} />{[provider.address, provider.city].filter(Boolean).join(', ') || 'Adresse non renseignée'}</span>{contact?.email || provider.email ? <a href={`mailto:${contact?.email || provider.email}`}><Mail size={13} />{contact?.email || provider.email}</a> : null}{contact?.phone || provider.phone ? <a href={`tel:${contact?.phone || provider.phone}`}><Phone size={13} />{contact?.phone || provider.phone}</a> : null}</div>}
            </div>;
          })}
          <button className="fcx-add-provider" disabled={assignments.length >= 10 || !providers.length} onClick={() => setAssignments((current) => [...current, makeAssignment()])} type="button"><Plus size={15} /> Ajouter un prestataire</button>
        </fieldset>

        <div className="fcx-dialog-section-title"><span>3</span><div><h3>Planning et documents</h3><p>Vérifiez l’agenda puis préparez, si nécessaire, le document d’intervention.</p></div></div>
        <section className="fcx-daily-agenda"><header><div><CalendarDays size={18} /><span><b>Planning des journées</b><small>Les interventions simultanées sont affichées côte à côte.</small></span></div></header>{agendaDays.map((day) => <article key={day.date}><h3>{formatDay(day.date)}</h3><div>{day.items.map((assignment) => { const provider = providerById.get(Number(assignment.providerId)); const specialty = provider?.specialties.find((item) => item.id === Number(assignment.specialtyId)); return <section key={assignment.key}><time>{formatTime(assignment.scheduledStart)}<small>{formatTime(assignment.scheduledEnd)}</small></time><span><b>{provider?.name || 'Prestataire à choisir'}</b><small>{specialty?.name || 'Spécialité à choisir'}</small></span></section>; })}</div></article>)}</section>

        <label>Notes<textarea maxLength={2000} placeholder="Informations complémentaires…" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <section className="fcx-visit-export"><div><label>Journée à exporter<select value={reportDate} onChange={(event) => setReportDate(event.target.value)}>{agendaDays.map((day) => <option key={day.date} value={day.date}>{formatDay(day.date)}</option>)}</select></label><label className="fcx-report-subjects"><input checked={includeSubjects} onChange={(event) => setIncludeSubjects(event.target.checked)} type="checkbox" /> Inclure les sujets, constats, suivis et photos</label></div><button disabled={exporting || !agendaDays.length} onClick={exportReport} type="button"><Download size={16} />{exporting ? 'Génération…' : 'Exporter le PDF'}</button></section>
        <footer><button onClick={onClose} type="button">Annuler</button><button className="fcx-primary" disabled={saving || !providers.length} type="submit">{saving ? 'Enregistrement…' : 'Enregistrer la visite'}</button></footer>
      </form>
    </section>
  </div>;
}
