import { describe, expect, it } from 'vitest';
import type { SpotId } from './room';
import { FURNITURE, GRID, HUB, SPOTS, depthOf, pathBetween, pathLength, segmentHitsRect, toScreen } from './room';

describe('isometric projection (FR-R1, ADR-019)', () => {
  it.each([
    [{ x: 0, y: 0 }, { x: 240, y: 150 }],
    [{ x: 9, y: 0 }, { x: 384, y: 222 }],
    [{ x: 0, y: 9 }, { x: 96, y: 222 }],
    [{ x: 9, y: 9 }, { x: 240, y: 294 }],
    [{ x: 4.5, y: 4.5 }, { x: 240, y: 222 }],
  ])('tile %j → screen %j', (tile, point) => {
    expect(toScreen(tile)).toEqual(point);
  });

  it('draws things nearer the front later', () => {
    expect(depthOf({ x: 2, y: 2 })).toBeLessThan(depthOf({ x: 3, y: 2 }));
    expect(depthOf({ x: 1, y: 5 })).toBe(depthOf({ x: 5, y: 1 }));
  });
});

describe('room layout', () => {
  it('keeps every footprint and spot inside the floor (the door outside spot excepted)', () => {
    for (const item of Object.values(FURNITURE)) {
      expect(item.x0).toBeGreaterThanOrEqual(0);
      expect(item.y0).toBeGreaterThanOrEqual(0);
      expect(item.x1).toBeLessThanOrEqual(GRID);
      expect(item.y1).toBeLessThanOrEqual(GRID);
    }
    for (const [id, spot] of Object.entries(SPOTS)) {
      if (id === 'outside') {
        expect(spot.at.y).toBeLessThan(0);
        continue;
      }
      expect(spot.at.x).toBeGreaterThan(0);
      expect(spot.at.y).toBeGreaterThan(0);
      expect(spot.at.x).toBeLessThan(GRID);
      expect(spot.at.y).toBeLessThan(GRID);
    }
  });

  it('keeps the walking hub clear of furniture', () => {
    for (const item of Object.values(FURNITURE)) {
      expect(segmentHitsRect(HUB, HUB, item)).toBe(false);
    }
  });

  it.each(Object.keys(SPOTS).filter((id) => id !== 'outside') as SpotId[])(
    'the straight walk from the hub to %s crosses no furniture but its own',
    (id) => {
      const spot = SPOTS[id];
      for (const [name, item] of Object.entries(FURNITURE)) {
        if (name === spot.furniture) continue;
        expect(segmentHitsRect(HUB, spot.at, item), `${id} crosses ${name}`).toBe(false);
      }
    },
  );
});

describe('pathBetween', () => {
  it('walks through the hub', () => {
    expect(pathBetween(SPOTS.bed.at, SPOTS.shower.at)).toEqual([SPOTS.bed.at, HUB, SPOTS.shower.at]);
  });

  it('does not detour when starting or ending at the hub', () => {
    expect(pathBetween(HUB, SPOTS.sofa.at)).toEqual([HUB, SPOTS.sofa.at]);
    expect(pathBetween(SPOTS.sofa.at, HUB)).toEqual([SPOTS.sofa.at, HUB]);
  });

  it('stays put when already there', () => {
    expect(pathBetween(SPOTS.desk.at, SPOTS.desk.at)).toEqual([SPOTS.desk.at]);
  });

  it('enters and leaves through the door', () => {
    expect(pathBetween(SPOTS.outside.at, SPOTS.sofa.at)).toEqual([SPOTS.outside.at, SPOTS.door.at, HUB, SPOTS.sofa.at]);
    expect(pathBetween(SPOTS.sofa.at, SPOTS.outside.at)).toEqual([SPOTS.sofa.at, HUB, SPOTS.door.at, SPOTS.outside.at]);
  });

  it('measures length in tiles', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 5 }])).toBe(6);
  });
});
