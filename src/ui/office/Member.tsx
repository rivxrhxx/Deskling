import type { CSSProperties } from 'react';
import { MAX_LEVEL } from '../../core/growth';
import type { MemberActivity, MemberView } from '../../core/office';
import type { AngerLevel, EnergyLevel } from '../../core/mood';
import { toScreen } from '../../core/room';
import { memberEmote } from './emote';
import { INK } from './isoMath';
import { PixelSprite } from './PixelSprite';
import { textMap } from './pixelText';
import type { LevelTier } from './pose';
import { LOOK_OF, MEMBER_SCALE, beatOf, deskFacesAway, levelTier, memberPose } from './pose';
import { EMOTES, SPRITES, guestPalette } from './sprites';

/** Standing on the floor (not on a chair or the sofa): these get a shadow. */
const STANDING = new Set<MemberActivity>(['wave', 'cheer', 'coffee', 'water', 'window', 'plant', 'books']);

/** A one-pixel white rim round an emote, so it reads over a busy desk or another member. */
const HALO = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/** One pixel sign centred above a head (DESIGN §3.3). */
function EmoteSign({ id, centerX, headTop }: { id: string | null; centerX: number; headTop: number }) {
  const emote = id ? EMOTES[id] : undefined;
  if (!emote || !id) return null;
  const scale = emote.scale ?? 2;
  const width = (emote.map[0]?.length ?? 0) * scale;
  const height = emote.map.length * scale;
  const x = centerX - width / 2;
  const y = headTop - height - 4;
  const rim = Object.fromEntries(Object.keys(emote.palette).map((key) => [key, emote.rim ?? '#ffffff']));
  return (
    <g data-part="emote" data-emote={id} className="emote">
      {HALO.map(([dx, dy]) => (
        <PixelSprite key={`${dx},${dy}`} map={emote.map} palette={rim} x={x + dx} y={y + dy} scale={scale} />
      ))}
      <PixelSprite map={emote.map} palette={emote.palette} x={x} y={y} scale={scale} />
    </g>
  );
}

/** Plate and ink of a level badge by its tier (ADR-028 §3). */
const PLATE: Readonly<Record<LevelTier, { readonly fill: string; readonly ink: string }>> = {
  rookie: { fill: '#ffffff', ink: '#3b2a20' },
  pro: { fill: '#bfe6ff', ink: '#24496e' },
  star: { fill: '#ffd23f', ink: '#7a3d0a' },
};

/** "Lv n" in pixels on a small plate, by the top right of the head (ADR-028 §3). It shines while the level has just risen. */
function LevelBadge({ level, left, top, shine }: { level: number; left: number; top: number; shine: boolean }) {
  const shown = Number.isSafeInteger(level) && level >= 1 ? Math.min(level, MAX_LEVEL) : 1;
  const tier = levelTier(shown);
  const plate = PLATE[tier];
  const text = textMap(`Lv${shown}`);
  const width = (text[0]?.length ?? 0) + 4;
  return (
    <g data-part="level" data-level={shown} data-tier={tier} data-shine={shine ? 'true' : 'false'} className="level-badge">
      <rect x={left} y={top} width={width} height={9} rx={2} fill={plate.fill} stroke={plate.ink} strokeWidth={1} />
      <PixelSprite map={text} palette={{ t: plate.ink }} x={left + 2} y={top + 2} />
    </g>
  );
}

export interface MemberProps {
  readonly view: MemberView;
  readonly frame: number;
  readonly energy?: EnergyLevel;
  readonly anger?: AngerLevel;
  /** Draw only the sprite's top rows: behind a desk the rest is covered, and must not stick out past its end. */
  readonly rows?: number;
}

/**
 * One office member (ADR-025 §1, §3): its kind's look in its number's colours, posed by what it does,
 * with one emote over its head. Feet on its tile; the parent decides what is drawn in front of it.
 */
export function Member({ view, frame, energy = 'unknown', anger = 'unknown', rows }: MemberProps) {
  const look = LOOK_OF[view.kind];
  const pose = memberPose({ look, activity: view.activity, walking: view.walking, face: view.face, frame, away: deskFacesAway(view.desk) });
  const sheet = SPRITES[pose.name];
  const map = rows === undefined ? sheet : sheet?.slice(0, rows);
  const feet = toScreen(view.at);
  const x = feet.x - 6 * MEMBER_SCALE;
  const y = feet.y - 15.5 * MEMBER_SCALE - pose.lift + pose.bob;
  const emote = memberEmote({
    visual: view.visual,
    activity: view.activity,
    walking: view.walking,
    chat: view.chat,
    energy,
    anger,
    levelUp: view.levelUp,
  });
  return (
    <g
      data-part="member"
      data-session-kind={view.kind}
      data-ordinal={view.ordinal}
      data-visual={view.visual}
      data-activity={view.activity}
      data-pose={pose.name}
      data-walking={view.walking ? 'true' : 'false'}
      data-chat={view.chat ?? undefined}
      data-desk={view.desk}
      data-level-up={view.levelUp ? 'true' : 'false'}
      className={`member member--${look}`}
    >
      {(view.walking || STANDING.has(view.activity)) && <ellipse cx={feet.x} cy={feet.y} rx={5 * MEMBER_SCALE} ry={1.6 * MEMBER_SCALE} fill={INK} opacity="0.18" />}
      {/* The body carries the small CSS loops by activity (breathing, a sip, a sway, a nod); the sprite keeps its own transform. */}
      <g data-part="body" className="member__body" style={{ '--beat': beatOf(view.key).toFixed(3) } as CSSProperties}>
        {map && <PixelSprite part="sprite" map={map} palette={guestPalette(look, view.ordinal)} x={x} y={y} scale={MEMBER_SCALE} flip={pose.flip} />}
      </g>
      <LevelBadge level={view.level} left={Math.round(feet.x + 7)} top={Math.round(y - 3)} shine={view.levelUp} />
      <EmoteSign id={emote} centerX={feet.x} headTop={y} />
    </g>
  );
}
