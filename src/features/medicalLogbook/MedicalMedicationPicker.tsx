import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { PHARMACY_MEDICAL_SECTIONS, formatPharmacyStockQuantity, pharmacyMedicalSection, type PharmacyMedicalSection } from '../pharmacy/pharmacyModel';
import { medicalMedicationLabel, medicalMedicationQuantity, validMedicalMedicationUses, type MedicalMedicationChoice, type MedicalMedicationSnapshot, type MedicalMedicationUse } from './medicalLogbookModel';

type MedicationList = { choices: MedicalMedicationChoice[]; error: string } | null;
type Selection = Omit<MedicalMedicationUse, 'quantity'> & { quantity: string };

const sectionOrder = ['medicines', 'equipment', 'unclassified'] as const;
const compare = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' }).compare;
const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr');

function medicationGroups(items: MedicalMedicationChoice[], query: string) {
  const search = normalize(query.trim());
  const sections = new Map<PharmacyMedicalSection, Map<string, MedicalMedicationChoice[]>>();
  for (const item of items) {
    const section = pharmacyMedicalSection(item.medical_section);
    const category = item.category?.trim() || 'Sans catégorie';
    if (search && !normalize([medicalMedicationLabel(item), category, PHARMACY_MEDICAL_SECTIONS[section]].join(' ')).includes(search)) continue;
    const categories = sections.get(section) ?? new Map<string, MedicalMedicationChoice[]>();
    const group = categories.get(category) ?? [];
    group.push(item);
    categories.set(category, group);
    sections.set(section, categories);
  }
  return sectionOrder.flatMap((section) => {
    const categories = sections.get(section);
    if (!categories) return [];
    return [{
      section, categories: [...categories].sort(([first], [second]) => compare(first, second)).map(([category, items]) =>
        [category, items.sort((first, second) => compare(medicalMedicationLabel(first), medicalMedicationLabel(second)) || first.item_id - second.item_id)] as const,
      ),
    }];
  });
}

export function MedicalMedicationPicker({ vesselName, list, original, value, disabled, onChange, onReload }: {
  vesselName: string;
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
  const groups = selection ? medicationGroups(list?.choices ?? [], query) : [];
  const selectedIds = new Set(selection?.map((item) => item.item_id));
  const proposed = selection?.map(({ quantity, ...item }) => ({ ...item, quantity: Number(quantity) })) ?? [];
  const valid = validMedicalMedicationUses(proposed);

  return <>
    <button className="sp-button sp-button--secondary medical-medication-trigger" type="button" aria-haspopup="dialog" aria-expanded={!!selection && !disabled} disabled={disabled}
      onClick={() => { setSelection(value.map((item) => ({ ...item, quantity: String(item.quantity) }))); setQuery(''); }}>
      Médicament administré<ChevronDown size={14} aria-hidden="true" />
    </button>
    {value.length ? <ul className="medical-medication-summary">
      {value.map(({ item_id, quantity, unit }) => {
        const item = itemFor({ item_id, unit, quantity });
        return <li key={item_id}>{item ? medicalMedicationLabel(item) : 'Article de pharmacie'} — {medicalMedicationQuantity(quantity, unit, item)}</li>;
      })}
    </ul> : null}
    {selection && !disabled ? createPortal(
      <AppDialog title="Médicaments et matériel du navire" eyebrow={vesselName} size="lg" onClose={() => setSelection(null)}
        description="Cochez les médicaments et le matériel utilisés, puis indiquez les quantités. Le stock du navire est mis à jour à l’enregistrement de l’entrée médicale."
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
              const box = itemFor({ item_id, unit: 'package', quantity });
              const stock = itemFor({ item_id, unit: 'unit', quantity });
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
                    <option value="unit">{stock?.stock_unit || 'unité'}</option>
                    {box?.package_size ? <option value="package">Boîte de {formatPharmacyStockQuantity(box.package_size, box.stock_unit)}</option> : null}
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
          </div> : groups.length ? <fieldset className="medical-medication-options">
            <legend>Articles disponibles</legend>
            {groups.map(({ section, categories }) => <section key={section} className="medical-medication-section">
              <h3>{PHARMACY_MEDICAL_SECTIONS[section]}</h3>
              {categories.map(([category, items]) => <fieldset className="medical-medication-category" key={category}>
                <legend>{category}</legend>
                {items.map((item) => {
                  const checked = selectedIds.has(item.item_id);
                  return <label key={item.item_id} className="medical-medication-option">
                    <input type="checkbox" checked={checked} disabled={!checked && (!item.stock_quantity || selection.length >= 50)} onChange={() => {
                      setSelection(checked ? selection.filter((row) => row.item_id !== item.item_id) : [...selection, {
                        item_id: item.item_id, quantity: String(Math.min(1, item.stock_quantity ?? 1)), unit: 'unit',
                      }]);
                    }} />
                    <span>{medicalMedicationLabel(item)}<small>{item.stock_quantity === null ? 'Stock à renseigner dans l’inventaire'
                      : `Stock disponible · ${formatPharmacyStockQuantity(item.stock_quantity, item.stock_unit)}`}</small></span>
                  </label>;
                })}
              </fieldset>)}
            </section>)}
          </fieldset> : <p>{query.trim() ? 'Aucun article ne correspond à la recherche.' : 'Aucun article de pharmacie accessible pour ce navire.'}</p>}
        </div>
      </AppDialog>, document.body) : null}
  </>;
}
