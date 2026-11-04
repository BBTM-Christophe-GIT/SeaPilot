import { useState } from 'react';
import { calculateEmploymentContractEndDate, isEmploymentContractDate, type EmploymentContractDurationUnit } from './employmentContractModel';

function savedDays(startDate: string, endDate: string): string {
  if (!isEmploymentContractDate(startDate) || !isEmploymentContractDate(endDate) || endDate < startDate) return '';
  return String(Math.round((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86_400_000) + 1);
}

export function EmploymentContractDurationFields({ startDate, endDate, disabled, onChange }: {
  startDate: string; endDate: string; disabled: boolean; onChange: (endDate: string) => void;
}) {
  const [duration, setDuration] = useState(() => savedDays(startDate, endDate));
  const [unit, setUnit] = useState<EmploymentContractDurationUnit>('days');
  const [error, setError] = useState('');
  function update(value: string, selectedUnit: EmploymentContractDurationUnit) {
    setDuration(value); setUnit(selectedUnit);
    try { onChange(calculateEmploymentContractEndDate(startDate, value, selectedUnit)); setError(''); }
    catch (cause) { onChange(''); setError(cause instanceof Error ? cause.message : 'Renseignez une durée valide.'); }
  }
  return <div className="hr-contract-fields">
    <label className="hr-edit-field">Durée du CDD<input type="number" inputMode="numeric" min="1" step="1" value={duration} disabled={disabled} onChange={event => update(event.target.value, unit)} /></label>
    <label className="hr-edit-field">Unité de durée<select value={unit} disabled={disabled} onChange={event => update(duration, event.target.value as EmploymentContractDurationUnit)}><option value="days">Jours</option><option value="weeks">Semaines</option><option value="months">Mois</option></select></label>
    <p className="hr-contract-help">Fin du CDD : {endDate || 'durée à renseigner'}. Le dernier jour est inclus. Enregistrez la fiche pour conserver cette durée.</p>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>;
}
