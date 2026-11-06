import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { medicalMedicationLabel, validMedicalMedicationUses, type MedicalMedicationChoice, type MedicalMedicationSnapshot, type MedicalMedicationUse } from './medicalLogbookModel';

type MedicationList = { choices: MedicalMedicationChoice[]; error: string } | null;
type Selection = Omit<MedicalMedicationUse, 'quantity'> & { quantity: string };

export function MedicalMedicationPicker({ list, original, value, disabled, onChange, onReload }: {
  list: MedicationList;
  original: MedicalMedicationSnapshot[];
  value: MedicalMedicationUse[];
  disabled: boolean;
  onChange: (items: MedicalMedicationUse[]) => void;
  onReload: () => void;
}) {
  const [selection, setSelection] = useState<Selection[] | null>(null);
  const [query, setQuery] = useState('');
  const live = new Map(list?.choices.map((item) => [item.item_id, item]));
  const historical = new Map(original.map((item) => [item.item_id, item]));
  function itemFor({ item_id, unit }: MedicalMedicationUse | Selection) {
    const prior = historical.get(item_id);
    return (prior?.unit === unit ? prior : live.get(item_id)) ?? prior;
  }
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr');
  const search = normalize(query.trim());
  const matches = (list?.choices ?? []).filter((item) => !search || normalize(medicalMedicationLabel(item)).includes(search));
  const quantityFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
  const proposed = selection?.map(({ quantity, ...item }) => ({ ...item, quantity: Number(quantity) })) ?? [];
  const valid = validMedicalMedicationUses(proposed);

  return <>
    <button className="sp-button sp-button--secondary medical-medication-trigger" type="button" aria-haspopup="dialog" disabled={disabled}
      onClick={() => { setSelection(value.map((item) => ({ ...item, quantity: String(item.quantity) }))); setQuery(''); }}>
      {value.length ? `Articles de pharmacie (${value.length})` : 'Choisir les articles de pharmacie'}<ChevronDown size={14} aria-hidden="true" />
    </button>
    {value.length ? <ul className="medical-medication-summary">
      {value.map(({ item_id, quantity, unit }) => {
        const item = itemFor({ item_id, unit, quantity });
        return <li key={item_id}>{item ? medicalMedicationLabel(item) : 'Article de pharmacie'} — {quantityFormat.format(quantity)} {unit === 'package' ? quantity === 1 ? 'boîte' : 'boîtes' : item?.stock_unit || 'unité'}</li>;
      })}
    </ul> : null}
    {selection && !disabled ? createPortal(
      <AppDialog title="Articles de pharmacie du navire" size="lg" onClose={() => setSelection(null)}
        description="Sélectionnez les articles utilisés et indiquez les quantités. Le stock sera mis à jour lorsque l’entrée médicale sera enregistrée."
        footer={<div className="app-dialog__actions">
          <button className="sp-button sp-button--secondary" type="button" onClick={() => setSelection(null)}>Annuler</button>
          <button className="sp-button sp-button--primary" type="button" disabled={!valid} onClick={() => { onChange(proposed); setSelection(null); }}>Appliquer la sélection</button>
        </div>}>
        <div className="medical-medication-picker">
          {selection.length ? <fieldset className="medical-medication-selected">
            <legend>Quantités utilisées</legend>
            {selection.map(({ item_id, quantity, unit }) => {
              const item = itemFor({ item_id, unit, quantity });
              const label = item ? medicalMedicationLabel(item) : 'Article de pharmacie';
              const box = itemFor({ item_id, unit: 'package', quantity })?.package_size;
              return <div className="medical-medication-selection" key={item_id}>
                <strong>{label}</strong>
                <div className="medical-medication-fields">
                  <label>Quantité<input type="number" min={unit === 'package' ? 1 : 0.001} max={1_000_000} step={unit === 'package' ? 1 : 0.001}
                    inputMode={unit === 'package' ? 'numeric' : 'decimal'} aria-label={`Quantité — ${label}`} value={quantity}
                    onChange={(event) => setSelection(selection.map((row) => row.item_id === item_id ? { ...row, quantity: event.target.value } : row))} /></label>
                  <label>Unité<select value={unit} aria-label={`Unité — ${label}`} onChange={(event) => {
                    const next = event.target.value === 'package' ? 'package' : 'unit';
                    setSelection(selection.map((row) => row.item_id === item_id ? { ...row, unit: next } : row));
                  }}>
                    <option value="unit">{item?.stock_unit || 'unité'}</option>
                    {box ? <option value="package">Boîte de {quantityFormat.format(box)} {item?.stock_unit}</option> : null}
                  </select></label>
                  <button className="sp-button sp-button--secondary" type="button" aria-label={`Retirer ${label}`}
                    onClick={() => setSelection(selection.filter((row) => row.item_id !== item_id))}>Retirer</button>
                </div>
              </div>;
            })}
          </fieldset> : null}
          {!valid ? <p className="medical-error" role="alert">Indiquez une quantité valide par article. Saisissez un nombre entier pour les boîtes.</p> : null}
          <label>Rechercher dans l’inventaire<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          {!list ? <p role="status">Chargement de la pharmacie…</p> : list.error ? <div>
            <p className="medical-error" role="alert">{list.error}</p>
            <button className="sp-button sp-button--secondary" type="button" onClick={onReload}>Réessayer</button>
          </div> : matches.length ? <fieldset className="medical-medication-options">
            <legend>Articles disponibles</legend>
            {matches.map((item) => {
              const checked = selection.some((row) => row.item_id === item.item_id);
              return <label key={item.item_id} className="medical-medication-option">
                <input type="checkbox" checked={checked} disabled={!checked && (!item.stock_quantity || selection.length >= 50)} onChange={() => {
                  setSelection(checked ? selection.filter((row) => row.item_id !== item.item_id) : [...selection, { item_id: item.item_id, quantity: '1', unit: 'unit' }]);
                }} />
                <span>{medicalMedicationLabel(item)}<small>{item.stock_quantity === null ? 'Stock à renseigner dans l’inventaire'
                  : `Stock : ${quantityFormat.format(item.stock_quantity)} ${item.stock_unit}`}</small></span>
              </label>;
            })}
          </fieldset> : <p>{query.trim() ? 'Aucun article ne correspond à la recherche.' : 'Aucun article de pharmacie accessible pour ce navire.'}</p>}
        </div>
      </AppDialog>, document.body) : null}
  </>;
}
