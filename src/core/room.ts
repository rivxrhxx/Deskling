/**
 * Hermes' mini room (ADR-019): isometric geometry and layout as pure data.
 * Tile space: x runs along the right wall (down-right on screen), y along the left wall (down-left).
 * The back corner is (0, 0); the floor is GRID × GRID tiles of 32×16 px.
 */

export interface Tile {
  readonly x: number;
  readonly y: number;
}

export const GRID = 9;
export const TILE_W = 32;
export const TILE_H = 16;
export const ORIGIN = { x: 240, y: 150 } as const;

/** Screen position (viewBox 480×320) of a point in tile space. */
export function toScreen(tile: Tile): { x: number; y: number } {
  return {
    x: ORIGIN.x + ((tile.x - tile.y) * TILE_W) / 2,
    y: ORIGIN.y + ((tile.x + tile.y) * TILE_H) / 2,
  };
}

/** Painter's order: larger is nearer the viewer. */
export function depthOf(tile: Tile): number {
  return tile.x + tile.y;
}

/** Furniture footprint in tiles: [x0, x1) × [y0, y1). */
export interface Footprint {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export const FURNITURE = {
  // Left wall (x = 0)
  bed: { x0: 0, y0: 1, x1: 2, y1: 3 },
  bookshelf: { x0: 0, y0: 4.2, x1: 0.7, y1: 5 },
  /** Against the left wall, facing into the room so the people on it face the viewer. */
  sofa: { x0: 0, y0: 5.2, x1: 0.8, y1: 7.5 },
  // Right wall (y = 0)
  desk: { x0: 1, y0: 0, x1: 3, y1: 1 },
  fridge: { x0: 3.6, y0: 0, x1: 4.5, y1: 0.8 },
  shower: { x0: 5, y0: 0, x1: 6.5, y1: 1.5 },
  // Floor
  /** A low TV stand facing the sofa (the viewer sees its back). */
  tv: { x0: 2.6, y0: 5.6, x1: 3, y1: 6.6 },
  table: { x0: 5.2, y0: 4.6, x1: 6.2, y1: 5.6 },
  plant: { x0: 8.2, y0: 3.6, x1: 8.8, y1: 4.2 },
} as const satisfies Record<string, Footprint>;
export type FurnitureId = keyof typeof FURNITURE;

/** Which way a character faces on screen. "back-*" shows its back to the viewer. */
export type Facing = 'front-right' | 'front-left' | 'back-right' | 'back-left';

export interface Spot {
  readonly at: Tile;
  readonly face: Facing;
  /** The furniture this spot belongs to; walking into it is allowed. */
  readonly furniture?: FurnitureId;
}

const spots = {
  bed: { at: { x: 1, y: 2 }, face: 'front-right', furniture: 'bed' },
  desk: { at: { x: 2, y: 1.55 }, face: 'back-right' },
  helper: { at: { x: 3.35, y: 1.5 }, face: 'back-right' },
  celebrate: { at: { x: 2.6, y: 2.6 }, face: 'front-right' },
  fridge: { at: { x: 3.95, y: 1.4 }, face: 'back-right' },
  shower: { at: { x: 5.75, y: 0.75 }, face: 'front-left', furniture: 'shower' },
  table: { at: { x: 5.7, y: 4.2 }, face: 'front-left' },
  sofa: { at: { x: 0.5, y: 5.7 }, face: 'front-right', furniture: 'sofa' },
  'sofa-2': { at: { x: 0.5, y: 7.05 }, face: 'front-right', furniture: 'sofa' },
  /** Beside the shelf rather than straight in front of it: the TV stand would hide Hermes there. */
  bookshelf: { at: { x: 2.4, y: 4.2 }, face: 'back-left' },
  window: { at: { x: 0.9, y: 3.6 }, face: 'back-left' },
  /** Left of the pot, so the watering can is not hidden behind the leaves. */
  plant: { at: { x: 7.7, y: 4.5 }, face: 'front-right' },
  front: { at: { x: 5.4, y: 7.4 }, face: 'front-left' },
  /** Right of the TV, so the set does not stand behind Hermes' head. */
  stretch: { at: { x: 4.9, y: 6.4 }, face: 'front-right' },
  door: { at: { x: 8, y: 0.6 }, face: 'front-left' },
  /** Beyond the door, outside the room: characters here are not drawn. */
  outside: { at: { x: 8, y: -0.6 }, face: 'back-right' },
} as const satisfies Record<string, Spot>;
export type SpotId = keyof typeof spots;
export const SPOTS: Readonly<Record<SpotId, Spot>> = spots;

/** Every walk goes through this open middle of the room. */
export const HUB: Tile = { x: 4.2, y: 3.6 };

export const isOutside = (tile: Tile) => tile.y < 0;
const same = (a: Tile, b: Tile) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/** Waypoints from one point to another: via the door when leaving or entering, via the hub otherwise. */
export function pathBetween(from: Tile, to: Tile): Tile[] {
  if (same(from, to)) return [from];
  const door = SPOTS.door.at;
  const points: Tile[] = [from];
  if (isOutside(from)) points.push(door);
  const start = points[points.length - 1] as Tile;
  const end = isOutside(to) ? door : to;
  if (!same(start, HUB) && !same(end, HUB) && !same(start, end)) points.push(HUB);
  if (!same(points[points.length - 1] as Tile, end)) points.push(end);
  if (isOutside(to)) points.push(to);
  return points;
}

export function pathLength(points: readonly Tile[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Tile;
    const b = points[i] as Tile;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** True when the segment a→b passes through the inside of the footprint (touching an edge does not count). */
export function segmentHitsRect(a: Tile, b: Tile, rect: Footprint): boolean {
  const inset = 0.02;
  const x0 = rect.x0 + inset;
  const y0 = rect.y0 + inset;
  const x1 = rect.x1 - inset;
  const y1 = rect.y1 - inset;
  // Liang–Barsky clipping of the segment against the rectangle.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: Array<[number, number]> = [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dy, a.y - y0],
    [dy, y1 - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return t0 <= t1;
}
