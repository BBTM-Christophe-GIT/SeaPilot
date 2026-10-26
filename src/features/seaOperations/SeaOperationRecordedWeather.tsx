import { RefreshCw } from 'lucide-react';
import type { SeaOperationRecord } from './seaOperationQueries';
import { SeaOperationWeatherCard } from './SeaOperationWeatherCard';
import './seaOperationRecordedWeather.css';

/** Compare the saved revision, independently of unsaved edits and later model runs. */
export function SeaOperationRecordedWeather({ record, hasUnsavedChanges, loading = false, onRefresh }: {
  record: SeaOperationRecord; hasUnsavedChanges: boolean; loading?: boolean; onRefresh: () => void;
}) {
  const signed = record.status === 'signed';
  return <section className="so-recorded-weather" aria-label="Météo enregistrée aux waypoints">
    <header><div><h3>Météo enregistrée</h3><p>Version {record.version} · {signed ? 'Prévisions conservées avec la décision du Capitaine.' : 'Prévisions du brouillon sauvegardé, avant signature.'}</p></div>
      {signed && <button className="sp-button sp-button--secondary so-secondary" disabled={loading} onClick={onRefresh} type="button"><RefreshCw size={14} aria-hidden="true" />{loading ? 'Lecture des mesures…' : 'Actualiser les mesures enregistrées'}</button>}
    </header>
    {hasUnsavedChanges && <p className="so-help" role="status">Ces cartes reprennent la dernière version enregistrée. Enregistrez vos modifications pour les retrouver ici.</p>}
    {record.weatherHistoryError && <p className="so-alert" role="status">{record.weatherHistoryError}</p>}
    {record.draft.waypoints.length ? <ol>{record.draft.waypoints.map((point, index) => <li key={point.id}>
      <h4>Waypoint {point.number || index + 1}{point.descriptionVhf.trim() ? ` · ${point.descriptionVhf}` : ''}</h4>
      <SeaOperationWeatherCard point={point} matrix={record.draft.vessel.weatherMatrix} variant="comparison"
        validatedAt={signed ? record.signedAt : undefined} observations={signed ? record.weatherObservations : undefined} />
    </li>)}</ol> : <p className="so-help">Aucun waypoint dans cette version enregistrée.</p>}
  </section>;
}
