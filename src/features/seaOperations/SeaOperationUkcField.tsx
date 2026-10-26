import { useId } from 'react';
import type { SeaOperationPayload, SeaOperationWaypoint } from './seaOperationModel';
import { seaOperationUkcPresentation } from './seaOperationUkcPresentation';
import { SeaOperationUkcIndicator } from './SeaOperationUkcIndicator';
import { assessSeaOperationUkc } from './seaOperationUkc';
import { seaWaypointPosition } from './seaOperationNavigation';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import type { SeaOperationUkcRequestStatus } from './seaOperationValidationUkc';
import './seaOperationUkcEditor.css';

function waitingMessage(payload: SeaOperationPayload, point: SeaOperationWaypoint): string {
  if (!payload.planning?.projectId) return 'Sélectionnez un projet du planning.';
  if (payload.vessel.draftMeters == null) return 'Renseignez le tirant d’eau dans Navires.';
  if (!seaWaypointPosition(point)) return 'Renseignez les coordonnées.';
  try { if (Date.parse(seaOperationEtaUtc(point.eta)) <= Date.now()) return 'L’ETA est passée : aucune prévision UKC enregistrée.'; }
  catch { return 'Renseignez une date et une heure d’ETA.'; }
  return 'Préparation du calcul UKC…';
}

export function SeaOperationUkcField({ payload, point, index, disabled, readOnly = false, status, onChange }: {
  payload: SeaOperationPayload; point: SeaOperationWaypoint; index: number; disabled: boolean;
  readOnly?: boolean; status?: SeaOperationUkcRequestStatus; onChange: (patch: Partial<SeaOperationWaypoint>) => void;
}) {
  const id = useId(), presentation = seaOperationUkcPresentation(payload, point), automatic = point.ukcMode === 'automatic';
  const requestStatus = readOnly ? undefined : status;
  const message = requestStatus?.loading ? 'Calcul UKC en cours…' : requestStatus?.error || (presentation.capture?.status === 'unavailable' ? presentation.capture.message
    : presentation.capture ? presentation.caption : readOnly ? 'UKC automatique non enregistrée dans cette version.' : waitingMessage(payload, point));
  const successful = presentation.capture?.status === 'available' && !requestStatus?.loading && !requestStatus?.error;
  return <div role="cell" className={`so-passage-field is-ukc so-ukc-editor-field${readOnly ? ' is-readonly' : ''}`}>
    <div className="so-ukc-field-toolbar">
    <label htmlFor={id}>UKC</label>
    <div className={`so-ukc-mode${readOnly ? ' is-readonly' : ''}`} role="group" aria-label={`Mode UKC · point ${index + 1}`}>
      {readOnly ? <span className="so-ukc-mode-label">{automatic ? 'Automatique' : 'Manuel'}</span> : <>
      <button type="button" className="sp-button sp-button--secondary" aria-pressed={automatic} disabled={disabled} onClick={() => onChange({ ukcMode: 'automatic' })}>Auto</button>
      <button type="button" className="sp-button sp-button--secondary" aria-pressed={!automatic} disabled={disabled} onClick={() => onChange({ ukcMode: 'manual' })}>Manuel</button></>}
    </div>
    {automatic ? <output id={id} aria-label={`UKC · point ${index + 1}`} aria-live="off" className="so-ukc-field-value">
      {presentation.rawValue ? <SeaOperationUkcIndicator value={presentation.rawValue} draftMeters={payload.vessel.draftMeters} approximate={presentation.approximate} /> : <span className="so-ukc-unclassified">Indisponible</span>}
    </output> : <input id={id} aria-label={`UKC · point ${index + 1}`} type="text" readOnly={readOnly || disabled} value={point.ukc}
      onChange={event => { if (!readOnly && !disabled) onChange({ ukc: event.target.value, ukcMode: 'manual' }); }} />}
    {!automatic && assessSeaOperationUkc(presentation.rawValue, payload.vessel.draftMeters) && <SeaOperationUkcIndicator value={presentation.rawValue}
      draftMeters={payload.vessel.draftMeters} approximate={presentation.approximate} />}
    {automatic && presentation.capture && presentation.details.length > 0 && <details className="so-ukc-details"><summary>Détails UKC</summary>
      {presentation.details.map((detail, item) => <p key={item}>{detail}</p>)}
      {presentation.sourceUrls.map(url => <a href={url} target="_blank" rel="noopener noreferrer" key={url}>Source Copernicus Marine</a>)}
    </details>}
    </div>
    {automatic && <small className="so-ukc-field-status" role="status" aria-label={`État du calcul UKC · point ${index + 1}`} title={message}>{successful ? 'Indicative · incertitude non quantifiée' : message}</small>}
  </div>;
}
