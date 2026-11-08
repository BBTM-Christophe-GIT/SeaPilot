import type { SupabaseClient } from '@supabase/supabase-js';
import { Fuel } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import { landemerTankVolumeLiters } from './seaOperationConsumption';
import { SeaOperationFuelTankGauge, SeaOperationFuelTankLayout } from './SeaOperationFuelTankVisual';
import {
  fetchSeaOperationFuelTanks, isFleetFuelReadingTime, MAX_BASELINE_FUEL_LITERS_WITHOUT_CAPACITY, saveSeaOperationFuelTanks,
  type FleetFuelTank as Tank, type FleetFuelTankUnit as Unit, type SeaOperationFleetFuelLevel,
  type SeaOperationFuelTanks as Configuration,
} from './seaOperationFleetFuelQuery';
import { formatFuelVolume, fuelVolumeUnit } from './seaOperationFuelVolume';
import { seaOperationToday } from './seaOperationModel';
import { consumptionErrorMessage } from './useSeaOperationConsumption';
import './seaOperationFuelTanksDialog.css';

type SavedTank = NonNullable<Configuration['reading']>['tanks'][number];
type Draft = { unit: Unit; value: string };
type TankField = Tank & { draft: Draft; value: number | null; liters: number | null };
type RequestScope = { client: SupabaseClient; vesselId: number; date: string; time: string | null; revision: number };
type LoadedState = RequestScope & { times: readonly string[] } & ({ configuration: Configuration; drafts: Record<string, Draft> } | { error: string });

const units: Record<Unit, string> = { percent: '%', liters: 'L', m3: 'm³' };
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 });
const earliestDate = '1900-01-01';
const parisClock = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });

function newMeasurement(date?: string) {
  const now = new Date();
  const today = seaOperationToday(now);
  const day = date ?? today;
  return { date: day, time: day === today ? parisClock.format(now) : '00:00' };
}

function maximumValue(tank: Tank, unit: Unit) {
  const limit = tank.capacityLiters ?? MAX_BASELINE_FUEL_LITERS_WITHOUT_CAPACITY;
  return unit === 'percent' ? 100 : unit === 'm3' ? limit / 1000 : limit;
}

function draftValue(tank: Tank, draft: Draft) {
  if (!/^(?:\d+(?:\.\d{1,3})?|\.\d{1,3})$/.test(draft.value) || draft.unit === 'percent' && tank.capacityLiters === null) return null;
  const value = Number(draft.value);
  return value <= maximumValue(tank, draft.unit) ? value : null;
}

function measuredLiters(tank: Tank, unit: Unit, value: number) {
  if (unit === 'liters') return value;
  if (unit === 'm3') return Math.round(value * 1000);
  if (tank.capacityLiters === null) return null;
  if (tank.calibration === 'landemer-v1') {
    const liters = landemerTankVolumeLiters(value);
    return liters === null ? null : Math.round(liters * 1000) / 1000;
  }
  // Multiply integer thousandths before rounding, as the server does with numeric inputs.
  return Math.round(Math.round(tank.capacityLiters * 1000) * Math.round(value * 1000) / 100000) / 1000;
}

function matchesTank(saved: SavedTank, tank: Tank) {
  return saved.key === tank.key && (tank.key === 'day' || saved.name === tank.name)
    && saved.capacityLiters === tank.capacityLiters && saved.calibration === tank.calibration;
}

function initialDrafts(configuration: Configuration) {
  return Object.fromEntries(configuration.tanks.map(tank => {
    const saved = configuration.reading?.tanks.find(row => matchesTank(row, tank));
    return [tank.key, saved ? { unit: saved.unit, value: String(saved.value) } : { unit: 'liters' as const, value: '' }];
  }));
}

function TankEntry({ field, onChange }: { field: TankField; onChange: (draft: Draft) => void }) {
  const hint = useId();
  const { key, name, capacityLiters, draft, value, liters } = field;
  const displayUnit = fuelVolumeUnit(capacityLiters);
  const invalid = Boolean(draft.value) && value === null;
  const maximum = maximumValue(field, draft.unit);
  return <fieldset className="so-soutes-tank" data-tank={key}>
    <legend>{name}</legend>
    <div className="so-soutes-tank-reading">
      <SeaOperationFuelTankGauge liters={liters} capacityLiters={capacityLiters} />
      <div><strong>{liters === null ? '—' : formatFuelVolume(liters, displayUnit)}</strong>
        <small>{capacityLiters === null ? 'Capacité non renseignée' : `sur ${formatFuelVolume(capacityLiters, displayUnit)}`}</small>
      </div>
    </div>
    <div className="so-soutes-tank-fields">
      <label className="so-field"><span className="so-field-label">Unité</span>
        <select value={draft.unit} onChange={event => onChange({ unit: event.target.value as Unit, value: '' })}>
          <option value="liters">L</option><option value="m3">m³</option>
          <option value="percent" disabled={capacityLiters === null}>%</option>
        </select>
      </label>
      <label className="so-field"><span className="so-field-label">Niveau</span>
        <input type="number" inputMode="decimal" min={0} max={maximum} step={.001} value={draft.value}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? hint : undefined}
          onChange={event => onChange({ ...draft, value: event.target.value })} />
      </label>
    </div>
    {invalid && <p id={hint} className="so-soutes-invalid">De 0 à {decimal.format(maximum)} {units[draft.unit]}, trois décimales au maximum.</p>}
  </fieldset>;
}

function TotalStock({ fields }: { fields: readonly TankField[] }) {
  const capacitiesKnown = fields.every(field => field.capacityLiters !== null);
  const capacity = capacitiesKnown ? fields.reduce((sum, field) => sum + (field.capacityLiters ?? 0), 0) : null;
  const entered = fields.filter(field => field.liters !== null);
  const measured = entered.reduce((sum, field) => sum + (field.liters ?? 0), 0);
  const unit = fuelVolumeUnit(capacity);
  const fill = capacity && entered.length ? Math.min(1, measured / capacity) : null;
  const complete = entered.length === fields.length;
  const main = fields.filter(field => field.key !== 'day');
  const mainLiters = main.every(field => field.liters !== null) ? main.reduce((sum, field) => sum + (field.liters ?? 0), 0) : null;
  return <section className="so-soutes-total" aria-label="Stock total mesuré">
    <div className="so-soutes-total-heading">
      <div><h3>Stock total mesuré</h3><strong>{entered.length ? formatFuelVolume(measured, unit) : '—'}</strong>
        {capacity !== null && <span> sur {formatFuelVolume(capacity, unit)}</span>}</div>
      {fill !== null && <span className="so-soutes-total-percent">{percent.format(fill)}{!complete && ' saisis'}</span>}
    </div>
    <div className="so-soutes-total-track" data-known={fill !== null} aria-hidden="true">
      {fill !== null && <span style={{ width: `${fill * 100}%` }} />}
    </div>
    <p>{entered.length}/{fields.length} {entered.length === 1 ? 'niveau saisi' : 'niveaux saisis'}
      {capacity === null && ' · Capacité totale indisponible'}</p>
    {main.length !== fields.length && <p>Stock de référence et DPR · cuves principales{mainLiters !== null && ` · ${formatFuelVolume(mainLiters, unit)}`}</p>}
  </section>;
}

function PreviousReading({ reading, tanks }: { reading: Configuration['reading']; tanks: readonly Tank[] }) {
  if (!reading) return null;
  const changed = reading.tanks.length !== tanks.length || tanks.some(tank => !reading.tanks.some(saved => matchesTank(saved, tank)));
  if (!changed && !reading.superseded) return null;
  return <div className="so-soutes-previous">
    <p>{reading.superseded ? 'Un stock global a remplacé ce relevé détaillé. Vérifiez les niveaux avant d’enregistrer une nouvelle référence.'
      : 'La configuration des soutes a changé. Renseignez les niveaux des soutes modifiées.'}</p>
    <details><summary>Consulter le relevé précédent</summary>
      <ul>{reading.tanks.map(tank => <li key={tank.key}>{tank.name} · {decimal.format(tank.value)} {units[tank.unit]} · {formatFuelVolume(tank.liters, 'L')}</li>)}</ul>
    </details>
  </div>;
}

export function SeaOperationFuelTanksDialog({ client, vessels, preferredVesselId, onClose, onSaved }: {
  client: SupabaseClient; vessels: readonly SeaOperationFleetFuelLevel[]; preferredVesselId?: number; onClose: () => void; onSaved: () => void;
}) {
  const candidates = vessels.filter(vessel => vessel.canSetBaseline)
    .map(vessel => ({ ...vessel, name: vessel.vesselName, assetKind: 'vessel' as const })).sort(compareFleetAssets);
  const [selection, setSelection] = useState<number>();
  const vesselId = (candidates.find(vessel => vessel.vesselId === (selection ?? preferredVesselId)) ?? candidates[0])?.vesselId;
  const [{ date, time: newTime }, setMeasurement] = useState(newMeasurement);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<LoadedState>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [conflict, setConflict] = useState(false);
  const pending = useRef(false);
  const active = useRef(true);
  const now = new Date();
  const today = seaOperationToday(now);
  const latestTime = date === today ? parisClock.format(now) : undefined;
  const time = selectedTime ?? newTime;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= earliestDate && date <= today;
  const validTime = isFleetFuelReadingTime(time) && (latestTime === undefined || time <= latestTime);
  const dayResponse = response?.client === client && response.vesselId === vesselId && response.date === date ? response : undefined;
  const times = dayResponse?.times ?? [];
  const duplicate = selectedTime === null && times.includes(time);
  const current = dayResponse?.time === selectedTime && dayResponse.revision === revision ? dayResponse : undefined;
  const loaded = current && 'configuration' in current ? current : undefined;
  const configuration = loaded?.configuration;
  const missingReading = Boolean(selectedTime && configuration && !configuration.reading);
  const fields: TankField[] = loaded?.configuration.tanks.map(tank => {
    const draft = loaded.drafts[tank.key];
    const value = draftValue(tank, draft);
    const saved = loaded.configuration.reading?.tanks.find(row => matchesTank(row, tank) && row.unit === draft.unit && row.value === value);
    return { ...tank, draft, value, liters: value === null ? null : saved?.liters ?? measuredLiters(tank, draft.unit, value) };
  }) ?? [];
  const valid = validTime && !duplicate && !missingReading && Boolean(configuration?.canSetBaseline && fields.length
    && fields.every(field => field.value !== null && field.liters !== null));

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (vesselId === undefined || !validDate) return;
    const scope = { client, vesselId, date, time: selectedTime, revision };
    let requestActive = true;
    void fetchSeaOperationFuelTanks(client, vesselId, date, selectedTime).then(configuration => {
      if (requestActive) setResponse({ ...scope, times: configuration.times, configuration, drafts: initialDrafts(configuration) });
    }).catch(reason => {
      if (requestActive) setResponse(previous => ({ ...scope, error: consumptionErrorMessage(reason),
        times: previous?.client === client && previous.vesselId === vesselId && previous.date === date ? previous.times : [] }));
    });
    return () => { requestActive = false; };
  }, [client, vesselId, date, selectedTime, revision, validDate]);

  function resetError() { setSaveError(''); setConflict(false); }
  function reload() { resetError(); setRevision(value => value + 1); }

  function chooseReading(nextTime: string | null, nextDate = date) {
    setSelectedTime(nextTime);
    if (nextTime === null) setMeasurement(newMeasurement(nextDate));
    reload();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || conflict || !configuration?.canSetBaseline || vesselId === undefined || !valid) return;
    const readings = fields.flatMap(({ key, draft, value }) => value === null ? [] : [{ key, unit: draft.unit, value }]);
    setSelection(vesselId);
    pending.current = true;
    setSaving(true);
    setSaveError('');
    try {
      await saveSeaOperationFuelTanks(client, vesselId, date, time, configuration.reading?.version ?? null, readings);
      if (active.current) onSaved();
    } catch (reason) {
      if (active.current) {
        const concurrent = Boolean(reason && typeof reason === 'object' && 'code' in reason && reason.code === '40001');
        if (concurrent && selectedTime === null) {
          setResponse(previous => previous && { ...previous, times: [...new Set([...previous.times, time])].sort() });
        } else {
          setSaveError(consumptionErrorMessage(reason));
          setConflict(concurrent);
        }
      }
    } finally {
      pending.current = false;
      if (active.current) setSaving(false);
    }
  }

  return <AppDialog size="md" title="Soutes" eyebrow="Suivi carburant" icon={<Fuel size={21} aria-hidden="true" />}
    description="Renseignez les niveaux mesurés à la date et à l’heure de Paris choisies."
    isBusy={saving} onClose={onClose} onSubmit={event => void submit(event)}
    footer={<div className="app-dialog__actions"><button type="button" className="sp-button sp-button--secondary" onClick={onClose} disabled={saving}>Annuler</button>
      <button type="submit" className="sp-button sp-button--primary" disabled={saving || conflict || !valid}>{saving ? 'Enregistrement…' : 'Enregistrer les niveaux'}</button></div>}>
    <div className="so-soutes-dialog">
      <fieldset className="so-soutes-selectors" disabled={saving}>
        <label className="so-field so-soutes-vessel"><span className="so-field-label">Navire</span><select value={vesselId ?? ''} disabled={!candidates.length}
          onChange={event => { setSelection(Number(event.target.value)); chooseReading(null); }}>
          {!candidates.length && <option value="">Aucun navire disponible</option>}
          {candidates.map(vessel => <option key={vessel.vesselId} value={vessel.vesselId}>{vessel.vesselName}</option>)}
        </select></label>
        <label className="so-field"><span className="so-field-label">Date de référence</span><input type="date" min={earliestDate} max={today}
          value={date} onChange={event => { setSelection(vesselId); chooseReading(null, event.target.value); }} /></label>
        <label className="so-field"><span className="so-field-label">Heure du relevé</span><input type="time" step={60} max={latestTime}
          value={time} readOnly={selectedTime !== null} aria-invalid={Boolean(time) && !validTime || undefined}
          onChange={event => { setSelection(vesselId); setMeasurement({ date, time: event.target.value }); resetError(); }} /></label>
        {(times.length > 0 || selectedTime) && <label className="so-field so-soutes-day-readings"><span className="so-field-label">Relevés de la journée</span>
          <select value={selectedTime ?? ''} onChange={event => { setSelection(vesselId); chooseReading(event.target.value || null); }}>
            <option value="">Nouveau relevé</option>
            {times.map(savedTime => <option key={savedTime} value={savedTime}>{savedTime}</option>)}
            {selectedTime && !times.includes(selectedTime) && <option value={selectedTime}>{selectedTime}</option>}
          </select>
        </label>}
      </fieldset>
      <p className="so-help">À 00:00, les DPR validés sont déduits dès le jour du relevé. Pour une heure ultérieure, le décompte commence le lendemain.</p>
      {validDate && !validTime && <p className="so-help">Choisissez une heure de relevé passée ou actuelle.</p>}
      {duplicate && <div className="so-soutes-status"><p role="status">Un relevé existe déjà à {time}.</p>
        <button type="button" className="sp-button sp-button--secondary" disabled={saving}
          onClick={() => { setSelection(vesselId); chooseReading(time); }}>Modifier le relevé de {time}</button>
      </div>}
      {!candidates.length ? <p>Aucun navire accessible pour la saisie des soutes.</p>
        : !validDate ? <p className="so-help">Choisissez une date de référence valide.</p>
        : !current ? <p role="status">Chargement des soutes…</p>
        : 'error' in current ? <div className="so-soutes-status"><p role="alert">{current.error}</p>
          <button type="button" className="sp-button sp-button--secondary" onClick={reload}>Réessayer</button></div>
        : missingReading ? <p role="status">Ce relevé n’est plus disponible. Choisissez un autre relevé ou créez-en un nouveau.</p>
        : fields.length === 0 ? <p>Aucune soute configurée pour ce navire. Renseignez les capacités dans Navires.</p>
        : <>
          <TotalStock fields={fields} />
          <PreviousReading reading={current.configuration.reading} tanks={current.configuration.tanks} />
          {!current.configuration.canSetBaseline && <p className="so-help">Ce relevé est en consultation selon vos droits sur le navire.</p>}
          <fieldset className="so-soutes-layout" aria-label="Niveaux des soutes" disabled={saving || !current.configuration.canSetBaseline}>
            <SeaOperationFuelTankLayout tanks={fields} renderTank={field => <TankEntry field={field} onChange={draft => {
              setSelection(vesselId);
              setResponse(previous => previous && 'drafts' in previous ? { ...previous, drafts: { ...previous.drafts, [field.key]: draft } } : previous);
              if (!conflict) setSaveError('');
            }} />} />
          </fieldset>
        </>}
      {saveError && <div className="so-soutes-status"><p className="so-alert so-danger" role="alert">{saveError}</p>
        {conflict && <button type="button" className="sp-button sp-button--secondary" onClick={reload}>Recharger le relevé</button>}
      </div>}
    </div>
  </AppDialog>;
}
