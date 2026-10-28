export interface SeaOperationZoneAppearance {
  code: string;
  stroke: string;
  fill: string;
  rgb: readonly [number, number, number];
  fillRgb: readonly [number, number, number];
}

type Position = { x: number; y: number };
export interface SeaOperationZoneLabelObstacle { west: number; east: number; north: number; south: number }
export interface SeaOperationZoneLabelInput { id: string; index: number; name?: string; vertices: readonly Position[] }
export interface SeaOperationZoneLabel {
  id: string; index: number; code: string; x: number; y: number; width: number; height: number;
  text: string; lines: string[]; fontSize: number; lineHeight: number;
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
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);
const positionKey = (point: Position) => `${point.x}:${point.y}`;
const defaultTextWidth = (text: string) => Array.from(text).reduce((width, character) => width
  + (/\s/.test(character) ? 3.4 : /[ilI.,:;'!|]/.test(character) ? 3.5 : /[MWwm@%&]/.test(character) ? 10
    : /[A-ZÀ-Þ]/.test(character) ? 7.8 : /[\u0020-\u024f]/.test(character) ? 6.5 : 12), 0);

/** Preserve every name character, including a long unbroken identifier, without ellipses. */
function wrapName(text: string, maximumWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maximumWidth) { line = candidate; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const character of Array.from(word)) {
      if (measure(character) > maximumWidth) return [];
      if (line && measure(line + character) > maximumWidth) { lines.push(line); line = ''; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Pixel-space document/editor labels. Every accepted tag is inside the frame and disjoint
 * from earlier tags/obstacles; a saturated frame omits a tag instead of superposing it.
 * Real polygon vertices are preferred to shared/nearby attachment points. The bounded vertex
 * index and prior-anchor scan avoid a quadratic all-vertices search during camera updates.
 * Its full code/name remains available in the external legend. Source positions are untouched.
 */
export function layoutSeaOperationZoneLabels(zones: readonly SeaOperationZoneLabelInput[], width: number, height: number,
  obstacles: readonly SeaOperationZoneLabelObstacle[] = [], measureText?: (text: string) => number): SeaOperationZoneLabel[] {
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
  const validZones = zones.slice(0, 50).flatMap((zone, owner) => {
    if (zone.vertices.length < 3 || zone.vertices.length > 200 || !zone.vertices.every(finitePosition)) return [];
    const vertices = [...new Map(zone.vertices.map(point => [positionKey(point), point])).values()];
    if (vertices.length < 3) return [];
    const west = Math.min(...vertices.map(point => point.x)), east = Math.max(...vertices.map(point => point.x));
    const north = Math.min(...vertices.map(point => point.y)), south = Math.max(...vertices.map(point => point.y));
    if (east < 0 || west > width || south < 0 || north > height) return [];
    return [{ ...zone, vertices, owner }];
  });
  const vertexOwners = new Map<string, { point: Position; owners: Set<number> }>();
  for (const zone of validZones) for (const point of zone.vertices) {
    const key = positionKey(point), previous = vertexOwners.get(key);
    if (previous) previous.owners.add(zone.owner); else vertexOwners.set(key, { point, owners: new Set([zone.owner]) });
  }
  const vertexBuckets = new Map<string, Array<{ point: Position; owners: Set<number> }>>();
  const vertexObstacles = new Map<string, SeaOperationZoneLabelObstacle>();
  for (const vertex of vertexOwners.values()) {
    const key = `${Math.floor(vertex.point.x / 32)}:${Math.floor(vertex.point.y / 32)}`;
    const bucket = vertexBuckets.get(key); if (bucket) bucket.push(vertex); else vertexBuckets.set(key, [vertex]);
    // Merge near-identical obstacle boxes conservatively; dense overlapping rings must not
    // make every tag candidate scan thousands of copies of the same protected pixel.
    const obstacleKey = `${Math.floor(vertex.point.x / 4)}:${Math.floor(vertex.point.y / 4)}`;
    const previous = vertexObstacles.get(obstacleKey);
    if (previous) {
      previous.west = Math.min(previous.west, vertex.point.x - 3); previous.east = Math.max(previous.east, vertex.point.x + 3);
      previous.north = Math.min(previous.north, vertex.point.y - 3); previous.south = Math.max(previous.south, vertex.point.y + 3);
    } else vertexObstacles.set(obstacleKey, { west: vertex.point.x - 3, east: vertex.point.x + 3, north: vertex.point.y - 3, south: vertex.point.y + 3 });
  }
  // Tags should not cover the points their own or another leader identifies.
  vertexObstacles.forEach(add);
  const foreignClearance = (point: Position, owner: number) => {
    if (vertexOwners.get(positionKey(point))!.owners.size > 1) return 0;
    let nearest = 16;
    let inspected = 0;
    const x = Math.floor(point.x / 32), y = Math.floor(point.y / 32);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const vertex of vertexBuckets.get(`${x + dx}:${y + dy}`) || []) {
        if (vertex.owners.size === 1 && vertex.owners.has(owner)) continue;
        // A crowded bucket is conservatively considered near, never presumed unique.
        if (++inspected > 128) return 0;
        nearest = Math.min(nearest, distance(point, vertex.point));
        if (nearest < 16) return nearest;
      }
    }
    return nearest;
  };
  const measureCache = new Map<string, number>();
  const measure = (text: string) => {
    const cached = measureCache.get(text); if (cached !== undefined) return cached;
    const proposed = measureText?.(text);
    const measured = typeof proposed === 'number' && Number.isFinite(proposed) && proposed >= 0 ? proposed : defaultTextWidth(text);
    measureCache.set(text, measured); return measured;
  };
  const labels: SeaOperationZoneLabel[] = [];
  const separation = Math.max(24, Math.min(width, height) * .08);
  for (const zone of validZones) {
    const code = seaOperationZoneAppearance(zone.index).code, text = zone.name?.trim().replace(/\s+/g, ' ') || code.replace('Z', 'Zone ');
    if (text.length > 500) continue;
    const fontSize = 10, lineHeight = 12;
    const lines = wrapName(text, Math.min(240, Math.max(60, width * .34), width - 10) - 12, measure);
    if (!lines.length) continue;
    const tagWidth = Math.max(28, ...lines.map(line => measure(line) + 12)), tagHeight = lines.length * lineHeight + 8;
    if (tagHeight > height - 10 || tagWidth > width - 10) continue;
    const center = { x: zone.vertices.reduce((sum, point) => sum + point.x / zone.vertices.length, 0), y: zone.vertices.reduce((sum, point) => sum + point.y / zone.vertices.length, 0) };
    const visible = zone.vertices.filter(point => point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height);
    const anchors = (visible.length ? visible : zone.vertices).map((point, order) => ({ point, order,
      used: labels.length ? Math.min(...labels.map(label => distance(point, label.anchor))) : Infinity,
      foreign: foreignClearance(point, zone.owner), outward: distance(point, center) }));
    anchors.sort((a, b) => Number(a.used < separation) - Number(b.used < separation) || Number(a.foreign < 16) - Number(b.foreign < 16)
      || (Number.isFinite(b.used) && Number.isFinite(a.used) ? b.used - a.used : 0) || b.foreign - a.foreign || b.outward - a.outward || a.order - b.order);
    const anchor = { ...anchors[0].point };
    const clamp = (point: Position) => ({ x: Math.max(tagWidth / 2 + 5, Math.min(width - tagWidth / 2 - 5, point.x)), y: Math.max(tagHeight / 2 + 5, Math.min(height - tagHeight / 2 - 5, point.y)) });
    const directions = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }]
      .sort((a, b) => (b.x * Math.sign(anchor.x - center.x) + b.y * Math.sign(anchor.y - center.y)) - (a.x * Math.sign(anchor.x - center.x) + a.y * Math.sign(anchor.y - center.y)));
    const offsets = [12, 30, 54, 84].flatMap(gap => directions.map(direction => ({ x: direction.x * (tagWidth / 2 + gap), y: direction.y * (tagHeight / 2 + gap) })));
    const candidates = offsets.map(offset => clamp({ x: anchor.x + offset.x, y: anchor.y + offset.y }));
    const boxAt = (point: Position) => ({ west: point.x - tagWidth / 2, east: point.x + tagWidth / 2, north: point.y - tagHeight / 2, south: point.y + tagHeight / 2 });
    let placed = candidates.find(point => !collides(boxAt(point)));
    if (!placed) {
      const grid: Position[] = [];
      for (let y = tagHeight / 2 + 5; y <= height - tagHeight / 2 - 5; y += tagHeight + 6) for (let x = tagWidth / 2 + 5; x <= width - tagWidth / 2 - 5; x += tagWidth + 8) grid.push({ x, y });
      grid.sort((a, b) => distance(a, anchor) - distance(b, anchor));
      placed = grid.find(point => !collides(boxAt(point)));
    }
    if (!placed) continue;
    add(boxAt(placed));
    const leader = { from: anchor, to: {
      x: Math.max(placed.x - tagWidth / 2, Math.min(placed.x + tagWidth / 2, anchor.x)),
      y: Math.max(placed.y - tagHeight / 2, Math.min(placed.y + tagHeight / 2, anchor.y)),
    } };
    labels.push({ id: zone.id, index: zone.index, code, text, lines, fontSize, lineHeight, x: placed.x, y: placed.y, width: tagWidth, height: tagHeight, anchor, leader });
  }
  return labels;
}
