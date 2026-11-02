import type { CSSProperties } from 'react';
import { useId } from 'react';
import './PerformanceRadarGraphic.css';

export interface RadarAxis {
  key: string;
  label: string;
  shortLabel?: string;
  score: number | null;
}
export interface RadarSeries {
  key: string;
  label: string;
  values: Record<string, number | null>;
}
export interface PerformanceRadarGraphicProps {
  axes: RadarAxis[];
  series?: RadarSeries[];
  selectedKey?: string;
  onSelect?: (key: string) => void;
  title?: string;
}

type Point = [number, number];
const WIDTH = 560;
const HEIGHT = 460;
const CENTER: Point = [280, 218];
const RADIUS = 140;
const LEVELS = [20, 40, 60, 80, 100];
const COLORS = [
  'var(--sp-primary, #0c5598)', 'var(--sp-category-marine, #087f83)', 'var(--sp-category-contract, #7050a2)',
  'var(--sp-category-commercial, #9e4a26)', 'var(--sp-success, #25815f)', 'var(--sp-warning, #b45309)',
];
const DASHES = ['', '7 3', '2 3', '10 3 2 3', '5 2', '12 4'];
const score = (value: number | null | undefined): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const valueLabel = (value: number | null) => value === null ? 'Non noté' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)} %`;
const pointString = (points: Point[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function radialPoint(index: number, count: number, radius: number): Point {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
  return [CENTER[0] + Math.cos(angle) * radius, CENTER[1] + Math.sin(angle) * radius];
}
function valuePoint(index: number, count: number, value: number): Point {
  if (count >= 3) return radialPoint(index, count, RADIUS * value / 100);
  // One or two criteria use shared 0–100 horizontal scales, without invented radar axes.
  return [164 + value * 3.04, count === 1 ? 210 : index === 0 ? 150 : 298];
}
function labelPoint(index: number, count: number): Point {
  return count >= 3 ? radialPoint(index, count, 186) : [78, count === 1 ? 210 : index === 0 ? 150 : 298];
}

/** Nulls split the line; a hidden or unavailable value is never replaced by a zero vertex. */
function knownSegments(points: Array<Point | null>, cyclic: boolean): Point[][] {
  const firstGap = points.findIndex((point) => point === null);
  if (firstGap === -1) return [points as Point[]];
  const segments: Point[][] = [];
  let segment: Point[] = [];
  const start = cyclic ? (firstGap + 1) % points.length : 0;
  for (let offset = 0; offset < points.length; offset += 1) {
    const point = points[(start + offset) % points.length];
    if (point) segment.push(point);
    else if (segment.length) { segments.push(segment); segment = []; }
  }
  if (segment.length) segments.push(segment);
  return segments;
}

export function PerformanceRadarGraphic({ axes, series, selectedKey, onSelect, title = 'Performance des processus sur 100' }: PerformanceRadarGraphicProps) {
  const titleId = useId();
  const descriptionId = useId();
  const chartSeries = series === undefined ? [{ key: 'performance', label: 'Performance', values: Object.fromEntries(axes.map((axis) => [axis.key, axis.score])) }] : series;
  const values = chartSeries.map((entry) => axes.map((axis) => score(entry.values[axis.key])));
  const missingCount = values.reduce((total, entry) => total + entry.filter((value) => value === null).length, 0);
  const description = chartSeries.map((entry, index) => `${entry.label} : ${axes.map((axis, axisIndex) => `${axis.label} : ${values[index][axisIndex] === null ? 'indisponible (non noté)' : valueLabel(values[index][axisIndex])}`).join(' ; ')}`).join('. ');
  if (!axes.length) return <p className="performance-radar-empty">Aucun indicateur accessible pour ce périmètre.</p>;
  return <div className={`performance-radar-graphic${axes.length < 3 ? ' is-compact-axis' : ''}`}>
    <div className="performance-radar-canvas">
      <svg aria-describedby={descriptionId} aria-labelledby={titleId} role="img" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <title id={titleId}>{title}. {description}</title>
        <desc id={descriptionId}>Échelle commune de 0 à 100 pour cent. {axes.length < 3 ? 'Les critères partagent des échelles horizontales identiques.' : 'Chaque axe correspond à un indicateur.'} Les valeurs non notées laissent des lacunes dans le tracé.</desc>
        {axes.length >= 3 ? <>
          {LEVELS.map((level) => <g className="performance-radar-grid" key={level}>
            <polygon className={level === 100 ? 'is-target' : ''} points={pointString(axes.map((_, index) => radialPoint(index, axes.length, RADIUS * level / 100)))} />
            <text x={CENTER[0] + 5} y={CENTER[1] - RADIUS * level / 100 + 13}>{level}</text>
          </g>)}
          {axes.map((axis, index) => {
            const end = radialPoint(index, axes.length, RADIUS);
            return <line className={`performance-radar-spoke${selectedKey === axis.key ? ' is-selected' : ''}`} key={axis.key} x1={CENTER[0]} x2={end[0]} y1={CENTER[1]} y2={end[1]} />;
          })}
        </> : axes.map((axis, index) => {
          const y = valuePoint(index, axes.length, 0)[1];
          return <g className="performance-radar-linear-grid" key={axis.key}>
            <line x1="164" x2="468" y1={y} y2={y} />
            {[0, ...LEVELS].map((level) => {
              const [x] = valuePoint(index, axes.length, level);
              return <g key={level}><line x1={x} x2={x} y1={y - 5} y2={y + 5} /><text textAnchor="middle" x={x} y={y + 22}>{level}</text></g>;
            })}
          </g>;
        })}
        {chartSeries.map((entry, seriesIndex) => {
          const points = values[seriesIndex].map((value, index) => value === null ? null : valuePoint(index, axes.length, value));
          const complete = points.every((point) => point !== null);
          const segments = knownSegments(points, axes.length >= 3);
          const color = COLORS[seriesIndex % COLORS.length];
          return <g className="performance-radar-series" data-series-key={entry.key} key={entry.key} style={{ '--radar-series-color': color } as CSSProperties}>
            {complete && axes.length >= 3 ? <polygon className="performance-radar-area" points={pointString(points as Point[])} /> : null}
            {segments.filter((segment) => segment.length >= 2).map((segment, index) => <polyline className="performance-radar-line" key={index} points={pointString(complete && axes.length >= 3 ? [...segment, segment[0]] : segment)} strokeDasharray={DASHES[seriesIndex % DASHES.length]} />)}
            {points.map((point, index) => point ? <circle className={`performance-radar-point${selectedKey === axes[index].key ? ' is-selected' : ''}`} cx={point[0]} cy={point[1]} data-axis-key={axes[index].key} key={axes[index].key} r={selectedKey === axes[index].key ? 6 : 4.5}>
              <title>{entry.label} · {axes[index].label} : {valueLabel(values[seriesIndex][index])}</title>
            </circle> : null)}
          </g>;
        })}
      </svg>
      <div className="performance-radar-axis-labels">
        {axes.map((axis, index) => {
          const [x, y] = labelPoint(index, axes.length);
          const position = { left: `${x / WIDTH * 100}%`, top: `${y / HEIGHT * 100}%` };
          const singleValue = chartSeries.length === 1 ? values[0][index] : undefined;
          const content = <><strong>{axis.shortLabel || axis.label}</strong>{singleValue !== undefined ? <span>{valueLabel(singleValue)}</span> : null}</>;
          return onSelect ? <button aria-label={`Détailler ${axis.label}`} aria-pressed={selectedKey === axis.key} className={`performance-radar-axis-label${selectedKey === axis.key ? ' is-selected' : ''}`} key={axis.key} onClick={() => onSelect(axis.key)} style={position} title={axis.label} type="button">{content}</button>
            : <div className="performance-radar-axis-label" key={axis.key} style={position} title={axis.label}>{content}</div>;
        })}
      </div>
    </div>
    <ul aria-label="Légende du radar" className="performance-radar-series-legend">
      {chartSeries.map((entry, index) => <li key={entry.key}><svg aria-hidden="true" viewBox="0 0 28 12"><line stroke={COLORS[index % COLORS.length]} strokeDasharray={DASHES[index % DASHES.length]} x1="1" x2="27" y1="6" y2="6" /><circle cx="14" cy="6" fill="var(--sp-surface, #fff)" r="3" stroke={COLORS[index % COLORS.length]} /></svg><span>{entry.label}</span></li>)}
      <li className="performance-radar-target-legend"><i aria-hidden="true" />Repère 100 %</li>
    </ul>
    {!chartSeries.length ? <p className="performance-radar-note">Sélectionnez au moins une entité à comparer.</p> : missingCount ? <p className="performance-radar-note">{missingCount} valeur{missingCount > 1 ? 's' : ''} non notée{missingCount > 1 ? 's' : ''} : les lacunes ne valent pas 0 %.</p> : null}
    {axes.length < 3 ? <p className="performance-radar-note">{axes.length === 1 ? 'Un critère' : 'Deux critères'} : chaque échelle va de 0 à 100 %. {axes.length === 2 ? 'Le segment relie les deux valeurs d’une même entité.' : ''}</p> : null}
    <details className="performance-radar-values"><summary>Consulter les valeurs du graphique</summary><div className="performance-radar-table-scroll"><table><caption>{title} — valeurs</caption><thead><tr><th scope="col">Indicateur</th>{chartSeries.map((entry) => <th key={entry.key} scope="col">{entry.label}</th>)}</tr></thead><tbody>{axes.map((axis, index) => <tr key={axis.key}><th scope="row">{axis.label}</th>{chartSeries.map((entry, seriesIndex) => <td key={entry.key}>{valueLabel(values[seriesIndex][index])}</td>)}</tr>)}</tbody></table></div></details>
  </div>;
}
