import { useId } from 'react';
import type { SeaOperationPayload, SeaOperationWaypoint } from './seaOperationModel';
import { seaOperationUkcPrerequisite, seaOperationUkcPresentation } from './seaOperationUkcPresentation';
import { SeaOperationUkcIndicator } from './SeaOperationUkcIndicator';
import { assessSeaOperationUkc } from './seaOperationUkc';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import type { SeaOperationUkcRequestStatus } from './seaOperationValidationUkc';
import './seaOperationUkcEditor.css';

export function SeaOperationUkcField({ payload, point, index, disabled, readOnly = false, showDraftThreshold = false, status, onChange }: {
  payload: SeaOperationPayload; point: SeaOperationWaypoint; index: number; disabled: boolean;
  readOnly?: boolean; showDraftThreshold?: boolean; status?: SeaOperationUkcRequestStatus; onChange: (patch: Partial<SeaOperationWaypoint>) => void;
}) {
  const id = useId(), presentation = seaOperationUkcPresentation(payload, point, showDraftThreshold && !readOnly), automatic = presentation.automatic;
  const showRequirement = presentation.threshold || presentation.fallback;
  const requestStatus = readOnly ? undefined : status;
  let message = presentation.caption;
  if (requestStatus?.loading) message = 'Calcul UKC en cours…';
  else if (requestStatus?.error) message = requestStatus.error;
  else if (automatic && !readOnly && !presentation.capture && !presentation.fallback && !seaOperationUkcPrerequisite(payload, point)) {
    message = Date.parse(seaOperationEtaUtc(point.eta)) <= Date.now()
      ? 'UKC indisponible · L’ETA est passée. Aucune prévision UKC enregistrée.' : 'Préparation du calcul UKC…';
  }
  return <div role="cell" className={`so-passage-field is-ukc so-ukc-editor-field${readOnly ? ' is-readonly' : ''}`}>
    <div className="so-ukc-field-toolbar">
    <label htmlFor={id}>UKC</label>
    <div className={`so-ukc-mode${readOnly ? ' is-readonly' : ''}`} role="group" aria-label={`Mode UKC · point ${index + 1}`}>
      {readOnly ? <span className="so-ukc-mode-label">{automatic ? 'Automatique' : 'Manuel'}</span> : <>
      <button type="button" className="sp-button sp-button--secondary" aria-pressed={automatic} disabled={disabled} onClick={() => onChange({ ukcMode: 'automatic' })}>Auto</button>
      <button type="button" className="sp-button sp-button--secondary" aria-pressed={!automatic} disabled={disabled} onClick={() => onChange({ ukcMode: 'manual' })}>Manuel</button></>}
    </div>
    {automatic ? <output id={id} aria-label={`UKC · point ${index + 1}`} aria-live="off" className="so-ukc-field-value">
      {presentation.rawValue ? <SeaOperationUkcIndicator value={presentation.rawValue} draftMeters={payload.vessel.draftMeters} approximate={presentation.approximate} />
        : <span className="so-ukc-unclassified">UKC indisponible{showRequirement && <><br /><small>{presentation.label} · {presentation.displayValue}</small></>}</span>}
    </output> : <input id={id} aria-label={`UKC · point ${index + 1}`} type="text" readOnly={readOnly || disabled} value={point.ukc}
      onChange={event => { if (!readOnly && !disabled) onChange({ ukc: event.target.value, ukcMode: 'manual' }); }} />}
    {!automatic && assessSeaOperationUkc(presentation.rawValue, payload.vessel.draftMeters) && <SeaOperationUkcIndicator value={presentation.rawValue}
      draftMeters={payload.vessel.draftMeters} approximate={presentation.approximate} />}
    {automatic && (presentation.capture || showRequirement) && presentation.details.length > 0 && <details className="so-ukc-details"><summary>Détails UKC</summary>
      {presentation.details.map((detail, item) => <p key={item}>{detail}</p>)}
      {presentation.sourceUrls.map(url => <a href={url} target="_blank" rel="noopener noreferrer" key={url}>Source Copernicus Marine</a>)}
    </details>}
    </div>
    {automatic && <small className="so-ukc-field-status" role="status" aria-label={`État du calcul UKC · point ${index + 1}`} title={message}>{message}</small>}
  </div>;
}
