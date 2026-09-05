import { QHSE_CHART_CONTROLS } from './qhseReportTrends';
import type { QhseReportOptions } from './qhseReportData';

interface Props { reportId: string; value: NonNullable<QhseReportOptions['charts']>; disabled: boolean; onChange(value: NonNullable<QhseReportOptions['charts']>): void }
export function QhseGraphOptions({ reportId, value, disabled, onChange }: Props) {
  const controls = QHSE_CHART_CONTROLS[reportId];
  if (!controls?.length) return null;
  return <details className="qhse-graph-options"><summary>Options des {controls.length} graphique(s)</summary>
    <fieldset disabled={disabled}><legend>Tendance et prévision indépendantes</legend>{controls.map((control) => <div key={control.key}>
      <strong>{control.label}</strong><span>{(['trend', 'forecast'] as const).map((kind) => <label key={kind}>
        <input type="checkbox" disabled={!control[kind]} checked={Boolean(value[control.key]?.[kind])} onChange={(event) => onChange({ ...value, [control.key]: { ...value[control.key], [kind]: event.target.checked } })} />
        {kind === 'trend' ? 'Tendance' : 'Prévision'}</label>)}</span>
      {control.reason && <small>{control.reason}</small>}
    </div>)}<p>La tendance décrit les mois observés. La prévision estime les mois futurs en pointillés, si les données sont suffisantes. Les totaux restent des valeurs observées.</p></fieldset>
  </details>;
}
