import { ORIGIN, TILE_H, TILE_W, toScreen } from '../../core/room';

/** The dark brown outline of every shape and sprite in the office. */
export const INK = '#3b2a20';

/** Screen point for tile (x, y) at height z (px above the floor). */
export function pt(x: number, y: number, z = 0): { x: number; y: number } {
  const p = toScreen({ x, y });
  return { x: p.x, y: p.y - z };
}

/** SVG `points` for a list of [x, y, z] tile-space corners. */
export function pts(corners: ReadonlyArray<readonly [number, number, number]>): string {
  return corners
    .map(([x, y, z]) => {
      const p = pt(x, y, z);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

export interface BoxFaces {
  readonly top: string;
  /** Face on the plane y = y1, facing the viewer's left. */
  readonly left: string;
  /** Face on the plane x = x1, facing the viewer's right. */
  readonly right: string;
}

export function boxFaces(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): BoxFaces {
  return {
    top: pts([
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ]),
    left: pts([
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ]),
    right: pts([
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x1, y0, z1],
    ]),
  };
}

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

/**
 * Transform for drawing flat artwork on the plane y = Y between x0 and x1 (the front-left face of a box,
 * or the right wall when Y = 0). Local u runs along +x over `width` units, local v runs down from zTop.
 */
export function planeY(Y: number, x0: number, x1: number, zTop: number, width: number): string {
  const k = (x1 - x0) / width;
  return `matrix(${HALF_W * k} ${HALF_H * k} 0 1 ${ORIGIN.x + (x0 - Y) * HALF_W} ${ORIGIN.y + (x0 + Y) * HALF_H - zTop})`;
}

/** Same for the plane x = X between y0 and y1 (front-right face of a box, or the left wall when X = 0). */
export function planeX(X: number, y0: number, y1: number, zTop: number, width: number): string {
  const k = (y1 - y0) / width;
  return `matrix(${-HALF_W * k} ${HALF_H * k} 0 1 ${ORIGIN.x + (X - y0) * HALF_W} ${ORIGIN.y + (X + y0) * HALF_H - zTop})`;
}
