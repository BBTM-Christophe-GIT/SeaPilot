import { useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { formatPlanningDate } from './planningDates';
import { formatPlanningCrewBalance, type PlanningCrewBalanceCheckpoint } from './planningCrewBalance';

export function PlanningCrewBalanceDialog({ personId, personName, initialDate, checkpoints, onClose, onSave }: {
  personId: number; personName: string; initialDate: string; checkpoints: PlanningCrewBalanceCheckpoint[];
  onClose: () => void; onSave: (checkpoint: PlanningCrewBalanceCheckpoint) => Promise<void>;
}) {
  const [date, setDate] = useState(initialDate);
  const [balance, setBalance] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const refs = checkpoints.filter((item) => item.personId === personId).sort((a, b) => b.asOf.localeCompare(a.asOf));
  return <AppDialog title={`Solde de ${personName}`} description="Saisissez le solde à la fin de la journée choisie. Le calcul commence le lendemain." isBusy={saving} onClose={onClose}
    onSubmit={async (event) => {
      event.preventDefault();
      if (!/^[+-]?\d+(?:[.,]\d{1,2})?$/.test(balance.trim())) { setError('Saisissez un nombre avec deux décimales au maximum.'); return; }
      setSaving(true); setError('');
      try { await onSave({ personId, asOf: date, balance: Number(balance.replace(',', '.')) }); onClose(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Enregistrement impossible.'); }
      finally { setSaving(false); }
    }} footer={<><button type="button" onClick={onClose} disabled={saving}>Annuler</button><button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer le solde'}</button></>}>
    <div className="planning-balance-form">
      {error ? <p role="alert">{error}</p> : null}
      <label>Date du solde<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Solde en fin de journée<input inputMode="decimal" placeholder="Ex. 12,50 ou -3" required value={balance} onChange={(event) => setBalance(event.target.value)} /></label>
      {refs.some((item) => item.asOf === date) ? <p>Le solde déjà saisi à cette date sera remplacé.</p> : null}
      <p>En mer +1,05 · À terre et formation +0,50 · Extra +2,05 · Repos, congés et case vide −1 · Maladie et accident du travail 0.</p>
      {refs.length ? <><strong>Soldes de référence enregistrés</strong><ul>{refs.map((item) => <li key={item.asOf}><button type="button" onClick={() => { setDate(item.asOf); setBalance(String(item.balance).replace('.', ',')); }}>{formatPlanningDate(item.asOf)} : {formatPlanningCrewBalance(item.balance)}</button></li>)}</ul></> : <p>Aucun solde de référence enregistré.</p>}
    </div>
  </AppDialog>;
}
