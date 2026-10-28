import { describe, expect, it } from 'vitest';
import { layoutSeaOperationZoneLabels, seaOperationZoneAppearance, type SeaOperationZoneLabelObstacle } from './seaOperationZonePresentation';

const luminance = (rgb: readonly number[]) => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
const box = (label: { x: number; y: number; width: number; height: number }) => ({ west: label.x - label.width / 2, east: label.x + label.width / 2, north: label.y - label.height / 2, south: label.y + label.height / 2 });
const overlap = (a: SeaOperationZoneLabelObstacle, b: SeaOperationZoneLabelObstacle) => a.west < b.east && a.east > b.west && a.north < b.south && a.south > b.north;
const triangle = [{ x: 400, y: 80 }, { x: 500, y: 80 }, { x: 450, y: 160 }];

describe('zone data appearance', () => {
  it('assigns 50 distinct dark outlines and pale fills with readable code contrast and matching RGB/hex values', () => {
    const colours = Array.from({ length: 50 }, (_, index) => seaOperationZoneAppearance(index));
    expect(new Set(colours.map(value => value.stroke)).size).toBe(50); expect(new Set(colours.map(value => value.fill)).size).toBe(50);
    colours.forEach((appearance, index) => {
      expect(appearance.code).toBe(`Z${index + 1}`);
      expect(appearance.rgb.map(value => value.toString(16).padStart(2, '0')).join('')).toBe(appearance.stroke.slice(1));
      expect(appearance.fillRgb.map(value => value.toString(16).padStart(2, '0')).join('')).toBe(appearance.fill.slice(1));
      expect((luminance(appearance.fillRgb) + .05) / (luminance(appearance.rgb) + .05)).toBeGreaterThanOrEqual(4.5);
      expect(luminance(appearance.fillRgb)).toBeGreaterThan(.7);
      expect(seaOperationZoneAppearance(index)).toEqual(appearance);
    });
  });
  it('retains original ordinals independently of invalid neighbours and fails safely on invalid indices', () => {
    expect(seaOperationZoneAppearance(2).code).toBe('Z3');
    for (const value of [-1, .5, NaN, Infinity, Number.MAX_VALUE]) expect(seaOperationZoneAppearance(value)).toEqual(seaOperationZoneAppearance(0));
  });
});

describe('zone tag placement', () => {
  it('separates 50 nested/coincident zone labels from each other and the route without moving source geometry', () => {
    const zones = Array.from({ length: 50 }, (_, index) => ({ id: String(index), index, vertices: triangle }));
    const obstacles = [{ west: 410, east: 490, north: 70, south: 170 }];
    const original = structuredClone({ zones, obstacles });
    const labels = layoutSeaOperationZoneLabels(zones, 900, 320, obstacles);
    expect(labels).toHaveLength(50); expect(labels.map(value => value.code)).toEqual(zones.map(value => `Z${value.index + 1}`));
    labels.forEach((label, index) => {
      const area = box(label); expect(area.west).toBeGreaterThanOrEqual(5); expect(area.east).toBeLessThanOrEqual(895); expect(area.north).toBeGreaterThanOrEqual(5); expect(area.south).toBeLessThanOrEqual(315);
      expect(obstacles.some(obstacle => overlap(area, obstacle))).toBe(false);
      expect(labels.slice(index + 1).some(other => overlap(area, box(other)))).toBe(false);
      expect(label.leader).not.toBeNull(); expect(triangle).toContainEqual(label.anchor);
    });
    expect(layoutSeaOperationZoneLabels(zones, 900, 320, obstacles)).toEqual(labels);
    expect({ zones, obstacles }).toEqual(original);
  });
  it('skips invalid or off-frame zones, preserves original codes and omits a tag when no collision-free space exists', () => {
    const zones = [{ id: 'incomplete', index: 0, vertices: triangle.slice(0, 2) }, { id: 'valid', index: 2, vertices: triangle }, { id: 'invalid', index: 3, vertices: [{ x: NaN, y: 0 }, ...triangle] }, { id: 'outside', index: 4, vertices: triangle.map(point => ({ x: point.x + 1000, y: point.y })) }];
    expect(layoutSeaOperationZoneLabels(zones, 900, 320).map(value => value.code)).toEqual(['Z3']);
    expect(layoutSeaOperationZoneLabels(zones, 900, 320, [{ west: -10, east: 910, north: -10, south: 330 }])).toEqual([]);
    for (const [width, height] of [[NaN, 320], [900, Infinity], [20, 20], [4001, 320]]) expect(layoutSeaOperationZoneLabels(zones, width, height)).toEqual([]);
  });
  it('respects obstacles across collision-grid boundaries and keeps callout endpoints on the tag edge', () => {
    const obstacle = { west: 63, east: 106, north: 63, south: 106 };
    const labels = layoutSeaOperationZoneLabels([{ id: 'zone', index: 0, vertices: [{ x: 64, y: 64 }, { x: 104, y: 64 }, { x: 84, y: 104 }] }], 240, 180, [obstacle]);
    expect(labels).toHaveLength(1); const label = labels[0], area = box(label);
    expect(overlap(area, obstacle)).toBe(false);
    expect(label.leader).not.toBeNull(); const end = label.leader!.to;
    expect(end.x === area.west || end.x === area.east || end.y === area.north || end.y === area.south).toBe(true);
  });

  it('shows full zone names and targets non-shared vertices instead of the common corner', () => {
    const shared = { x: 100, y: 80 };
    const zones = [
      { id: 'works', index: 0, name: 'Zone de Travaux', vertices: [shared, { x: 220, y: 80 }, { x: 160, y: 190 }] },
      { id: 'buffer', index: 1, name: 'Zone Tampon', vertices: [shared, { x: 350, y: 85 }, { x: 300, y: 210 }] },
    ];
    const original = structuredClone(zones), labels = layoutSeaOperationZoneLabels(zones, 500, 300);
    expect(labels).toHaveLength(2);
    expect(labels.map(label => label.text)).toEqual(['Zone de Travaux', 'Zone Tampon']);
    labels.forEach((label, index) => {
      expect(label.lines).toEqual([zones[index].name]); expect(label.code).toBe(`Z${index + 1}`);
      expect(zones[index].vertices).toContainEqual(label.anchor); expect(label.anchor).not.toEqual(shared);
      expect(label.leader?.from).toEqual(label.anchor); expect(label.leader).not.toBeNull();
      expect(overlap(box(label), { west: label.anchor.x - 3, east: label.anchor.x + 3, north: label.anchor.y - 3, south: label.anchor.y + 3 })).toBe(false);
    });
    expect(Math.hypot(labels[0].anchor.x - labels[1].anchor.x, labels[0].anchor.y - labels[1].anchor.y)).toBeGreaterThan(24);
    expect(zones).toEqual(original);
  });

  it.each([0, 2])('separates anchors for coincident or near-nested polygons (inset %s)', inset => {
    const rectangle = [{ x: 160, y: 80 }, { x: 360, y: 80 }, { x: 360, y: 240 }, { x: 160, y: 240 }];
    const nested = rectangle.map(point => ({ x: point.x + (point.x < 260 ? inset : -inset), y: point.y + (point.y < 160 ? inset : -inset) }));
    const zones = [{ id: 'first', index: 0, name: 'Zone de Travaux', vertices: rectangle }, { id: 'second', index: 1, name: 'Zone Tampon', vertices: nested }];
    const labels = layoutSeaOperationZoneLabels(zones, 600, 320);
    expect(labels).toHaveLength(2); expect(labels.every(label => label.leader !== null)).toBe(true);
    labels.forEach((label, index) => expect(zones[index].vertices).toContainEqual(label.anchor));
    expect(Math.hypot(labels[0].anchor.x - labels[1].anchor.x, labels[0].anchor.y - labels[1].anchor.y)).toBeGreaterThan(200);
    expect(overlap(box(labels[0]), box(labels[1]))).toBe(false);
    expect(layoutSeaOperationZoneLabels(zones, 600, 320)).toEqual(labels);
  });

  it('wraps complete long names and unbroken identifiers using the consumer text metrics', () => {
    const name = `  Zone   ${'W'.repeat(44)}   de sécurité  `, measure = (value: string) => Array.from(value).length * 11;
    const labels = layoutSeaOperationZoneLabels([{ id: 'long', index: 4, name, vertices: triangle }], 620, 400, [], measure);
    expect(labels).toHaveLength(1); const label = labels[0], area = box(label);
    expect(label.text).toBe(`Zone ${'W'.repeat(44)} de sécurité`); expect(label.lines.length).toBeGreaterThan(1);
    expect(label.lines.join('').replace(/\s/g, '')).toBe(label.text.replace(/\s/g, ''));
    expect(label.lines.every(line => measure(line) + 12 <= label.width)).toBe(true);
    expect(label.height).toBe(label.lines.length * label.lineHeight + 8); expect(label.fontSize).toBe(10); expect(label.lineHeight).toBe(12);
    expect(area.west).toBeGreaterThanOrEqual(5); expect(area.east).toBeLessThanOrEqual(615);
    expect(area.north).toBeGreaterThanOrEqual(5); expect(area.south).toBeLessThanOrEqual(395);
    expect(label.text).not.toContain('…');
  });

  it('prefers an on-screen vertex and keeps partially off-screen polygon callouts truthful', () => {
    const visible = { x: 150, y: 80 };
    const zones = [{ id: 'partial', index: 1, name: 'Zone côtière', vertices: [{ x: -200, y: 30 }, visible, { x: -200, y: 180 }] }];
    const [label] = layoutSeaOperationZoneLabels(zones, 400, 240);
    expect(label.anchor).toEqual(visible); expect(label.leader?.from).toEqual(visible);
    const surround = [{ x: -50, y: -50 }, { x: 450, y: -50 }, { x: 450, y: 350 }, { x: -50, y: 350 }];
    const [covering] = layoutSeaOperationZoneLabels([{ id: 'covers', index: 0, vertices: surround }], 400, 300);
    expect(surround).toContainEqual(covering.anchor); expect(covering.text).toBe('Zone 1');
    expect([covering.x, covering.y, covering.width, covering.height]).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect(box(covering).west).toBeGreaterThanOrEqual(5); expect(box(covering).east).toBeLessThanOrEqual(395);
  });

  it('omits an unfit full name rather than clipping or truncating it and falls back for blank names', () => {
    const small = [{ x: 15, y: 15 }, { x: 65, y: 15 }, { x: 40, y: 55 }];
    expect(layoutSeaOperationZoneLabels([{ id: 'too-long', index: 0, name: 'W'.repeat(500), vertices: small }], 80, 70)).toEqual([]);
    const [fallback] = layoutSeaOperationZoneLabels([{ id: 'unnamed', index: 3, name: ' \n ', vertices: triangle }], 900, 320);
    expect(fallback.text).toBe('Zone 4'); expect(fallback.lines).toEqual(['Zone 4']); expect(fallback.code).toBe('Z4');
    expect(layoutSeaOperationZoneLabels([{ id: 'invalid-metric', index: 0, name: 'Zone nommée', vertices: triangle }], 900, 320, [], () => NaN)).toHaveLength(1);
  });

  it('handles the permitted 50 by 200 vertex plan deterministically without mutating its geometry', () => {
    const zones = Array.from({ length: 50 }, (_, index) => ({ id: String(index), index,
      vertices: Array.from({ length: 200 }, (_, vertex) => ({ x: 450 + 70 * Math.cos(vertex / 200 * Math.PI * 2) + index * .01,
        y: 160 + 70 * Math.sin(vertex / 200 * Math.PI * 2) + index * .01 })) }));
    const original = structuredClone(zones), labels = layoutSeaOperationZoneLabels(zones, 900, 320);
    expect(labels).toHaveLength(50); expect(labels.every(label => [label.x, label.y, label.width, label.height, label.anchor.x, label.anchor.y].every(Number.isFinite))).toBe(true);
    labels.forEach((label, index) => expect(zones[index].vertices).toContainEqual(label.anchor));
    expect(layoutSeaOperationZoneLabels(zones, 900, 320)).toEqual(labels); expect(zones).toEqual(original);
  });
});
