import type { SupabaseClient } from '@supabase/supabase-js';
import { Fuel } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AppDialog } from '../../components/AppDialog';
import {
  calculateSeaOperationConsumption,
  saveSeaOperationConsumption,
  type SeaOperationConsumption as ConsumptionContext,
  type SeaOperationConsumptionInputs,
} from './seaOperationConsumption';
import type { SeaOperationRecord } from './seaOperationQueries';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import { consumptionErrorMessage, useSeaOperationConsumptionContext } from './useSeaOperationConsumption';
import './seaOperationConsumption.css';

type ConsumptionResults = ReturnType<typeof calculateSeaOperationConsumption>;
type ConsumptionRecord = NonNullable<ConsumptionContext['record']>;

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const amount = (value: number | null, unit: string) => value === null ? 'Indisponible' : `${decimal.format(value)} ${unit}`;

function ConsumptionReadout({ result }: { result: ConsumptionResults }) {
  return <dl className="so-consumption-values">
    <div><dt>Distance parcourue</dt><dd>{amount(result.distanceNm, 'NM')}</dd></div>
    <div><dt>Soute au départ</dt><dd>{amount(result.departureLiters, 'L')}</dd></div>
    <div><dt>Consommation totale</dt><dd>{amount(result.consumedLiters, 'L')}</dd></div>
    <div><dt>À l’heure</dt><dd>{amount(result.litersPerHour, 'L/h')}</dd></div>
    <div><dt>Au mille nautique</dt><dd>{amount(result.litersPerNm, 'L/NM')}</dd></div>
    <div><dt>Coût du carburant HT</dt><dd>{result.costEuros === null ? 'Indisponible' : currency.format(result.costEuros)}</dd></div>
  </dl>;
}

function ConsumptionRecordReadout({ record }: { record: ConsumptionRecord | null }) {
  if (!record) return <p>Aucune consommation enregistrée.</p>;
  return <><ConsumptionReadout result={record} />
    {record.includedInReference && <small>Relevé inclus dans la référence de consommation Projet.</small>}
  </>;
}

function ConsumptionLoadStatus({ error, reload }: { error?: string; reload: () => void }) {
  return error ? <div className="so-consumption-error"><p role="alert">{error}</p>
    <button className="sp-button sp-button--secondary" type="button" onClick={reload}>Réessayer</button></div>
    : <p role="status">Chargement de la consommation…</p>;
}

export function SeaOperationConsumptionSummary({ response, reload }: ReturnType<typeof useSeaOperationConsumptionContext>) {
  return <section className="sp-panel so-consumption-summary" aria-label="Consommation de l’opération">
    <h2><Fuel size={17} aria-hidden="true" />Consommation de l’opération</h2>
    {response?.data ? <ConsumptionRecordReadout record={response.data.record} /> : <ConsumptionLoadStatus error={response?.error} reload={reload} />}
  </section>;
}

type FormValues = {
  hours: string; minutes: string; averageSpeedKnots: string; gaugeUnit: SeaOperationConsumptionInputs['gaugeUnit'];
  departureGauge: string; arrivalGauge: string; refuelLiters: string; pricePerLiter: string; actualArrival: string;
};

function initialValues(context: ConsumptionContext): FormValues {
  const record = context.record;
  return {
    hours: record ? String(Math.floor(record.durationMinutes / 60)) : '',
    minutes: record ? String(record.durationMinutes % 60) : '',
    averageSpeedKnots: String(record?.averageSpeedKnots ?? ''),
    gaugeUnit: record?.gaugeUnit ?? context.calibration.defaultGaugeUnit,
    departureGauge: String(record?.departureGauge ?? ''),
    arrivalGauge: String(record?.arrivalGauge ?? ''),
    refuelLiters: String(record?.refuelLiters ?? ''),
    pricePerLiter: String(record?.pricePerLiter ?? ''),
    actualArrival: record?.actualArrival ?? '',
  };
}

function estimate(values: FormValues, calibration: ConsumptionContext['calibration']) {
  const { hours, minutes, averageSpeedKnots, departureGauge, arrivalGauge } = values;
  if ((!hours && !minutes) || !averageSpeedKnots || !departureGauge || !arrivalGauge) return null;
  const wholeHours = Number(hours), extraMinutes = Number(minutes);
  if (!Number.isSafeInteger(wholeHours) || wholeHours < 0 || !Number.isInteger(extraMinutes) || extraMinutes < 0 || extraMinutes > 59) {
    return { error: 'Saisissez des heures entières et des minutes comprises entre 0 et 59.' };
  }
  const inputs: SeaOperationConsumptionInputs = {
    durationMinutes: wholeHours * 60 + extraMinutes, averageSpeedKnots: Number(averageSpeedKnots), gaugeUnit: values.gaugeUnit,
    departureGauge: Number(departureGauge), arrivalGauge: Number(arrivalGauge),
    refuelLiters: values.refuelLiters ? Number(values.refuelLiters) : null,
    pricePerLiter: values.pricePerLiter ? Number(values.pricePerLiter) : null,
    actualArrival: values.actualArrival || null, completed: true,
  };
  const maxGauge = values.gaugeUnit === 'percent' ? 100 : 1000;
  const inRange = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;
  if (!inRange(inputs.durationMinutes, 1, 525600) || !inRange(inputs.averageSpeedKnots, 0, 100)
    || !inRange(inputs.departureGauge, 0, maxGauge) || !inRange(inputs.arrivalGauge, 0, maxGauge)
    || inputs.refuelLiters !== null && !inRange(inputs.refuelLiters, 0, 10000000)
    || inputs.pricePerLiter !== null && (!inRange(inputs.pricePerLiter, .0001, 10000) || Number(inputs.pricePerLiter.toFixed(4)) !== inputs.pricePerLiter)) {
    return { error: 'Vérifiez les limites de durée, de vitesse, de jauge et d’avitaillement. Le prix accepte jusqu’à quatre décimales.' };
  }
  if (inputs.arrivalGauge > inputs.departureGauge) return { error: 'La jauge à l’arrivée dépasse celle du départ. Vérifiez la jauge de départ après l’avitaillement.' };
  if (inputs.actualArrival) {
    try {
      if (Date.parse(seaOperationEtaUtc(inputs.actualArrival)) > Date.now()) throw new Error();
    } catch {
      return { error: 'L’arrivée réelle doit être une date et une heure de Paris valides et passées.' };
    }
  }
  return { inputs, result: calculateSeaOperationConsumption(inputs, calibration) };
}

function NumberField({ label, value, onChange, min = 0, max, step = 'any' }: {
  label: string; value: string; onChange: (value: string) => void; min?: number; max?: number; step?: number | 'any';
}) {
  return <label className="so-field"><span className="so-field-label">{label}</span>
    <input type="number" inputMode={step === 1 ? 'numeric' : 'decimal'} min={min} max={max} step={step} value={value} onChange={event => onChange(event.target.value)} />
  </label>;
}

function CalibrationNote({ calibration, unit }: { calibration: ConsumptionContext['calibration']; unit: FormValues['gaugeUnit'] }) {
  if (calibration.kind === 'rozel') return <p className="so-help">La conversion utilise la courbe de jauge du Rozel.</p>;
  if (calibration.kind === 'suroit' && unit === 'cm') return <p className="so-help">La jauge du Suroît correspond à 34,3 L par centimètre.</p>;
  if (calibration.nominalCapacityLiters !== null) return <p className="so-help">Le pourcentage s’applique à la capacité nominale des soutes de {amount(calibration.nominalCapacityLiters, 'L')}.</p>;
  return <p className="so-help">Capacité des soutes indisponible. Les jauges et la distance peuvent être enregistrées.</p>;
}

interface DialogProps {
  client: SupabaseClient;
  record: SeaOperationRecord;
  onClose: () => void;
  onSaved: () => void;
}

function EditableConsumptionDialog({ client, context, description, onClose, onSaved, onReload }: Omit<DialogProps, 'record'> & { context: ConsumptionContext; description: string; onReload: () => void }) {
  const [values, setValues] = useState(() => initialValues(context));
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const alive = useRef(true);
  const submitting = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const preview = estimate(values, context.calibration);
  const unit = values.gaugeUnit === 'cm' ? 'cm' : '%';
  const maxGauge = values.gaugeUnit === 'percent' ? 100 : 1000;
  function change(field: Exclude<keyof FormValues, 'gaugeUnit'>, value: string) {
    setValues(current => ({ ...current, [field]: value }));
    if (!conflict) setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || conflict || !confirmed || !preview?.inputs || !context.canEdit) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      await saveSeaOperationConsumption(client, context.operationId, context.record?.version ?? null, preview.inputs);
      if (alive.current) onSaved();
    } catch (reason) {
      if (alive.current) {
        setError(consumptionErrorMessage(reason));
        setConflict(Boolean(reason && typeof reason === 'object' && 'code' in reason && reason.code === '40001'));
      }
    } finally {
      submitting.current = false;
      if (alive.current) setSaving(false);
    }
  }

  return <AppDialog size="md" eyebrow="Navigation réalisée" title="Consommation de carburant" description={description} icon={<Fuel size={22} aria-hidden="true" />}
    isBusy={saving} onClose={onClose} onSubmit={event => void submit(event)}
    footer={<div className="app-dialog__actions"><button type="button" className="sp-button sp-button--secondary" disabled={saving} onClick={onClose}>Annuler</button>
      <button type="submit" className="sp-button sp-button--primary" disabled={saving || conflict || !confirmed || !preview?.inputs}>{saving ? 'Enregistrement…' : 'Enregistrer la consommation'}</button></div>}>
    <fieldset className="so-consumption-fields" disabled={saving}>
      <fieldset className="so-consumption-duration"><legend>Durée réelle de navigation</legend>
        <NumberField label="Heures" step={1} max={8760} value={values.hours} onChange={value => change('hours', value)} />
        <NumberField label="Minutes" step={1} max={59} value={values.minutes} onChange={value => change('minutes', value)} />
      </fieldset>
      <NumberField label="Vitesse moyenne (nœuds)" max={100} value={values.averageSpeedKnots} onChange={value => change('averageSpeedKnots', value)} />
      <label className="so-field"><span className="so-field-label">Arrivée réelle (heure de Paris, facultative)</span>
        <input type="datetime-local" value={values.actualArrival} onChange={event => change('actualArrival', event.target.value)} />
      </label>
      <p className="so-help so-consumption-wide">L’arrivée réelle permet de vérifier si ce relevé peut alimenter la référence Projet. Le récapitulatif est enregistré même si le trajet ne remplit pas ces critères.</p>
      {context.calibration.kind === 'suroit' && <label className="so-field so-consumption-wide"><span className="so-field-label">Unité des jauges</span>
        <select value={values.gaugeUnit} onChange={event => {
          const gaugeUnit = event.target.value === 'cm' ? 'cm' : 'percent';
          setValues(current => ({ ...current, gaugeUnit, departureGauge: '', arrivalGauge: '' }));
          if (!conflict) setError('');
        }}><option value="cm">Hauteur de jauge (cm)</option><option value="percent">Pourcentage de la capacité nominale (%)</option></select>
      </label>}
      <NumberField label={`Jauge au départ après avitaillement (${unit})`} value={values.departureGauge} max={maxGauge} onChange={value => change('departureGauge', value)} />
      <NumberField label={`Jauge à l’arrivée (${unit})`} value={values.arrivalGauge} max={maxGauge} onChange={value => change('arrivalGauge', value)} />
      <div className="so-consumption-wide"><CalibrationNote calibration={context.calibration} unit={values.gaugeUnit} /></div>
      <NumberField label="Avitaillement avant départ (L, facultatif)" max={10000000} value={values.refuelLiters} onChange={value => change('refuelLiters', value)} />
      <NumberField label="Prix du fuel HT en €/L" min={.0001} max={10000} step={.0001} value={values.pricePerLiter} onChange={value => change('pricePerLiter', value)} />
      <p className="so-help so-consumption-wide">Le dernier prix saisi sert de référence à la carte Projet.</p>
      <label className="so-checkbox so-consumption-wide"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Je confirme que la navigation est terminée.</label>
    </fieldset>
    {preview?.result && <section className="sp-panel so-consumption-preview" aria-label="Récapitulatif calculé"><h3>Récapitulatif calculé</h3><ConsumptionReadout result={preview.result} /></section>}
    {(error || preview?.error) && <p className="so-alert so-danger" role="alert">{error || preview?.error}</p>}
    {conflict && <button className="sp-button sp-button--secondary" type="button" onClick={onReload}>Recharger le relevé</button>}
  </AppDialog>;
}

export function SeaOperationConsumptionDialog({ client, record, onClose, onSaved }: DialogProps) {
  const { response, reload } = useSeaOperationConsumptionContext(client, record.id);
  const description = [record.draft.project || 'Opération sans titre', record.draft.vessel.name].filter(Boolean).join(' · ');
  return <div className="so-consumption-dialog">
    {response?.data?.canEdit ? <EditableConsumptionDialog client={client} context={response.data} description={description} onClose={onClose} onSaved={onSaved} onReload={reload} />
      : <AppDialog size="md" title="Consommation de carburant" description={description} icon={<Fuel size={22} aria-hidden="true" />} onClose={onClose}>
        {response?.data ? <><ConsumptionRecordReadout record={response.data.record} /><p className="so-help">Consommation en consultation selon vos droits sur cette opération.</p></>
          : <ConsumptionLoadStatus error={response?.error} reload={reload} />}
      </AppDialog>}
  </div>;
}
