/**
 * The office (ADR-025 §2): isometric geometry, layout and walking routes as pure data.
 * Tile space: x runs along the right back wall (down-right on screen), y along the left back wall (down-left).
 * The back corner is (0, 0); the floor is FLOOR.cols × FLOOR.rows tiles of 32×16 px.
 */

export interface Tile {
  readonly x: number;
  readonly y: number;
}

export const FLOOR = { cols: 14, rows: 12 } as const;
export const TILE_W = 32;
export const TILE_H = 16;
/** Height of the two back walls and the thickness of the floor's front side faces (px). */
export const WALL_H = 112;
export const FLOOR_EDGE = 10;
/** The scene's SVG viewBox. Room centred, with ≥ 36 px free above the walls for the summary bubble. */
export const VIEWBOX = { w: 640, h: 420 } as const;
export const ORIGIN = { x: VIEWBOX.w / 2 - ((FLOOR.cols - FLOOR.rows) * TILE_W) / 4, y: 156 } as const;

/** Screen position (in VIEWBOX) of a point in tile space. */
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

/** A stretch of a back wall: 'left' is the wall x = 0 (from/to are y), 'right' the wall y = 0 (from/to are x). */
export interface WallSpan {
  readonly wall: 'left' | 'right';
  readonly from: number;
  readonly to: number;
}

/** The big window on the left wall, beside the lounge. */
export const WINDOW: WallSpan = { wall: 'left', from: 2, to: 5 };
/** The door on the right wall; `door` stands just inside it, `outside` just beyond it. */
export const DOOR: WallSpan = { wall: 'right', from: 11.8, to: 13 };

export const FURNITURE = {
  // Two desk pods of four, desks back to back. In each pod two desks are sat at from the viewer's side (backs to the
  // viewer, monitors visible: 1–2, 5–6) and two from behind (faces visible over the monitors: 3–4, 7–8).
  // Pod A (back, centre) has its rows along x; pod B (front right) along y, so the office shows all four facings.
  'desk-1': { x0: 5.2, y0: 3.3, x1: 7, y1: 4.2 },
  'desk-2': { x0: 7, y0: 3.3, x1: 8.8, y1: 4.2 },
  'desk-3': { x0: 5.2, y0: 2.4, x1: 7, y1: 3.3 },
  'desk-4': { x0: 7, y0: 2.4, x1: 8.8, y1: 3.3 },
  'desk-5': { x0: 11.4, y0: 6, x1: 12.3, y1: 7.8 },
  'desk-6': { x0: 11.4, y0: 7.8, x1: 12.3, y1: 9.6 },
  'desk-7': { x0: 10.5, y0: 6, x1: 11.4, y1: 7.8 },
  'desk-8': { x0: 10.5, y0: 7.8, x1: 11.4, y1: 9.6 },
  'meeting-table': { x0: 4, y0: 7.8, x1: 6, y1: 9.4 },
  // Right wall (y = 0): the kitchen corner at the back, the printer by the door.
  'plant-1': { x0: 0.3, y0: 0.3, x1: 0.9, y1: 0.9 },
  'coffee-machine': { x0: 1.3, y0: 0, x1: 2.3, y1: 0.75 },
  'water-cooler': { x0: 2.8, y0: 0, x1: 3.4, y1: 0.6 },
  printer: { x0: 9.6, y0: 0, x1: 10.6, y1: 0.7 },
  // Left wall (x = 0): the window, then the sofa facing into the room, a plant and the bookshelf at the front.
  sofa: { x0: 0, y0: 6.2, x1: 0.9, y1: 8.6 },
  'plant-2': { x0: 0.2, y0: 9, x1: 0.8, y1: 9.6 },
  bookshelf: { x0: 0, y0: 10, x1: 0.7, y1: 11.6 },
} as const satisfies Record<string, Footprint>;
export type FurnitureId = keyof typeof FURNITURE;

/** Which way a character faces on screen. "back-*" shows its back to the viewer. */
export type Facing = 'front-right' | 'front-left' | 'back-right' | 'back-left';

export interface Spot {
  readonly at: Tile;
  readonly face: Facing;
  /** The furniture this spot belongs to (a desk's chair, a seat on the sofa). */
  readonly furniture?: FurnitureId;
}

const spots = {
  // Chairs, 0.45 tiles off their desk and facing its monitor.
  'desk-1': { at: { x: 6.1, y: 4.65 }, face: 'back-right', furniture: 'desk-1' },
  'desk-2': { at: { x: 7.9, y: 4.65 }, face: 'back-right', furniture: 'desk-2' },
  'desk-3': { at: { x: 6.1, y: 1.95 }, face: 'front-left', furniture: 'desk-3' },
  'desk-4': { at: { x: 7.9, y: 1.95 }, face: 'front-left', furniture: 'desk-4' },
  'desk-5': { at: { x: 12.75, y: 6.9 }, face: 'back-left', furniture: 'desk-5' },
  'desk-6': { at: { x: 12.75, y: 8.7 }, face: 'back-left', furniture: 'desk-6' },
  'desk-7': { at: { x: 10.05, y: 6.9 }, face: 'front-right', furniture: 'desk-7' },
  'desk-8': { at: { x: 10.05, y: 8.7 }, face: 'front-right', furniture: 'desk-8' },
  // The lounge: each spot by its thing, facing it (or, on the sofa, the room).
  coffee: { at: { x: 1.8, y: 1.3 }, face: 'back-right', furniture: 'coffee-machine' },
  water: { at: { x: 3.1, y: 1.15 }, face: 'back-right', furniture: 'water-cooler' },
  'sofa-1': { at: { x: 0.5, y: 6.8 }, face: 'front-right', furniture: 'sofa' },
  'sofa-2': { at: { x: 0.5, y: 8 }, face: 'front-right', furniture: 'sofa' },
  window: { at: { x: 0.85, y: 3.5 }, face: 'back-left' },
  plant: { at: { x: 1.35, y: 9.3 }, face: 'back-left', furniture: 'plant-2' },
  books: { at: { x: 1.15, y: 10.8 }, face: 'back-left', furniture: 'bookshelf' },
  door: { at: { x: 12.4, y: 0.75 }, face: 'front-left' },
  /** Beyond the door, outside the room: characters here are not drawn. */
  outside: { at: { x: 12.4, y: -0.8 }, face: 'back-right' },
} as const satisfies Record<string, Spot>;
export type SpotId = keyof typeof spots;
export const SPOTS: Readonly<Record<SpotId, Spot>> = spots;

/** The eight desks, taken lowest first. A desk's spot is its chair. */
export const DESK_IDS = ['desk-1', 'desk-2', 'desk-3', 'desk-4', 'desk-5', 'desk-6', 'desk-7', 'desk-8'] as const satisfies readonly SpotId[];
export type DeskId = (typeof DESK_IDS)[number];
/** Where idle members rest, moving from one to another now and then (ADR-027 §1). */
export const LOUNGE_SPOTS = ['coffee', 'water', 'sofa-1', 'sofa-2', 'window', 'plant', 'books'] as const satisfies readonly SpotId[];
export type LoungeSpot = (typeof LOUNGE_SPOTS)[number];

export const isOutside = (tile: Tile) => tile.y < 0;
/** True when two points coincide (within float error). */
export const sameTile = (a: Tile, b: Tile) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/* ---------- Walking: A* on a fine grid, then string pulling ---------------------------------- */

/** Grid cell size in tiles. */
const CELL = 0.25;
const NX = Math.round(FLOOR.cols / CELL);
const NY = Math.round(FLOOR.rows / CELL);
/**
 * How far walkers keep from furniture and from the places people sit or stand: grid cells within CLEARANCE are
 * blocked; a straight cut keeps SIGHT (a little less, so cuts between free cells are not refused for grazing a corner).
 * Both exceed half a cell's diagonal, so even a step between neighbouring free cells never touches furniture.
 */
const CLEARANCE = 0.3;
const SIGHT = 0.2;
const WALL_CLEARANCE = 0.35;
/** Half the size of a place where someone sits or stands: walks go round other people's places. */
const PLACE = 0.15;

const grow = (r: Footprint, by: number): Footprint => ({ x0: r.x0 - by, y0: r.y0 - by, x1: r.x1 + by, y1: r.y1 + by });
const contains = (r: Footprint, p: Tile) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

/** Everything walks avoid: the furniture, and every spot but the door's (people sit or stand there). */
const OBSTACLES: readonly Footprint[] = [
  ...Object.values(FURNITURE),
  ...(Object.keys(SPOTS) as SpotId[])
    .filter((id) => id !== 'door' && id !== 'outside')
    .map((id) => {
      const { x, y } = SPOTS[id].at;
      return { x0: x - PLACE, y0: y - PLACE, x1: x + PLACE, y1: y + PLACE };
    }),
];

const center = (cell: number): Tile => ({ x: ((cell % NX) + 0.5) * CELL, y: (Math.floor(cell / NX) + 0.5) * CELL });

const FREE: readonly boolean[] = Array.from({ length: NX * NY }, (_, cell) => {
  const c = center(cell);
  const inRoom = c.x >= WALL_CLEARANCE && c.x <= FLOOR.cols - WALL_CLEARANCE && c.y >= WALL_CLEARANCE && c.y <= FLOOR.rows - WALL_CLEARANCE;
  return inRoom && !OBSTACLES.some((o) => contains(grow(o, CLEARANCE), c));
});

/**
 * An end of a walk and the obstacles whose margin it stands in (its own chair or seat, or a margin it was
 * passing when it turned round), each with the margin it may keep: no less than it already keeps.
 */
interface End {
  readonly at: Tile;
  readonly own: ReadonlyMap<Footprint, number>;
}

/** How far a point is outside a rectangle along the nearer axis; negative inside. */
const gap = (p: Tile, r: Footprint) => Math.max(r.x0 - p.x, p.x - r.x1, r.y0 - p.y, p.y - r.y1);

function endAt(at: Tile): End {
  const own = new Map<Footprint, number>();
  for (const o of OBSTACLES) {
    if (contains(grow(o, CLEARANCE), at)) own.set(o, Math.min(SIGHT, gap(at, o) - 0.01));
  }
  return { at, own };
}

/**
 * Whether a straight walk a→b is clear: it keeps SIGHT from every obstacle, except that an end may stay as close as
 * it already is to what it stands by, and may cross what it stands inside (getting up from the sofa).
 */
function clear(a: Tile, b: Tile, ends: readonly End[]): boolean {
  return OBSTACLES.every((o) => {
    let margin = SIGHT;
    for (const end of ends) margin = Math.min(margin, end.own.get(o) ?? SIGHT);
    return margin < 0 || !segmentHitsRect(a, b, grow(o, margin));
  });
}

/** The free grid cells an end can step to in a straight line, with the length of that step. */
function entries(end: End): Map<number, number> {
  const reach = 6;
  const ci = Math.floor(end.at.x / CELL);
  const cj = Math.floor(end.at.y / CELL);
  const found = new Map<number, number>();
  for (let j = Math.max(0, cj - reach); j <= Math.min(NY - 1, cj + reach); j += 1) {
    for (let i = Math.max(0, ci - reach); i <= Math.min(NX - 1, ci + reach); i += 1) {
      const cell = j * NX + i;
      const c = center(cell);
      if (FREE[cell] && clear(end.at, c, [end])) found.set(cell, Math.hypot(c.x - end.at.x, c.y - end.at.y));
    }
  }
  return found;
}

const STEPS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

type Queued = readonly [f: number, cell: number];
const before = (p: Queued, q: Queued) => p[0] < q[0] - 1e-9 || (Math.abs(p[0] - q[0]) <= 1e-9 && p[1] < q[1]);

/** A binary min-heap on (f, cell): equal costs are broken by cell index, so routes are deterministic. */
function heap() {
  const items: Queued[] = [];
  const swap = (i: number, j: number) => {
    const t = items[i] as Queued;
    items[i] = items[j] as Queued;
    items[j] = t;
  };
  return {
    get size() {
      return items.length;
    },
    push(item: Queued) {
      items.push(item);
      let i = items.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (!before(items[i] as Queued, items[parent] as Queued)) break;
        swap(i, parent);
        i = parent;
      }
    },
    pop(): Queued {
      const top = items[0] as Queued;
      const last = items.pop() as Queued;
      if (items.length > 0) {
        items[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          let m = i;
          if (l < items.length && before(items[l] as Queued, items[m] as Queued)) m = l;
          if (l + 1 < items.length && before(items[l + 1] as Queued, items[m] as Queued)) m = l + 1;
          if (m === i) break;
          swap(i, m);
          i = m;
        }
      }
      return top;
    },
  };
}

/**
 * A* over free cells, 8-connected without cutting corners, from the cells the start can step to towards the cells
 * the goal can be reached from. Costs are lengths in tiles; the heuristic is the straight distance to the goal.
 */
function search(start: End, goal: End): number[] | null {
  const sources = entries(start);
  const exits = entries(goal);
  const h = (cell: number) => {
    const c = center(cell);
    return Math.hypot(c.x - goal.at.x, c.y - goal.at.y);
  };
  const g = new Float64Array(NX * NY).fill(Infinity);
  const from = new Int32Array(NX * NY).fill(-1);
  const done = new Uint8Array(NX * NY);
  const open = heap();
  for (const [cell, cost] of sources) {
    g[cell] = cost;
    open.push([cost + h(cell), cell]);
  }
  while (open.size > 0) {
    const [f, cell] = open.pop();
    if (done[cell]) continue;
    done[cell] = 1;
    // A cell the goal is in sight of: its f is the whole length, so the first one popped is the shortest.
    if (exits.has(cell) && f >= (g[cell] as number) + (exits.get(cell) as number) - 1e-9) {
      const route = [cell];
      for (let at = from[cell] as number; at !== -1; at = from[at] as number) route.unshift(at);
      return route;
    }
    const x = cell % NX;
    const y = Math.floor(cell / NX);
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue;
      const next = ny * NX + nx;
      if (!FREE[next] || done[next]) continue;
      if (dx !== 0 && dy !== 0 && (!FREE[y * NX + nx] || !FREE[ny * NX + x])) continue;
      const cost = (g[cell] as number) + (dx !== 0 && dy !== 0 ? CELL * Math.SQRT2 : CELL);
      if (cost < (g[next] as number) - 1e-9) {
        g[next] = cost;
        from[next] = cell;
        open.push([cost + h(next), next]);
      }
    }
  }
  return null;
}

/** Pulls the string tight: from each point, straight on to the farthest later point in clear sight. */
function smooth(points: readonly Tile[], start: End, goal: End): Tile[] {
  const out: Tile[] = [points[0]!];
  let i = 0;
  const last = points.length - 1;
  while (i < last) {
    let j = last;
    while (j > i + 1) {
      const ends = [...(i === 0 ? [start] : []), ...(j === last ? [goal] : [])];
      if (clear(points[i]!, points[j]!, ends)) break;
      j -= 1;
    }
    out.push(points[j]!);
    i = j;
  }
  return out;
}

/** A walk between two points on the floor. */
function walk(from: Tile, to: Tile): Tile[] {
  if (sameTile(from, to)) return [from];
  const start = endAt(from);
  const goal = endAt(to);
  if (clear(from, to, [start, goal])) return [from, to];
  const route = search(start, goal);
  if (!route) return [from, to];
  return smooth([from, ...route.map(center), to], start, goal);
}

/**
 * Waypoints from one point to another, round the furniture and other people's places. Walks in from outside
 * or out of the office go through the door. Deterministic: the same ends give the same walk.
 */
export function pathBetween(from: Tile, to: Tile): Tile[] {
  if (sameTile(from, to)) return [from];
  const door = SPOTS.door.at;
  // Outside, or in the doorway between the door spot and outside: the way in or out is a straight line.
  const passage = (p: Tile) => isOutside(p) || (p.y < door.y && p.x >= DOOR.from && p.x <= DOOR.to);
  if (passage(from) && passage(to)) return [from, to];
  if (passage(from)) return [from, ...walk(door, to)];
  if (passage(to)) return [...walk(from, door), to];
  return walk(from, to);
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
