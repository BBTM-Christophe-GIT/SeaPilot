import { describe, expect, it } from 'vitest';
import { insertPolygonVertex, isValidPolygon, translatePolygon } from './workPermitGeometry';

const triangle = [{ x: .2, y: .2 }, { x: .6, y: .2 }, { x: .2, y: .6 }];

describe('géométrie des zones de travaux', () => {
  it('préserve les écarts entre les sommets quand la translation atteint le bord du plan', () => {
    const translated = translatePolygon(triangle, 1, -1);
    expect(translated[1].x).toBe(1);
    expect(translated[0].y).toBe(0);
    expect(translated[1].x - translated[0].x).toBeCloseTo(triangle[1].x - triangle[0].x);
    expect(translated[2].y - translated[0].y).toBeCloseTo(triangle[2].y - triangle[0].y);
  });

  it('étend le contour par un sommet extérieur et refuse un sommet intérieur', () => {
    const newVertex = { x: .5, y: .5 };
    expect(insertPolygonVertex(triangle, newVertex)).toEqual([triangle[0], triangle[1], newVertex, triangle[2]]);
    expect(insertPolygonVertex(triangle, { x: .3, y: .3 })).toBeNull();
  });

  it('refuse un polygone croisé, même lorsque son aire algébrique est non nulle', () => {
    expect(isValidPolygon([{ x: .1, y: .1 }, { x: .8, y: .9 }, { x: .1, y: .7 }, { x: .7, y: .2 }])).toBe(false);
  });
});
