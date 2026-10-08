import { FUEL_LABELS, type Fuel } from './expenseNoteModel';
import type { ExpenseVehicleDraft } from './expenseVehicleQueries';

export function ExpenseVehicleFields({ value, onChange }: { value: ExpenseVehicleDraft; onChange: (value: ExpenseVehicleDraft) => void }) {
  return <div className="expense-entry__vehicle">
    <label>Marque / modèle du véhicule<input required maxLength={150} placeholder="Ex. Peugeot 308" value={value.vehicle} onChange={(event) => onChange({ ...value, vehicle: event.target.value })} /></label>
    <label>Puissance fiscale<input required maxLength={30} placeholder="Ex. 6 CV" value={value.fiscalPower} onChange={(event) => onChange({ ...value, fiscalPower: event.target.value })} /></label>
    <label>Carburant<select value={value.fuel} onChange={(event) => onChange({ ...value, fuel: event.target.value as Fuel })}>{Object.entries(FUEL_LABELS).map(([fuel, label]) => <option key={fuel} value={fuel}>{label}</option>)}</select></label>
  </div>;
}
