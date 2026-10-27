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
      expect(label.leader).not.toBeNull(); expect(label.anchor.x).toBe(450);
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
});
