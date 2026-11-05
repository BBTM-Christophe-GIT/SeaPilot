import { useState, type MouseEvent } from 'react';
import type { ExclusionZone, PlanPoint } from './workPermitQueries';
import type { WorkPermitPlan } from './workPermitPlans';

interface MapProps {
  plan: WorkPermitPlan;
  pins: { id: string; label: string; point: PlanPoint; selected?: boolean }[];
  zones: ExclusionZone[];
  onSelect?: (id: string) => void;
  onPoint?: (point: PlanPoint) => void;
  onZones?: (zones: ExclusionZone[]) => void;
}

function svgPoints(points: PlanPoint[]) {
  return points.map(({ x, y }) => `${x * 100} ${y * 100}`).join(' ');
}

export function WorkPermitMap({ plan, pins, zones, onSelect, onPoint, onZones }: MapProps) {
  const [mode, setMode] = useState<'point' | 'zone' | null>(null);
  const [vertices, setVertices] = useState<PlanPoint[]>([]);
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const localZones = zones.flatMap((zone, index) => zone.planKey === plan.id ? [{ ...zone, index }] : []);

  function stopDrawing() {
    setMode(null);
    setVertices([]);
  }

  function addPoint(point: PlanPoint) {
    if (mode === 'point') {
      onPoint?.(point);
      stopDrawing();
    }
    if (mode === 'zone' && vertices.length < 40) {
      setVertices((items) => [...items, point]);
    }
  }

  function positionOnPlan(event: MouseEvent<HTMLButtonElement>) {
    if (!event.detail) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const normalized = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000;
    addPoint({
      x: normalized((event.clientX - rect.left) / rect.width),
      y: normalized((event.clientY - rect.top) / rect.height),
    });
  }

  const coordinateValid = (value: string) => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
  const distinct = new Set(vertices.map(({ x, y }) => `${x},${y}`)).size;
  const area = vertices.reduce((sum, point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return sum + point.x * next.y - point.y * next.x;
  }, 0);

  return (
    <div className="work-permits-map">
      <div className="work-permits-map-image">
        <img src={plan.src} alt={plan.title} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {localZones.map(({ points, index }) => <polygon key={index} points={svgPoints(points)} vectorEffect="non-scaling-stroke" />)}
          {vertices.length > 1 && <polyline points={svgPoints(vertices)} vectorEffect="non-scaling-stroke" />}
          {vertices.map(({ x, y }, index) => <circle key={index} cx={x * 100} cy={y * 100} r=".55" />)}
        </svg>
        {pins.map(({ id, label, point, selected }) => onSelect ? (
          <button key={id} type="button" className="work-permits-pin" aria-label={label} aria-pressed={selected}
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} onClick={() => onSelect(id)}>●</button>
        ) : <span key={id} className="work-permits-pin" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-hidden="true">●</span>)}
        {mode && <button type="button" className="work-permits-placement" aria-label="Placer sur le plan, ou saisir les coordonnées sous le plan" onClick={positionOnPlan} />}
      </div>
      {!!localZones.length && <p className="work-permits-map-legend">{localZones.length} zone(s) d’exclusion en rouge</p>}
      {(onPoint || onZones) && <div className="work-permits-actions">
        {onPoint && <button type="button" aria-pressed={mode === 'point'} onClick={() => { stopDrawing(); setMode('point'); }}>Placer ou déplacer le repère</button>}
        {onZones && <button type="button" aria-pressed={mode === 'zone'} disabled={zones.length >= 30}
          onClick={() => { stopDrawing(); setMode('zone'); }}>Dessiner une zone d’exclusion</button>}
      </div>}
      {mode && <>
        <p role="status">{mode === 'point' ? 'Choisissez la nouvelle position du repère.' : `Placez les sommets dans l’ordre, puis fermez la zone (${vertices.length}/40).`}</p>
        <div className="work-permits-actions">
          <label>Horizontal (%) <input type="number" min={0} max={100} step="any" value={x} onChange={(event) => setX(event.target.value)} /></label>
          <label>Vertical (%) <input type="number" min={0} max={100} step="any" value={y} onChange={(event) => setY(event.target.value)} /></label>
          <button type="button" disabled={!coordinateValid(x) || !coordinateValid(y) || vertices.length >= 40}
            onClick={() => addPoint({ x: Number(x) / 100, y: Number(y) / 100 })}>{mode === 'point' ? 'Placer le repère' : 'Ajouter le sommet'}</button>
          {mode === 'zone' && <>
            <button type="button" disabled={!vertices.length} onClick={() => setVertices(vertices.slice(0, -1))}>Retirer le dernier sommet</button>
            <button type="button" disabled={distinct < 3 || Math.abs(area) < 1e-8} onClick={() => {
              onZones?.([...zones, { planKey: plan.id, points: vertices }]);
              stopDrawing();
            }}>Fermer la zone</button>
          </>}
          <button type="button" onClick={stopDrawing}>Annuler le tracé</button>
        </div>
      </>}
      {onZones && !!localZones.length && <ul className="work-permits-zone-list">
        {localZones.map(({ index }) => <li key={index}>
          Zone d’exclusion {index + 1}
          <button type="button" aria-label={`Supprimer la zone d’exclusion ${index + 1}`}
            onClick={() => onZones(zones.filter((_, position) => position !== index))}>Supprimer</button>
        </li>)}
      </ul>}
    </div>
  );
}
