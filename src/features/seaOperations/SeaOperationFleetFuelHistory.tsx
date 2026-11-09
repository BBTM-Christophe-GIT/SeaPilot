import { Download } from 'lucide-react';
import { useEffect, useId, useRef, useState, type Ref } from 'react';
import type { SeaOperationFleetFuelMonth } from './seaOperationFleetFuelQuery';
import { buildSeaOperationFleetFuelHistoryPng } from './seaOperationFleetFuelHistoryImage';
import { formatFuelVolume, fuelVolumeAmount, type FuelVolumeUnit } from './seaOperationFuelVolume';
import { seaOperationToday } from './seaOperationModel';
import './seaOperationFleetFuelHistory.css';

export type SeaOperationFleetFuelHistoryMonth = SeaOperationFleetFuelMonth;
export type SeaOperationFleetFuelCostSource = 'billing' | 'dpr';

interface Props {
  vesselName: string;
  year: number;
  years: readonly number[];
  months?: readonly SeaOperationFleetFuelMonth[];
  volumeUnit?: FuelVolumeUnit;
  costSource?: SeaOperationFleetFuelCostSource;
  lastEntryDate?: string | null;
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
const shortDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' });
const monthNumbers = Array.from({ length: 12 }, (_, index) => index + 1);
const monthName = (month: number) => fullMonth.format(new Date(Date.UTC(2000, month - 1, 1)));
const monthLabel = (month: number) => shortMonth.format(new Date(Date.UTC(2000, month - 1, 1)));
const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
const fractional = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 });
const volumeText = (liters: number | null, unit: FuelVolumeUnit) => liters === null ? '—' : formatFuelVolume(liters, unit);
const moneyText = (value: number | null) => value === null ? '—' : `${currency.format(value)} HT`;

function historyMonths(source: readonly SeaOperationFleetFuelMonth[] | undefined, lastMonth: number, costSource: SeaOperationFleetFuelCostSource): HistoryMonth[] {
  const byMonth = new Map(source?.map(row => [row.month, row]));
  let cost = 0;
  let liters = 0;
  let unpriced = 0;
  let hasReading = false;
  let hasPricedVolume = false;
  let hasBilling = false;
  return monthNumbers.map(month => {
    const elapsed = month <= lastMonth;
    const row = elapsed ? byMonth.get(month) : undefined;
    if (row?.liters != null) {
      hasReading = true;
      liters += row.liters;
      if (costSource === 'dpr') unpriced += row.unpricedLiters;
    }
    if (row?.costEuros != null) {
      cost += row.costEuros;
      if (costSource === 'billing') hasBilling = true;
      else hasPricedVolume ||= (row.liters ?? 0) > row.unpricedLiters;
    }
    const hasCost = costSource === 'billing' ? hasBilling : hasReading && (hasPricedVolume || unpriced === 0);
    return {
      month, liters: row?.liters ?? null, costEuros: row?.costEuros ?? null, unpricedLiters: costSource === 'billing' ? 0 : row?.unpricedLiters ?? 0,
      cumulativeLiters: elapsed && hasReading ? liters : null,
      cumulativeCostEuros: elapsed && hasCost ? cost : null,
      cumulativeUnpricedLiters: unpriced,
    };
  });
}

function cumulativeText(row: HistoryMonth) {
  const amount = moneyText(row.cumulativeCostEuros);
  return row.cumulativeCostEuros !== null && row.cumulativeUnpricedLiters > 0 ? `${amount} · partiel` : amount;
}

interface PlotPanel {
  id: 'volume' | 'cost';
  title: string;
  color: string;
  top: number;
  bottom: number;
  value: (row: HistoryMonth) => number | null;
  selectedLabel: string;
  isPartial?: (row: HistoryMonth) => boolean;
}

function axisTicks(maximum: number): number[] {
  const domain = maximum > 0 ? maximum : 1;
  const target = domain / 3;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = magnitude * ([1, 2, 5, 10].find(factor => factor >= target / magnitude) ?? 10);
  const intervals = Math.ceil(domain / step);
  return Array.from({ length: intervals + 1 }, (_, index) => index * step);
}

function HistoryPlot({ rows, lastMonth, selected, selectedDate, volumeUnit, billed, hasPartialCost, svgRef, onMonthChange }: {
  rows: readonly HistoryMonth[]; lastMonth: number; selected: HistoryMonth; selectedDate: string;
  volumeUnit: FuelVolumeUnit; billed: boolean; hasPartialCost: boolean;
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

  const height = hasPartialCost ? 392 : 372;
  const left = 54, right = width - 21;
  const step = (right - left) / 11;
  const x = (month: number) => left + (month - 1) * step;
  const futureStart = x(lastMonth) + step / 2;
  const selectedX = x(selected.month);
  const muted = 'var(--sp-muted)', border = 'var(--sp-border)', surface = 'var(--sp-surface)';
  const selectedVolume = volumeText(selected.cumulativeLiters, volumeUnit);
  const selectedCost = cumulativeText(selected);
  const costTitle = billed ? 'Coût cumulé facturé' : 'Coût cumulé estimé';
  const panels: readonly PlotPanel[] = [
    { id: 'volume', title: `Consommation cumulée (${volumeUnit})`, color: 'var(--sp-primary)', top: 68, bottom: 168,
      value: row => row.cumulativeLiters === null ? null : fuelVolumeAmount(row.cumulativeLiters, volumeUnit), selectedLabel: selectedVolume },
    { id: 'cost', title: `${costTitle} (€ HT)`, color: 'var(--sp-category-billing)', top: 241, bottom: 341,
      value: row => row.cumulativeCostEuros, selectedLabel: selectedCost, isPartial: row => row.cumulativeUnpricedLiters > 0 },
  ];
  const valueDescription = [selectedDate,
    selected.cumulativeLiters === null ? 'Consommation cumulée indisponible' : `Consommation cumulée ${selectedVolume}`,
    selected.cumulativeCostEuros === null ? 'Coût cumulé indisponible' : `${costTitle} ${selectedCost}`,
  ].join('. ');

  return <div className="so-fuel-history-plot" ref={host}>
    <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      role="img" aria-label={`Consommation cumulée et ${costTitle.toLowerCase()}`} fontSize="12" fontFamily="var(--sp-font)">
      <rect width={width} height={height} fill={surface} />
      {panels.map(panel => {
        const points = rows.flatMap(row => {
          const value = panel.value(row);
          return value === null ? [] : [{ month: row.month, value, partial: panel.isPartial?.(row) ?? false }];
        });
        const ticks = axisTicks(Math.max(0, ...points.map(point => point.value)));
        const maximum = ticks[ticks.length - 1];
        const y = (value: number) => panel.bottom - value / maximum * (panel.bottom - panel.top);
        const selectedValue = panel.value(selected);
        const pointY = selectedValue === null ? panel.top : y(selectedValue);
        const labelY = pointY - 43;
        const valueWidth = panel.selectedLabel.length * 7;
        const labelWidth = Math.min(right - left, Math.max(94, selectedDate.length * 6 + 16, valueWidth + 16));
        const labelCenter = Math.min(right - labelWidth / 2, Math.max(left + labelWidth / 2, selectedX));
        const labelX = labelCenter - labelWidth / 2;
        const stemX = Math.max(labelX + 6, Math.min(labelX + labelWidth - 6, selectedX));
        return <g key={panel.id}>
          <line x1="13" x2="31" y1={panel.top - 55} y2={panel.top - 55} stroke={panel.color} strokeWidth="3" strokeLinecap="round" />
          <text x="38" y={panel.top - 51} fill="var(--sp-heading)" fontWeight="650">{panel.title}</text>
          {lastMonth < 12 && <rect x={futureStart} y={panel.top} width={Math.max(0, right - futureStart)} height={panel.bottom - panel.top} fill="var(--sp-surface-subtle)" />}
          {ticks.map(tick => <g key={tick}>
            <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke={border} />
            <text x={left - 7} y={y(tick) + 4} fontSize="11" textAnchor="end" fill={muted}>{(tick < 1 ? fractional : compact).format(tick)}</text>
          </g>)}
          <line x1={selectedX} x2={selectedX} y1={panel.top} y2={panel.bottom} stroke="var(--sp-border-strong)" />
          {points.map((point, index) => {
            const previous = points[index - 1];
            return <g key={point.month}>
              {previous && previous.month + 1 === point.month && <line x1={x(previous.month)} y1={y(previous.value)}
                x2={x(point.month)} y2={y(point.value)} stroke={panel.color} strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={point.partial || previous.partial ? '5 4' : undefined} />}
              <circle cx={x(point.month)} cy={y(point.value)} r={point.month === selected.month ? 5 : 3.2}
                fill={point.partial ? surface : panel.color} stroke={point.partial ? panel.color : surface} strokeWidth="1.6" />
            </g>;
          })}
          {!points.length && <text x={(left + right) / 2} y={(panel.top + panel.bottom) / 2 + 4} fill={muted} textAnchor="middle">
            {panel.id === 'volume' ? 'Consommation indisponible' : 'Coût indisponible'}
          </text>}
          <g data-fuel-history-label={panel.id} textAnchor="middle">
            <line x1={selectedX} x2={stemX} y1={pointY - (selectedValue === null ? 0 : 5)} y2={labelY + 35} stroke={panel.color} />
            <rect x={labelX} y={labelY} width={labelWidth} height="35" rx="6" fill={surface} stroke={panel.color} />
            <text x={labelCenter} y={labelY + 13} fill={muted} fontSize="10">{selectedDate}</text>
            <text x={labelCenter} y={labelY + 27} fill={panel.color} fontWeight="700"
              textLength={valueWidth > labelWidth - 16 ? labelWidth - 16 : undefined} lengthAdjust="spacingAndGlyphs">{panel.selectedLabel}</text>
          </g>
        </g>;
      })}
      {monthNumbers.filter(month => width >= 510 || month % 2 === 1).map(month => <text key={month}
        x={x(month)} y="363" textAnchor="middle" fill={muted}>{monthLabel(month)}</text>)}
      {hasPartialCost && <g>
        <line x1="13" x2="31" y1="381" y2="381" stroke="var(--sp-category-billing)" strokeWidth="2.5" strokeDasharray="5 4" />
        <text x="38" y="385" fill={muted}>Coût partiel</text>
      </g>}
    </svg>
    <div className="so-fuel-history-month-slider" role="slider" tabIndex={0} aria-label="Mois du graphique"
      aria-valuemin={1} aria-valuemax={lastMonth} aria-valuenow={selected.month} aria-valuetext={valueDescription}
      onClick={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (!bounds.width) return;
        const position = (event.clientX - bounds.left) * width / bounds.width;
        const month = 1 + Math.round((position - left) / step);
        if (month >= 1 && month <= lastMonth) onMonthChange(month);
      }}
      onKeyDown={event => {
        let month = selected.month;
        switch (event.key) {
          case 'ArrowLeft': case 'ArrowDown': month -= 1; break;
          case 'ArrowRight': case 'ArrowUp': month += 1; break;
          case 'Home': month = 1; break;
          case 'End': month = lastMonth; break;
          default: return;
        }
        event.preventDefault();
        onMonthChange(Math.max(1, Math.min(lastMonth, month)));
      }} />
  </div>;
}

export function SeaOperationFleetFuelHistory({ vesselName, year, years, months, volumeUnit = 'L', costSource = 'dpr', lastEntryDate, loading, error, onRetry, onYearChange }: Props) {
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
  const tableLastMonth = isCurrentYear ? Number(today.slice(5, 7)) : year < calendarYear ? 12 : 0;
  const billed = costSource === 'billing';
  const costSourceLabel = billed ? 'Coût HT · Projet → Facturation · Fuel' : '';
  const rows = historyMonths(months, tableLastMonth, costSource);
  const latest = rows.filter(row => row.liters !== null || row.costEuros !== null).at(-1);
  const lastMonth = latest?.month ?? 0;
  const lastDate = lastEntryDate && Number(lastEntryDate.slice(5, 7)) === lastMonth
    ? shortDate.format(new Date(`${lastEntryDate}T12:00:00Z`)) : '';
  const asOf = lastDate ? `Dernière saisie le ${lastDate}` : '';
  const selectedMonth = selection?.scope === scope && selection.month <= lastMonth ? selection.month : Math.max(1, lastMonth);
  const selected = rows[selectedMonth - 1];
  const selectedMonthName = monthName(selectedMonth);
  const selectedDate = lastDate && selectedMonth === lastMonth ? lastDate
    : `${selectedMonthName.charAt(0).toUpperCase()}${selectedMonthName.slice(1)} ${year}`;
  const missing = latest?.cumulativeUnpricedLiters ?? 0;
  const costNote = missing > 0 ? `${volumeText(missing, volumeUnit)} sans prix applicable. ${latest?.cumulativeCostEuros === null ? 'Coût cumulé indisponible.' : 'Coût cumulé partiel.'}` : '';
  const hasPartialCost = rows.some(row => row.cumulativeCostEuros !== null && row.cumulativeUnpricedLiters > 0);
  const canExport = Boolean(latest) && !loading && !error;

  async function exportPng() {
    const svg = svgRef.current;
    if (!svg || !canExport || pending.current) return;
    pending.current = true;
    setExporting(true);
    setExportError(undefined);
    try {
      const blob = await buildSeaOperationFleetFuelHistoryPng(svg, { vesselName, year, asOf, costNote, costSourceLabel });
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
      <div><h3 id={headingId}>Historique annuel du carburant</h3><p>{vesselName} · Cumul des DPR validés{asOf ? ` · ${asOf}` : ''}</p>
        {costSourceLabel && <p>{costSourceLabel}</p>}
      </div>
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
      <HistoryPlot rows={rows.slice(0, lastMonth)} lastMonth={lastMonth} selected={selected} selectedDate={selectedDate} volumeUnit={volumeUnit} billed={billed}
        hasPartialCost={hasPartialCost} svgRef={svgRef}
        onMonthChange={month => setSelection({ scope, month })} />
      {costNote && <p className="so-fuel-history-coverage">{costNote}</p>}
      <details className="so-fuel-history-table"><summary>Données mensuelles</summary>
        <div className="so-fuel-history-table-scroll" role="region" aria-label="Données mensuelles du carburant" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Mois</th><th scope="col">Consommation du mois</th><th scope="col">Consommation cumulée</th>
              <th scope="col">{billed ? 'Coût facturé du mois' : 'Coût estimé du mois'}</th>
              <th scope="col">{billed ? 'Coût cumulé facturé' : 'Coût cumulé estimé'}</th>{!billed && <th scope="col">Volume sans prix</th>}</tr></thead>
            <tbody>{rows.slice(0, tableLastMonth).map(row => <tr key={row.month}>
              <th scope="row">{monthName(row.month)}{isCurrentYear && row.month === tableLastMonth && <small> · En cours</small>}</th>
              <td>{volumeText(row.liters, volumeUnit)}</td><td>{volumeText(row.cumulativeLiters, volumeUnit)}</td><td>{moneyText(row.costEuros)}</td><td>{cumulativeText(row)}</td>
              {!billed && <td>{volumeText(row.liters === null ? null : row.unpricedLiters, volumeUnit)}</td>}
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </>}
    {exportError === scope && <p className="so-fuel-history-coverage" role="alert">Impossible d’exporter le graphique en PNG. Réessayez.</p>}
  </section>;
}
