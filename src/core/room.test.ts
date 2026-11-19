import { describe, expect, it } from 'vitest';
import type { Facing, Footprint, FurnitureId, SpotId, Tile } from './room';
import {
  DESK_IDS,
  DOOR,
  FLOOR,
  FLOOR_EDGE,
  FURNITURE,
  LOUNGE_SPOTS,
  ORIGIN,
  SPOTS,
  TILE_H,
  TILE_W,
  VIEWBOX,
  WALL_H,
  WINDOW,
  depthOf,
  isOutside,
  pathBetween,
  pathLength,
  segmentHitsRect,
  toScreen,
} from './room';

const SPOT_IDS = Object.keys(SPOTS) as SpotId[];
const FURNITURE_IDS = Object.keys(FURNITURE) as FurnitureId[];
/** Where people sit or stand: every spot but the door and beyond it. */
const PLACES = SPOT_IDS.filter((id) => id !== 'door' && id !== 'outside');

/** One step in tile space for each facing (DESIGN: x runs down-right, y down-left on screen). */
const STEP: Record<Facing, Tile> = {
  'front-right': { x: 1, y: 0 },
  'back-left': { x: -1, y: 0 },
  'front-left': { x: 0, y: 1 },
  'back-right': { x: 0, y: -1 },
};

const inside = (p: Tile, r: Footprint) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1;
/** Straight distance from a point to a footprint (0 inside it). */
const distanceTo = (p: Tile, r: Footprint) =>
  Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.y0 - p.y, 0, p.y - r.y1));
/** True when walking from the spot in its facing direction reaches the footprint within `reach` tiles. */
const facesToward = (id: SpotId, r: Footprint, reach = 1.2) => {
  const { at, face } = SPOTS[id];
  const step = STEP[face];
  return segmentHitsRect(at, { x: at.x + step.x * reach, y: at.y + step.y * reach }, r);
};
const overlaps = (a: Footprint, b: Footprint) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe('isometric projection (ADR-019 kept, ADR-025 §2)', () => {
  it('keeps the 2:1 tiles', () => {
    expect([TILE_W, TILE_H]).toEqual([32, 16]);
  });

  it.each([
    [{ x: 0, y: 0 }, ORIGIN],
    [{ x: 1, y: 0 }, { x: ORIGIN.x + 16, y: ORIGIN.y + 8 }],
    [{ x: 0, y: 1 }, { x: ORIGIN.x - 16, y: ORIGIN.y + 8 }],
    [{ x: 2.5, y: 2.5 }, { x: ORIGIN.x, y: ORIGIN.y + 40 }],
  ])('tile %j → screen %j', (tile, point) => {
    expect(toScreen(tile)).toEqual({ x: point.x, y: point.y });
  });

  it('draws things nearer the front later', () => {
    expect(depthOf({ x: 2, y: 2 })).toBeLessThan(depthOf({ x: 3, y: 2 }));
    expect(depthOf({ x: 1, y: 5 })).toBe(depthOf({ x: 5, y: 1 }));
  });
});

describe('the office in the window (ADR-025 §2)', () => {
  /** Screen corners of the room: wall tops and the bottom of the floor's side faces. */
  const corners = [
    { ...toScreen({ x: 0, y: 0 }), z: WALL_H },
    { ...toScreen({ x: FLOOR.cols, y: 0 }), z: WALL_H },
    { ...toScreen({ x: 0, y: FLOOR.rows }), z: WALL_H },
    { ...toScreen({ x: FLOOR.cols, y: 0 }), z: -FLOOR_EDGE },
    { ...toScreen({ x: 0, y: FLOOR.rows }), z: -FLOOR_EDGE },
    { ...toScreen({ x: FLOOR.cols, y: FLOOR.rows }), z: -FLOOR_EDGE },
  ].map((c) => ({ x: c.x, y: c.y - c.z }));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);

  it('is a wide floor of at most 14 × 12 tiles under 112 px walls', () => {
    expect(FLOOR.cols).toBeLessThanOrEqual(14);
    expect(FLOOR.rows).toBeLessThanOrEqual(12);
    expect(FLOOR.cols * FLOOR.rows).toBeGreaterThanOrEqual(150);
    expect(WALL_H).toBe(112);
    expect(VIEWBOX).toEqual({ w: 640, h: 420 });
  });

  it('fits whole inside the viewBox, with at least 36 px free above it for the bubble', () => {
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(36);
    expect(Math.max(...ys)).toBeLessThanOrEqual(VIEWBOX.h);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(VIEWBOX.w);
  });

  it('is centred horizontally', () => {
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(VIEWBOX.w / 2, 5);
  });
});

describe('office layout (ADR-025 §2)', () => {
  it('has the furniture the office needs', () => {
    expect(FURNITURE_IDS).toEqual(
      expect.arrayContaining([
        ...DESK_IDS,
        'meeting-table',
        'coffee-machine',
        'water-cooler',
        'sofa',
        'bookshelf',
        'plant-1',
        'plant-2',
      ]),
    );
  });

  it('keeps every footprint on the floor, none overlapping another', () => {
    for (const id of FURNITURE_IDS) {
      const r = FURNITURE[id];
      expect(r.x0, id).toBeGreaterThanOrEqual(0);
      expect(r.y0, id).toBeGreaterThanOrEqual(0);
      expect(r.x1, id).toBeLessThanOrEqual(FLOOR.cols);
      expect(r.y1, id).toBeLessThanOrEqual(FLOOR.rows);
      expect(r.x1, id).toBeGreaterThan(r.x0);
      expect(r.y1, id).toBeGreaterThan(r.y0);
      for (const other of FURNITURE_IDS) {
        if (other !== id) expect(overlaps(r, FURNITURE[other]), `${id} overlaps ${other}`).toBe(false);
      }
    }
  });

  it('stands the bookshelf, coffee machine and water cooler against a back wall', () => {
    for (const id of ['bookshelf', 'coffee-machine', 'water-cooler'] as const) {
      const r = FURNITURE[id];
      expect(r.x0 === 0 || r.y0 === 0, id).toBe(true);
    }
  });

  it('puts the window and the door on the two back walls, clear of what stands against them', () => {
    expect(WINDOW.wall).not.toBe(DOOR.wall);
    for (const span of [WINDOW, DOOR]) {
      const length = span.wall === 'left' ? FLOOR.rows : FLOOR.cols;
      expect(span.from).toBeGreaterThan(0);
      expect(span.to).toBeLessThan(length);
      expect(span.to - span.from).toBeGreaterThanOrEqual(1);
    }
    // Nothing stands in the doorway.
    const doorway: Footprint =
      DOOR.wall === 'right' ? { x0: DOOR.from, y0: 0, x1: DOOR.to, y1: 1.2 } : { x0: 0, y0: DOOR.from, x1: 1.2, y1: DOOR.to };
    for (const id of FURNITURE_IDS) expect(overlaps(FURNITURE[id], doorway), id).toBe(false);
  });

  it('keeps every spot on the floor and out of furniture but its own; outside is beyond the door', () => {
    for (const id of SPOT_IDS) {
      const { at, furniture } = SPOTS[id];
      if (id === 'outside') {
        expect(isOutside(at)).toBe(true);
        continue;
      }
      expect(isOutside(at), id).toBe(false);
      expect(at.x, id).toBeGreaterThan(0);
      expect(at.y, id).toBeGreaterThan(0);
      expect(at.x, id).toBeLessThan(FLOOR.cols);
      expect(at.y, id).toBeLessThan(FLOOR.rows);
      for (const other of FURNITURE_IDS) {
        if (other !== furniture) expect(inside(at, FURNITURE[other]), `${id} inside ${other}`).toBe(false);
      }
    }
  });

  it('keeps people apart: every two spots at least 0.8 tiles from each other', () => {
    for (const a of SPOT_IDS) {
      for (const b of SPOT_IDS) {
        if (a >= b) continue;
        const p = SPOTS[a].at;
        const q = SPOTS[b].at;
        expect(Math.hypot(p.x - q.x, p.y - q.y), `${a} vs ${b}`).toBeGreaterThanOrEqual(0.8);
      }
    }
  });

  it('places the door just inside the door and outside just beyond it, in line', () => {
    const { door, outside } = SPOTS;
    expect(DOOR.wall).toBe('right');
    for (const spot of [door, outside]) {
      expect(spot.at.x).toBeGreaterThan(DOOR.from);
      expect(spot.at.x).toBeLessThan(DOOR.to);
    }
    expect(door.at.y).toBeGreaterThan(0);
    expect(door.at.y).toBeLessThan(1.2);
    expect(outside.at.y).toBeLessThan(0);
    expect(door.face).toBe('front-left');
  });
});

describe('desks (ADR-025 §3)', () => {
  it('has eight desks, each with its chair spot', () => {
    expect(DESK_IDS).toEqual(['desk-1', 'desk-2', 'desk-3', 'desk-4', 'desk-5', 'desk-6', 'desk-7', 'desk-8']);
    for (const id of DESK_IDS) {
      expect(SPOTS[id].furniture).toBe(id);
      expect(FURNITURE[id]).toBeDefined();
    }
  });

  it.each(DESK_IDS)('%s: the chair is beside the desk, not in it, facing its monitor', (id) => {
    const desk = FURNITURE[id];
    const { at } = SPOTS[id];
    expect(inside(at, desk)).toBe(false);
    expect(distanceTo(at, desk)).toBeGreaterThanOrEqual(0.35);
    expect(distanceTo(at, desk)).toBeLessThanOrEqual(0.6);
    expect(facesToward(id, desk, 0.8)).toBe(true);
  });

  it('sits some with their backs to the viewer (monitors visible) and some facing the viewer (faces visible)', () => {
    const faces = DESK_IDS.map((id) => SPOTS[id].face);
    expect(faces.filter((f) => f.startsWith('back')).length).toBeGreaterThanOrEqual(2);
    expect(faces.filter((f) => f.startsWith('front')).length).toBeGreaterThanOrEqual(2);
    // The first desks taken show their monitors.
    expect(SPOTS['desk-1'].face.startsWith('back')).toBe(true);
  });

  it('groups the desks into at least two pods of desks standing back to back or side by side', () => {
    const touching = (a: Footprint, b: Footprint) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
    const pods: string[][] = [];
    for (const id of DESK_IDS) {
      const joined = pods.filter((pod) => pod.some((other) => touching(FURNITURE[id], FURNITURE[other as typeof id])));
      const merged = [id, ...joined.flat()];
      for (const pod of joined) pods.splice(pods.indexOf(pod), 1);
      pods.push(merged);
    }
    expect(pods.length).toBeGreaterThanOrEqual(2);
    for (const pod of pods) expect(pod.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the lounge (ADR-025 §3)', () => {
  it('has at least six resting spots', () => {
    expect(LOUNGE_SPOTS).toEqual(['coffee', 'water', 'sofa-1', 'sofa-2', 'window', 'plant']);
  });

  it.each([
    ['coffee', 'coffee-machine'],
    ['water', 'water-cooler'],
    ['plant', 'plant-2'],
  ] as const)('%s stands by the %s, facing it', (spot, thing) => {
    expect(distanceTo(SPOTS[spot].at, FURNITURE[thing])).toBeLessThanOrEqual(0.7);
    expect(facesToward(spot, FURNITURE[thing])).toBe(true);
  });

  it('seats two on the sofa facing into the room (faces visible)', () => {
    for (const id of ['sofa-1', 'sofa-2'] as const) {
      expect(SPOTS[id].furniture).toBe('sofa');
      expect(inside(SPOTS[id].at, FURNITURE.sofa)).toBe(true);
      expect(SPOTS[id].face.startsWith('front')).toBe(true);
    }
  });

  it('looks out of the window from right in front of it', () => {
    const { at, face } = SPOTS.window;
    expect(WINDOW.wall).toBe('left');
    expect(at.y).toBeGreaterThan(WINDOW.from);
    expect(at.y).toBeLessThan(WINDOW.to);
    expect(at.x).toBeLessThanOrEqual(1.2);
    expect(face).toBe('back-left');
  });
});

describe('pathBetween (A* round the furniture)', () => {
  const ROUTES = SPOT_IDS.flatMap((from) => SPOT_IDS.filter((to) => to !== from).map((to) => [from, to] as const));

  /** Every way a walk can go wrong; [] when it is a good walk. */
  function problems(from: Tile, to: Tile, path: readonly Tile[], own: readonly FurnitureId[], skip: readonly SpotId[] = []): string[] {
    const found: string[] = [];
    if (!path[0] || path[0].x !== from.x || path[0].y !== from.y) found.push('does not start where it starts');
    const end = path[path.length - 1];
    if (!end || end.x !== to.x || end.y !== to.y) found.push('does not end where it ends');
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1] as Tile;
      const b = path[i] as Tile;
      const door = SPOTS.door.at;
      const passage = (p: Tile) => p.y <= door.y && p.x > DOOR.from && p.x < DOOR.to;
      if (!(passage(a) && passage(b))) {
        for (const p of [a, b]) {
          if (p.x <= 0 || p.y <= 0 || p.x >= FLOOR.cols || p.y >= FLOOR.rows) found.push(`leaves the floor at ${p.x},${p.y}`);
        }
      }
      for (const id of FURNITURE_IDS) {
        if (own.includes(id)) continue;
        if (segmentHitsRect(a, b, FURNITURE[id])) found.push(`crosses ${id}`);
      }
      for (const id of PLACES) {
        if (skip.includes(id)) continue;
        const { x, y } = SPOTS[id].at;
        if (segmentHitsRect(a, b, { x0: x - 0.3, y0: y - 0.3, x1: x + 0.3, y1: y + 0.3 })) found.push(`walks through ${id}`);
      }
    }
    return found;
  }

  /** The furniture an end of a walk sits inside (the sofa); a chair is beside its desk, not in it. */
  const ownOf = (...ends: Tile[]) => FURNITURE_IDS.filter((id) => ends.some((p) => inside(p, FURNITURE[id])));

  it('reaches every spot from every spot, round the furniture and other people’s places', () => {
    for (const [from, to] of ROUTES) {
      const a = SPOTS[from].at;
      const b = SPOTS[to].at;
      const path = pathBetween(a, b);
      expect(problems(a, b, path, ownOf(a, b), [from, to]), `${from} → ${to}: ${JSON.stringify(path)}`).toEqual([]);
    }
  });

  it('never walks over a desk, not even its own', () => {
    for (const [from, to] of ROUTES) {
      const path = pathBetween(SPOTS[from].at, SPOTS[to].at);
      for (let i = 1; i < path.length; i += 1) {
        for (const desk of DESK_IDS) {
          expect(segmentHitsRect(path[i - 1] as Tile, path[i] as Tile, FURNITURE[desk]), `${from} → ${to} over ${desk}`).toBe(false);
        }
      }
    }
  });

  it('only the sofa is ever walked through, and only getting on or off it', () => {
    expect(ownOf(...PLACES.map((id) => SPOTS[id].at))).toEqual(['sofa']);
  });

  it('re-routes from anywhere along a walk (someone turning round mid-walk)', () => {
    const starts = ['outside', 'desk-1', 'desk-6', 'sofa-1', 'coffee', 'window'] as const;
    for (const s of starts) {
      for (const t of ['desk-8', 'plant', 'desk-3', 'outside'] as const) {
        const walk = pathBetween(SPOTS[s].at, SPOTS[t].at);
        for (let i = 1; i < walk.length; i += 1) {
          const a = walk[i - 1] as Tile;
          const b = walk[i] as Tile;
          for (const f of [0.3, 0.5, 0.8]) {
            const mid = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
            for (const back of ['desk-2', 'water', 'sofa-2', 'outside'] as const) {
              const target = SPOTS[back].at;
              const path = pathBetween(mid, target);
              expect(problems(mid, target, path, ownOf(mid, target), [s, t, back]), `${s}→${t} at ${f} → ${back}`).toEqual([]);
            }
          }
        }
      }
    }
  });

  it('is deterministic: the same ends give the same walk, whatever was asked before', () => {
    const first = pathBetween(SPOTS['desk-6'].at, SPOTS.window.at);
    pathBetween(SPOTS.coffee.at, SPOTS['desk-2'].at);
    pathBetween(SPOTS.outside.at, SPOTS['sofa-2'].at);
    expect(pathBetween(SPOTS['desk-6'].at, SPOTS.window.at)).toEqual(first);
  });

  it('walks in and out only through the door', () => {
    const { door, outside } = SPOTS;
    for (const id of SPOT_IDS.filter((s) => s !== 'outside' && s !== 'door')) {
      const inward = pathBetween(outside.at, SPOTS[id].at);
      expect(inward.slice(0, 2), id).toEqual([outside.at, door.at]);
      expect(inward.slice(2).every((p) => !isOutside(p)), id).toBe(true);
      const outward = pathBetween(SPOTS[id].at, outside.at);
      expect(outward.slice(-2), id).toEqual([door.at, outside.at]);
      expect(outward.slice(0, -1).every((p) => !isOutside(p)), id).toBe(true);
    }
    expect(pathBetween(outside.at, door.at)).toEqual([outside.at, door.at]);
  });

  it('turns straight back in the doorway instead of stepping in to the door first', () => {
    const doorway = { x: SPOTS.door.at.x, y: 0.2 };
    expect(pathBetween(doorway, SPOTS.outside.at)).toEqual([doorway, SPOTS.outside.at]);
    expect(pathBetween(doorway, SPOTS['desk-1'].at).slice(0, 2)).toEqual([doorway, SPOTS.door.at]);
  });

  it('goes straight when nothing is in the way, and stays put when already there', () => {
    expect(pathBetween(SPOTS['desk-2'].at, SPOTS['desk-1'].at)).toEqual([SPOTS['desk-2'].at, SPOTS['desk-1'].at]);
    expect(pathBetween(SPOTS['sofa-1'].at, SPOTS['sofa-2'].at)).toEqual([SPOTS['sofa-1'].at, SPOTS['sofa-2'].at]);
    expect(pathBetween(SPOTS['desk-3'].at, SPOTS['desk-3'].at)).toEqual([SPOTS['desk-3'].at]);
  });

  it('takes a reasonably direct way (no detours longer than twice the straight distance plus two tiles)', () => {
    for (const [from, to] of ROUTES) {
      const a = SPOTS[from].at;
      const b = SPOTS[to].at;
      const path = pathBetween(a, b);
      expect(pathLength(path), `${from} → ${to}`).toBeLessThanOrEqual(2 * Math.hypot(b.x - a.x, b.y - a.y) + 2);
    }
  });

  it('measures length in tiles', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 5 }])).toBe(6);
  });
});

describe('segmentHitsRect', () => {
  const box = { x0: 1, y0: 1, x1: 2, y1: 2 };

  it('sees a segment through the box, not one that passes by or only touches an edge', () => {
    expect(segmentHitsRect({ x: 0, y: 1.5 }, { x: 3, y: 1.5 }, box)).toBe(true);
    expect(segmentHitsRect({ x: 1.5, y: 1.5 }, { x: 1.5, y: 1.5 }, box)).toBe(true);
    expect(segmentHitsRect({ x: 0, y: 0.5 }, { x: 3, y: 0.5 }, box)).toBe(false);
    expect(segmentHitsRect({ x: 0, y: 1 }, { x: 3, y: 1 }, box)).toBe(false);
    expect(segmentHitsRect({ x: 0, y: 0 }, { x: 0.9, y: 0.9 }, box)).toBe(false);
  });
});
