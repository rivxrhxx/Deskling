import { memo } from 'react';
import type { OfficeDecorId } from '../../core/growth';
import { DOOR, FLOOR, FLOOR_EDGE, WALL_H, WINDOW } from '../../core/room';
import { IsoBox } from './IsoBox';
import { INK, planeX, planeY, pt, pts } from './isoMath';

/**
 * The office shell (DESIGN §3.1): floor, the two back walls and what hangs on them. Original art from primitives.
 * Wall artwork is drawn flat on its wall: `planeY(0, …)` on the right wall, `planeX(0, y1, y0, …)` on the left one
 * (from the far end, so it reads left to right).
 */

const { cols: X, rows: Y } = FLOOR;

/* ---------- Floor ------------------------------------------------------------------------------ */

/** Carpet tiles under the two desk pods. */
const CARPETS = [
  { x0: 4.7, y0: 1.35, x1: 9.3, y1: 5.25 },
  { x0: 9.5, y0: 5.4, x1: 13.35, y1: 10.2 },
] as const;

export const Floor = memo(function Floor() {
  return (
    <g data-part="floor">
      <polygon points={pts([[0, Y, 0], [X, Y, 0], [X, Y, -FLOOR_EDGE], [0, Y, -FLOOR_EDGE]])} fill="#c99d6a" stroke={INK} />
      <polygon points={pts([[X, 0, 0], [X, Y, 0], [X, Y, -FLOOR_EDGE], [X, 0, -FLOOR_EDGE]])} fill="#ab8253" stroke={INK} />
      {Array.from({ length: Y }, (_, row) => (
        <polygon key={row} points={pts([[0, row, 0], [X, row, 0], [X, row + 1, 0], [0, row + 1, 0]])} fill={row % 2 === 0 ? '#f0dcb8' : '#ead2aa'} />
      ))}
      {/* Plank ends, staggered row by row. */}
      {Array.from({ length: Y * 4 }, (_, i) => {
        const row = Math.floor(i / 4);
        const x = ((row * 1.7) % 3.5) + (i % 4) * 3.5 + 0.4;
        const a = pt(x, row);
        const b = pt(x, row + 1);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#dcc196" />;
      })}
      {CARPETS.map((c) => (
        <g key={c.x0}>
          <polygon points={pts([[c.x0, c.y0, 0], [c.x1, c.y0, 0], [c.x1, c.y1, 0], [c.x0, c.y1, 0]])} fill="#d3dbe1" stroke="#b3bec8" />
          {Array.from({ length: Math.floor((c.x1 - c.x0) / 0.65) }, (_, i) => {
            const a = pt(c.x0 + (i + 1) * 0.65, c.y0);
            const b = pt(c.x0 + (i + 1) * 0.65, c.y1);
            return <line key={`x${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c6d0d8" />;
          })}
          {Array.from({ length: Math.floor((c.y1 - c.y0) / 0.65) }, (_, i) => {
            const a = pt(c.x0, c.y0 + (i + 1) * 0.65);
            const b = pt(c.x1, c.y0 + (i + 1) * 0.65);
            return <line key={`y${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c6d0d8" />;
          })}
        </g>
      ))}
      <polygon points={pts([[0, 0, 0], [X, 0, 0], [X, Y, 0], [0, Y, 0]])} fill="none" stroke={INK} />
    </g>
  );
});

/* ---------- Walls ------------------------------------------------------------------------------ */

const STRIPE = { z0: 88, z1: 95 };

export const Walls = memo(function Walls() {
  return (
    <>
      <g data-part="wall-left">
        <polygon points={pts([[0, 0, 0], [0, Y, 0], [0, Y, WALL_H], [0, 0, WALL_H]])} fill="#ebe5dc" stroke={INK} />
        {Array.from({ length: Y / 2 - 1 }, (_, i) => {
          const a = pt(0, (i + 1) * 2, 6);
          const b = pt(0, (i + 1) * 2, STRIPE.z0 - 2);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#e2dacd" />;
        })}
        <polygon points={pts([[0, 0, STRIPE.z0], [0, Y, STRIPE.z0], [0, Y, STRIPE.z1], [0, 0, STRIPE.z1]])} fill="#a9dccd" />
        <polyline points={pts([[0, 0, STRIPE.z1 + 2], [0, Y, STRIPE.z1 + 2]])} fill="none" stroke="#7cc4b0" />
        <polygon points={pts([[0, 0, 0], [0, Y, 0], [0, Y, 5], [0, 0, 5]])} fill="#cdbfa9" stroke={INK} strokeWidth="0.6" />
      </g>
      <g data-part="wall-right">
        <polygon points={pts([[0, 0, 0], [X, 0, 0], [X, 0, WALL_H], [0, 0, WALL_H]])} fill="#f5f0e8" stroke={INK} />
        {Array.from({ length: X / 2 - 1 }, (_, i) => {
          const a = pt((i + 1) * 2, 0, 6);
          const b = pt((i + 1) * 2, 0, STRIPE.z0 - 2);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ebe4d8" />;
        })}
        <polygon points={pts([[0, 0, STRIPE.z0], [X, 0, STRIPE.z0], [X, 0, STRIPE.z1], [0, 0, STRIPE.z1]])} fill="#b6e3d5" />
        <polyline points={pts([[0, 0, STRIPE.z1 + 2], [X, 0, STRIPE.z1 + 2]])} fill="none" stroke="#7cc4b0" />
        <polygon points={pts([[0, 0, 0], [X, 0, 0], [X, 0, 5], [0, 0, 5]])} fill="#d6c9b4" stroke={INK} strokeWidth="0.6" />
      </g>
      <polyline points={pts([[0, Y, WALL_H], [0, 0, WALL_H], [X, 0, WALL_H]])} fill="none" stroke={INK} strokeWidth="2" />
    </>
  );
});

/** The big window on the left wall: sky and a far-off skyline by day, a moon and lit windows by night. */
export const Window = memo(function Window({ night }: { night: boolean }) {
  const { from, to } = WINDOW;
  const z0 = 34;
  const z1 = 84;
  const sky = night ? '#26305e' : '#bfe6ff';
  const towers = [
    [0, 30, 9],
    [9, 22, 7],
    [16, 34, 10],
    [26, 18, 8],
    [34, 27, 11],
    [45, 21, 7],
    [52, 31, 8],
  ] as const;
  return (
    <g data-part="window">
      <polygon points={pts([[0, from - 0.12, z0 - 4], [0, to + 0.12, z0 - 4], [0, to + 0.12, z1 + 4], [0, from - 0.12, z1 + 4]])} fill="#ffffff" stroke={INK} />
      <polygon points={pts([[0, from, z0], [0, to, z0], [0, to, z1], [0, from, z1]])} fill={sky} />
      <g transform={planeX(0, to, from, z1, 60)} data-part="window-view">
        {night ? (
          <>
            <circle cx="46" cy="9" r="4" fill="#ffe48a" />
            <circle cx="48" cy="8" r="3.4" fill={sky} />
            {[[8, 6], [20, 12], [34, 5], [56, 16]].map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width="1.5" height="1.5" fill="#ffffff" />
            ))}
          </>
        ) : (
          <g data-part="clouds" className="cloud-drift">
            <ellipse cx="14" cy="10" rx="7" ry="3" fill="#ffffff" />
            <ellipse cx="20" cy="8" rx="5" ry="3" fill="#ffffff" />
            <ellipse cx="44" cy="15" rx="6" ry="2.4" fill="#ffffff" opacity="0.85" />
          </g>
        )}
        {towers.map(([x, h, w]) => (
          <g key={x}>
            <rect x={x} y={50 - h} width={w} height={h} fill={night ? '#1a2046' : '#a8c9e2'} />
            {Array.from({ length: Math.floor(h / 6) }, (_, i) => (
              <rect key={i} x={x + 2} y={50 - h + 3 + i * 6} width={w - 4} height="1.5" fill={night ? (i % 2 ? '#ffd97a' : '#3a4270') : '#e2f1fb'} />
            ))}
          </g>
        ))}
      </g>
      {[from + (to - from) / 3, from + ((to - from) * 2) / 3].map((y) => {
        const a = pt(0, y, z0);
        const b = pt(0, y, z1);
        return <line key={y} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffffff" strokeWidth="2" />;
      })}
      <polyline points={pts([[0, from, 66], [0, to, 66]])} fill="none" stroke="#ffffff" strokeWidth="2" />
      <IsoBox x0={0} y0={from - 0.2} x1={0.2} y1={to + 0.2} z0={z0 - 7} h={3} top="#ffffff" left="#e3e6ec" right="#cdd2db" />
    </g>
  );
});

/** The door on the right wall; open while someone walks through it. */
export const Door = memo(function Door({ open }: { open: boolean }) {
  const { from, to } = DOOR;
  return (
    <g data-part="door" data-open={open ? 'true' : 'false'}>
      <polygon points={pts([[from - 0.1, 0, 0], [to + 0.1, 0, 0], [to + 0.1, 0, 80], [from - 0.1, 0, 80]])} fill="#c3c9d3" stroke={INK} />
      <polygon points={pts([[from, 0, 0], [to, 0, 0], [to, 0, 76], [from, 0, 76]])} fill={open ? '#4a3b30' : '#e7cfa5'} stroke={INK} strokeWidth="0.6" />
      {open ? (
        <polygon points={pts([[from, 0, 0], [to, 0, 0], [to + 0.1, 0.5, 0], [from + 0.1, 0.5, 0]])} fill="#fff3d6" opacity="0.45" />
      ) : (
        <g transform={planeY(0, from, to, 76, 40)}>
          <rect x="8" y="10" width="6" height="34" fill="#bfe6ff" stroke={INK} strokeWidth="0.8" />
          <rect x="31" y="40" width="5" height="3" fill="#9aa1bb" stroke={INK} strokeWidth="0.5" />
          <rect x="6" y="54" width="28" height="16" fill="none" stroke="#d6bb8c" />
        </g>
      )}
    </g>
  );
});

/** A whiteboard on the right wall with abstract boxes, arrows and sticky notes — no letters. */
export const Whiteboard = memo(function Whiteboard() {
  const x0 = 4.5;
  const x1 = 8.5;
  return (
    <g data-part="whiteboard">
      <polygon points={pts([[x0, 0, 46], [x1, 0, 46], [x1, 0, 86], [x0, 0, 86]])} fill="#c9cfdb" stroke={INK} />
      <g transform={planeY(0, x0 + 0.08, x1 - 0.08, 84, 100)}>
        <rect width="100" height="36" fill="#fdfdfb" />
        <rect x="8" y="6" width="18" height="9" fill="none" stroke="#5b8de8" strokeWidth="1.5" />
        <rect x="8" y="22" width="18" height="9" fill="none" stroke="#5b8de8" strokeWidth="1.5" />
        <path d="M26 10 h12 M26 26 h12 M38 10 v16 M38 18 h10" fill="none" stroke="#3b4a6b" strokeWidth="1.2" />
        <path d="M45 15 l4 3 -4 3" fill="none" stroke="#3b4a6b" strokeWidth="1.2" />
        <circle cx="58" cy="18" r="6" fill="none" stroke="#e8505b" strokeWidth="1.5" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={70 + i * 5} y={30 - (i + 1) * 5} width="3.5" height={(i + 1) * 5} fill={i === 3 ? '#3fae8f' : '#9fc3e6'} />
        ))}
        <rect x="88" y="4" width="8" height="8" fill="#ffe58f" />
        <rect x="88" y="14" width="8" height="8" fill="#ffb3cf" />
        <rect x="88" y="24" width="8" height="8" fill="#b8ecc9" />
      </g>
      <IsoBox x0={x0 + 0.6} y0={0} x1={x1 - 0.6} y1={0.14} z0={44} h={2} top="#dfe3ea" left="#c5cbd6" right="#aeb5c2" />
      <IsoBox x0={x0 + 1} y0={0.02} x1={x0 + 1.3} y1={0.1} z0={46} h={1.5} top="#e8505b" left="#c93f4a" right="#a8323b" />
      <IsoBox x0={x0 + 1.5} y0={0.02} x1={x0 + 1.8} y1={0.1} z0={46} h={1.5} top="#5b8de8" left="#3d68bd" right="#2f5299" />
    </g>
  );
});

/** A plain wall clock: a face and two hands, no numbers. */
export const Clock = memo(function Clock() {
  return (
    <g data-part="clock" transform={planeY(0, 0.4, 1.1, 88, 14)}>
      <circle cx="7" cy="7" r="6.5" fill="#ffffff" stroke={INK} strokeWidth="1" />
      <path d="M7 7 V2.5 M7 7 H10.5" stroke={INK} strokeWidth="1" />
      <rect x="6.5" y="6.5" width="1" height="1" fill="#e8505b" />
    </g>
  );
});

/* ---------- Growth unlocks on the walls and floor (DESIGN §4.2) -------------------------------- */

function WallDecorView({ decor }: { decor: readonly OfficeDecorId[] }) {
  const has = (id: OfficeDecorId) => decor.includes(id);
  return (
    <>
      {has('poster') && (
        <g data-part="decor-poster">
          {/* Above the sofa, below the stripe. */}
          <polygon points={pts([[0, 6.45, 48], [0, 7.95, 48], [0, 7.95, 82], [0, 6.45, 82]])} fill="#ffffff" stroke={INK} />
          <g transform={planeX(0, 7.85, 6.55, 80, 30)}>
            <rect width="30" height="30" fill="#ffd8a8" />
            <circle cx="21" cy="9" r="5" fill="#ff8f6b" />
            <path d="M0 30 L9 15 L15 22 L21 13 L30 30 Z" fill="#5fb393" />
          </g>
        </g>
      )}
      {has('string-lights') && (
        <g data-part="decor-string-lights">
          {Array.from({ length: 25 }, (_, i) => {
            const onLeft = i < 11;
            const t = onLeft ? 11 - i : (i - 11) + 0.5;
            const z = WALL_H - 6 - (i % 2) * 3;
            const p = onLeft ? pt(0, t, z) : pt(t, 0, z);
            return <circle key={i} className={`string-bulb string-bulb--${i % 3}`} cx={p.x} cy={p.y} r="2" fill={['#f49ab8', '#f2d27a', '#8fd3c0'][i % 3]} stroke={INK} strokeWidth="0.5" />;
          })}
        </g>
      )}
      {has('trophy-shelf') && (
        <g data-part="decor-trophy-shelf">
          <IsoBox x0={9.35} y0={0} x1={10.85} y1={0.3} z0={60} h={3} top="#d99a63" left="#c07d4a" right="#b0733f" />
          {[9.75, 10.45].map((x, i) => {
            const base = pt(x, 0.15, 63);
            return (
              <g key={x} transform={`translate(${base.x} ${base.y})`}>
                <rect x="-3" y="-3" width="6" height="3" fill="#8a90aa" stroke={INK} strokeWidth="0.5" />
                <rect x="-1" y="-7" width="2" height="4" fill="#f2b33d" />
                <path d={`M-5 -${i ? 15 : 14} h10 l-1.5 7 h-7z`} fill="#f2d27a" stroke={INK} strokeWidth="0.6" />
              </g>
            );
          })}
        </g>
      )}
    </>
  );
}

// `decor` is a fresh array every render; compare by content so the static walls are skipped.
export const WallDecor = memo(WallDecorView, (a, b) => a.decor.join() === b.decor.join());

/** The lounge rug in front of the sofa. */
export const LoungeRug = memo(function LoungeRug() {
  return (
    <g data-part="decor-lounge-rug">
      <polygon points={pts([[1.15, 6.05, 0.5], [3.3, 6.05, 0.5], [3.3, 8.75, 0.5], [1.15, 8.75, 0.5]])} fill="#f4c09a" stroke="#d98f62" />
      <polygon points={pts([[1.35, 6.25, 0.6], [3.1, 6.25, 0.6], [3.1, 8.55, 0.6], [1.35, 8.55, 0.6]])} fill="none" stroke="#fff3e6" strokeDasharray="2 2" />
    </g>
  );
});

/** Lights out: the whole office under a dim blue overlay. */
export function Night() {
  return (
    <polygon
      data-part="night"
      className="night"
      points={pts([[0, 0, WALL_H], [X, 0, WALL_H], [X, 0, -FLOOR_EDGE], [X, Y, -FLOOR_EDGE], [0, Y, -FLOOR_EDGE], [0, Y, WALL_H]])}
      fill="#1b2140"
      opacity="0.5"
    />
  );
}
