import { QHSE_CHART_CONTROLS } from './qhseReportTrends';
import type { QhseReportOptions } from './qhseReportData';
import type { QhseGraphAvailability } from './qhseGraphAvailability';
const CONSUMPTION = [['water', 'Eau avitaillée'], ['fuel', 'Fuel consommé'], ['emissions', 'GES sans XBEE'], ['xbee', 'GES avec XBEE']] as const;
const OFF = { water: false, fuel: false, emissions: false, xbee: false };
interface Props { reportId: string; value: QhseReportOptions; disabled?: boolean; availability?: QhseGraphAvailability; onChange(value: QhseReportOptions): void }
export function QhseGraphOptions({ reportId, value, disabled, availability, onChange }: Props) {
  const controls = reportId === 'consumption' ? CONSUMPTION.map(([key, label]) => ({ key, label, trend: true, forecast: true, reason: '' })) : QHSE_CHART_CONTROLS[reportId];
  if (!controls?.length) return <p className="kpi-options-help">Ce rapport ne contient pas de graphique paramétrable.</p>;
  return <fieldset className="kpi-graph-options" disabled={disabled}><legend>Réglages des graphiques</legend>
    <div className="kpi-options-heading"><span>Courbe</span><span>Tendance</span><span>Prévision</span></div>
    {controls.map((control) => <div className="kpi-option-row" key={control.key}><strong>{control.label}</strong>{(['trend', 'forecast'] as const).map((kind) => {
      const consumptionKey = control.key as keyof typeof OFF;
      const checked = reportId === 'consumption' ? Boolean(value[kind]?.[consumptionKey]) : Boolean(value.charts?.[control.key]?.[kind]);
      return <label key={kind} title={availability?.[control.key]?.reason || control.reason || `${kind === 'trend' ? 'Tendance' : 'Prévision'} · ${control.label}`}><input type="checkbox" role="switch" aria-label={`${kind === 'trend' ? 'Tendance' : 'Prévision'} ${control.label}`} disabled={!control[kind] || availability?.[control.key]?.[kind] === false} checked={checked} onChange={(event) => {
        onChange(reportId === 'consumption' ? { ...value, [kind]: { ...OFF, ...value[kind], [control.key]: event.target.checked } }
          : { ...value, charts: { ...value.charts, [control.key]: { ...value.charts?.[control.key], [kind]: event.target.checked } } });
      }} /></label>;
    })}{control.reason && <small>{control.reason}</small>}</div>)}
    {availability && <p className="kpi-options-help">{[...new Set(controls.filter((c) => !c.reason).map((c) => availability[c.key]?.reason).filter(Boolean))].join(' ')}</p>}
    <p className="kpi-options-help"><b>Tendance</b> : évolution observée. <b>Prévision</b> : estimation future en pointillés. Calcul uniquement si les mois terminés sont suffisamment renseignés ; les totaux réels ne changent pas.</p>
  </fieldset>;
}
