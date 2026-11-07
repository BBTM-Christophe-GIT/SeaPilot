import type { SupabaseClient } from '@supabase/supabase-js';
import { BarChart3, Fuel, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AppDialog } from '../../components/AppDialog';
import {
  calculateSeaOperationConsumption,
  saveSeaOperationConsumption,
  type SeaOperationConsumption as ConsumptionContext,
  type SeaOperationConsumptionInputs,
} from './seaOperationConsumption';
import { SeaOperationConsumptionCharts } from './SeaOperationConsumptionCharts';
import {
  parseSeaOperationConsumptionTrace, SEA_OPERATION_CONSUMPTION_TRACE_MAX_BYTES, type SeaOperationConsumptionTrace,
} from './seaOperationConsumptionTrace';
import type { SeaOperationRecord } from './seaOperationQueries';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import { consumptionErrorMessage, useSeaOperationConsumptionContext } from './useSeaOperationConsumption';
import './seaOperationConsumption.css';

type ConsumptionResults = ReturnType<typeof calculateSeaOperationConsumption>;
type ConsumptionRecord = NonNullable<ConsumptionContext['record']>;

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const parisDateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
const amount = (value: number | null, unit: string) => value === null ? 'Indisponible' : `${decimal.format(value)} ${unit}`;

function parisArrivalInput(utc: string) {
  const parts = parisDateTime.formatToParts(new Date(utc));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value;
  const local = [part('year'), part('month'), part('day')].join('-') + 'T' + [part('hour'), part('minute')].join(':');
  try {
    seaOperationEtaUtc(local);
    return local;
  } catch {
    return '';
  }
}

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

function estimate(values: FormValues, calibration: ConsumptionContext['calibration'],
  trace: SeaOperationConsumptionTrace | null, removeSavedTrace: boolean) {
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
    ...(trace || removeSavedTrace ? { trace } : {}),
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
  if (trace && Date.parse(trace.endedAt) > Date.now()) {
    return { error: 'La trace GPS doit correspondre à une navigation terminée.' };
  }
  if (inputs.actualArrival) {
    try {
      if (Date.parse(seaOperationEtaUtc(inputs.actualArrival)) > Date.now()) throw new Error();
    } catch {
      return { error: 'L’arrivée réelle doit être une date et une heure de Paris valides et passées.' };
    }
  }
  return { inputs, result: calculateSeaOperationConsumption(inputs, calibration) };
}

function NumberField({ label, value, onChange, min = 0, max, step = 'any', readOnly }: {
  label: string; value: string; onChange: (value: string) => void; min?: number; max?: number; step?: number | 'any'; readOnly?: boolean;
}) {
  return <label className="so-field"><span className="so-field-label">{label}</span>
    <input type="number" inputMode={step === 1 ? 'numeric' : 'decimal'} min={min} max={max} step={step} value={value} readOnly={readOnly} onChange={event => onChange(event.target.value)} />
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
  onSaved: (saved: ConsumptionContext) => void;
}

function EditableConsumptionDialog({ client, context, description, onClose, onSaved, onReload }: Omit<DialogProps, 'record'> & { context: ConsumptionContext; description: string; onReload: () => void }) {
  const [values, setValues] = useState(() => initialValues(context));
  const [trace, setTrace] = useState(context.record?.trace ?? null);
  const [tracks, setTracks] = useState<ReturnType<typeof parseSeaOperationConsumptionTrace>>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const alive = useRef(true);
  const submitting = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const preview = estimate(values, context.calibration, trace, Boolean(context.record?.trace));
  const traceHasWarnings = trace && (trace.gapCount > 0 || trace.reorderedPointCount > 0 || trace.excludedPointCount > 0);
  const unit = values.gaugeUnit === 'cm' ? 'cm' : '%';
  const maxGauge = values.gaugeUnit === 'percent' ? 100 : 1000;
  function change(field: Exclude<keyof FormValues, 'gaugeUnit'>, value: string) {
    setValues(current => ({ ...current, [field]: value }));
    if (!conflict) setError('');
  }

  function useTrace(next: SeaOperationConsumptionTrace) {
    setTrace(next);
    setTracks([]);
    setValues(current => ({
      ...current, hours: String(Math.floor(next.durationMinutes / 60)), minutes: String(next.durationMinutes % 60),
      averageSpeedKnots: String(next.averageSpeedKnots), actualArrival: parisArrivalInput(next.endedAt),
    }));
    if (!conflict) setError('');
  }

  async function importTrace(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || importing) return;
    setImportError('');
    setTracks([]);
    if (!/\.gpx$/i.test(file.name) || file.size > SEA_OPERATION_CONSUMPTION_TRACE_MAX_BYTES) {
      setImportError('Choisissez un fichier .gpx de 5 Mo maximum.');
      return;
    }
    setImporting(true);
    try {
      const candidates = parseSeaOperationConsumptionTrace(await file.text());
      if (!alive.current) return;
      if (candidates.length === 1) useTrace(candidates[0].trace);
      else setTracks(candidates);
    } catch (reason) {
      if (alive.current) setImportError(consumptionErrorMessage(reason));
    } finally {
      if (alive.current) setImporting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || importing || tracks.length > 0 || conflict || !preview?.inputs || !context.canEdit) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const saved = await saveSeaOperationConsumption(client, context.operationId, context.record?.version ?? null, preview.inputs);
      if (alive.current) onSaved(saved);
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

  return <AppDialog size="lg" eyebrow="Relevé de mission" title="Consommation de carburant" description={description} icon={<Fuel size={22} aria-hidden="true" />}
    isBusy={saving} onClose={onClose} onSubmit={event => void submit(event)}
    footer={<div className="app-dialog__actions"><button type="button" className="sp-button sp-button--secondary" disabled={saving} onClick={onClose}>Annuler</button>
      <button type="submit" className="sp-button sp-button--primary" disabled={saving || importing || tracks.length > 0 || conflict || !preview?.inputs}>{saving ? 'Enregistrement…' : 'Enregistrer la consommation'}</button></div>}>
    <fieldset className="so-consumption-fields" disabled={saving}>
      <fieldset className="so-consumption-section"><legend>Trajet</legend>
        <div className="so-consumption-import so-consumption-wide">
          <label className="so-field">
            <span className="so-field-label"><Upload size={15} aria-hidden="true" />Importer une trace GPX</span>
            <input type="file" accept=".gpx,application/gpx+xml" disabled={importing} onChange={event => void importTrace(event)} />
          </label>
          {importing && <p role="status" className="so-help">Lecture de la trace…</p>}
          {importError && <p role="alert" className="so-alert so-danger">{importError}</p>}
          {tracks.length > 1 && <div className="so-consumption-track-picker">
            <label className="so-field"><span className="so-field-label">Trace de la mission</span>
              <select value="" onChange={event => { if (event.target.value) useTrace(tracks[Number(event.target.value)].trace); }}>
                <option value="">Choisir une trace</option>
                {tracks.map(({ label, trace: candidate }, index) =>
                  <option key={index} value={index}>{label} · {parisDateTime.format(new Date(candidate.startedAt))} · {amount(candidate.distanceNm, 'NM')}</option>)}
              </select>
            </label>
            <button type="button" className="sp-button sp-button--secondary" onClick={() => setTracks([])}>Annuler la sélection</button>
          </div>}
          {trace && <div className="so-consumption-trace" aria-label="Trace GPS importée">
            <div><strong>{amount(trace.distanceNm, 'NM')} par GPS</strong>
              <p className="so-help">{parisDateTime.format(new Date(trace.startedAt))} → {parisDateTime.format(new Date(trace.endedAt))} · {decimal.format(trace.pointCount)} points</p>
              {traceHasWarnings && <p className="so-help">La trace comporte des coupures ou des points corrigés. Vérifiez que sa période couvre la mission.</p>}
            </div>
            <button type="button" className="sp-button sp-button--secondary" disabled={importing} onClick={() => setTrace(null)}>Revenir à la saisie manuelle</button>
          </div>}
          {!trace && <p className="so-help">Une trace horodatée préremplit la durée, la vitesse moyenne et l’arrivée. Les jauges se saisissent à bord.</p>}
        </div>
        <fieldset className="so-consumption-duration"><legend>Durée réelle de navigation</legend>
          <NumberField label="Heures" step={1} max={8760} value={values.hours} readOnly={Boolean(trace)} onChange={value => change('hours', value)} />
          <NumberField label="Minutes" step={1} max={59} value={values.minutes} readOnly={Boolean(trace)} onChange={value => change('minutes', value)} />
        </fieldset>
        <NumberField label="Vitesse moyenne (nœuds)" max={100} value={values.averageSpeedKnots} readOnly={Boolean(trace)} onChange={value => change('averageSpeedKnots', value)} />
        <label className="so-field"><span className="so-field-label">Arrivée réelle (heure de Paris, facultative)</span>
          <input type="datetime-local" value={values.actualArrival} onChange={event => change('actualArrival', event.target.value)} />
        </label>
        <p className="so-help so-consumption-wide">L’arrivée réelle permet de vérifier si ce relevé peut alimenter la référence Projet.</p>
      </fieldset>
      <fieldset className="so-consumption-section"><legend>Jauges</legend>
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
      </fieldset>
      <fieldset className="so-consumption-section"><legend>Avitaillement et prix</legend>
        <NumberField label="Avitaillement avant départ (L, facultatif)" max={10000000} value={values.refuelLiters} onChange={value => change('refuelLiters', value)} />
        <NumberField label="Prix du fuel HT en €/L" min={.0001} max={10000} step={.0001} value={values.pricePerLiter} onChange={value => change('pricePerLiter', value)} />
        <p className="so-help so-consumption-wide">Le dernier prix saisi sert de référence à la carte Projet.</p>
      </fieldset>
    </fieldset>
    {preview?.result && <section className="sp-panel so-consumption-preview" aria-label="Récapitulatif calculé"><h3>Récapitulatif calculé</h3><ConsumptionReadout result={preview.result} /></section>}
    {(error || preview?.error) && <p className="so-alert so-danger" role="alert">{error || preview?.error}</p>}
    {conflict && <button className="sp-button sp-button--secondary" type="button" onClick={onReload}>Recharger le relevé</button>}
  </AppDialog>;
}

export function SeaOperationConsumptionDialog({ client, record, onClose, onSaved }: DialogProps) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<ConsumptionContext>();
  const { response, reload } = useSeaOperationConsumptionContext(client, record.id, undefined, undefined, saved);
  const context = response?.data;
  const reading = context?.record;
  const description = [record.draft.project || 'Opération sans titre', record.draft.vessel.name].filter(Boolean).join(' · ');
  const reloadReading = () => { setEditing(false); setSaved(undefined); reload(); };

  return <div className="so-consumption-dialog">
    {context?.canEdit && (!reading || editing)
      ? <EditableConsumptionDialog client={client} context={context} description={description}
        onClose={reading ? () => setEditing(false) : onClose} onReload={reloadReading}
        onSaved={next => { setSaved(next); setEditing(false); onSaved(next); }} />
      : <AppDialog size={reading ? 'lg' : 'md'} eyebrow={reading ? 'Relevé de mission' : undefined}
        title={reading ? 'Bilan de consommation' : 'Consommation de carburant'} description={description}
        icon={reading ? <BarChart3 size={22} aria-hidden="true" /> : <Fuel size={22} aria-hidden="true" />} onClose={onClose}
        footer={reading && <div className="app-dialog__actions">
          <button type="button" className="sp-button sp-button--secondary" onClick={onClose}>Fermer le bilan</button>
          {context?.canEdit && <button type="button" className="sp-button sp-button--primary" onClick={() => setEditing(true)}>Modifier le relevé</button>}
        </div>}>
        {context ? <>
          <ConsumptionRecordReadout record={context.record} />
          {reading && <SeaOperationConsumptionCharts record={reading} />}
          {!context.canEdit && <p className="so-help">Consommation en consultation selon vos droits sur cette opération.</p>}
        </> : <ConsumptionLoadStatus error={response?.error} reload={reload} />}
      </AppDialog>}
  </div>;
}
