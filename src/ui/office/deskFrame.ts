import type { DeskId, Footprint, Tile } from '../../core/room';
import { FURNITURE, SPOTS } from '../../core/room';

/** Which side of its desk a chair stands on, in tile axes. */
export type Side = '+x' | '-x' | '+y' | '-y';

/**
 * A desk seen from its chair: `u` runs along the desk (tile x or y), `v` across it from the chair's edge
 * (0) to the far edge (`depth`). Desk furniture is laid out in these terms so all eight desks share one drawing.
 */
export interface DeskFrame {
  readonly side: Side;
  /** The desk's ends along `u`, and the chair's place between them. */
  readonly ua: number;
  readonly ub: number;
  readonly cu: number;
  readonly depth: number;
  /** The end of the desk away from its pod neighbour: -1 towards `ua`, 1 towards `ub`. */
  readonly outer: -1 | 1;
  /** A footprint given along (`u0..u1`) and across (`v0..v1`) the desk. */
  rect(u0: number, u1: number, v0: number, v1: number): Footprint;
  /** A point given the same way. */
  at(u: number, v: number): Tile;
}

export function deskFrame(desk: DeskId): DeskFrame {
  const f: Footprint = FURNITURE[desk];
  const chair = SPOTS[desk].at;
  const side: Side = chair.y > f.y1 ? '+y' : chair.y < f.y0 ? '-y' : chair.x > f.x1 ? '+x' : '-x';
  const alongX = side === '+y' || side === '-y';
  const [ua, ub] = alongX ? [f.x0, f.x1] : [f.y0, f.y1];
  const depth = alongX ? f.y1 - f.y0 : f.x1 - f.x0;
  // v measured from the chair's edge into the desk.
  const across = (v: number) => (side === '+y' ? f.y1 - v : side === '-y' ? f.y0 + v : side === '+x' ? f.x1 - v : f.x0 + v);
  const at = (u: number, v: number): Tile => (alongX ? { x: u, y: across(v) } : { x: across(v), y: u });
  const rect = (u0: number, u1: number, v0: number, v1: number): Footprint => {
    const a = at(u0, v0);
    const b = at(u1, v1);
    return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  };
  const neighbour = Object.entries(FURNITURE).some(
    ([id, other]) => id !== desk && id.startsWith('desk-') && (alongX ? other.x0 === f.x1 && other.y0 === f.y0 : other.y0 === f.y1 && other.x0 === f.x0),
  );
  return { side, ua, ub, cu: alongX ? chair.x : chair.y, depth, outer: neighbour ? -1 : 1, rect, at };
}

/** Where the delegation helper hovers: beside the member's chair, a tile along the desk towards the pod's outer end. */
export function helperSpot(desk: DeskId): Tile {
  const { cu, outer, at } = deskFrame(desk);
  return at(cu + outer, -0.45);
}
