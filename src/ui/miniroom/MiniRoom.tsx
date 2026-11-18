import type { ReactNode } from 'react';
import { memo, useId } from 'react';
import type { VisualState } from '../../core/agentEvent';
import type { DecorId, GrowthStage } from '../../core/growth';
import type { AngerLevel, EnergyLevel } from '../../core/mood';
import type { Footprint, Tile } from '../../core/room';
import { FURNITURE, GRID } from '../../core/room';
import { VISUAL_SPEC } from '../visualSpec';
import type { ActorView } from './Actor';
import { Actor } from './Actor';
import { STAGE_SCALE } from './pose';
import type { CareReaction } from './emote';
import { IsoBox } from './IsoBox';
import { planeX, planeY, pt, pts } from './isoMath';
import { MonitorScreen } from './MonitorScreen';

/**
 * Hermes' isometric pixel mini room (ADR-019, DESIGN §9). Original art from primitives.
 * The parent drives positions and frames from the life engine; this component only draws.
 */

export interface FriendView extends ActorView {
  readonly activity: 'visit' | 'help' | 'leave';
  readonly look: number;
}

export interface MiniRoomProps {
  readonly state: VisualState;
  readonly hermes: ActorView;
  readonly friend?: FriendView | null;
  readonly frame: number;
  readonly energy?: EnergyLevel;
  readonly anger?: AngerLevel;
  readonly stage?: GrowthStage;
  readonly decor?: readonly DecorId[];
  readonly reaction?: CareReaction | null;
}

const WALL_H = 112;
const INK = '#3b2a20';

const inside = (at: Tile, f: Footprint) => at.x > f.x0 && at.x < f.x1 && at.y > f.y0 && at.y < f.y1;

/* ---------- Room shell ---------------------------------------------------------------------- */

const Floor = memo(function Floor() {
  return (
    <g data-part="floor">
      <polygon points={pts([[0, GRID, 0], [GRID, GRID, 0], [GRID, GRID, -10], [0, GRID, -10]])} fill="#b9773f" stroke={INK} />
      <polygon points={pts([[GRID, 0, 0], [GRID, GRID, 0], [GRID, GRID, -10], [GRID, 0, -10]])} fill="#9a6232" stroke={INK} />
      {Array.from({ length: GRID }, (_, row) => (
        <polygon
          key={row}
          points={pts([[0, row, 0], [GRID, row, 0], [GRID, row + 1, 0], [0, row + 1, 0]])}
          fill={row % 2 === 0 ? '#e2a96b' : '#d99d5f'}
        />
      ))}
      {Array.from({ length: GRID * 2 }, (_, i) => {
        const row = Math.floor(i / 2);
        const x = (i % 2 === 0 ? 2.5 : 6) + (row % 3) * 0.7;
        const a = pt(x, row);
        const b = pt(x, row + 1);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c4874c" strokeWidth="1" />;
      })}
      <polygon points={pts([[0, 0, 0], [GRID, 0, 0], [GRID, GRID, 0], [0, GRID, 0]])} fill="none" stroke={INK} />
      {/* Centre rug */}
      <polygon points={pts([[3.3, 2.3, 0.5], [5, 2.3, 0.5], [5, 3.9, 0.5], [3.3, 3.9, 0.5]])} fill="#f6c3d5" stroke="#e48aab" />
      <polygon points={pts([[3.5, 2.5, 0.6], [4.8, 2.5, 0.6], [4.8, 3.7, 0.6], [3.5, 3.7, 0.6]])} fill="none" stroke="#fff3f7" strokeDasharray="2 2" />
    </g>
  );
});

const Walls = memo(function Walls() {
  const band = WALL_H - 18;
  return (
    <>
      <g data-part="wall-left">
        <polygon points={pts([[0, 0, 0], [0, GRID, 0], [0, GRID, WALL_H], [0, 0, WALL_H]])} fill="#fbf1df" stroke={INK} />
        {Array.from({ length: GRID * 2 - 1 }, (_, i) => {
          const a = pt(0, (i + 1) / 2, 6);
          const b = pt(0, (i + 1) / 2, band - 2);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f1e2c6" />;
        })}
        <polygon points={pts([[0, 0, band], [0, GRID, band], [0, GRID, band + 9], [0, 0, band + 9]])} fill="#f7d7e1" />
        {Array.from({ length: GRID * 2 }, (_, i) => (
          <polygon key={i} points={pts([[0, i / 2 + 0.25, band + 1.5], [0, i / 2 + 0.35, band + 4.5], [0, i / 2 + 0.25, band + 7.5], [0, i / 2 + 0.15, band + 4.5]])} fill={i % 2 ? '#8fd3c0' : '#f49ab8'} />
        ))}
        <polygon points={pts([[0, 0, 0], [0, GRID, 0], [0, GRID, 5], [0, 0, 5]])} fill="#d9a066" stroke={INK} strokeWidth="0.6" />
      </g>
      <g data-part="wall-right">
        <polygon points={pts([[0, 0, 0], [GRID, 0, 0], [GRID, 0, WALL_H], [0, 0, WALL_H]])} fill="#fff7ea" stroke={INK} />
        {Array.from({ length: GRID * 2 - 1 }, (_, i) => {
          const a = pt((i + 1) / 2, 0, 6);
          const b = pt((i + 1) / 2, 0, band - 2);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f3e6cf" />;
        })}
        <polygon points={pts([[0, 0, band], [GRID, 0, band], [GRID, 0, band + 9], [0, 0, band + 9]])} fill="#f7d7e1" />
        {Array.from({ length: GRID * 2 }, (_, i) => (
          <polygon key={i} points={pts([[i / 2 + 0.25, 0, band + 1.5], [i / 2 + 0.35, 0, band + 4.5], [i / 2 + 0.25, 0, band + 7.5], [i / 2 + 0.15, 0, band + 4.5]])} fill={i % 2 ? '#f49ab8' : '#8fd3c0'} />
        ))}
        <polygon points={pts([[0, 0, 0], [GRID, 0, 0], [GRID, 0, 5], [0, 0, 5]])} fill="#d9a066" stroke={INK} strokeWidth="0.6" />
        {/* Shower tiles */}
        <polygon points={pts([[5, 0, 4], [6.5, 0, 4], [6.5, 0, 96], [5, 0, 96]])} fill="#e3f1fb" stroke="#b9d6ea" />
        {[0.5, 1].map((dx) => {
          const a = pt(5 + dx, 0, 4);
          const b = pt(5 + dx, 0, 96);
          return <line key={dx} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b9d6ea" />;
        })}
        {[24, 48, 72].map((z) => {
          const a = pt(5, 0, z);
          const b = pt(6.5, 0, z);
          return <line key={z} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b9d6ea" />;
        })}
      </g>
      {/* Top edges of the walls */}
      <polyline points={pts([[0, GRID, WALL_H], [0, 0, WALL_H], [GRID, 0, WALL_H]])} fill="none" stroke={INK} strokeWidth="2" />
    </>
  );
});

const Window = memo(function Window({ night }: { night: boolean }) {
  const a = pt(0, 3.65, 46);
  const b = pt(0, 3.65, 88);
  const c = pt(0, 3.05, 67);
  const d = pt(0, 4.25, 67);
  return (
    <g data-part="window">
      <polygon points={pts([[0, 2.95, 42], [0, 4.35, 42], [0, 4.35, 92], [0, 2.95, 92]])} fill="#ffffff" stroke={INK} />
      <polygon points={pts([[0, 3.05, 46], [0, 4.25, 46], [0, 4.25, 88], [0, 3.05, 88]])} fill={night ? '#26305e' : '#bfe6ff'} />
      <g transform={planeX(0, 3.05, 4.25, 88, 40)}>
        {night ? (
          <>
            <circle cx="30" cy="10" r="4" fill="#ffe48a" />
            <circle cx="32" cy="9" r="3.4" fill="#26305e" />
            <rect x="8" y="8" width="1.5" height="1.5" fill="#ffffff" />
            <rect x="16" y="24" width="1.5" height="1.5" fill="#ffffff" />
          </>
        ) : (
          <>
            <ellipse cx="14" cy="14" rx="7" ry="3.5" fill="#ffffff" />
            <ellipse cx="20" cy="12" rx="5" ry="3.5" fill="#ffffff" />
            <ellipse cx="30" cy="28" rx="6" ry="2.5" fill="#ffffff" opacity="0.8" />
          </>
        )}
      </g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffffff" strokeWidth="2" />
      <line x1={c.x} y1={c.y} x2={d.x} y2={d.y} stroke="#ffffff" strokeWidth="2" />
      <polygon points={pts([[0, 2.8, 38], [0, 3.2, 38], [0, 3.1, 96], [0, 2.8, 96]])} fill="#f7b6cc" stroke={INK} strokeWidth="0.6" />
      <polygon points={pts([[0, 4.1, 38], [0, 4.5, 38], [0, 4.5, 96], [0, 4.2, 96]])} fill="#f7b6cc" stroke={INK} strokeWidth="0.6" />
      <polygon points={pts([[0, 2.8, 96], [0, 4.5, 96], [0, 4.5, 99], [0, 2.8, 99]])} fill="#c98a55" stroke={INK} strokeWidth="0.6" />
    </g>
  );
});

const Door = memo(function Door({ open }: { open: boolean }) {
  return (
    <g data-part="door" data-open={open ? 'true' : 'false'}>
      <polygon points={pts([[7.35, 0, 0], [8.65, 0, 0], [8.65, 0, 74], [7.35, 0, 74]])} fill="#c98a55" stroke={INK} />
      <polygon points={pts([[7.45, 0, 0], [8.55, 0, 0], [8.55, 0, 70], [7.45, 0, 70]])} fill={open ? '#5a4636' : '#f3e3c7'} stroke={INK} strokeWidth="0.6" />
      {!open && (
        <g transform={planeY(0, 7.45, 8.55, 70, 36)}>
          <circle cx="18" cy="16" r="6" fill="#bfe6ff" stroke={INK} strokeWidth="0.8" />
          <path d="M16 15 q2 -3 4 0 q-2 3 -4 0" fill="#f49ab8" />
          <rect x="29" y="38" width="3" height="3" fill="#f2d27a" stroke={INK} strokeWidth="0.5" />
          <rect x="6" y="50" width="24" height="12" fill="none" stroke="#e3cfa9" />
        </g>
      )}
    </g>
  );
});

/* ---------- Furniture ------------------------------------------------------------------------- */

function Bed({ occupant, asleep }: { occupant?: ReactNode; asleep: boolean }) {
  return (
    <g data-part="bed">
      <IsoBox x0={0} y0={1} x1={0.18} y1={3} h={40} top="#d99a63" left="#c07d4a" right="#a86a3c" />
      <IsoBox x0={0.05} y0={1} x1={2} y1={3} h={10} top="#c98b52" left="#b0733f" right="#965f33" />
      <IsoBox x0={0.12} y0={1.05} x1={2} y1={2.95} z0={10} h={7} top="#fffaf2" left="#f1e6d6" right="#e0d3c0" />
      <IsoBox x0={0.18} y0={1.3} x1={0.68} y1={2.7} z0={17} h={5} top="#ffffff" left="#f6eef4" right="#e8dbe5" />
      {occupant}
      {asleep ? (
        <IsoBox part="blanket" x0={0.62} y0={1.08} x1={2} y1={2.92} z0={17} h={5} top="#f7a8c4" left="#e98fb0" right="#d27a9b" />
      ) : (
        <IsoBox part="blanket" x0={1.45} y0={1.08} x1={2} y1={2.92} z0={17} h={6} top="#f7a8c4" left="#e98fb0" right="#d27a9b" />
      )}
    </g>
  );
}

const Bookshelf = memo(function Bookshelf({ extra }: { extra: boolean }) {
  const books = ['#e8505b', '#5b6fd6', '#72e3bd', '#f2d27a', '#a48df0', '#ff8fb1'];
  return (
    <g data-part="bookshelf">
      <IsoBox x0={0} y0={4.2} x1={0.7} y1={5} h={64} top="#d99a63" left="#c07d4a" right="#b0733f" />
      <g transform={planeX(0.7, 4.2, 5, 64, 40)}>
        <rect x="2" y="2" width="36" height="60" fill="#7a4f3a" />
        {[20, 40].map((y) => (
          <rect key={y} x="2" y={y} width="36" height="2" fill="#c07d4a" />
        ))}
        {[0, 1, 2].flatMap((shelf) =>
          books.slice(0, extra ? 6 : 4).map((fill, i) => (
            <rect key={`${shelf}-${i}`} x={4 + i * 5.5} y={6 + shelf * 20} width="4.5" height={12 - ((i + shelf) % 3)} fill={fill} />
          )),
        )}
      </g>
    </g>
  );
});

function Tv({ on }: { on: boolean }) {
  return (
    <g data-part="tv">
      <IsoBox x0={2.6} y0={5.6} x1={3} y1={6.6} h={14} top="#f5ead7" left="#e7d9bf" right="#d8c6a6" />
      <IsoBox x0={2.72} y0={5.75} x1={2.9} y1={6.45} z0={14} h={24} top="#4a4f66" left="#3a3f55" right="#2c3042" />
      {/* The screen faces the sofa; from here we only see its glow on the wall side. */}
      <polygon className={on ? 'tv-glow tv-glow--on' : 'tv-glow'} points={pts([[2.72, 5.8, 16], [2.72, 6.4, 16], [2.72, 6.4, 36], [2.72, 5.8, 36]])} fill={on ? '#9fd4ff' : '#1a1d2b'} opacity={on ? 0.9 : 1} />
      <polygon points={pts([[2.9, 5.85, 18], [2.9, 6.35, 18], [2.9, 6.35, 34], [2.9, 5.85, 34]])} fill="#23273a" />
    </g>
  );
}

function Desk({ screen, cans, plant }: { screen: React.ComponentProps<typeof MonitorScreen>['screen']; cans: number; plant: boolean }) {
  return (
    <g data-part="desk">
      <IsoBox x0={1} y0={0} x1={3} y1={1} h={22} top="#e8ad72" left="#c98b52" right="#b0733f" />
      <g data-part="monitor">
        <IsoBox x0={1.95} y0={0.18} x1={2.1} y1={0.3} z0={22} h={6} top="#3a3f55" left="#2c3042" right="#22263a" />
        <IsoBox x0={1.5} y0={0.15} x1={2.55} y1={0.32} z0={27} h={24} top="#3a3f55" left="#2c3042" right="#22263a" />
        <MonitorScreen screen={screen} transform={planeY(0.32, 1.56, 2.49, 49, 48)} />
      </g>
      <IsoBox x0={1.5} y0={0.48} x1={2.35} y1={0.78} z0={22} h={2} top="#f0f0f6" left="#d8d8e6" right="#c4c4d6" />
      <IsoBox x0={2.55} y0={0.45} x1={2.7} y1={0.6} z0={22} h={7} top="#f2d27a" left="#e0b85a" right="#c99f45" />
      {Array.from({ length: cans }, (_, i) => (
        <IsoBox key={i} part="energy-can" x0={2.75 + i * 0.07} y0={0.1 + i * 0.12} x1={2.84 + i * 0.07} y1={0.19 + i * 0.12} z0={22} h={8} top="#c9cfe4" left="#7d66c9" right="#5f4fa6" />
      ))}
      {plant && (
        <g data-part="decor-desk-plant">
          <IsoBox x0={1.08} y0={0.12} x1={1.3} y1={0.34} z0={22} h={6} top="#e0866a" left="#c96c52" right="#ad5a43" />
          <circle cx={pt(1.19, 0.23, 34).x} cy={pt(1.19, 0.23, 34).y} r="4" fill="#5fbf7f" stroke={INK} strokeWidth="0.6" />
        </g>
      )}
      {/* Stool */}
      <IsoBox x0={1.8} y0={1.35} x1={2.2} y1={1.75} h={10} top="#ff8fa0" left="#e8505b" right="#c93f4a" />
    </g>
  );
}

const Fridge = memo(function Fridge() {
  return (
    <g data-part="fridge">
      <IsoBox x0={3.6} y0={0} x1={4.5} y1={0.8} h={58} top="#d9f3ea" left="#bfe8dc" right="#a5d8c9" />
      <polyline points={pts([[3.62, 0.8, 38], [4.48, 0.8, 38]])} fill="none" stroke={INK} strokeWidth="0.8" />
      <polyline points={pts([[4.3, 0.8, 44], [4.3, 0.8, 52]])} fill="none" stroke={INK} strokeWidth="1.6" />
      <polyline points={pts([[4.3, 0.8, 26], [4.3, 0.8, 34]])} fill="none" stroke={INK} strokeWidth="1.6" />
      <circle cx={pt(3.8, 0.8, 48).x} cy={pt(3.8, 0.8, 48).y} r="2" fill="#f49ab8" />
    </g>
  );
});

function Shower({ occupant, running }: { occupant?: ReactNode; running: boolean }) {
  const head = pt(5.75, 0.08, 92);
  return (
    <g data-part="shower">
      <IsoBox x0={5} y0={0} x1={6.5} y1={1.5} h={4} top="#f1f7fb" left="#d8e6f0" right="#c2d5e3" />
      <line x1={head.x} y1={head.y} x2={head.x} y2={head.y - 10} stroke="#9aa1bb" strokeWidth="2" />
      <rect x={head.x - 5} y={head.y} width="10" height="3" fill="#c9cfe4" stroke={INK} strokeWidth="0.6" />
      {running && (
        <g className="shower-water">
          {[-3, 0, 3].map((dx) => (
            <rect key={dx} x={head.x + dx} y={head.y + 6} width="1.4" height="5" fill="#6cc7f2" />
          ))}
        </g>
      )}
      {occupant}
      <polygon points={pts([[5, 1.5, 4], [6.5, 1.5, 4], [6.5, 1.5, 82], [5, 1.5, 82]])} fill="#cfeaff" opacity="0.35" stroke="#7fb1d6" />
      <polygon points={pts([[6.5, 0, 4], [6.5, 1.5, 4], [6.5, 1.5, 82], [6.5, 0, 82]])} fill="#cfeaff" opacity="0.3" stroke="#7fb1d6" />
      {/* Curtain bunched at the side so the booth stays see-through. */}
      <polygon points={pts([[5, 1.5, 6], [5.3, 1.5, 6], [5.3, 1.5, 82], [5, 1.5, 82]])} fill="#ffe58f" stroke={INK} strokeWidth="0.6" />
      <polyline points={pts([[5, 1.5, 84], [6.5, 1.5, 84]])} fill="none" stroke="#9aa1bb" strokeWidth="1.5" />
    </g>
  );
}

function Sofa({ occupants }: { occupants?: ReactNode }) {
  return (
    <g data-part="sofa">
      <IsoBox x0={0} y0={5.2} x1={0.22} y1={7.5} z0={10} h={18} top="#9cc2f0" left="#7aa7e0" right="#6a96d0" />
      <IsoBox x0={0.05} y0={5.2} x1={0.8} y1={7.5} h={10} top="#9cc2f0" left="#7aa7e0" right="#6a96d0" />
      <IsoBox x0={0.05} y0={5.2} x1={0.8} y1={5.4} z0={10} h={8} top="#9cc2f0" left="#7aa7e0" right="#6a96d0" />
      <IsoBox x0={0.22} y0={6.15} x1={0.42} y1={6.6} z0={10} h={8} top="#f7b6cc" left="#e48aab" right="#d27a9b" />
      {occupants}
      <IsoBox x0={0.05} y0={7.3} x1={0.8} y1={7.5} z0={10} h={8} top="#9cc2f0" left="#7aa7e0" right="#6a96d0" />
    </g>
  );
}

function TableStool() {
  return (
    <g data-part="table-stool">
      <IsoBox x0={5.5} y0={4.02} x1={5.9} y1={4.38} h={9} top="#ff8fa0" left="#e8505b" right="#c93f4a" />
    </g>
  );
}

function Table({ eating }: { eating: boolean }) {
  const plate = pt(5.7, 5.1, 15);
  return (
    <g data-part="table">
      {[
        [5.25, 4.65],
        [6.05, 4.65],
        [5.25, 5.45],
        [6.05, 5.45],
      ].map(([x, y]) => (
        <IsoBox key={`${x}-${y}`} x0={x as number} y0={y as number} x1={(x as number) + 0.1} y1={(y as number) + 0.1} h={12} top="#b0733f" left="#a0683a" right="#8f5d32" />
      ))}
      <IsoBox x0={5.2} y0={4.6} x1={6.2} y1={5.6} z0={12} h={3} top="#e8ad72" left="#c98b52" right="#b0733f" />
      {eating && (
        <g data-part="meal">
          <ellipse cx={plate.x} cy={plate.y} rx="7" ry="3.5" fill="#ffffff" stroke={INK} strokeWidth="0.6" />
          <ellipse cx={plate.x} cy={plate.y - 1} rx="4" ry="2" fill="#f2b24a" />
        </g>
      )}
    </g>
  );
}

const Plant = memo(function Plant() {
  const top = pt(8.5, 3.9, 12);
  return (
    <g data-part="plant">
      <IsoBox x0={8.3} y0={3.7} x1={8.7} y1={4.1} h={12} top="#e0866a" left="#c96c52" right="#ad5a43" />
      <g transform={`translate(${top.x} ${top.y})`} stroke={INK} strokeWidth="0.6">
        <ellipse cx="-5" cy="-8" rx="5" ry="8" fill="#5fbf7f" transform="rotate(-25 -5 -8)" />
        <ellipse cx="5" cy="-9" rx="5" ry="9" fill="#4aa86a" transform="rotate(25 5 -9)" />
        <ellipse cx="0" cy="-14" rx="4" ry="9" fill="#6fd08e" />
      </g>
    </g>
  );
});

function HelperDesk() {
  return (
    <g data-part="helper-desk">
      <IsoBox x0={3.1} y0={0.95} x1={3.62} y1={1.28} h={12} top="#f5ead7" left="#e7d9bf" right="#d8c6a6" />
      <g data-part="laptop">
        <IsoBox x0={3.18} y0={1.0} x1={3.55} y1={1.22} z0={12} h={1.5} top="#c9cfe4" left="#9aa1bb" right="#8a90aa" />
        <polygon points={pts([[3.18, 1.0, 13.5], [3.55, 1.0, 13.5], [3.55, 1.0, 24], [3.18, 1.0, 24]])} fill="#2c3042" stroke={INK} strokeWidth="0.6" />
      </g>
    </g>
  );
}

/* ---------- Decorations (growth unlocks) ------------------------------------------------------- */

function DecorView({ decor }: { decor: readonly DecorId[] }) {
  const has = (id: DecorId) => decor.includes(id);
  return (
    <>
      {has('poster') && (
        <g data-part="decor-poster">
          {/* Below the pattern band, where the string-light bulbs hang. */}
          <polygon points={pts([[1.2, 0, 56], [2.2, 0, 56], [2.2, 0, 92], [1.2, 0, 92]])} fill="#ffffff" stroke={INK} />
          <g transform={planeY(0, 1.25, 2.15, 88, 30)}>
            <rect width="30" height="30" fill="#bfe6ff" />
            <circle cx="20" cy="9" r="5" fill="#f2d27a" />
            <path d="M0 30 L10 14 L17 22 L22 16 L30 30 Z" fill="#72e3bd" />
          </g>
        </g>
      )}
      {has('string-lights') && (
        <g data-part="decor-string-lights">
          {Array.from({ length: 17 }, (_, i) => {
            const onLeft = i < 9;
            const t = onLeft ? 8.6 - i : i - 8 + 0.4;
            const p = onLeft ? pt(0, t, 101 - (i % 2) * 3) : pt(t, 0, 101 - (i % 2) * 3);
            return <circle key={i} className={`string-bulb string-bulb--${i % 3}`} cx={p.x} cy={p.y} r="2" fill={['#f49ab8', '#f2d27a', '#8fd3c0'][i % 3]} stroke={INK} strokeWidth="0.5" />;
          })}
        </g>
      )}
      {has('bedside-rug') && (
        <g data-part="decor-bedside-rug">
          <polygon points={pts([[2.15, 1.2, 0.5], [2.95, 1.2, 0.5], [2.95, 2.8, 0.5], [2.15, 2.8, 0.5]])} fill="#c9b7f0" stroke="#a48df0" />
        </g>
      )}
      {(has('more-books') || has('trophy')) && (
        <IsoBox x0={0} y0={1.2} x1={0.3} y1={2.8} z0={70} h={3} top="#d99a63" left="#c07d4a" right="#b0733f" />
      )}
      {has('more-books') && (
        <g data-part="decor-more-books">
          {['#e8505b', '#5b6fd6', '#72e3bd', '#a48df0'].map((fill, i) => (
            <IsoBox key={fill} x0={0.02} y0={1.3 + i * 0.18} x1={0.24} y1={1.44 + i * 0.18} z0={73} h={12 - (i % 2) * 3} top={fill} left={fill} right={fill} />
          ))}
        </g>
      )}
      {has('trophy') && (
        <g data-part="decor-trophy">
          <IsoBox x0={0.05} y0={2.35} x1={0.25} y1={2.55} z0={73} h={4} top="#c9cfe4" left="#9aa1bb" right="#8a90aa" />
          <path d={`M${pt(0.15, 2.45, 84).x} ${pt(0.15, 2.45, 84).y - 4} l1.6 3.2 3.5 .5 -2.5 2.4 .6 3.5 -3.2 -1.7 -3.2 1.7 .6 -3.5 -2.5 -2.4 3.5 -.5z`} fill="#f2d27a" stroke={INK} strokeWidth="0.6" />
        </g>
      )}
    </>
  );
}

// `decor` is a fresh array every render; compare by content so the static shell is skipped.
const Decor = memo(DecorView, (a, b) => a.decor.join() === b.decor.join());

/* ---------- The room -------------------------------------------------------------------------- */

const CANS: Readonly<Record<EnergyLevel, number>> = { unknown: 0, full: 0, ok: 1, low: 2, empty: 3 };

export function MiniRoom({
  state,
  hermes,
  friend = null,
  frame,
  energy = 'unknown',
  anger = 'unknown',
  stage = 'adult',
  decor = [],
  reaction = null,
}: MiniRoomProps) {
  const spec = VISUAL_SPEC[state];
  const titleId = `room-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const night = state === 'offline';
  const friendInRoom = friend && friend.at.y >= 0 ? friend : null;
  const friendWho = friend && friend.look % 2 === 1 ? 'friend-b' : 'friend-a';

  const hermesActor = (anchor?: { x: number; y: number }) => (
    <Actor who="hermes" view={hermes} frame={frame} stage={stage} energy={energy} anger={anger} reaction={reaction} anchor={anchor} />
  );
  const friendActor = friendInRoom ? <Actor who={friendWho} view={friendInRoom} frame={frame} /> : null;

  const atRest = (view: ActorView | null) => view !== null && !view.walking;
  const asleep = atRest(hermes) && (hermes.activity === 'sleep' || hermes.activity === 'nap') && inside(hermes.at, FURNITURE.bed);
  const showering = atRest(hermes) && hermes.activity === 'shower' && inside(hermes.at, FURNITURE.shower);
  const hermesOnSofa = atRest(hermes) && inside(hermes.at, FURNITURE.sofa);
  const friendOnSofa = atRest(friendInRoom) && friendInRoom !== null && inside(friendInRoom.at, FURNITURE.sofa);
  const helping = atRest(friendInRoom) && friendInRoom?.activity === 'help';
  const doorOpen = friend !== null && friend.walking && (friend.at.y < 1.2 && friend.at.x > 6.8);

  const pillow = pt(0.43, 2, 22);
  const headScale = STAGE_SCALE[stage];
  const shower = pt(5.75, 0.75, 0);

  type Item = { depth: number; node: ReactNode; key: string };
  const items: Item[] = [
    {
      key: 'bed',
      depth: 3,
      node: <Bed asleep={asleep} occupant={asleep ? hermesActor({ x: pillow.x - 6 * headScale, y: pillow.y - 8 * headScale }) : undefined} />,
    },
    { key: 'desk', depth: 2.5, node: <Desk screen={spec.screen} cans={CANS[energy]} plant={decor.includes('desk-plant')} /> },
    { key: 'fridge', depth: 4.45, node: <Fridge /> },
    { key: 'bookshelf', depth: 4.95, node: <Bookshelf extra={decor.includes('more-books')} /> },
    { key: 'tv', depth: 8.9, node: <Tv on={hermesOnSofa && (hermes.activity === 'watch-tv' || hermes.activity === 'host-friend')} /> },
    {
      key: 'shower',
      depth: 6.5,
      node: <Shower running={showering} occupant={showering ? hermesActor({ x: shower.x - 6 * headScale, y: shower.y - 24 - 10 * headScale }) : undefined} />,
    },
    {
      key: 'sofa',
      depth: 6.75,
      node: (
        <Sofa
          occupants={
            <>
              {hermesOnSofa && hermesActor()}
              {friendOnSofa && friendActor}
            </>
          }
        />
      ),
    },
    { key: 'table-stool', depth: 9.85, node: <TableStool /> },
    { key: 'table', depth: 10.8, node: <Table eating={atRest(hermes) && hermes.activity === 'eat'} /> },
    { key: 'plant', depth: 12.4, node: <Plant /> },
  ];
  if (helping) items.push({ key: 'helper-desk', depth: 4.47, node: <HelperDesk /> });
  if (!asleep && !showering && !hermesOnSofa) {
    items.push({ key: 'hermes', depth: hermes.at.x + hermes.at.y, node: hermesActor() });
  }
  if (friendInRoom && !friendOnSofa) {
    items.push({ key: 'friend', depth: friendInRoom.at.x + friendInRoom.at.y, node: friendActor });
  }
  items.sort((a, b) => a.depth - b.depth);

  return (
    <svg
      className="miniroom"
      viewBox="0 0 480 320"
      role="img"
      aria-labelledby={titleId}
      data-state={state}
      data-tone={spec.tone}
      data-energy={energy}
      data-anger={anger}
      preserveAspectRatio="xMidYMax meet"
    >
      <title id={titleId}>{`헤르메스의 방 — ${spec.label}`}</title>
      <ellipse cx="240" cy="306" rx="150" ry="9" fill="#000000" opacity="0.18" />
      <Floor />
      <Walls />
      <Window night={night} />
      <Door open={doorOpen} />
      <Decor decor={decor} />
      {items.map((item) => (
        <g key={item.key}>{item.node}</g>
      ))}
      {night && (
        <polygon
          data-part="night"
          className="night"
          points={pts([[0, 0, WALL_H], [GRID, 0, WALL_H], [GRID, 0, -10], [GRID, GRID, -10], [0, GRID, -10], [0, GRID, WALL_H]])}
          fill="#1b2140"
          opacity="0.5"
        />
      )}
    </svg>
  );
}
