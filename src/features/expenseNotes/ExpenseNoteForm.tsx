import { useState, type FormEvent } from 'react';
import { FilePlus2, Plus, Trash2 } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { ExpenseInputError, FUEL_LABELS, formatExpenseMoney, mileageAmount, mileageTotal, validateExpenseFiles, type ExpenseKind, type ExpenseNoteInput, type Fuel, type MileageDetails, type MileageTrip } from './expenseNoteModel';
import type { ExpenseIdentity, ExpensePerson, ExpenseSettings, ExpenseVessel } from './expenseNoteQueries';

interface Props {
  identity: ExpenseIdentity; vessels: ExpenseVessel[]; functionLabel: string;
  people: ExpensePerson[]; settings: ExpenseSettings; defaultVesselId: number | null;
  onClose: () => void; onSubmit: (input: ExpenseNoteInput, files: File[]) => Promise<void>;
}
const blankTrip = (): MileageTrip => ({ date: new Date().toLocaleDateString('en-CA'), route: '', reason: '', km: 0, amount: 0 });

export function ExpenseNoteForm({ identity, vessels, functionLabel, people, settings, defaultVesselId, onClose, onSubmit }: Props) {
  const [id, setId] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState<ExpenseKind>('expense');
  const [vesselId, setVesselId] = useState(defaultVesselId ? String(defaultVesselId) : '');
  const [personId, setPersonId] = useState(() => String(people.find((person) => person.is_current)?.id || 'custom'));
  const [issuerName, setIssuerName] = useState(identity.name);
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [payment, setPayment] = useState(settings.default_payment_method);
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState<MileageDetails>(() => ({ vehicle: '', fiscalPower: '', fuel: 'diesel', function: functionLabel, period: '', tolls: 0, trips: [blankTrip()] }));
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState('');
  const total = kind === 'mileage' ? mileageTotal(details) : Number(amount);

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
    if (!Number.isFinite(total) || total <= 0) { setError('Le montant total doit être supérieur à zéro.'); return; }
    setError(''); setBusy(true); setAttempted(true);
    try {
      await onSubmit({ id, kind, issuer_person_id: personId === 'custom' ? null : Number(personId), issuer_name: personId === 'custom' ? issuerName.trim() : people.find((person) => person.id === Number(personId))!.name, vessel_id: vesselId ? Number(vesselId) : null, expense_on: date,
        title: title.trim(), description: description.trim(), payment_method: payment, amount: total,
        mileage: kind === 'mileage' ? details : null, receipt_count: files.length }, files);
    } catch (failure) {
      if (failure instanceof ExpenseInputError) { setAttempted(false); setId(crypto.randomUUID()); }
      setError((failure as Error).message || 'Émission impossible. Réessayez.');
    }
    finally { setBusy(false); }
  }
  return <AppDialog title="Nouvelle note de frais" eyebrow="Achats" size="xl" icon={<FilePlus2 size={20} />} isBusy={busy} onClose={onClose} onSubmit={submit}
    footer={<><button type="button" className="expense-button" disabled={busy} onClick={onClose}>Fermer</button><button type="submit" className="expense-button expense-button--primary" disabled={busy}>{busy ? 'Enregistrement…' : attempted ? 'Réessayer l’émission' : 'Émettre la note'}</button></>}>
    <div className="expense-form">
      <p className="expense-form__identity">Saisie par : <strong>{identity.name}</strong></p>
      {error ? <p className="expense-message expense-message--error" role="alert">{error}</p> : null}
      {attempted && !busy ? <p>La saisie est conservée pour réessayer sans créer de doublon. Pour changer les informations, fermez ce formulaire et créez une nouvelle note.</p> : null}
      <fieldset disabled={busy || attempted} className="expense-form__fields">
        <div className="expense-tabs" role="group" aria-label="Type de note">
          <button type="button" aria-pressed={kind === 'expense'} onClick={() => setKind('expense')}>Dépense</button>
          <button type="button" aria-pressed={kind === 'mileage'} onClick={() => setKind('mileage')}>Indemnités kilométriques</button>
        </div>
        <div className="expense-form__grid">
          <label>Émetteur<select value={personId} onChange={(event) => setPersonId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}<option value="custom">Autre nom / saisie libre</option></select></label>
          {personId === 'custom' ? <label>Nom de l’émetteur<input required maxLength={150} value={issuerName} onChange={(event) => setIssuerName(event.target.value)} /></label> : null}
          <label>Navire<select value={vesselId} onChange={(event) => setVesselId(event.target.value)}><option value="">Hors navire</option>{vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label>
          <label>Date de la dépense<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label className="expense-form__wide">Objet<input required maxLength={200} placeholder="Ex. Fournitures de bord, déplacement à Cherbourg…" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          {kind === 'expense' ? <><label>Mode de paiement<select value={payment} onChange={(event) => setPayment(event.target.value)}>{settings.payment_methods.map((method) => <option key={method}>{method}</option>)}</select></label>
            <label>Montant TTC (€)<input required type="number" min="0.01" max="99999999" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label></> : null}
          <label className="expense-form__wide">Description<textarea rows={3} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Précisez la nature de la dépense si le justificatif n’est pas explicite." /></label>
        </div>
        {kind === 'mileage' ? <section aria-label="Indemnités kilométriques" className="expense-mileage">
          <div className="expense-form__grid">
            <label>Fonction<input required maxLength={100} value={details.function} onChange={(e) => setDetails({ ...details, function: e.target.value })} /></label>
            <label>Date ou période<input required maxLength={100} value={details.period} onChange={(e) => setDetails({ ...details, period: e.target.value })} /></label>
            <label>Marque / modèle du véhicule<input required maxLength={150} value={details.vehicle} onChange={(e) => setDetails({ ...details, vehicle: e.target.value })} /></label>
            <label>Puissance fiscale<input required maxLength={30} value={details.fiscalPower} onChange={(e) => setDetails({ ...details, fiscalPower: e.target.value })} /></label>
            <label>Carburant<select value={details.fuel} onChange={(e) => setDetails({ ...details, fuel: e.target.value as Fuel, trips: details.trips.map((trip) => ({ ...trip, amount: 0 })) })}>{Object.entries(FUEL_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </div>
          <p className="expense-hint">Règle NDF actuelle : 0,606 €/km, plafonné à 100 € par déplacement. Pour un véhicule électrique, renseignez le montant manuellement.</p>
          {details.trips.map((trip, index) => <fieldset className="expense-trip" key={index}>
            <legend>Déplacement {index + 1}</legend><div className="expense-form__grid">
              <label>Date<input aria-label={`Date du déplacement ${index + 1}`} required type="date" value={trip.date} onChange={(e) => changeTrip(index, { date: e.target.value })} /></label>
              <label>Trajet<input aria-label={`Trajet ${index + 1}`} required maxLength={200} value={trip.route} onChange={(e) => changeTrip(index, { route: e.target.value })} placeholder="Départ → Arrivée" /></label>
              <label>Motif<input aria-label={`Motif ${index + 1}`} required maxLength={200} value={trip.reason} onChange={(e) => changeTrip(index, { reason: e.target.value })} /></label>
              <label>Kilomètres<input aria-label={`Kilomètres ${index + 1}`} required type="number" min="1" max="100000" step="1" value={trip.km || ''} onChange={(e) => changeTrip(index, { km: Number(e.target.value) })} /></label>
              {details.fuel === 'electric' ? <label>Montant (€)<input aria-label={`Montant du déplacement ${index + 1}`} required type="number" min="0.01" max="999999" step="0.01" value={trip.amount || ''} onChange={(e) => changeTrip(index, { amount: Number(e.target.value) })} /></label> : null}
            </div><div className="expense-trip__footer"><strong>{formatExpenseMoney(mileageAmount(trip.km, details.fuel, trip.amount))}</strong>{details.trips.length > 1 ? <button className="expense-button" type="button" aria-label={`Supprimer le déplacement ${index + 1}`} onClick={() => setDetails({ ...details, trips: details.trips.filter((_, i) => i !== index) })}><Trash2 size={16} /> Supprimer</button> : null}</div>
          </fieldset>)}
          <button className="expense-button" type="button" disabled={details.trips.length >= 30} onClick={() => setDetails({ ...details, trips: [...details.trips, blankTrip()] })}><Plus size={16} /> Ajouter un déplacement</button>
          <label className="expense-tolls">Montant total des péages (€)<input required type="number" min="0" max="999999" step="0.01" value={details.tolls} onChange={(e) => setDetails({ ...details, tolls: Number(e.target.value) })} /></label>
        </section> : null}
        <section className="expense-files" aria-label="Justificatifs">
          <label>Justificatifs<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { chooseFiles(Array.from(e.target.files || [])); e.target.value = ''; }} /></label>
          <p className="expense-hint">Photos JPG, PNG, WebP ou PDF · 20 fichiers maximum. Les justificatifs sont intégrés au PDF de la note.</p>
          {files.map((file, index) => <div className="expense-file" key={`${index}-${file.name}`}><span>{file.name}</span><button className="expense-button" type="button" aria-label={`Retirer ${file.name}`} onClick={() => setFiles(files.filter((_, i) => i !== index))}><Trash2 size={16} /></button></div>)}
        </section>
      </fieldset>
      <div className="expense-form__total"><span>Total de la note</span><strong>{formatExpenseMoney(Number.isFinite(total) ? total : 0)}</strong></div>
      <p className="expense-hint">La note émise est conservée dans votre historique, puis transmise à la comptabilité. Son contenu ne pourra plus être modifié.</p>
    </div>
  </AppDialog>;
}
