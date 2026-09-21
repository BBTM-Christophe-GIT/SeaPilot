import { useRef, useState, type FormEvent } from 'react';
import { CarFront, FilePlus2, MapPin, Paperclip, Plus, ReceiptText, Trash2, UserRound } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppDialog } from '../../components/AppDialog';
import { ExpenseInputError, FUEL_LABELS, formatExpenseMoney, mileageAmount, mileageTotal, validateExpenseFiles, type ExpenseKind, type ExpenseNoteInput, type MileageDetails, type MileageTrip } from './expenseNoteModel';
import { ExpenseVehiclePicker } from './ExpenseVehiclePicker';
import { ExpenseEntrySection } from './ExpenseEntrySection';
import type { ExpensePersonalVehicle } from './expenseVehicleQueries';
import type { ExpenseIdentity, ExpensePerson, ExpenseSettings, ExpenseVessel } from './expenseNoteQueries';

interface Props {
  client: SupabaseClient; previewMode: boolean;
  previewVehicles?: ExpensePersonalVehicle[]; onPreviewVehiclesChange?: (vehicles: ExpensePersonalVehicle[]) => void;
  identity: ExpenseIdentity; vessels: ExpenseVessel[]; functionLabel: string;
  people: ExpensePerson[]; settings: ExpenseSettings; defaultVesselId: number | null;
  onClose: () => void; onSubmit: (input: ExpenseNoteInput, files: File[]) => Promise<void>;
}
const blankTrip = (): MileageTrip => ({ date: new Date().toLocaleDateString('en-CA'), route: '', reason: '', km: 0, amount: 0 });
type SectionKey = 'information' | 'vehicle' | 'trips' | 'expense' | 'extras';

export function ExpenseNoteForm({ client, previewMode, previewVehicles, onPreviewVehiclesChange, identity, vessels, functionLabel, people, settings, defaultVesselId, onClose, onSubmit }: Props) {
  const [id, setId] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState<ExpenseKind>('expense');
  const [vesselId, setVesselId] = useState(defaultVesselId ? String(defaultVesselId) : '');
  const [personId, setPersonId] = useState(() => String(people.find((person) => person.is_current)?.id || 'custom'));
  const [issuerName, setIssuerName] = useState(identity.name);
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({ information: true, vehicle: true, trips: true, expense: true, extras: false });
  const firstInvalid = useRef<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [payment, setPayment] = useState(settings.default_payment_method);
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState<MileageDetails>(() => ({ vehicle: '', fiscalPower: '', fuel: 'diesel', function: functionLabel, period: '', tolls: 0, trips: [blankTrip()] }));
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState('');
  const total = kind === 'mileage' ? mileageTotal(details) : Number(amount);
  const issuer = personId === 'custom' ? issuerName : people.find((person) => person.id === Number(personId))?.name || '';
  const vessel = vessels.find((entry) => entry.id === Number(vesselId))?.name || 'Hors navire';
  const toggle = (section: SectionKey) => setSections((current) => ({ ...current, [section]: !current[section] }));

  function revealInvalid(event: FormEvent<HTMLDivElement>) {
    // Native validation still blocks submission; reveal collapsed fields before focusing.
    event.preventDefault();
    const target = event.target as HTMLInputElement;
    const section = target.closest<HTMLElement>('[data-expense-section]')?.dataset.expenseSection as SectionKey | undefined;
    if (section) setSections((current) => ({ ...current, [section]: true }));
    if (!firstInvalid.current) {
      firstInvalid.current = target;
      setError(target.validationMessage || 'Vérifiez les champs obligatoires.');
      window.requestAnimationFrame(() => { firstInvalid.current?.focus(); firstInvalid.current = null; });
    }
  }
  function changeTrip(index: number, values: Partial<MileageTrip>) {
    setDetails((current) => ({ ...current, trips: current.trips.map((trip, i) => i === index ? { ...trip, ...values } : trip) }));
  }
  function chooseFiles(selected: File[]) {
    try { validateExpenseFiles([...files, ...selected]); setFiles((current) => [...current, ...selected]); setError(''); }
    catch (failure) { setError((failure as Error).message); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!Number.isFinite(total) || total <= 0) {
      setError('Le montant total doit être supérieur à zéro.');
      setSections((current) => ({ ...current, [kind === 'mileage' ? 'trips' : 'expense']: true })); return;
    }
    setError(''); setBusy(true); setAttempted(true);
    try {
      await onSubmit({ id, kind, issuer_person_id: personId === 'custom' ? null : Number(personId), issuer_name: issuer.trim(), vessel_id: vesselId ? Number(vesselId) : null, expense_on: date,
        title: title.trim(), description: description.trim(), payment_method: payment, amount: total,
        mileage: kind === 'mileage' ? details : null, receipt_count: files.length }, files);
    } catch (failure) {
      if (failure instanceof ExpenseInputError) { setAttempted(false); setId(crypto.randomUUID()); }
      setError((failure as Error).message || 'Émission impossible. Réessayez.');
    }
    finally { setBusy(false); }
  }
  return <div className={'expense-entry expense-entry--' + kind} onInvalidCapture={revealInvalid}><AppDialog title="Nouvelle note" eyebrow="Achats · Notes de frais" size="lg" icon={<FilePlus2 size={20} />} isBusy={busy} onClose={onClose} onSubmit={submit}
    footer={<><div className="expense-entry__total"><span>Total de la note</span><output aria-label="Total de la note" aria-live="polite">{formatExpenseMoney(Number.isFinite(total) ? total : 0)}</output></div><div className="expense-entry__actions"><button type="submit" className="expense-button expense-button--primary" disabled={busy}>{busy ? 'Enregistrement…' : attempted ? 'Réessayer l’émission' : 'Émettre la note'}</button><small>Transmission à la comptabilité</small></div></>}>
    <div className="expense-form">
      {error ? <p className="expense-message expense-message--error" role="alert">{error}</p> : null}
      {attempted && !busy ? <p>La saisie est conservée pour réessayer sans créer de doublon. Pour changer les informations, fermez ce formulaire et créez une nouvelle note.</p> : null}
      <fieldset disabled={busy || attempted} className="expense-form__fields">
        <div className="expense-tabs" role="group" aria-label="Type de note">
          <button type="button" aria-pressed={kind === 'expense'} onClick={() => setKind('expense')}>Dépense</button>
          <button type="button" aria-label="Indemnités kilométriques" aria-pressed={kind === 'mileage'} onClick={() => setKind('mileage')}>Kilométrique</button>
        </div>
        <div className="expense-entry__sections">
          <ExpenseEntrySection section="information" title="Informations" icon={<UserRound size={23} />} summary={<>{issuer}<br />{vessel}</>} open={sections.information} onToggle={() => toggle('information')}>
            <div className="expense-form__grid">
              <label>Émetteur<select value={personId} onChange={(event) => setPersonId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}<option value="custom">Autre nom / saisie libre</option></select></label>
              {personId === 'custom' ? <label>Nom de l’émetteur<input required maxLength={150} value={issuerName} onChange={(event) => setIssuerName(event.target.value)} /></label> : null}
              <label>Navire<select value={vesselId} onChange={(event) => setVesselId(event.target.value)}><option value="">Hors navire</option>{vessels.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
            </div>
            <div className="expense-entry__subject"><label>Objet<input required maxLength={200} placeholder={kind === 'mileage' ? 'Ex. Déplacement professionnel' : 'Ex. Fournitures de bord'} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>{kind === 'mileage' ? 'Date de la note' : 'Date de la dépense'}<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
            {kind === 'mileage' ? <div className="expense-form__grid"><label>Fonction<input required maxLength={100} value={details.function} onChange={(e) => setDetails({ ...details, function: e.target.value })} /></label><label>Date ou période<input required maxLength={100} placeholder="Ex. Septembre 2026" value={details.period} onChange={(e) => setDetails({ ...details, period: e.target.value })} /></label></div> : null}
            <p className="expense-hint">Saisie par : {identity.name}</p>
          </ExpenseEntrySection>
          {kind === 'expense' ? <ExpenseEntrySection section="expense" title="Montant et paiement" icon={<ReceiptText size={23} />} summary={payment + ' · ' + formatExpenseMoney(Number(amount) || 0)} open={sections.expense} onToggle={() => toggle('expense')}>
            <div className="expense-form__grid"><label>Mode de paiement<select value={payment} onChange={(event) => setPayment(event.target.value)}>{settings.payment_methods.map((method) => <option key={method}>{method}</option>)}</select></label><label>Montant TTC (€)<input required type="number" min="0.01" max="99999999" step="0.01" inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} /></label></div>
          </ExpenseEntrySection> : <>
            <ExpenseEntrySection section="vehicle" title="Mon véhicule" icon={<CarFront size={23} />} summary={details.vehicle ? details.vehicle + ' · ' + details.fiscalPower + ' · ' + FUEL_LABELS[details.fuel] : 'Choisir ou ajouter un véhicule'} open={sections.vehicle} onToggle={() => toggle('vehicle')}>
              <ExpenseVehiclePicker client={client} previewMode={previewMode} previewVehicles={previewVehicles} onPreviewChange={onPreviewVehiclesChange} value={details} onDefaultLoaded={() => setSections((current) => ({ ...current, vehicle: false }))} onChange={(vehicle) => setDetails((current) => ({ ...current, vehicle: vehicle.vehicle, fiscalPower: vehicle.fiscalPower, fuel: vehicle.fuel, trips: current.fuel === vehicle.fuel ? current.trips : current.trips.map((trip) => ({ ...trip, amount: 0 })) }))} />
            </ExpenseEntrySection>
            <ExpenseEntrySection section="trips" title="Déplacements" icon={<MapPin size={23} />} summary={details.trips.length + ' déplacement(s) · ' + formatExpenseMoney(mileageTotal({ ...details, tolls: 0 }))} open={sections.trips} onToggle={() => toggle('trips')}>
              <div className="expense-entry__trips">{details.trips.map((trip, index) => <fieldset className="expense-entry__trip" key={index}>
                <legend className="expense-sr-only">Trajet {index + 1}</legend>
                <div className="expense-entry__trip-heading"><strong aria-hidden="true">Trajet {index + 1}</strong><label className="expense-entry__trip-date"><span className="expense-sr-only">Date</span><input aria-label={'Date du déplacement ' + (index + 1)} required type="date" value={trip.date} onChange={(e) => changeTrip(index, { date: e.target.value })} /></label></div>
                <label className="expense-entry__trip-route">Trajet<input aria-label={'Trajet ' + (index + 1)} required maxLength={200} value={trip.route} onChange={(e) => changeTrip(index, { route: e.target.value })} placeholder="Départ → Arrivée" /></label>
                <label className="expense-entry__trip-reason">Motif<input aria-label={'Motif ' + (index + 1)} required maxLength={200} value={trip.reason} onChange={(e) => changeTrip(index, { reason: e.target.value })} placeholder="Ex. Réunion de chantier" /></label>
                <label>Distance (km)<input aria-label={'Kilomètres ' + (index + 1)} required type="number" min="1" max="100000" step="1" inputMode="numeric" value={trip.km || ''} onChange={(e) => changeTrip(index, { km: Number(e.target.value) })} /></label>
                {details.fuel === 'electric' ? <label>Montant (€)<input aria-label={'Montant du déplacement ' + (index + 1)} required type="number" min="0.01" max="999999" step="0.01" inputMode="decimal" value={trip.amount || ''} onChange={(e) => changeTrip(index, { amount: Number(e.target.value) })} /></label> : <div className="expense-entry__trip-amount"><span>Montant</span><output aria-label={'Montant du déplacement ' + (index + 1)}>{formatExpenseMoney(mileageAmount(trip.km, details.fuel, trip.amount))}</output></div>}
                {details.trips.length > 1 ? <button className="expense-button expense-entry__remove-trip" type="button" aria-label={'Supprimer le déplacement ' + (index + 1)} onClick={() => setDetails({ ...details, trips: details.trips.filter((_, i) => i !== index) })}><Trash2 size={16} /> Retirer le trajet</button> : null}
              </fieldset>)}</div>
              <button className="expense-button expense-entry__add-trip" type="button" disabled={details.trips.length >= 30} onClick={() => setDetails({ ...details, trips: [...details.trips, blankTrip()] })}><Plus size={19} /> Ajouter un déplacement</button>
              <p className="expense-hint">{details.fuel === 'electric' ? 'Véhicule électrique : montant à saisir par déplacement.' : 'Règle NDF : 0,606 €/km · plafond de 100 € par déplacement.'}</p>
            </ExpenseEntrySection>
          </>}
          <ExpenseEntrySection section="extras" title="Compléments" icon={<Paperclip size={23} />} summary={(kind === 'mileage' ? 'Péages ' + formatExpenseMoney(details.tolls) + ' · ' : '') + files.length + ' justificatif(s)' + (description ? ' · Description' : '')} open={sections.extras} onToggle={() => toggle('extras')}>
            {kind === 'mileage' ? <label>Péages (€)<input aria-label="Montant total des péages (€)" required type="number" min="0" max="999999" step="0.01" inputMode="decimal" value={details.tolls} onChange={(e) => setDetails({ ...details, tolls: Number(e.target.value) })} /></label> : null}
            <label>Description<textarea rows={2} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Facultative · Précisez la nature de la dépense si nécessaire." /></label>
            <section className="expense-files" aria-label="Justificatifs"><h4>Justificatifs{files.length ? ' (' + files.length + '/20)' : ''}</h4>
              <input ref={fileInput} hidden aria-label="Justificatifs" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { chooseFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
              <button className="expense-button" type="button" onClick={() => fileInput.current?.click()}><Paperclip size={18} /> Ajouter des fichiers</button>
              <p className="expense-hint">JPG, PNG, WebP, PDF · 20 fichiers maximum</p>
              {files.map((file, index) => <div className="expense-file" key={index + '-' + file.name}><span>{file.name}</span><button className="expense-button" type="button" aria-label={'Retirer ' + file.name} onClick={() => setFiles(files.filter((_, i) => i !== index))}><Trash2 size={16} /></button></div>)}
            </section>
            <p className="expense-hint">La note et ses justificatifs sont transmis à la comptabilité. Après émission, la note ne peut plus être modifiée.</p>
          </ExpenseEntrySection>
        </div>
      </fieldset>
    </div>
  </AppDialog></div>;
}
