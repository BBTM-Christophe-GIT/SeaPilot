export interface SeaOperationZoneAppearance {
  code: string;
  stroke: string;
  fill: string;
  rgb: readonly [number, number, number];
  fillRgb: readonly [number, number, number];
}

type Position = { x: number; y: number };
export interface SeaOperationZoneLabelObstacle { west: number; east: number; north: number; south: number }
export interface SeaOperationZoneLabelInput { id: string; index: number; vertices: readonly Position[] }
export interface SeaOperationZoneLabel {
  id: string; index: number; code: string; x: number; y: number; width: number; height: number;
  anchor: Position;
  leader: { from: Position; to: Position } | null;
}

const hex = (rgb: readonly number[]) => `#${rgb.map(value => value.toString(16).padStart(2, '0')).join('')}`;

/** Data colours, independent of theme chrome. Golden-angle hues keep 50 original ordinals distinct. */
export function seaOperationZoneAppearance(index: number): SeaOperationZoneAppearance {
  const ordinal = Number.isSafeInteger(index) && index >= 0 ? index : 0;
  const hue = (205 + ordinal * 137.507764) % 360;
  const chroma = .48 * .68, secondary = chroma * (1 - Math.abs((hue / 60) % 2 - 1)), offset = .24 - chroma / 2;
  const channels = hue < 60 ? [chroma, secondary, 0] : hue < 120 ? [secondary, chroma, 0] : hue < 180 ? [0, chroma, secondary]
    : hue < 240 ? [0, secondary, chroma] : hue < 300 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  const rgb = channels.map(channel => Math.round((channel + offset) * 255)) as [number, number, number];
  const fillRgb = rgb.map(channel => Math.round(255 * .86 + channel * .14)) as [number, number, number];
  return { code: `Z${ordinal + 1}`, stroke: hex(rgb), fill: hex(fillRgb), rgb, fillRgb };
}

const finitePosition = (point: Position) => Number.isFinite(point.x) && Number.isFinite(point.y);
const overlaps = (a: SeaOperationZoneLabelObstacle, b: SeaOperationZoneLabelObstacle) => a.west < b.east + 3 && a.east > b.west - 3 && a.north < b.south + 3 && a.south > b.north - 3;

/**
 * Pixel-space document/editor labels. Every accepted tag is inside the frame and disjoint
 * from earlier tags/obstacles; a saturated frame omits a tag instead of superposing it.
 * Its full code/name remains available in the external legend. Source positions are untouched.
 */
export function layoutSeaOperationZoneLabels(zones: readonly SeaOperationZoneLabelInput[], width: number, height: number,
  obstacles: readonly SeaOperationZoneLabelObstacle[] = []): SeaOperationZoneLabel[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 40 || height < 32 || width > 4000 || height > 2000) return [];
  const buckets = new Map<string, SeaOperationZoneLabelObstacle[]>();
  const bucketKeys = (box: SeaOperationZoneLabelObstacle) => {
    const keys: string[] = [];
    for (let x = Math.floor(Math.max(-3, box.west - 3) / 64); x <= Math.floor(Math.min(width + 3, box.east + 3) / 64); x += 1)
      for (let y = Math.floor(Math.max(-3, box.north - 3) / 64); y <= Math.floor(Math.min(height + 3, box.south + 3) / 64); y += 1) keys.push(`${x}:${y}`);
    return keys;
  };
  const add = (box: SeaOperationZoneLabelObstacle) => {
    if (![box.west, box.east, box.north, box.south].every(Number.isFinite) || box.west > box.east || box.north > box.south) return;
    for (const key of bucketKeys(box)) { const bucket = buckets.get(key); if (bucket) bucket.push(box); else buckets.set(key, [box]); }
  };
  const collides = (box: SeaOperationZoneLabelObstacle) => bucketKeys(box).some(key => buckets.get(key)?.some(other => overlaps(box, other)));
  obstacles.forEach(add);
  const labels: SeaOperationZoneLabel[] = [];
  for (const zone of zones) {
    if (zone.vertices.length < 3 || !zone.vertices.every(finitePosition) || new Set(zone.vertices.map(point => `${point.x}:${point.y}`)).size < 3) continue;
    const west = Math.min(...zone.vertices.map(point => point.x)), east = Math.max(...zone.vertices.map(point => point.x));
    const north = Math.min(...zone.vertices.map(point => point.y)), south = Math.max(...zone.vertices.map(point => point.y));
    if (east < 0 || west > width || south < 0 || north > height) continue;
    const code = seaOperationZoneAppearance(zone.index).code, tagWidth = Math.max(28, code.length * 6 + 12), tagHeight = 18;
    const anchor = { x: zone.vertices.reduce((sum, point) => sum + point.x, 0) / zone.vertices.length, y: zone.vertices.reduce((sum, point) => sum + point.y, 0) / zone.vertices.length };
    const clamp = (point: Position) => ({ x: Math.max(tagWidth / 2 + 5, Math.min(width - tagWidth / 2 - 5, point.x)), y: Math.max(14, Math.min(height - 14, point.y)) });
    const offsets = [0, -24, 24, -48, 48, -72, 72].flatMap(y => [0, -36, 36, -72, 72].map(x => ({ x, y })))
      .sort((a, b) => a.x ** 2 + a.y ** 2 - b.x ** 2 - b.y ** 2);
    const candidates = offsets.map(offset => clamp({ x: anchor.x + offset.x, y: anchor.y + offset.y }));
    const grid: Position[] = [];
    for (let y = 14; y <= height - 14; y += tagHeight + 6) for (let x = tagWidth / 2 + 5; x <= width - tagWidth / 2 - 5; x += tagWidth + 8) grid.push({ x, y });
    grid.sort((a, b) => (a.x - anchor.x) ** 2 + (a.y - anchor.y) ** 2 - (b.x - anchor.x) ** 2 - (b.y - anchor.y) ** 2);
    const boxAt = (point: Position) => ({ west: point.x - tagWidth / 2, east: point.x + tagWidth / 2, north: point.y - tagHeight / 2, south: point.y + tagHeight / 2 });
    const placed = [...candidates, ...grid].find(point => !collides(boxAt(point)));
    if (!placed) continue;
    add(boxAt(placed));
    const area = boxAt(placed);
    const outsideTag = anchor.x < area.west || anchor.x > area.east || anchor.y < area.north || anchor.y > area.south;
    const leader = outsideTag ? { from: anchor, to: {
      x: Math.max(placed.x - tagWidth / 2, Math.min(placed.x + tagWidth / 2, anchor.x)),
      y: Math.max(placed.y - tagHeight / 2, Math.min(placed.y + tagHeight / 2, anchor.y)),
    } } : null;
    labels.push({ id: zone.id, index: zone.index, code, x: placed.x, y: placed.y, width: tagWidth, height: tagHeight, anchor, leader });
  }
  return labels;
}
