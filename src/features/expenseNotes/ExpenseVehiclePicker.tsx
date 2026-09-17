import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Pencil, Save, Trash2 } from 'lucide-react';
import { FUEL_LABELS, type Fuel } from './expenseNoteModel';
import { deletePersonalVehicle, fetchPersonalVehicles, savePersonalVehicle, type ExpensePersonalVehicle, type ExpenseVehicleDraft } from './expenseVehicleQueries';

interface Props {
  client: SupabaseClient;
  previewMode: boolean;
  value: ExpenseVehicleDraft;
  onChange: (value: ExpenseVehicleDraft) => void;
}
const previewVehicles: ExpensePersonalVehicle[] = [
  { id: 'demo-diesel', vehicle: 'Peugeot 308', fiscalPower: '6 CV', fuel: 'diesel' },
  { id: 'demo-electric', vehicle: 'Renault Mégane E-Tech', fiscalPower: '4 CV', fuel: 'electric' },
];

export function ExpenseVehiclePicker({ client, previewMode, value, onChange }: Props) {
  const [vehicles, setVehicles] = useState<ExpensePersonalVehicle[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const entries = previewMode ? previewVehicles : await fetchPersonalVehicles(client);
        if (active) setVehicles(entries);
      } catch { if (active) setError('Impossible de charger vos véhicules. La saisie manuelle reste disponible.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [client, previewMode]);

  function selectVehicle(id: string) {
    setSelectedId(id); setConfirmDelete(false); setNotice(''); setError('');
    const vehicle = vehicles.find((entry) => entry.id === id);
    setEditing(!vehicle);
    onChange(vehicle || { vehicle: '', fiscalPower: '', fuel: 'diesel' });
  }
  async function save() {
    if (!value.vehicle.trim() || !value.fiscalPower.trim()) {
      setError('Renseignez le modèle et la puissance fiscale pour enregistrer le véhicule.'); return;
    }
    setSaving(true); setError(''); setNotice('');
    try {
      const saved = previewMode ? { ...value, id: selectedId || crypto.randomUUID() } : await savePersonalVehicle(client, value, selectedId || undefined);
      setVehicles((current) => [...current.filter((entry) => entry.id !== saved.id), saved].sort((a, b) => a.vehicle.localeCompare(b.vehicle, 'fr')));
      setSelectedId(saved.id); setEditing(false); onChange(saved);
      setNotice(previewMode ? 'Véhicule enregistré dans cette démonstration uniquement.' : 'Véhicule enregistré dans votre carnet.');
    } catch { setError('Enregistrement du véhicule impossible. Votre saisie est conservée, vous pouvez réessayer.'); }
    finally { setSaving(false); }
  }
  async function remove() {
    setSaving(true); setError(''); setNotice('');
    try {
      if (!previewMode) await deletePersonalVehicle(client, selectedId);
      setVehicles((current) => current.filter((entry) => entry.id !== selectedId));
      setSelectedId(''); setEditing(true); setConfirmDelete(false);
      // Preserve the in-progress note; removing a saved vehicle never changes a note.
      setNotice('Véhicule retiré du carnet. Les informations de cette note sont conservées.');
    } catch { setError('Suppression du véhicule impossible. Réessayez.'); }
    finally { setSaving(false); }
  }
  return <fieldset className="expense-vehicle-picker" disabled={saving} aria-label="Carnet de véhicules personnel">
    <div className="expense-vehicle-picker__selection">
      <label>Mes véhicules<select value={selectedId} disabled={loading} onChange={(event) => selectVehicle(event.target.value)}>
        <option value="">{loading ? 'Chargement…' : 'Nouveau véhicule / saisie ponctuelle'}</option>
        {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle} · {vehicle.fiscalPower} · {FUEL_LABELS[vehicle.fuel]}</option>)}
      </select></label>
      {selectedId ? <div className="expense-vehicle-picker__actions">
        <button type="button" className="expense-button" aria-label="Modifier le véhicule enregistré" onClick={() => { setEditing(true); setConfirmDelete(false); }}><Pencil size={15} /> Modifier</button>
        <button type="button" className="expense-button" aria-label="Retirer le véhicule du carnet" onClick={() => setConfirmDelete(!confirmDelete)}><Trash2 size={15} /></button>
      </div> : null}
    </div>
    {editing ? <>
      <div className="expense-entry__vehicle">
        <label>Marque / modèle du véhicule<input required maxLength={150} placeholder="Ex. Peugeot 308" value={value.vehicle} onChange={(event) => onChange({ ...value, vehicle: event.target.value })} /></label>
        <label>Puissance fiscale<input required maxLength={30} placeholder="Ex. 6 CV" value={value.fiscalPower} onChange={(event) => onChange({ ...value, fiscalPower: event.target.value })} /></label>
        <label>Carburant<select value={value.fuel} onChange={(event) => onChange({ ...value, fuel: event.target.value as Fuel })}>{Object.entries(FUEL_LABELS).map(([fuel, label]) => <option key={fuel} value={fuel}>{label}</option>)}</select></label>
      </div>
      <div className="expense-vehicle-picker__save"><button className="expense-button" type="button" onClick={() => void save()}><Save size={15} />{saving ? 'Enregistrement…' : selectedId ? 'Mettre à jour le véhicule' : 'Enregistrer ce véhicule'}</button><span className="expense-hint">Réutilisable depuis votre compte.</span></div>
    </> : <p className="expense-hint">{value.fiscalPower} · {FUEL_LABELS[value.fuel]} · Véhicule de votre carnet personnel</p>}
    {confirmDelete ? <div className="expense-vehicle-picker__confirmation"><p>Retirer ce véhicule du carnet ? Les notes déjà émises sont conservées.</p><button type="button" className="expense-button" onClick={() => setConfirmDelete(false)}>Annuler</button><button type="button" className="expense-button" onClick={() => void remove()}>Confirmer le retrait</button></div> : null}
    {error ? <p className="expense-message expense-message--error" role="alert">{error}</p> : null}
    {notice ? <p className="expense-hint" role="status">{notice}</p> : null}
  </fieldset>;
}
