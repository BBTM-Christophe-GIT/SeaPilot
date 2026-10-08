import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CarFront, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { FUEL_LABELS } from './expenseNoteModel';
import { ExpenseVehicleFields } from './ExpenseVehicleFields';
import { deletePersonalVehicle, fetchPersonalVehicles, savePersonalVehicle, setDefaultPersonalVehicle, type ExpensePersonalVehicle, type ExpenseVehicleDraft } from './expenseVehicleQueries';

interface Props {
  client: SupabaseClient; previewMode: boolean; previewVehicles: ExpensePersonalVehicle[];
  onPreviewChange: (vehicles: ExpensePersonalVehicle[]) => void; onClose: () => void;
}
const emptyVehicle = (): ExpenseVehicleDraft => ({ vehicle: '', fiscalPower: '', fuel: 'diesel' });

export function ExpenseVehiclesDialog({ client, previewMode, previewVehicles, onPreviewChange, onClose }: Props) {
  const [vehicles, setVehicles] = useState<ExpensePersonalVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyVehicle);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try { const rows = previewMode ? previewVehicles : await fetchPersonalVehicles(client); if (active) setVehicles(rows); }
      catch { if (active) setError('Impossible de charger vos véhicules. Fermez puis réouvrez le carnet pour réessayer.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [client, previewMode, previewVehicles]);
  function update(rows: ExpensePersonalVehicle[]) {
    setVehicles(rows);
    if (previewMode) onPreviewChange(rows);
  }
  function edit(vehicle?: ExpensePersonalVehicle) {
    setEditingId(vehicle?.id || ''); setDraft(vehicle || emptyVehicle()); setDeleteId(null); setError(''); setNotice('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (editingId === null || busy) return;
    if (!draft.vehicle.trim() || !draft.fiscalPower.trim()) { setError('Renseignez le modèle et la puissance fiscale.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = previewMode
        ? { ...draft, vehicle: draft.vehicle.trim(), fiscalPower: draft.fiscalPower.trim(), id: editingId || crypto.randomUUID(), isDefault: vehicles.find((v) => v.id === editingId)?.isDefault || false }
        : await savePersonalVehicle(client, draft, editingId || undefined);
      update([...vehicles.filter((v) => v.id !== saved.id), saved].sort((a, b) => a.vehicle.localeCompare(b.vehicle, 'fr')));
      setEditingId(null); setNotice('Véhicule enregistré.');
    } catch { setError('Enregistrement impossible. Votre saisie est conservée.'); }
    finally { setBusy(false); }
  }
  async function chooseDefault(id: string | null) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (!previewMode) await setDefaultPersonalVehicle(client, id);
      update(vehicles.map((v) => ({ ...v, isDefault: v.id === id })));
      setNotice(id ? 'Ce véhicule sera proposé pour vos prochaines notes kilométriques.' : 'Aucun véhicule ne sera présélectionné.');
    } catch { setError('Le véhicule par défaut n’a pas pu être modifié. Réessayez.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleteId || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (!previewMode) await deletePersonalVehicle(client, deleteId);
      update(vehicles.filter((v) => v.id !== deleteId)); setDeleteId(null);
      setNotice('Véhicule retiré. Les notes déjà émises sont conservées.');
    } catch { setError('Suppression impossible. Réessayez.'); }
    finally { setBusy(false); }
  }
  return <div className="expense-vehicles-dialog"><AppDialog title="Mes véhicules" icon={<CarFront size={22} />} size="md" onClose={onClose} isBusy={busy} onSubmit={save}
    footer={editingId !== null ? <div className="app-dialog__actions"><button type="button" className="expense-button" disabled={busy} onClick={() => setEditingId(null)}>Annuler</button><button type="submit" className="expense-button expense-button--primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le véhicule'}</button></div> : <button type="button" className="expense-button" onClick={onClose}>Fermer</button>}>
    <div className="expense-form">
      <p className="expense-hint">Votre carnet personnel. Le véhicule par défaut est proposé à chaque nouvelle note kilométrique.</p>
      {previewMode ? <p className="expense-hint">Démonstration · les changements restent dans cette prévisualisation.</p> : null}
      {error ? <p className="expense-message expense-message--error" role="alert">{error}</p> : null}
      {notice ? <p className="expense-message" role="status">{notice}</p> : null}
      {loading ? <p role="status">Chargement de vos véhicules…</p> : <fieldset disabled={busy} className="expense-form__fields">
        {editingId !== null ? <><h3>{editingId ? 'Modifier le véhicule' : 'Nouveau véhicule'}</h3><ExpenseVehicleFields value={draft} onChange={setDraft} /></> : <>
          <div className="expense-vehicle-list">{vehicles.length ? vehicles.map((vehicle) => <article key={vehicle.id} className="expense-vehicle-list__item">
            <div><h3>{vehicle.vehicle}</h3><p>{vehicle.fiscalPower} · {FUEL_LABELS[vehicle.fuel]}</p>{vehicle.isDefault ? <span className="expense-vehicle-default"><Star size={14} /> Véhicule par défaut</span> : null}</div>
            <div className="expense-vehicle-list__actions">
              <button type="button" className="expense-button" aria-label={`Modifier ${vehicle.vehicle}`} onClick={() => edit(vehicle)}><Pencil size={17} /></button>
              <button type="button" className="expense-button" aria-label={`Retirer ${vehicle.vehicle}`} onClick={() => { setDeleteId(vehicle.id); setNotice(''); }}><Trash2 size={17} /></button>
              {!vehicle.isDefault ? <button type="button" className="expense-button" onClick={() => void chooseDefault(vehicle.id)} aria-label={`Utiliser ${vehicle.vehicle} par défaut`}><Star size={16} /> Utiliser par défaut</button> : null}
            </div>
          </article>) : <p className="expense-hint">Ajoutez votre premier véhicule pour retrouver ses informations sans les ressaisir.</p>}</div>
          {deleteId ? <div className="expense-vehicle-picker__confirmation"><p>Retirer {vehicles.find((v) => v.id === deleteId)?.vehicle} ? Les notes déjà émises ne seront pas modifiées.</p><button type="button" className="expense-button" onClick={() => setDeleteId(null)}>Annuler le retrait</button><button type="button" className="expense-button" onClick={() => void remove()}>Confirmer le retrait</button></div> : null}
          <button type="button" className="expense-button" onClick={() => edit()}><Plus size={18} /> Ajouter un véhicule</button>
          {vehicles.some((v) => v.isDefault) ? <button type="button" className="expense-entry__disclosure" onClick={() => void chooseDefault(null)}>Ne pas présélectionner de véhicule</button> : null}
        </>}
      </fieldset>}
    </div>
  </AppDialog></div>;
}
