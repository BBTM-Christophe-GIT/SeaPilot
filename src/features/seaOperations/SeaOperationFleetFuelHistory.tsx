import { Download } from 'lucide-react';
import { useEffect, useId, useRef, useState, type Ref } from 'react';
import type { SeaOperationFleetFuelMonth } from './seaOperationFleetFuelQuery';
import { buildSeaOperationFleetFuelHistoryPng } from './seaOperationFleetFuelHistoryImage';
import { seaOperationToday } from './seaOperationModel';
import './seaOperationFleetFuelHistory.css';

export type SeaOperationFleetFuelHistoryMonth = SeaOperationFleetFuelMonth;

interface Props {
  vesselName: string;
  year: number;
  years: readonly number[];
  months?: readonly SeaOperationFleetFuelMonth[];
  loading: boolean;
  error?: boolean | string;
  onRetry: () => void;
  onYearChange: (year: number) => void;
}

interface HistoryMonth extends SeaOperationFleetFuelMonth {
  cumulativeLiters: number | null;
  cumulativeCostEuros: number | null;
  cumulativeUnpricedLiters: number;
}

const fullMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' });
const shortMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
const monthNumbers = Array.from({ length: 12 }, (_, index) => index + 1);
const monthName = (month: number) => fullMonth.format(new Date(Date.UTC(2000, month - 1, 1)));
const monthLabel = (month: number) => shortMonth.format(new Date(Date.UTC(2000, month - 1, 1)));
const quantity = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
const litersText = (value: number | null) => value === null ? '—' : `${quantity.format(value)} L`;
const moneyText = (value: number | null) => value === null ? '—' : `${currency.format(value)} HT`;

function historyMonths(source: readonly SeaOperationFleetFuelMonth[] | undefined, lastMonth: number): HistoryMonth[] {
  const byMonth = new Map(source?.map(row => [row.month, row]));
  let cost = 0;
  let liters = 0;
  let unpriced = 0;
  let hasReading = false;
  let hasPricedVolume = false;
  return monthNumbers.map(month => {
    const row = month <= lastMonth ? byMonth.get(month) : undefined;
    if (row?.liters != null) {
      hasReading = true;
      liters += row.liters;
      unpriced += row.unpricedLiters;
      if (row.costEuros !== null) {
        cost += row.costEuros;
        hasPricedVolume ||= row.liters > row.unpricedLiters;
      }
    }
    const elapsed = hasReading && month <= lastMonth;
    return {
      month, liters: row?.liters ?? null, costEuros: row?.costEuros ?? null, unpricedLiters: row?.unpricedLiters ?? 0,
      cumulativeLiters: elapsed ? liters : null,
      cumulativeCostEuros: elapsed && (hasPricedVolume || unpriced === 0) ? cost : null,
      cumulativeUnpricedLiters: unpriced,
    };
  });
}

function cumulativeText(row: HistoryMonth) {
  const amount = moneyText(row.cumulativeCostEuros);
  return row.cumulativeCostEuros !== null && row.cumulativeUnpricedLiters > 0 ? `${amount} · partiel` : amount;
}

interface PlotPanel {
  title: string;
  color: string;
  top: number;
  bottom: number;
  value: (row: HistoryMonth) => number | null;
  isPartial?: (row: HistoryMonth) => boolean;
}

const panels: readonly PlotPanel[] = [
  { title: 'Consommation cumulée (L)', color: 'var(--sp-primary)', top: 34, bottom: 143, value: row => row.cumulativeLiters },
  { title: 'Coût cumulé estimé (€ HT)', color: 'var(--sp-category-billing)', top: 182, bottom: 291,
    value: row => row.cumulativeCostEuros, isPartial: row => row.cumulativeUnpricedLiters > 0 },
];

function axisTicks(maximum: number): number[] {
  const target = Math.max(1, maximum) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = magnitude * ([1, 2, 5, 10].find(factor => factor >= target / magnitude) ?? 10);
  const intervals = Math.ceil(Math.max(1, maximum) / step);
  return Array.from({ length: intervals + 1 }, (_, index) => index * step);
}

function HistoryPlot({ rows, lastMonth, selectedMonth, hasPartialCost, svgRef, onMonthChange }: {
  rows: readonly HistoryMonth[]; lastMonth: number; selectedMonth: number; hasPartialCost: boolean;
  svgRef: Ref<SVGSVGElement>; onMonthChange: (month: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => {
      const next = Math.floor(element.getBoundingClientRect().width);
      if (next > 0) setWidth(Math.max(272, Math.min(1600, next)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const height = hasPartialCost ? 342 : 321;
  const left = 54, right = width - 21;
  const step = (right - left) / 11;
  const x = (month: number) => left + (month - 1) * step;
  const futureStart = x(lastMonth) + step / 2;
  const muted = 'var(--sp-muted)', border = 'var(--sp-border)', surface = 'var(--sp-surface)';
  return <div className="so-fuel-history-plot" ref={host}>
    <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      role="img" aria-label="Consommation cumulée et coût cumulé estimé" fontSize="12" fontFamily="var(--sp-font)"
      onClick={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (!bounds.width) return;
        const position = (event.clientX - bounds.left) * width / bounds.width;
        const month = 1 + Math.round((position - left) / step);
        if (month >= 1 && month <= lastMonth) onMonthChange(month);
      }}>
      <rect width={width} height={height} fill={surface} />
      {panels.map(panel => {
        const points = rows.flatMap(row => {
          const value = panel.value(row);
          return value === null ? [] : [{ month: row.month, value, partial: panel.isPartial?.(row) ?? false }];
        });
        const ticks = axisTicks(Math.max(0, ...points.map(point => point.value)));
        const maximum = ticks[ticks.length - 1];
        const y = (value: number) => panel.bottom - value / maximum * (panel.bottom - panel.top);
        return <g key={panel.title}>
          <line x1="13" x2="31" y1={panel.top - 15} y2={panel.top - 15} stroke={panel.color} strokeWidth="3" strokeLinecap="round" />
          <text x="38" y={panel.top - 11} fill="var(--sp-heading)" fontWeight="650">{panel.title}</text>
          {lastMonth < 12 && <rect x={futureStart} y={panel.top} width={Math.max(0, right - futureStart)} height={panel.bottom - panel.top} fill="var(--sp-surface-subtle)" />}
          {ticks.map(tick => <g key={tick}>
            <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke={border} />
            <text x={left - 7} y={y(tick) + 4} textAnchor="end" fill={muted}>{compact.format(tick)}</text>
          </g>)}
          <line x1={x(selectedMonth)} x2={x(selectedMonth)} y1={panel.top} y2={panel.bottom} stroke="var(--sp-border-strong)" />
          {points.map((point, index) => {
            const previous = points[index - 1];
            return <g key={point.month}>
              {previous && previous.month + 1 === point.month && <line x1={x(previous.month)} y1={y(previous.value)}
                x2={x(point.month)} y2={y(point.value)} stroke={panel.color} strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={point.partial || previous.partial ? '5 4' : undefined} />}
              <circle cx={x(point.month)} cy={y(point.value)} r={point.month === selectedMonth ? 5 : 3.2}
                fill={point.partial ? surface : panel.color} stroke={point.partial ? panel.color : surface} strokeWidth="1.6" />
            </g>;
          })}
          {!points.length && <text x={(left + right) / 2} y={(panel.top + panel.bottom) / 2 + 4} fill={muted} textAnchor="middle">Coût indisponible</text>}
        </g>;
      })}
      {monthNumbers.filter(month => width >= 510 || month % 2 === 1).map(month => <text key={month}
        x={x(month)} y="313" textAnchor="middle" fill={muted}>{monthLabel(month)}</text>)}
      {hasPartialCost && <g>
        <line x1="13" x2="31" y1="331" y2="331" stroke="var(--sp-category-billing)" strokeWidth="2.5" strokeDasharray="5 4" />
        <text x="38" y="335" fill={muted}>Coût partiel</text>
      </g>}
    </svg>
  </div>;
}

export function SeaOperationFleetFuelHistory({ vesselName, year, years, months, loading, error, onRetry, onYearChange }: Props) {
  const headingId = useId();
  const scope = `${vesselName}:${year}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const svgRef = useRef<SVGSVGElement>(null);
  const pending = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();
  const [selection, setSelection] = useState<{ scope: string; month: number }>();
  const today = seaOperationToday();
  const calendarYear = Number(today.slice(0, 4));
  const isCurrentYear = year === calendarYear;
  const lastMonth = isCurrentYear ? Number(today.slice(5, 7)) : year < calendarYear ? 12 : 0;
  const asOf = isCurrentYear ? `Mois en cours au ${today.split('-').reverse().join('/')}` : '';
  const rows = historyMonths(months, lastMonth);
  const latest = rows.filter(row => row.cumulativeLiters !== null).at(-1);
  const selected = rows[(selection?.scope === scope ? selection.month : latest?.month ?? 1) - 1];
  const missing = latest?.cumulativeUnpricedLiters ?? 0;
  const costNote = missing > 0 ? `${litersText(missing)} sans prix applicable. ${latest?.cumulativeCostEuros === null ? 'Coût cumulé indisponible.' : 'Coût cumulé partiel.'}` : '';
  const hasPartialCost = rows.some(row => row.cumulativeCostEuros !== null && row.cumulativeUnpricedLiters > 0);
  const canExport = Boolean(latest) && !loading && !error;

  async function exportPng() {
    const svg = svgRef.current;
    if (!svg || !canExport || pending.current) return;
    pending.current = true;
    setExporting(true);
    setExportError(undefined);
    try {
      const blob = await buildSeaOperationFleetFuelHistoryPng(svg, { vesselName, year, asOf, costNote });
      if (currentScope.current !== scope || svgRef.current !== svg) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const safeName = vesselName.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Navire';
      anchor.download = `Carburant - ${safeName} - ${year}.png`;
      anchor.hidden = true;
      document.body.append(anchor);
      try { anchor.click(); }
      finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch {
      if (currentScope.current === scope && svgRef.current === svg) setExportError(scope);
    } finally {
      pending.current = false;
      setExporting(false);
    }
  }

  return <section className="so-fuel-history" aria-labelledby={headingId}>
    <header className="so-fuel-history-heading">
      <div><h3 id={headingId}>Historique annuel du carburant</h3><p>{vesselName} · Cumul des DPR validés{asOf ? ` · ${asOf}` : ''}</p></div>
      <div className="so-fuel-history-controls">
        <label>Année<select value={year} onChange={event => onYearChange(Number(event.target.value))}>
          {[...new Set([year, ...years])].sort((a, b) => b - a).map(option => <option key={option} value={option}>{option}</option>)}
        </select></label>
        <button className="sp-button sp-button--secondary so-secondary" type="button" disabled={!canExport || exporting}
          onClick={() => void exportPng()} aria-label="Exporter le graphique en PNG">
          <Download size={16} aria-hidden="true" />{exporting ? 'Export en cours…' : 'Exporter en PNG'}
        </button>
      </div>
    </header>
    {loading ? <p role="status">Chargement de l’historique…</p> : error ? <div className="so-fuel-history-status">
      <p role="alert">{typeof error === 'string' ? error : 'L’historique du carburant est indisponible.'}</p>
      <button className="sp-button sp-button--secondary so-secondary" type="button" onClick={onRetry}>Réessayer</button>
    </div> : !latest ? <p>Aucune consommation renseignée pour cette année.</p> : <>
      <HistoryPlot rows={rows} lastMonth={lastMonth} selectedMonth={selected.month} hasPartialCost={hasPartialCost} svgRef={svgRef}
        onMonthChange={month => setSelection({ scope, month })} />
      {costNote && <p className="so-fuel-history-coverage">{costNote}</p>}
      <div className="so-fuel-history-month" role="group" aria-label="Lecture du mois">
        <label>Mois<select value={selected.month} onChange={event => setSelection({ scope, month: Number(event.target.value) })}>
          {monthNumbers.slice(0, lastMonth).map(month => <option key={month} value={month}>{monthName(month)}</option>)}
        </select></label>
        <dl><div><dt>Consommation cumulée</dt><dd>{litersText(selected.cumulativeLiters)}</dd></div>
          <div><dt>Coût cumulé estimé</dt><dd>{cumulativeText(selected)}</dd></div></dl>
      </div>
      <details className="so-fuel-history-table"><summary>Données mensuelles</summary>
        <div className="so-fuel-history-table-scroll" role="region" aria-label="Données mensuelles du carburant" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Mois</th><th scope="col">Consommation du mois</th><th scope="col">Consommation cumulée</th><th scope="col">Coût estimé du mois</th>
              <th scope="col">Coût cumulé estimé</th><th scope="col">Volume sans prix</th></tr></thead>
            <tbody>{rows.slice(0, lastMonth).map(row => <tr key={row.month}>
              <th scope="row">{monthName(row.month)}{isCurrentYear && row.month === lastMonth && <small> · En cours</small>}</th>
              <td>{litersText(row.liters)}</td><td>{litersText(row.cumulativeLiters)}</td><td>{moneyText(row.costEuros)}</td><td>{cumulativeText(row)}</td>
              <td>{litersText(row.liters === null ? null : row.unpricedLiters)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </>}
    {exportError === scope && <p className="so-fuel-history-coverage" role="alert">Impossible d’exporter le graphique en PNG. Réessayez.</p>}
  </section>;
}
