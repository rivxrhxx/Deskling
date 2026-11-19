import type { ReactNode } from 'react';
import { memo } from 'react';
import type { DeskId, Tile } from '../../core/room';
import { FURNITURE, SPOTS, toScreen } from '../../core/room';
import type { ScreenId } from '../visualSpec';
import type { Side } from './deskFrame';
import { deskFrame, helperSpot } from './deskFrame';
import { IsoBox } from './IsoBox';
import { INK, planeX, planeY, pt, pts } from './isoMath';
import { MonitorScreen } from './MonitorScreen';
import { PixelSprite } from './PixelSprite';
import { HELPER_BOT } from './sprites';

/**
 * Office furniture (DESIGN §3.1–§3.2): isometric boxes with pixel trim. Furniture someone sits on takes its sitter
 * as a child and draws it between its own parts, so desks and chairs cover the right rows of the sprite.
 */

/** Height of a desk top (px). Low enough that a seated member's hands show just above its edge. */
const DESK_H = 17;
const SEAT_SCALE = 2.25;

const WOOD = { top: '#f1d6a8', left: '#dcb985', right: '#c9a26d' };
const PANEL = { top: '#eef0f4', left: '#d5d9e2', right: '#bfc5d1' };
const DARK = { top: '#4a4f66', left: '#3a3f55', right: '#2c3042' };
const BACK = { top: '#e6e9ef', left: '#cfd4de', right: '#b9bfcc' };
const SEAT = { top: '#9aaecd', left: '#7a8fb2', right: '#64799c' };

/* ---------- Office chair ---------------------------------------------------------------------- */

/** The chair back, square to the viewer like the people in the room: narrower than a member, so elbows show beside it. */
const CHAIR_BACK = ['.oooooo.', 'oCCCCCCo', 'oCccccCo', 'occcccco', '.oooooo.'];
const CHAIR_PALETTE = { o: INK, C: '#a9bcd9', c: '#8197ba' };
/** Top of the chair back (px above the floor): from behind it covers a sitter's rows 11–15. */
const CHAIR_BACK_TOP = 14;

/** An office chair at a spot: wheels, a stem, a seat and its back on the side away from the desk (or table). */
function Chair({ at, side }: { at: Tile; side: Side }) {
  const { x, y } = at;
  // The back stands behind the sitter: further from the desk than the seat.
  const away = { '+y': 0.2, '-y': -0.2, '+x': 0.2, '-x': -0.2 }[side];
  const alongY = side === '+y' || side === '-y';
  const back = toScreen(alongY ? { x, y: y + away } : { x: x + away, y });
  const width = CHAIR_BACK[0]?.length ?? 0;
  return (
    <g data-part="chair">
      <IsoBox x0={x - 0.22} y0={y - 0.22} x1={x + 0.22} y1={y + 0.22} h={1.5} top="#2c3042" left="#22263a" right="#1a1d2b" />
      <IsoBox x0={x - 0.04} y0={y - 0.04} x1={x + 0.04} y1={y + 0.04} z0={1.5} h={4} top="#5c6280" left="#4a5068" right="#3a3f55" />
      <IsoBox x0={x - 0.23} y0={y - 0.23} x1={x + 0.23} y1={y + 0.23} z0={5} h={3} {...SEAT} />
      <PixelSprite map={CHAIR_BACK} palette={CHAIR_PALETTE} x={back.x - (width * SEAT_SCALE) / 2} y={back.y - CHAIR_BACK_TOP} scale={SEAT_SCALE} />
    </g>
  );
}

/* ---------- Desks -------------------------------------------------------------------------------- */

export interface WorkstationProps {
  readonly desk: DeskId;
  readonly screen: ScreenId;
  /** Light round the back of a monitor that faces away from the viewer, or null when it is off. */
  readonly glow: string | null;
  readonly cans: number;
  readonly plant: boolean;
  /** The member sitting (or standing up) at this desk. */
  readonly occupant?: ReactNode;
  /** A member turned round to the viewer is drawn in front of its chair, not behind it. */
  readonly occupantFacesViewer?: boolean;
  readonly helper?: ReactNode;
}

/**
 * A desk with its monitor, keyboard and chair, and whoever sits there (FR-R1).
 * - Chair behind the desk (3, 4, 7, 8): chair, member, then the desk, whose front covers the member's lap;
 *   we see the back of the monitor, lit round its edge.
 * - Chair in front of the desk (1, 2, 5, 6): the desk and its monitor screen, then the member, then the chair back.
 */
export function Workstation({ desk, screen, glow, cans, plant, occupant, occupantFacesViewer = false, helper }: WorkstationProps) {
  const frame = deskFrame(desk);
  const { side, ua, ub, cu, depth, rect } = frame;
  const away = side === '+y' || side === '+x';
  const chair = <Chair key="chair" at={SPOTS[desk].at} side={side} />;
  const H = DESK_H;

  const panels = [
    <IsoBox key="end-a" {...rect(ua, ua + 0.07, 0.04, depth - 0.04)} h={H - 3} {...PANEL} />,
    <IsoBox key="end-b" {...rect(ub - 0.07, ub, 0.04, depth - 0.04)} h={H - 3} {...PANEL} />,
  ];
  const modesty = <IsoBox key="modesty" {...rect(ua + 0.07, ub - 0.07, depth - 0.1, depth - 0.04)} z0={3} h={H - 6} {...PANEL} />;
  const deskNode = (
    <g key="desk" data-part="desk">
      {away ? [modesty, ...panels] : [...panels, modesty]}
      <IsoBox {...rect(ua, ub, 0, depth)} z0={H - 3} h={3} {...WOOD} />
    </g>
  );
  const keyboard = (
    <g key="keyboard">
      <IsoBox {...rect(cu - 0.28, cu + 0.28, 0.12, 0.32)} z0={H} h={1.5} top="#f4f5f8" left="#dcdfe7" right="#c7cbd6" />
      <IsoBox {...rect(cu + 0.36, cu + 0.44, 0.16, 0.28)} z0={H} h={1.5} top="#f4f5f8" left="#dcdfe7" right="#c7cbd6" />
    </g>
  );

  // The monitor faces the chair; its screen is on the face at v = 0.6.
  const body = rect(cu - 0.5, cu + 0.5, 0.6, 0.7);
  const top = H + 23;
  const screenTransform =
    side === '+y'
      ? `${planeY(body.y1, cu - 0.45, cu + 0.45, top - 1.5, 48)} scale(1 0.78)`
      : `${planeX(body.x1, cu + 0.45, cu - 0.45, top - 1.5, 48)} scale(1 0.78)`;
  const backFace = (pad: number, z0: number, z1: number): string =>
    side === '-y'
      ? pts([[cu - 0.5 - pad, body.y1, z0], [cu + 0.5 + pad, body.y1, z0], [cu + 0.5 + pad, body.y1, z1], [cu - 0.5 - pad, body.y1, z1]])
      : pts([[body.x1, cu - 0.5 - pad, z0], [body.x1, cu + 0.5 + pad, z0], [body.x1, cu + 0.5 + pad, z1], [body.x1, cu - 0.5 - pad, z1]]);
  const monitor = (
    <g key="monitor" data-part="monitor" data-desk={desk} data-screen={screen}>
      <IsoBox {...rect(cu - 0.18, cu + 0.18, 0.56, 0.8)} z0={H} h={1} {...DARK} />
      <IsoBox {...rect(cu - 0.05, cu + 0.05, 0.68, 0.76)} z0={H + 1} h={4} {...DARK} />
      {!away && glow && <polygon data-part="monitor-glow" points={backFace(0.08, H + 3, top + 2.5)} fill={glow} opacity="0.55" />}
      <IsoBox {...body} z0={H + 4} h={top - H - 4} {...(away ? DARK : BACK)} />
      {away && <MonitorScreen screen={screen} transform={screenTransform} />}
    </g>
  );
  const extras = [
    ...Array.from({ length: cans }, (_, i) => (
      <g key={`can-${i}`} data-part="energy-can" data-desk={desk}>
        <IsoBox
          {...rect(cu + 0.56 + (i % 2) * 0.16, cu + 0.69 + (i % 2) * 0.16, 0.42 + i * 0.12, 0.55 + i * 0.12)}
          z0={H}
          h={8}
          top="#eef1f6"
          left="#ff8f6b"
          right="#e0704e"
        />
      </g>
    )),
    plant && <DeskPlant key="plant" at={frame.at(ub - 0.2, 0.24)} z={H} />,
  ];

  const layers = away
    ? [deskNode, monitor, keyboard, ...extras, ...(occupantFacesViewer ? [chair, occupant] : [occupant, chair])]
    : [chair, occupant, deskNode, keyboard, ...extras, monitor];
  return (
    <g data-part="workstation" data-desk={desk}>
      {helper && <ellipse data-part="helper-shadow" {...shadowAt(helperSpot(desk))} />}
      {layers}
      {helper}
    </g>
  );
}

function DeskPlant({ at, z }: { at: Tile; z: number }) {
  const leaves = pt(at.x, at.y, z + 10);
  return (
    <g data-part="decor-desk-plants">
      <IsoBox x0={at.x - 0.1} y0={at.y - 0.1} x1={at.x + 0.1} y1={at.y + 0.1} z0={z} h={5} top="#7a4f3a" left="#ffffff" right="#e3e6ec" />
      <g transform={`translate(${leaves.x} ${leaves.y})`} stroke={INK} strokeWidth="0.5">
        <ellipse cx="-2.5" cy="0" rx="2.5" ry="4" fill="#5fbf7f" transform="rotate(-25 -2.5 0)" />
        <ellipse cx="2.5" cy="0" rx="2.5" ry="4" fill="#4aa86a" transform="rotate(25 2.5 0)" />
        <ellipse cx="0" cy="-2" rx="2" ry="4" fill="#6fd08e" />
      </g>
    </g>
  );
}

/* ---------- The delegation helper (ADR-025 §3) ---------------------------------------------------- */

/** How high the helper bot hovers (px): level with its member's shoulders, clear of the desk top. */
const HOVER = 12;
const BOT_SCALE = 2;

const shadowAt = (spot: Tile) => {
  const p = toScreen(spot);
  return { cx: p.x, cy: p.y, rx: 7, ry: 2.5, fill: INK, opacity: 0.15 };
};

/** A small robot hovering beside the desk while its member delegates. */
export function HelperBot({ desk, frame }: { desk: DeskId; frame: number }) {
  const p = toScreen(helperSpot(desk));
  const map = HELPER_BOT.frames[frame % 2 === 1 ? 'helper-bot-b' : 'helper-bot-a'];
  const width = (map[0]?.length ?? 0) * BOT_SCALE;
  return (
    <g data-part="helper-bot" className="helper-bot">
      <PixelSprite map={map} palette={HELPER_BOT.palette} x={p.x - width / 2} y={p.y - HOVER - map.length * BOT_SCALE} scale={BOT_SCALE} />
    </g>
  );
}

/* ---------- Meeting table ------------------------------------------------------------------------- */

export const MeetingTable = memo(function MeetingTable() {
  const { x0, y0, x1, y1 } = FURNITURE['meeting-table'];
  const mid = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  // Tucked in: the seat under the table edge, the back on the far side from the table.
  const chairsAt = (y: number, behind: number) =>
    [mid - 0.5, mid + 0.5].map((x) => {
      const seat = <IsoBox key="seat" x0={x - 0.2} y0={y - 0.2} x1={x + 0.2} y1={y + 0.2} h={9} {...SEAT} />;
      const back = <IsoBox key="back" x0={x - 0.2} y0={y + behind * 0.2 - 0.05} x1={x + 0.2} y1={y + behind * 0.2 + 0.05} z0={9} h={12} {...SEAT} />;
      return <g key={x}>{behind < 0 ? [back, seat] : [seat, back]}</g>;
    });
  return (
    <g data-part="meeting-table">
      {chairsAt(y0 - 0.02, -1)}
      <IsoBox x0={mid - 0.12} y0={cy - 0.12} x1={mid + 0.12} y1={cy + 0.12} h={15} {...PANEL} />
      <IsoBox x0={mid - 0.45} y0={cy - 0.35} x1={mid + 0.45} y1={cy + 0.35} h={1.5} {...PANEL} />
      <IsoBox x0={x0} y0={y0} x1={x1} y1={y1} z0={15} h={3} top="#fbfaf7" left="#e4e1da" right="#cfcbc2" />
      <IsoBox x0={mid - 0.2} y0={cy - 0.25} x1={mid + 0.3} y1={cy + 0.1} z0={18} h={1} top="#ffffff" left="#e3e6ec" right="#cdd2db" />
      {chairsAt(y1 + 0.02, 1)}
    </g>
  );
});

/* ---------- The coffee corner -------------------------------------------------------------------- */

export function CoffeeMachine({ brewing }: { brewing: boolean }) {
  const { x0, y0, x1, y1 } = FURNITURE['coffee-machine'];
  const cup = pt(1.72, y1 - 0.12, 31);
  return (
    <g data-part="coffee-machine">
      <IsoBox x0={x0} y0={y0} x1={x1} y1={y1} h={28} top="#efe3cc" left="#d8c7a8" right="#c4b08f" />
      <polyline points={pts([[(x0 + x1) / 2, y1, 4], [(x0 + x1) / 2, y1, 24]])} fill="none" stroke="#b9a483" />
      <IsoBox x0={1.45} y0={0.08} x1={1.98} y1={0.5} z0={28} h={22} {...DARK} />
      <polygon points={pts([[1.55, 0.5, 30], [1.88, 0.5, 30], [1.88, 0.5, 40], [1.55, 0.5, 40]])} fill="#22263a" />
      <circle cx={pt(1.6, 0.5, 45).x} cy={pt(1.6, 0.5, 45).y} r="1.2" fill={brewing ? '#72e3bd' : '#e8505b'} />
      <IsoBox x0={1.64} y0={y1 - 0.2} x1={1.8} y1={y1 - 0.04} z0={28} h={4} top="#ffffff" left="#f1ece4" right="#ddd6ca" />
      <IsoBox x0={2.04} y0={0.28} x1={2.2} y1={0.44} z0={28} h={6} top="#ffffff" left="#f1ece4" right="#ddd6ca" />
      {brewing && (
        <g data-part="coffee-steam" className="coffee-steam" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round">
          <path d={`M${cup.x - 1.5} ${cup.y - 3} q-2 -3 0 -6`} />
          <path d={`M${cup.x + 1.5} ${cup.y - 4} q2 -3 0 -6`} />
        </g>
      )}
    </g>
  );
}

export const WaterCooler = memo(function WaterCooler() {
  const { x0, y0, x1, y1 } = FURNITURE['water-cooler'];
  return (
    <g data-part="water-cooler">
      <IsoBox x0={x0 + 0.05} y0={y0 + 0.05} x1={x1 - 0.05} y1={y1 - 0.05} h={30} top="#f4f6f8" left="#dfe3ea" right="#c9cfd9" />
      <rect x={pt(x0 + 0.2, y1 - 0.05, 22).x - 1} y={pt(x0 + 0.2, y1 - 0.05, 22).y} width="2.5" height="3" fill="#5b8de8" />
      <rect x={pt(x0 + 0.38, y1 - 0.05, 22).x - 1} y={pt(x0 + 0.38, y1 - 0.05, 22).y} width="2.5" height="3" fill="#e8505b" />
      <IsoBox x0={x0 + 0.12} y0={y0 + 0.12} x1={x1 - 0.12} y1={y1 - 0.12} z0={30} h={20} top="#d8f0ff" left="#b3dcf5" right="#9ccbea" />
      <IsoBox x0={x0 + 0.22} y0={y0 + 0.22} x1={x1 - 0.22} y1={y1 - 0.22} z0={50} h={3} top="#5b8de8" left="#3d68bd" right="#2f5299" />
    </g>
  );
});

export const Printer = memo(function Printer() {
  const { x0, y0, x1, y1 } = FURNITURE.printer;
  return (
    <g data-part="printer">
      <IsoBox x0={x0} y0={y0} x1={x1} y1={y1} h={20} {...PANEL} />
      <polyline points={pts([[x0 + 0.1, y1, 10], [x1 - 0.1, y1, 10]])} fill="none" stroke="#aeb5c2" />
      <IsoBox x0={x0 + 0.06} y0={y0 + 0.05} x1={x1 - 0.06} y1={y1 - 0.06} z0={20} h={12} top="#f7f8fa" left="#dfe2e8" right="#c8cdd6" />
      <polygon points={pts([[x0 + 0.2, y1 - 0.06, 24], [x1 - 0.3, y1 - 0.06, 24], [x1 - 0.3, y1 - 0.06, 27], [x0 + 0.2, y1 - 0.06, 27]])} fill="#3a3f55" />
      <IsoBox x0={x0 + 0.25} y0={y0 + 0.15} x1={x1 - 0.25} y1={y1 - 0.2} z0={32} h={1} top="#ffffff" left="#eef0f4" right="#dfe3ea" />
      <circle cx={pt(x1 - 0.18, y1 - 0.06, 28).x} cy={pt(x1 - 0.18, y1 - 0.06, 28).y} r="1" fill="#72e3bd" />
    </g>
  );
});

/* ---------- The lounge ------------------------------------------------------------------------------ */

const SOFA = { top: '#f2a07e', left: '#dc8763', right: '#c47252' };

/** The sofa along the left wall, facing the room; sitters sit between its back and its near arm. */
export function Sofa({ sitters }: { sitters?: ReactNode }) {
  const { x0, y0, x1, y1 } = FURNITURE.sofa;
  return (
    <g data-part="sofa">
      <IsoBox part="sofa-arm-far" x0={x0} y0={y0} x1={x1} y1={y0 + 0.22} h={18} {...SOFA} />
      <IsoBox part="sofa-back" x0={x0} y0={y0 + 0.22} x1={x0 + 0.24} y1={y1 - 0.22} h={28} {...SOFA} />
      <IsoBox part="sofa-seat" x0={x0 + 0.24} y0={y0 + 0.22} x1={x1} y1={y1 - 0.22} h={10} top="#f7b597" left="#dc8763" right="#c47252" />
      <polyline points={pts([[x0 + 0.24, (y0 + y1) / 2, 10], [x1, (y0 + y1) / 2, 10]])} fill="none" stroke="#dc8763" />
      <IsoBox x0={x0 + 0.24} y0={y0 + 0.5} x1={x0 + 0.42} y1={y0 + 0.9} z0={10} h={9} top="#fff1c9" left="#efd9a0" right="#dcc382" />
      {sitters}
      <IsoBox part="sofa-arm-near" x0={x0} y0={y1 - 0.22} x1={x1} y1={y1} h={18} {...SOFA} />
    </g>
  );
}

const BOOKS = ['#e8505b', '#5b6fd6', '#72e3bd', '#f2d27a', '#a48df0', '#ff8fb1', '#6cc7f2', '#f4b04a'];

export const Bookshelf = memo(function Bookshelf({ full }: { full: boolean }) {
  const { x0, y0, x1, y1 } = FURNITURE.bookshelf;
  const z = 70;
  return (
    <g data-part="bookshelf">
      <IsoBox x0={x0} y0={y0} x1={x1} y1={y1} h={z} top="#d99a63" left="#c07d4a" right="#b0733f" />
      <g transform={planeX(x1, y1 - 0.06, y0 + 0.06, z - 2, 48)}>
        <rect x="2" y="2" width="44" height={z - 6} fill="#7a4f3a" />
        {[18, 34, 50].map((y) => (
          <rect key={y} x="2" y={y} width="44" height="2" fill="#c07d4a" />
        ))}
        {[0, 1, 2, 3].flatMap((shelf) =>
          BOOKS.slice(0, full ? 8 : 4 - (shelf % 2)).map((fill, i) => (
            <rect key={`${shelf}-${i}`} x={4 + i * 5.2} y={5 + shelf * 16} width="4.2" height={12 - ((i + shelf) % 3)} fill={fill} />
          )),
        )}
      </g>
      {full && (
        <g data-part="decor-full-bookshelf">
          {BOOKS.slice(0, 4).map((fill, i) => (
            <IsoBox key={fill} x0={x0 + 0.1} y0={y0 + 0.3 + i * 0.05} x1={x1 - 0.12} y1={y0 + 0.75 + i * 0.05} z0={z + i * 2} h={2} top={fill} left={fill} right={fill} />
          ))}
        </g>
      )}
    </g>
  );
});

export const Plant = memo(function Plant({ id, tall }: { id: 'plant-1' | 'plant-2'; tall: boolean }) {
  const { x0, y0, x1, y1 } = FURNITURE[id];
  const top = pt((x0 + x1) / 2, (y0 + y1) / 2, 14);
  const size = tall ? 1.6 : 1;
  return (
    <g data-part="plant" data-plant={id}>
      <IsoBox x0={x0 + 0.05} y0={y0 + 0.05} x1={x1 - 0.05} y1={y1 - 0.05} h={14} top="#7a4f3a" left="#f4f6f8" right="#dfe3ea" />
      <g transform={`translate(${top.x} ${top.y}) scale(${size})`} stroke={INK} strokeWidth={0.6 / size}>
        <ellipse cx="-6" cy="-8" rx="5" ry="9" fill="#4aa86a" transform="rotate(-30 -6 -8)" />
        <ellipse cx="6" cy="-9" rx="5" ry="9" fill="#3f9a5e" transform="rotate(30 6 -9)" />
        <ellipse cx="-2" cy="-14" rx="4" ry="10" fill="#5fbf7f" transform="rotate(-10 -2 -14)" />
        <ellipse cx="3" cy="-15" rx="4" ry="10" fill="#6fd08e" transform="rotate(12 3 -15)" />
      </g>
    </g>
  );
});
