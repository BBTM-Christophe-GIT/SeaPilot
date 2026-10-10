import { Save, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import './BillingRawLineDraft.css';

export interface BillingRawLineValues {
  serviceDate: string;
  designation: string;
  vesselName: string;
  quantity: number;
  unitAmountHt: number;
}

export type BillingRawLineDraftValues = Omit<BillingRawLineValues, 'quantity' | 'unitAmountHt'> & {
  quantity: string;
  unitAmountHt: string;
};

interface BillingRawLineDraftProps {
  initialValues: BillingRawLineValues | BillingRawLineDraftValues;
  vesselNames: string[];
  editing: boolean;
  disabled: boolean;
  onChange: (values: BillingRawLineDraftValues) => void;
  onSave: (values: BillingRawLineValues) => void;
  onCancel: () => void;
}

export default function BillingRawLineDraft({
  initialValues, vesselNames, editing, disabled, onChange, onSave, onCancel,
}: BillingRawLineDraftProps) {
  const formId = useId();
  const errorId = `${formId}-error`;
  const designation = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState(() => ({
    ...initialValues,
    quantity: String(initialValues.quantity),
    unitAmountHt: String(initialValues.unitAmountHt),
  }));
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    designation.current?.focus();
    return () => { previous?.focus(); };
  }, []);

  function change(field: keyof BillingRawLineDraftValues, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    onChange(next);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const quantity = Number(values.quantity);
    const unitAmountHt = Number(values.unitAmountHt);
    const parsedDate = new Date(`${values.serviceDate}T12:00:00Z`);
    if (!values.designation.trim()) { setError('Renseignez une désignation.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.serviceDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== values.serviceDate) {
      setError('Renseignez une date valide.'); return;
    }
    if (!values.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      setError('La quantité doit être supérieure à zéro.'); return;
    }
    if (!values.unitAmountHt.trim() || !Number.isFinite(unitAmountHt) || unitAmountHt < 0) {
      setError('Le prix unitaire HT doit être positif ou nul.'); return;
    }
    onSave({ ...values, designation: values.designation.trim(), quantity, unitAmountHt });
  }

  const draftTotal = Number(values.quantity) * Number(values.unitAmountHt);
  const totalLabel = Number.isFinite(draftTotal) && draftTotal >= 0
    ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(draftTotal)
    : '—';

  return <tbody className="pp-raw-draft" aria-label="Saisie de la ligne brute" onKeyDown={(event) => {
    if (event.key === 'Escape' && !disabled) { event.preventDefault(); onCancel(); }
  }}>
    <tr aria-label={editing ? 'Modifier la ligne brute' : 'Nouvelle ligne brute'}>
      <td className="pp-row-actions-cell" />
      <td><input form={formId} aria-label="Date" aria-describedby={error ? errorId : undefined} type="date" required disabled={disabled} value={values.serviceDate} onChange={(event) => change('serviceDate', event.target.value)} /></td>
      <td><input ref={designation} form={formId} aria-label="Désignation libre" aria-describedby={error ? errorId : undefined} placeholder="Désignation libre…" required disabled={disabled} value={values.designation} onChange={(event) => change('designation', event.target.value)} /></td>
      <td><select form={formId} aria-label="Navire" disabled={disabled} value={values.vesselName} onChange={(event) => change('vesselName', event.target.value)}><option value="">Aucun navire</option>{vesselNames.map((name) => <option key={name}>{name}</option>)}</select></td>
      <td><input form={formId} aria-label="Quantité" aria-describedby={error ? errorId : undefined} type="number" min="0.001" step="0.001" required disabled={disabled} value={values.quantity} onChange={(event) => change('quantity', event.target.value)} /></td>
      <td><input form={formId} aria-label="Prix unitaire HT" aria-describedby={error ? errorId : undefined} type="number" min="0" step="0.001" required disabled={disabled} value={values.unitAmountHt} onChange={(event) => change('unitAmountHt', event.target.value)} /></td>
      <td className="pp-money">{totalLabel}</td>
    </tr>
    <tr><td colSpan={7}>
      <form id={formId} aria-label="Enregistrer la ligne brute" className="pp-raw-draft-actions" onSubmit={submit}>
        <span className="pp-muted">{editing ? 'Modification en cours' : 'Ligne en cours de saisie'} · EUR</span>
        <button className="pp-button" type="button" disabled={disabled} onClick={onCancel}><X size={16} />Annuler</button>
        <button className="pp-button primary" type="submit" disabled={disabled}><Save size={16} />Enregistrer</button>
      </form>
      {error && <p id={errorId} role="alert" className="pp-raw-draft-error">{error}</p>}
    </td></tr>
  </tbody>;
}
