import { CalendarDays, MessageSquareText, UsersRound } from 'lucide-react';
import { useId, useState } from 'react';
import { compareFleetNames } from '../fleet/fleetDisplay';
import type { ExerciseCrewPresenceData } from './processPerformance';
import './ExerciseCrewPresence.css';

const numberFormat = new Intl.NumberFormat('fr-FR');
const shortDateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' });

function dateBounds(data: ExerciseCrewPresenceData) {
  const asOf = data.asOf.slice(0, 10);
  const asOfYear = Number(asOf.slice(0, 4));
  const min = `${data.year}-01-01`;
  const max = data.year < asOfYear ? `${data.year}-12-31`
    : data.year > asOfYear ? min
      : new Date(Date.UTC(data.year, Number(asOf.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return { min, max, initial: data.year === asOfYear ? asOf : data.year < asOfYear ? max : min };
}

function PresenceValue({ value, unit }: { value: number | undefined; unit: string }) {
  return <dd>{value === undefined ? <span className="exercise-crew-presence-missing">Non renseigné</span>
    : <><strong>{numberFormat.format(value)}</strong><span>{unit}</span></>}</dd>;
}

export function ExerciseCrewPresence({ data }: { data: ExerciseCrewPresenceData }) {
  const headingId = useId();
  const dateId = useId();
  const [selectedOn, setSelectedOn] = useState('');
  const { min, max, initial } = dateBounds(data);
  const on = selectedOn >= min && selectedOn <= max ? selectedOn : initial;
  const date = new Date(`${on}T12:00:00Z`);
  const month = Number(on.slice(5, 7));
  const monthName = monthFormat.format(date);
  const forecast = on > data.asOf.slice(0, 10);
  const vessels = [...data.vessels].sort((a, b) => compareFleetNames(a.name, b.name));
  const days = new Map(data.days.filter((day) => day.on === on).map((day) => [day.vesselId, day.count]));
  const months = new Map(data.months.filter((item) => item.month === month).map((item) => [item.vesselId, item]));

  return <section aria-labelledby={headingId} className="exercise-crew-presence">
    <header className="exercise-crew-presence-header"><div><h4 id={headingId}><UsersRound aria-hidden="true" size={17} />Présence au planning</h4>
      <p>Les bordées se relaient : le nombre de marins affectés sur le mois peut dépasser le nombre présent un même jour.</p></div>
      <label htmlFor={dateId}><span><CalendarDays aria-hidden="true" size={13} />Date de présence</span>
        <input id={dateId} type="date" min={min} max={max} value={on} onChange={(event) => setSelectedOn(event.currentTarget.value)} required />
      </label></header>
    {forecast ? <p className="exercise-crew-presence-forecast" role="status">Prévision du planning au {shortDateFormat.format(date)} ; données arrêtées au {shortDateFormat.format(new Date(`${data.asOf.slice(0, 10)}T12:00:00Z`))}</p> : null}
    <ul className="exercise-crew-presence-vessels" aria-label="Présence par navire">
      {vessels.map((vessel) => {
        const day = days.get(vessel.id);
        const monthly = months.get(vessel.id);
        return <li key={vessel.id}><strong className="exercise-crew-presence-name">{vessel.name}</strong><dl>
          <div><dt>Présents le {shortDateFormat.format(date)}</dt><PresenceValue value={day} unit={day === 1 ? 'marin' : 'marins'} /></div>
          <div><dt>Affectés en {monthName}</dt><PresenceValue value={monthly?.people} unit="personnes distinctes" /></div>
          <div><dt>Journées de présence</dt><PresenceValue value={monthly?.presenceDays} unit={`sur ${monthName}`} /></div>
        </dl></li>;
      })}
    </ul>
    {!vessels.length ? <p className="exercise-crew-presence-empty">Aucun navire renseigné pour ce périmètre.</p> : null}
    <p className="exercise-crew-presence-note">Chaque marin compte une fois dans le total mensuel. Les journées de présence additionnent les jours planifiés de chaque marin. Une donnée non renseignée ne vaut pas zéro.</p>
    <footer><MessageSquareText aria-hidden="true" size={15} /><span><strong>{numberFormat.format(data.bonusTbt)} participation{data.bonusTbt === 1 ? '' : 's'} TBT</strong> en {data.year} · en complément, hors score obligatoire.</span></footer>
  </section>;
}
