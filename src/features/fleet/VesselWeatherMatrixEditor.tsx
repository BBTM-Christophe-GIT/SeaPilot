import { useId, useState } from 'react';
import {
  cloneVesselWeatherMatrix, createEmptyVesselWeatherMatrix, GOURY_WEATHER_MATRIX, isVesselWeatherMatrix,
  VESSEL_SEA_STATE_LABELS, VESSEL_SEA_STATE_LEVELS, vesselHsRange, vesselPeriodRange,
  type VesselSeaStateLevel, type VesselWeatherMatrix,
} from './vesselWeatherMatrix';
import './vesselWeatherMatrixEditor.css';

interface VesselWeatherMatrixEditorProps {
  vesselName: string;
  value?: VesselWeatherMatrix | null;
  onChange?: (value: VesselWeatherMatrix | null) => void;
  onValidationChange?: (valid: boolean) => void;
  disabled?: boolean;
}

interface AxisDraft { hs: string; upper: string; period: string }

function axisDraft(matrix: VesselWeatherMatrix): AxisDraft {
  const format = (value: number) => String(value).replace('.', ',');
  return {
    hs: matrix.hsLowerBoundsMeters.slice(1).map(format).join(' ; '),
    upper: format(matrix.hsUpperBoundMeters),
    period: matrix.periodLowerBoundsSeconds.slice(1).map(format).join(' ; '),
  };
}

function axisNumbers(value: string): number[] {
  return value.trim().split(/[;\s]+/).map((item) => item.trim() ? Number(item.replace(',', '.')) : Number.NaN);
}

function withAxes(matrix: VesselWeatherMatrix, draft: AxisDraft): VesselWeatherMatrix | null {
  const candidate = {
    ...matrix,
    hsLowerBoundsMeters: [0, ...axisNumbers(draft.hs)],
    hsUpperBoundMeters: draft.upper.trim() ? Number(draft.upper.replace(',', '.')) : Number.NaN,
    periodLowerBoundsSeconds: [0, ...axisNumbers(draft.period)],
  };
  return isVesselWeatherMatrix(candidate) ? candidate : null;
}

export function VesselWeatherMatrixEditor({ vesselName, value, onChange, onValidationChange, disabled = false }: VesselWeatherMatrixEditorProps) {
  const titleId = useId();
  const [selectedPeriod, setSelectedPeriod] = useState(0);
  const [draft, setDraft] = useState(() => axisDraft(value || createEmptyVesselWeatherMatrix()));
  const editable = Boolean(onChange);
  const isGoury = vesselName.trim().toLocaleUpperCase('fr-FR') === 'GOURY';
  const matrix = value || null;
  const savedAxes = matrix ? axisDraft(matrix) : null;
  const axesChanged = Boolean(savedAxes && (savedAxes.hs !== draft.hs || savedAxes.upper !== draft.upper || savedAxes.period !== draft.period));
  const candidate = matrix ? withAxes(matrix, draft) : null;

  function replaceMatrix(next: VesselWeatherMatrix | null) {
    setDraft(axisDraft(next || createEmptyVesselWeatherMatrix()));
    onValidationChange?.(true);
    onChange?.(next);
  }

  function changeAxis(field: keyof AxisDraft, nextValue: string) {
    const nextDraft = { ...draft, [field]: nextValue };
    setDraft(nextDraft);
    onValidationChange?.(Boolean(savedAxes && savedAxes.hs === nextDraft.hs && savedAxes.upper === nextDraft.upper && savedAxes.period === nextDraft.period));
  }

  function setLevel(period: number, hs: number, level: VesselSeaStateLevel | null) {
    if (!matrix || disabled) return;
    onChange?.({ ...matrix, levels: matrix.levels.map((row, rowIndex) => rowIndex === period ? row.map((cell, columnIndex) => columnIndex === hs ? level : cell) : row) });
  }

  return <section aria-labelledby={titleId} className="vwm-editor">
    <div className="vwm-heading"><div><h3 id={titleId}>Conditions météo limites</h3><p>Matrice propre à {vesselName || 'ce navire'} : hauteur significative de houle Hs × période.</p></div>
      {editable && isGoury ? <button className="sp-button sp-button--secondary" disabled={disabled} onClick={() => replaceMatrix(cloneVesselWeatherMatrix(GOURY_WEATHER_MATRIX))} type="button">Appliquer le modèle GOURY</button> : null}
    </div>
    {!matrix ? <div className="vwm-empty"><p>Matrice non renseignée. Aucun indicateur ne sera affiché aux waypoints tant que les limites ne sont pas définies.</p>{editable ? <button className="sp-button sp-button--secondary" disabled={disabled} onClick={() => replaceMatrix(createEmptyVesselWeatherMatrix())} type="button">Définir une matrice</button> : null}</div> : <>
      <label className="vwm-period-picker">Période de la houle<select aria-label="Ligne de période à afficher" onChange={(event) => setSelectedPeriod(Number(event.target.value))} value={selectedPeriod}>{matrix.periodLowerBoundsSeconds.map((_, index) => <option key={index} value={index}>{vesselPeriodRange(matrix, index)}</option>)}</select></label>
      <div className="vwm-table-wrap"><table aria-label={`Matrice Hs × période de ${vesselName || 'ce navire'}`} className="vwm-table"><thead><tr><th scope="col">Période / Hs</th>{matrix.hsLowerBoundsMeters.map((_, hs) => <th key={hs} scope="col">{vesselHsRange(matrix, hs)}</th>)}</tr></thead><tbody>{matrix.periodLowerBoundsSeconds.map((_, period) => <tr className={selectedPeriod === period ? 'is-selected-period' : ''} key={period}><th scope="row">{vesselPeriodRange(matrix, period)}</th>{matrix.hsLowerBoundsMeters.map((_, hs) => {
        const level = matrix.levels[period][hs];
        const range = vesselHsRange(matrix, hs);
        return <td className={`vwm-level is-${level || 'undefined'}`} key={hs}><span className="vwm-mobile-hs">Hs {range}</span>{editable ? <select aria-label={`Période ${vesselPeriodRange(matrix, period)} · Hs ${range}`} disabled={disabled} onChange={(event) => setLevel(period, hs, event.target.value ? event.target.value as VesselSeaStateLevel : null)} value={level || ''}><option value="">Non défini</option>{VESSEL_SEA_STATE_LEVELS.map((item) => <option key={item} value={item}>{VESSEL_SEA_STATE_LABELS[item]}</option>)}</select> : <span>{level ? VESSEL_SEA_STATE_LABELS[level] : 'Non défini'}</span>}</td>;
      })}</tr>)}</tbody></table></div>
      <p className="vwm-range-note">La borne basse est incluse, la borne haute exclue ; la dernière borne Hs est incluse. Une cellule « Non défini » n’affiche aucun indicateur au waypoint.</p>
      {editable ? <details className="vwm-axes"><summary>Paramètres des intervalles</summary><p>Le départ des axes reste à 0. Modifier une borne conserve les niveaux des cellules à leur position ; vérifiez chaque niveau après modification.</p><div className="vwm-axis-fields"><label>6 seuils Hs (m), séparés par « ; »<input aria-invalid={axesChanged && !candidate} disabled={disabled} onChange={(event) => changeAxis('hs', event.target.value)} value={draft.hs} /></label><label>Borne Hs maximale (m)<input aria-invalid={axesChanged && !candidate} disabled={disabled} inputMode="decimal" onChange={(event) => changeAxis('upper', event.target.value)} value={draft.upper} /></label><label>5 seuils de période (s), séparés par « ; »<input aria-invalid={axesChanged && !candidate} disabled={disabled} onChange={(event) => changeAxis('period', event.target.value)} value={draft.period} /></label></div>
        {axesChanged ? <p className={candidate ? 'vwm-pending' : 'vwm-axis-error'} role={candidate ? 'status' : 'alert'}>{candidate ? 'Appliquez les intervalles avant d’enregistrer le navire.' : 'Saisissez 6 seuils Hs croissants entre 0 et 50 m, une borne maximale supérieure, et 5 seuils de période croissants entre 0 et 120 s.'}</p> : null}
        <div className="vwm-axis-actions"><button className="sp-button sp-button--secondary" disabled={disabled || !axesChanged || !candidate} onClick={() => { if (candidate) replaceMatrix(candidate); }} type="button">Appliquer les intervalles</button><button className="sp-button sp-button--secondary" disabled={disabled || !axesChanged} onClick={() => { setDraft(axisDraft(matrix)); onValidationChange?.(true); }} type="button">Annuler les intervalles</button><button className="sp-button sp-button--secondary" disabled={disabled} onClick={() => replaceMatrix(null)} type="button">Retirer la matrice</button></div>
      </details> : null}
    </>}
    {editable ? <p className="vwm-save-note">Les modifications seront conservées avec « Enregistrer » dans la fiche du navire.</p> : null}
  </section>;
}
