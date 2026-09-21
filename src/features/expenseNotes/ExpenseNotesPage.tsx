import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CarFront, Download, FilePlus2, Mail, ReceiptText, RefreshCw, Settings, Ship, Users } from 'lucide-react';
import { ModuleRibbon, ModuleRibbonCommand, ModuleRibbonGroup } from '../../components/ModuleRibbon';
import type { AppShellOutletContext } from '../shell/AppShell';
import { ExpenseNoteForm } from './ExpenseNoteForm';
import { canViewAllExpenseNotes, DELIVERY_LABELS, expenseIssuerKey, formatExpenseMoney, groupExpenseNotes, PAYMENT_METHODS, type ExpenseNote, type ExpenseNoteInput } from './expenseNoteModel';
import { downloadExpenseNote, fetchExpenseIdentity, fetchExpenseNotes, fetchExpensePeople, fetchExpenseSettings, fetchExpenseVessels, saveExpenseSettings, submitExpenseNote, transmitExpenseNote, type ExpenseIdentity, type ExpensePerson, type ExpenseSettings, type ExpenseVessel } from './expenseNoteQueries';
import { fetchCurrentAssignedVessel } from '../purchaseRequests/purchaseRequestQueries';
import { ExpenseNoteSettings } from './ExpenseNoteSettings';
import { ExpenseVehiclesDialog } from './ExpenseVehiclesDialog';
import { PREVIEW_VEHICLES } from './expenseVehicleQueries';
import { EXPENSE_NOTE_PREVIEW } from './expenseNotePreview';
import './expenseNotes.css';

export function ExpenseNotesPage() {
  const context = useOutletContext<AppShellOutletContext>();
  const { client, previewMode, roles } = context;
  const allNotes = canViewAllExpenseNotes(roles);
  const [notes, setNotes] = useState<ExpenseNote[]>([]);
  const [identity, setIdentity] = useState<ExpenseIdentity | null>(null);
  const [vessels, setVessels] = useState<ExpenseVessel[]>([]);
  const [directory, setDirectory] = useState<ExpensePerson[]>([]);
  const [settings, setSettings] = useState<ExpenseSettings>({ company_id: 1, payment_methods: PAYMENT_METHODS, default_payment_method: 'CB-Perso' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  const [previewVehicles, setPreviewVehicles] = useState(PREVIEW_VEHICLES);
  const [defaultVesselId, setDefaultVesselId] = useState<number | null>(null);
  const currentPersonId = context.currentPerson?.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [vesselFilter, setVesselFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError('');
      try {
        if (previewMode) {
          setNotes(EXPENSE_NOTE_PREVIEW); setIdentity({ id: 'demo-1', name: 'Camille Martin' });
          setVessels([{ id: 1, name: 'GOURY' }, { id: 2, name: 'SUROIT' }]);
          setDirectory([{ id: 1, name: 'Camille Martin', is_current: true }, { id: 2, name: 'Alex Bernard', is_current: false }, { id: 3, name: 'Louise Robert', is_current: false }]); setDefaultVesselId(1);
        } else {
          const [history, person, fleet, peopleDirectory, preferences, assignment] = await Promise.all([fetchExpenseNotes(client), fetchExpenseIdentity(client), fetchExpenseVessels(client), fetchExpensePeople(client), fetchExpenseSettings(client), currentPersonId ? fetchCurrentAssignedVessel(client, currentPersonId).catch(() => null) : Promise.resolve(null)]);
          if (active) { setNotes(history); setIdentity(person); setVessels(fleet); setDirectory(peopleDirectory); setSettings(preferences); setDefaultVesselId(assignment?.id || null); }
        }
      } catch (failure) { if (active) { setNotes([]); setError((failure as Error).message || 'Chargement des notes impossible.'); } }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [client, previewMode, revision, currentPersonId]);

  const scopedNotes = useMemo(() => allNotes ? notes : notes.filter((note) => note.created_by === identity?.id), [allNotes, notes, identity]);
  const people = useMemo(() => {
    const employedIds = new Set(directory.map((person) => person.id));
    return [...new Map(scopedNotes
      .filter((note) => note.issuer_person_id !== null && employedIds.has(note.issuer_person_id))
      .map((note) => [expenseIssuerKey(note), note.issuer_name])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [scopedNotes, directory]);
  const activePersonFilter = people.some(([id]) => id === personFilter) ? personFilter : 'all';
  const filterVessels = useMemo(() => [...new Map(scopedNotes.map((note) => [String(note.vessel_id ?? 'none'), note.vessel_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr')), [scopedNotes]);
  const filtered = useMemo(() => scopedNotes.filter((note) => (vesselFilter === 'all' || String(note.vessel_id ?? 'none') === vesselFilter)
    && (!allNotes || activePersonFilter === 'all' || expenseIssuerKey(note) === activePersonFilter)
    && `${note.title} ${note.description} ${note.issuer_name} ${note.vessel_name}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'))), [scopedNotes, vesselFilter, allNotes, activePersonFilter, search]);
  const groups = useMemo(() => groupExpenseNotes(filtered), [filtered]);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);

  async function submit(input: ExpenseNoteInput, files: File[]) {
    if (previewMode) throw new Error('Cette préversion ne peut pas émettre de note.');
    const note = await submitExpenseNote(client, input, files);
    setCreating(false);
    setVesselFilter('all'); setPersonFilter('all'); setSearch('');
    setNotes((current) => [note, ...current.filter((item) => item.id !== note.id)]);
    setMessage('Note émise et enregistrée dans votre historique.');
    setBusyId(note.id);
    try { setMessage(await transmitExpenseNote(client, note.id)); }
    catch (failure) { setError((failure as Error).message); }
    finally {
      setBusyId('');
      // A refresh failure must never turn successful issuance into a second submission.
      try { setNotes(await fetchExpenseNotes(client)); } catch { /* Keep the confirmed issued note visible. */ }
    }
  }
  async function action(note: ExpenseNote, type: 'pdf' | 'send') {
    setError(''); setMessage(''); setBusyId(note.id);
    try {
      if (previewMode) { setMessage('Les documents de démonstration ne sont pas transmis.'); return; }
      if (type === 'pdf') await downloadExpenseNote(client, note);
      else { setMessage(await transmitExpenseNote(client, note.id)); setNotes(await fetchExpenseNotes(client)); }
    } catch (failure) { setError((failure as Error).message || 'Action impossible.'); }
    finally { setBusyId(''); }
  }
  return <section className="expense-page">
    <ModuleRibbon ariaLabel="Actions des notes de frais"><ModuleRibbonGroup label="Notes de frais">
      <ModuleRibbonCommand icon={<FilePlus2 />} label="Nouvelle note" disabled={loading || !identity || !!busyId} onClick={() => { setError(''); setMessage(''); setCreating(true); }} />
      <ModuleRibbonCommand icon={<CarFront />} label="Mes véhicules" disabled={loading || !identity || !!busyId} onClick={() => setVehiclesOpen(true)} />
      <ModuleRibbonCommand icon={<RefreshCw />} label="Actualiser" disabled={loading || !!busyId} onClick={refresh} />
      {roles.includes('admin') ? <ModuleRibbonCommand icon={<Settings />} label="Paramétrage" disabled={loading} onClick={() => setSettingsOpen(true)} /> : null}
    </ModuleRibbonGroup></ModuleRibbon>
    <header className="expense-header"><div><p className="expense-eyebrow">ACHATS · NDF</p><h1>Notes de frais</h1><p>{allNotes ? 'Toutes les notes émises, classées par navire et par émetteur.' : 'Retrouvez vos dépenses et indemnités kilométriques émises.'}</p></div><span className="expense-scope">{allNotes ? <Users size={16} /> : <ReceiptText size={16} />}{allNotes ? 'Vue de la société' : 'Mes notes'}</span></header>
    {previewMode ? <p className="expense-message" role="status">Données de démonstration · aucun envoi ni enregistrement réel.</p> : null}
    {error ? <p className="expense-message expense-message--error" role="alert">{error}</p> : null}
    {message ? <p className="expense-message" role="status">{message}</p> : null}
    <div className="expense-stats"><div><span>Notes affichées</span><strong>{filtered.length}</strong></div><div><span>Montant total</span><strong>{formatExpenseMoney(filtered.reduce((sum, note) => sum + Number(note.amount), 0))}</strong></div><div><span>À transmettre / vérifier</span><strong>{filtered.filter((note) => note.delivery_status !== 'sent').length}</strong></div></div>
    <div className="expense-filters"><label>Navire<select value={vesselFilter} onChange={(e) => setVesselFilter(e.target.value)}><option value="all">Tous les navires</option>{filterVessels.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      {allNotes ? <label>Émetteur<select value={activePersonFilter} onChange={(e) => setPersonFilter(e.target.value)}><option value="all">Toutes les personnes</option>{people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label> : null}
      <label className="expense-search">Rechercher<input type="search" placeholder="Objet, navire, émetteur…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <button className="expense-button" onClick={() => { setVesselFilter('all'); setPersonFilter('all'); setSearch(''); }}>Réinitialiser</button>
    </div>
    {loading ? <div className="expense-empty" role="status">Chargement des notes…</div> : groups.length ? <div className="expense-groups">{groups.map((vessel) => <section className="expense-vessel" key={vessel.key} aria-label={`Notes — ${vessel.name}`}>
      <header><Ship size={19} /><h2>{vessel.name}</h2><span>{vessel.issuers.reduce((count, person) => count + person.notes.length, 0)} note(s)</span></header>
      {vessel.issuers.map((person) => <section className="expense-person" key={person.id}><h3><Users size={15} />{person.name}</h3><div className="expense-table-scroll"><table><thead><tr><th>Date</th><th>Objet / type</th><th>Montant</th><th>Comptabilité</th><th><span className="expense-sr-only">Actions</span></th></tr></thead><tbody>{person.notes.map((note) => <tr key={note.id}>
        <td>{new Date(`${note.expense_on}T12:00:00`).toLocaleDateString('fr-FR')}</td><td><strong>{note.title}</strong><small>{note.kind === 'mileage' ? 'Indemnités kilométriques' : note.payment_method} · {note.receipt_count} justificatif(s)</small></td><td className="expense-amount">{formatExpenseMoney(Number(note.amount))}</td><td><span className={`expense-status expense-status--${note.delivery_status}`}>{DELIVERY_LABELS[note.delivery_status]}</span>{note.delivery_status === 'unknown' ? <small>Vérifiez la réception avant tout nouvel envoi.</small> : null}</td>
        <td><div className="expense-row-actions"><button className="expense-button" disabled={!!busyId} aria-label={`Télécharger le PDF : ${note.title}`} onClick={() => void action(note, 'pdf')}><Download size={16} /> PDF</button>{['pending', 'failed'].includes(note.delivery_status) ? <button className="expense-button" disabled={!!busyId} aria-label={`Transmettre : ${note.title}`} onClick={() => void action(note, 'send')}><Mail size={16} /> Transmettre</button> : null}</div></td>
      </tr>)}</tbody></table></div></section>)}
    </section>)}</div> : <div className="expense-empty"><ReceiptText size={36} /><h2>{scopedNotes.length ? 'Aucune note pour ces filtres' : 'Aucune note émise'}</h2><p>{scopedNotes.length ? 'Modifiez vos filtres pour retrouver vos notes.' : 'Créez une première note pour enregistrer une dépense ou un déplacement.'}</p></div>}
    {creating && identity ? <ExpenseNoteForm client={client} previewMode={previewMode} previewVehicles={previewVehicles} onPreviewVehiclesChange={setPreviewVehicles} identity={identity} vessels={vessels} people={directory} settings={settings} defaultVesselId={defaultVesselId} functionLabel={context.currentPerson?.functionLabel || ''} onClose={() => setCreating(false)} onSubmit={submit} /> : null}
    {vehiclesOpen ? <ExpenseVehiclesDialog client={client} previewMode={previewMode} previewVehicles={previewVehicles} onPreviewChange={setPreviewVehicles} onClose={() => setVehiclesOpen(false)} /> : null}
    {settingsOpen ? <ExpenseNoteSettings initial={settings} onClose={() => setSettingsOpen(false)} onSave={async (next) => { if (previewMode) throw new Error('Les paramètres ne peuvent pas être enregistrés en démonstration.'); await saveExpenseSettings(client, next); setSettings(next); setMessage('Paramètres enregistrés.'); }} /> : null}
  </section>;
}
