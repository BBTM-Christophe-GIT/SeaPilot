import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { MAX_POLYGON_VERTICES, insertPolygonVertex, isValidPolygon, translatePolygon } from './workPermitGeometry';
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

type DragTarget = { kind: 'pin'; point: PlanPoint }
  | { kind: 'zone' | 'vertex'; index: number; points: PlanPoint[]; vertex?: number };

const zoneLabel = 'Zone d’exclusion';
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const coordinateValid = (value: string) => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;

function svgPoints(points: PlanPoint[]) {
  return points.map(({ x, y }) => `${x * 100} ${y * 100}`).join(' ');
}

function styleAt({ x, y }: PlanPoint) {
  return { left: `${x * 100}%`, top: `${y * 100}%` };
}

export function WorkPermitMap({ plan, pins, zones, onSelect, onPoint, onZones }: MapProps) {
  const [mode, setMode] = useState<'point' | 'zone' | null>(null);
  const [vertices, setVertices] = useState<PlanPoint[]>([]);
  const [drawingZone, setDrawingZone] = useState<number>();
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<DragTarget>();
  const imageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; target: DragTarget; start: PlanPoint; moved: boolean }>(null);
  const canDragZones = !!onZones && (!mode || drawingZone !== undefined);
  const localZones = zones.flatMap((zone, index) => zone.planKey === plan.id
    ? [{ ...zone, points: preview && preview.kind !== 'pin' && preview.index === index ? preview.points : zone.points, index }]
    : []);

  function stopDrawing() {
    setMode(null);
    setVertices([]);
    setDrawingZone(undefined);
    setError('');
  }

  function updateZone(index: number, points: PlanPoint[]) {
    onZones?.(zones.map((zone, position) => position === index ? { ...zone, points } : zone));
  }

  function addPoint(point: PlanPoint) {
    setError('');
    if (mode === 'point') {
      onPoint?.(point);
      stopDrawing();
    } else if (mode === 'zone') {
      if (drawingZone !== undefined) {
        const rect = imageRef.current?.getBoundingClientRect();
        const points = insertPolygonVertex(zones[drawingZone].points, point, rect ? rect.width / rect.height : undefined);
        if (points) updateZone(drawingZone, points);
        else setError('Ajoutez le sommet sur le contour ou à l’extérieur, sans croiser les côtés.');
      } else {
        const points = [...vertices, point];
        if (points.length < 3) setVertices(points);
        else if (isValidPolygon(points)) {
          setDrawingZone(zones.length);
          onZones?.([...zones, { planKey: plan.id, points }]);
          setVertices([]);
        } else setError('Placez un troisième point distinct, hors de la ligne des deux premiers.');
      }
    }
  }

  function location(clientX: number, clientY: number) {
    const frame = imageRef.current!;
    const rect = frame.getBoundingClientRect();
    return {
      x: (clientX - rect.left - frame.clientLeft) / frame.clientWidth,
      y: (clientY - rect.top - frame.clientTop) / frame.clientHeight,
    };
  }

  function positionOnPlan(event: MouseEvent<HTMLButtonElement>) {
    if (!event.detail) return;
    const point = location(event.clientX, event.clientY);
    addPoint({ x: clamp(point.x), y: clamp(point.y) });
  }

  function startDrag(event: PointerEvent, target: DragTarget) {
    if (drag.current || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const frame = imageRef.current!;
    frame.setPointerCapture(event.pointerId);
    drag.current = { target, pointerId: event.pointerId, start: location(event.clientX, event.clientY), moved: false };
    setError('');
  }

  function movedTarget(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const { target, start } = active;
    const end = location(event.clientX, event.clientY);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (!active.moved && Math.hypot(dx * event.currentTarget.clientWidth, dy * event.currentTarget.clientHeight) < 3) return;
    active.moved = true;
    if (target.kind === 'pin') return { ...target, point: { x: clamp(target.point.x + dx), y: clamp(target.point.y + dy) } };
    const points = target.kind === 'zone' ? translatePolygon(target.points, dx, dy)
      : target.points.map((point, index) => index === target.vertex
        ? { x: clamp(point.x + dx), y: clamp(point.y + dy) }
        : point);
    return { ...target, points };
  }

  function cancelDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setPreview(undefined);
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    const pressed = drag.current.target;
    const target = movedTarget(event);
    cancelDrag(event);
    if (!target && mode === 'zone' && pressed.kind === 'zone' && drawingZone === pressed.index) {
      const { x, y } = location(event.clientX, event.clientY);
      addPoint({ x: clamp(x), y: clamp(y) });
    } else if (target?.kind === 'pin') onPoint?.(target.point);
    else if (target) {
      if (isValidPolygon(target.points)) updateZone(target.index, target.points);
      else setError('Le déplacement créerait une zone croisée ou sans surface.');
    }
  }

  return (
    <div className="work-permits-map">
      <div className="work-permits-map-image" ref={imageRef}
        onPointerMove={(event) => { const target = movedTarget(event); if (target) setPreview(target); }}
        onPointerUp={finishDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}>
        <img src={plan.src} alt={plan.title} draggable={false} />
        {mode && <button type="button" className="work-permits-placement" aria-label="Placer sur le plan, ou saisir les coordonnées sous le plan" onClick={positionOnPlan} />}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {localZones.map(({ points, index }) => <polygon key={index} points={svgPoints(points)} vectorEffect="non-scaling-stroke"
            data-draggable={canDragZones || undefined}
            onPointerDown={canDragZones ? (event) => startDrag(event, { kind: 'zone', index, points }) : undefined} />)}
          {vertices.length > 1 && <polyline points={svgPoints(vertices)} vectorEffect="non-scaling-stroke" />}
          {vertices.map(({ x, y }, index) => <circle key={index} cx={x * 100} cy={y * 100} r=".55" />)}
        </svg>
        {localZones.map(({ points, index }) => {
          const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
          return <span key={index} className="work-permits-zone-label" style={{ left: `clamp(3.5rem, ${center.x * 100}%, 100% - 3.5rem)`, top: `clamp(.75rem, ${center.y * 100}%, 100% - .75rem)` }}>{zoneLabel}</span>;
        })}
        {pins.map(({ id, label, point, selected }) => {
          const style = styleAt(preview?.kind === 'pin' ? preview.point : point);
          if (onPoint) return <button key={id} type="button" className="work-permits-pin work-permits-drag-handle"
            aria-label="Déplacer le repère" style={style} onClick={(event) => {
              if (!event.detail) { stopDrawing(); setMode('point'); }
            }} onPointerDown={(event) => startDrag(event, { kind: 'pin', point })}>●</button>;
          return onSelect ? <button key={id} type="button" className="work-permits-pin" aria-label={label} aria-pressed={selected}
            style={style} onClick={() => onSelect(id)}>●</button>
            : <span key={id} className="work-permits-pin" style={style} aria-hidden="true">●</span>;
        })}
        {canDragZones && localZones.flatMap(({ points, index }) => points.map((point, vertex) =>
          <span key={`${index}-${vertex}`} className="work-permits-vertex work-permits-drag-handle" style={styleAt(point)}
            aria-hidden="true" onPointerDown={(event) => startDrag(event, { kind: 'vertex', index, points, vertex })} />
        ))}
      </div>
      {!!localZones.length && <p className="work-permits-map-legend">{localZones.length} zone(s) d’exclusion en rouge</p>}
      {(onPoint || onZones) && <div className="work-permits-actions">
        {onPoint && <button type="button" aria-pressed={mode === 'point'} onClick={() => { stopDrawing(); setMode('point'); }}>Placer ou déplacer le repère</button>}
        {onZones && <button type="button" aria-pressed={mode === 'zone' && drawingZone === undefined} disabled={zones.length >= 30}
          onClick={() => { stopDrawing(); setMode('zone'); }}>Dessiner une zone d’exclusion</button>}
      </div>}
      {mode && <>
        <p role="status">{mode === 'point' ? 'Choisissez la nouvelle position du repère.'
          : drawingZone === undefined ? `Placez trois points pour fermer la zone (${vertices.length}/3).`
            : 'La zone est fermée. Ajoutez un sommet pour étendre son contour.'}</p>
        <div className="work-permits-actions">
          <label>Horizontal (%) <input type="number" min={0} max={100} step="any" value={x} onChange={(event) => setX(event.target.value)} /></label>
          <label>Vertical (%) <input type="number" min={0} max={100} step="any" value={y} onChange={(event) => setY(event.target.value)} /></label>
          <button type="button" disabled={!coordinateValid(x) || !coordinateValid(y) || (drawingZone !== undefined && zones[drawingZone].points.length >= MAX_POLYGON_VERTICES)}
            onClick={() => addPoint({ x: Number(x) / 100, y: Number(y) / 100 })}>{mode === 'point' ? 'Placer le repère' : 'Ajouter le sommet'}</button>
          {mode === 'zone' && drawingZone === undefined &&
            <button type="button" disabled={!vertices.length} onClick={() => setVertices(vertices.slice(0, -1))}>Retirer le dernier sommet</button>}
          {drawingZone === undefined && <button type="button" onClick={stopDrawing}>Annuler le tracé</button>}
        </div>
      </>}
      {error && <p className="work-permits-error" role="alert">{error}</p>}
      {onZones && !!localZones.length && <ul className="work-permits-zone-list">
        {localZones.map(({ index, points }) => <li key={index}>
          {zoneLabel} {index + 1}
          <button type="button" disabled={points.length >= MAX_POLYGON_VERTICES} aria-pressed={mode === 'zone' && drawingZone === index}
            aria-label={`Ajouter un sommet à la zone d’exclusion ${index + 1}`}
            onClick={() => { stopDrawing(); setMode('zone'); setDrawingZone(index); }}>Ajouter un sommet</button>
          <button type="button" aria-label={`Supprimer la zone d’exclusion ${index + 1}`}
            onClick={() => { stopDrawing(); onZones(zones.filter((_, position) => position !== index)); }}>Supprimer</button>
        </li>)}
      </ul>}
    </div>
  );
}
