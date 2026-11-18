import type { AngerLevel, EnergyLevel } from '../../core/mood';

/**
 * Energy and anger cues drawn on the character's face (DESIGN §4.1, ADR-016).
 * Shapes only — never numbers. Positioned relative to the eyes of the current pose.
 */

export interface EyeAnchor {
  readonly lx: number;
  readonly rx: number;
  readonly y: number;
  /** False when the eyes are closed or happy arcs: no eyelids are drawn over them. */
  readonly open: boolean;
  /** False when the pose already draws its own brows (distressed). */
  readonly brows: boolean;
}

const INK = '#171a27';
const LID = '#c6cde1';

const LID_HEIGHT: Partial<Record<EnergyLevel, number>> = { low: 2.6, empty: 3.7 };

function Eyelid({ x, y, height }: { x: number; y: number; height: number }) {
  const top = y - 2.9;
  return (
    <g data-part="eyelid">
      <rect x={x - 2.4} y={top} width="4.8" height={height} rx="1" fill={LID} />
      <path d={`M${x - 2.3} ${top + height} h4.6`} stroke={INK} strokeWidth="0.9" strokeLinecap="round" />
    </g>
  );
}

function Brow({ d, shape }: { d: string; shape: 'flat' | 'angry' }) {
  return <path data-part="brow" data-shape={shape} d={d} stroke={INK} strokeWidth="1.3" strokeLinecap="round" fill="none" />;
}

/** A small four-stroke "vein" mark, drawn rather than typed. */
function Vein({ x, y }: { x: number; y: number }) {
  return (
    <path
      data-part="vein"
      className="mood-vein"
      d={`M${x - 2.4} ${y - 0.6} q1.2 -1.8 0 -3.2 M${x + 0.6} ${y - 2.4} q1.8 1.2 3.2 0 M${x + 2.4} ${y + 0.6} q-1.2 1.8 0 3.2 M${x - 0.6} ${y + 2.4} q-1.8 -1.2 -3.2 0`}
      fill="none"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  );
}

function SteamPuff({ x, y, delay }: { x: number; y: number; delay: 'a' | 'b' }) {
  return (
    <g data-part="steam-puff" className={`steam-puff steam-puff--${delay}`} fill="#e8ecf8" opacity="0.85">
      <circle cx={x} cy={y} r="2.2" />
      <circle cx={x + 2.4} cy={y - 1.1} r="2.6" />
      <circle cx={x + 4.7} cy={y} r="2" />
    </g>
  );
}

export function MoodMarks({ anchor, energy, anger }: { anchor: EyeAnchor; energy: EnergyLevel; anger: AngerLevel }) {
  const { lx, rx, y } = anchor;
  const lid = anchor.open ? LID_HEIGHT[energy] : undefined;
  const browShape = anger === 'annoyed' ? 'flat' : anger === 'angry' || anger === 'furious' ? 'angry' : null;

  return (
    <g className="mood-marks">
      {lid !== undefined && (
        <>
          <Eyelid x={lx} y={y} height={lid} />
          <Eyelid x={rx} y={y} height={lid} />
        </>
      )}
      {anchor.brows && browShape === 'flat' && (
        <>
          <Brow shape="flat" d={`M${lx - 2.6} ${y - 4.8} h5`} />
          <Brow shape="flat" d={`M${rx - 2.4} ${y - 4.8} h5`} />
        </>
      )}
      {anchor.brows && browShape === 'angry' && (
        <>
          <Brow shape="angry" d={`M${lx - 2.8} ${y - 5.8} L${lx + 2.4} ${y - 3.9}`} />
          <Brow shape="angry" d={`M${rx + 2.8} ${y - 5.8} L${rx - 2.4} ${y - 3.9}`} />
        </>
      )}
      {(anger === 'angry' || anger === 'furious') && <Vein x={rx + 8} y={y - 10} />}
      {anger === 'furious' && (
        <>
          <SteamPuff x={lx - 14} y={y - 15} delay="a" />
          <SteamPuff x={rx + 9} y={y - 17} delay="b" />
        </>
      )}
    </g>
  );
}
