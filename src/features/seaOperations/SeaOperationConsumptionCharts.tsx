import { Activity } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { SeaOperationConsumptionTrace } from './seaOperationConsumptionTrace';
import './seaOperationConsumptionSpeed.css';

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const parisTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const parisDateTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' });
const minuteMs = 60_000;
const left = 52, right = 38, top = 10, bottom = 168;
const labelSpacing = 64;
const maxLabeledHours = 36;

function speedPlot(trace: SeaOperationConsumptionTrace, viewportWidth: number) {
  const firstSample = trace.profile.findIndex(point => point.speedKnots !== null);
  if (firstSample === -1) return null;

  const start = Date.parse(trace.startedAt);
  const end = Date.parse(trace.endedAt);
  const duration = (end - start) / minuteMs;
  const hours = Math.floor(duration / 60);
  const labeledHourStep = Math.max(1, Math.ceil(hours / maxLabeledHours));
  const tickStep = 60 * labeledHourStep;
  const width = Math.max(320, viewportWidth, left + right + Math.ceil(duration / tickStep) * labelSpacing);
  const x = (elapsed: number) => left + Math.min(duration, elapsed) / duration * (width - left - right);
  const maxSpeed = trace.profile.reduce((maximum, point) => Math.max(maximum, point.speedKnots ?? 0), 0);
  const speedStep = Math.max(1, Math.ceil(maxSpeed / 16));
  const ceiling = Math.max(10, Math.ceil(maxSpeed / speedStep) * speedStep);
  const y = (speed: number) => bottom - speed / ceiling * (bottom - top);
  const speedTicks = Array.from({ length: ceiling / speedStep + 1 }, (_, index) => index * speedStep);

  const timeTicks = Array.from({ length: Math.floor(duration / tickStep) + 1 }, (_, index) => index * tickStep);
  if (timeTicks.at(-1) !== duration) timeTicks.push(duration);
  const staggerEnd = x(duration) - x(timeTicks.at(-2) ?? 0) < 58 && timeTicks.length > 2;
  // Keep all hourly ticks. Only the labels and full-height grid lines are spaced out on long traces.
  const hourlyTicks = Array.from({ length: hours }, (_, index) => index + 1)
    .filter(hour => hour % labeledHourStep !== 0)
    .map(hour => 'M' + x(hour * 60).toFixed(1) + ',' + bottom + 'v4').join(' ');
  const hourlySpacing = (width - left - right) * 60 / duration;

  const segments: Array<Array<{ x: number; y: number }>> = [];
  let segment: (typeof segments)[number] = [];
  for (const point of trace.profile) {
    if (point.speedKnots === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else {
      segment.push({ x: x(point.elapsedMinutes), y: y(point.speedKnots) });
    }
  }
  if (segment.length) segments.push(segment);

  const runs = segments.filter(points => points.length > 1).map(points => ({
    line: 'M' + points.map(point => point.x.toFixed(2) + ',' + point.y.toFixed(2)).join('L'),
    from: points[0].x.toFixed(2),
  }));

  return {
    firstSample, start, end, width, height: bottom + (staggerEnd ? 62 : 37), x, y, maxSpeed, speedTicks,
    timeTicks, staggerEnd, hourlyTicks, hourlySpacing,
    line: runs.map(run => run.line).join(' '),
    area: runs.map(run => run.line + 'V' + bottom + 'H' + run.from + 'Z').join(' '),
    isolated: segments.filter(points => points.length === 1).map(points => points[0]),
  };
}

export function SeaOperationConsumptionSpeedProfile({ trace }: { trace: SeaOperationConsumptionTrace }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const areaId = useId();
  const helpId = useId();
  const plot = useMemo(() => speedPlot(trace, viewportWidth), [trace, viewportWidth]);
  const hasPlot = plot !== null;

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setViewportWidth(viewport.clientWidth));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [hasPlot]);

  if (!plot) return null;
  const { width, height, x, y } = plot;
  const index = Math.min(activeIndex ?? plot.firstSample, trace.profile.length - 1);
  const sample = trace.profile[index];
  const timestamp = parisDateTime.format(plot.start + Math.round(sample.elapsedMinutes * minuteMs));
  const elapsed = decimal.format(sample.elapsedMinutes) + ' min';
  const speed = sample.speedKnots === null ? 'Interruption de trace GPS' : decimal.format(sample.speedKnots) + ' nd';

  function inspectPointer(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    if (pointerX < left || pointerX > width - right || pointerY < top || pointerY > bottom) {
      setActiveIndex(null);
      return;
    }
    const nearest = trace.profile.reduce((closest, point, pointIndex) => (
      Math.abs(x(point.elapsedMinutes) - pointerX) < Math.abs(x(trace.profile[closest].elapsedMinutes) - pointerX)
        ? pointIndex : closest
    ), 0);
    setActiveIndex(trace.profile[nearest].speedKnots === null ? null : nearest);
  }

  function inspectKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': case 'ArrowDown': next = Math.max(0, index - 1); break;
      case 'ArrowRight': case 'ArrowUp': next = Math.min(trace.profile.length - 1, index + 1); break;
      case 'Home': next = 0; break;
      case 'End': next = trace.profile.length - 1; break;
      case 'Escape':
        if (activeIndex !== null) {
          event.stopPropagation();
          setActiveIndex(null);
        }
        return;
      default: return;
    }
    event.preventDefault();
    setActiveIndex(next);

    const viewport = scrollRef.current;
    if (!viewport) return;
    const pointX = x(trace.profile[next].elapsedMinutes);
    if (pointX < viewport.scrollLeft + left || pointX > viewport.scrollLeft + viewport.clientWidth - right) {
      viewport.scrollLeft = pointX - viewport.clientWidth / 2;
    }
  }

  return <section className="so-consumption-chart so-consumption-speed" aria-label="Navigation enregistrée">
    <h3><Activity size={20} aria-hidden="true" />Profil de vitesse GPS</h3>
    <div className="so-consumption-speed-scroll" ref={scrollRef}>
      <div className="so-consumption-speed-canvas" style={{ width }}>
        <svg className="so-consumption-speed-plot" viewBox={'0 0 ' + width + ' ' + height} role="img"
          aria-label={'Profil de vitesse GPS, maximum ' + decimal.format(plot.maxSpeed) + ' nœuds'}>
          <defs>
            <linearGradient id={areaId} x1="0" x2="0" y1={top} y2={bottom} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="var(--sp-primary)" stopOpacity=".32" />
              <stop offset="1" stopColor="var(--sp-primary)" stopOpacity=".08" />
            </linearGradient>
          </defs>
          <path d={plot.area} fill={'url(#' + areaId + ')'} />
          {plot.speedTicks.map(tick => <g key={tick}>
            <line className="so-consumption-chart-grid" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} />
            <text x={left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{tick}</text>
          </g>)}
          {plot.timeTicks.map((tick, tickIndex) => {
            const isEnd = tickIndex === plot.timeTicks.length - 1;
            const tickX = x(tick);
            const labelY = bottom + (isEnd && plot.staggerEnd ? 41 : 16);
            return <g key={tick}>
              <line className="so-consumption-chart-grid" x1={tickX} x2={tickX} y1={top} y2={bottom + 4} />
              {isEnd && plot.staggerEnd && <line className="so-consumption-chart-grid" x1={tickX + 1} x2={tickX + 1}
                y1={bottom + 4} y2={labelY - 12} />}
              <text className="so-consumption-speed-time" x={tickX} y={labelY} textAnchor="middle">
                {parisTime.format(isEnd ? plot.end : plot.start + tick * minuteMs)}
                <tspan className="so-consumption-speed-minutes" x={tickX} dy="13">({decimal.format(tick)} min)</tspan>
              </text>
            </g>;
          })}
          {plot.hourlyTicks && <path className="so-consumption-chart-grid" d={plot.hourlyTicks}
            strokeOpacity={Math.min(1, plot.hourlySpacing / 6)} />}
          <path className="so-consumption-chart-line" d={plot.line} />
          {plot.isolated.map(point => <circle className="so-consumption-chart-point" key={point.x}
            cx={point.x} cy={point.y} r={2.5} />)}
          {activeIndex !== null && <>
            <line className="so-consumption-chart-cursor" x1={x(sample.elapsedMinutes)} x2={x(sample.elapsedMinutes)} y1={top} y2={bottom} />
            {sample.speedKnots !== null && <circle className="so-consumption-chart-point" cx={x(sample.elapsedMinutes)}
              cy={y(sample.speedKnots)} r={4} />}
          </>}
          <text className="so-consumption-speed-axis" transform={'translate(14 ' + (top + bottom) / 2 + ') rotate(-90)'}
            textAnchor="middle">Vitesse (nd)</text>
        </svg>
        <div className="so-consumption-speed-hitbox" role="slider" tabIndex={0} aria-label="Mesures du profil GPS"
          aria-describedby={helpId} aria-valuemin={1} aria-valuemax={trace.profile.length} aria-valuenow={index + 1}
          aria-valuetext={timestamp + ', ' + elapsed + ', ' + speed}
          onFocus={() => setActiveIndex(current => current ?? plot.firstSample)}
          onBlur={() => setActiveIndex(null)}
          onKeyDown={inspectKeyboard}
          onPointerMove={event => { if (event.pointerType !== 'touch') inspectPointer(event); }}
          onPointerUp={event => { if (event.pointerType === 'touch') inspectPointer(event); }}
          onPointerLeave={event => {
            if (event.pointerType !== 'touch' && document.activeElement !== event.currentTarget) setActiveIndex(null);
          }}
        />
      </div>
    </div>
    <p className="so-consumption-speed-caption">Temps écoulé · heure de Paris</p>
    {activeIndex !== null && <div className="so-consumption-speed-tooltip" role="tooltip">
      <strong>{timestamp}</strong>
      <span>Temps écoulé · {elapsed}</span>
      <span>{sample.speedKnots === null ? speed : 'Vitesse GPS · ' + speed}</span>
    </div>}
    <p className="so-help" id={helpId}>Vitesse moyenne par intervalle. Les interruptions de la trace apparaissent sous forme de blancs.</p>
  </section>;
}
