import type { CSSProperties } from 'react';
import type { MemberActivity, MemberView } from '../../core/office';
import type { AngerLevel, EnergyLevel } from '../../core/mood';
import { memberEmote } from './emote';
import { EmoteSign } from './EmoteSign';
import { INK } from './isoMath';
import { PixelSprite } from './PixelSprite';
import { LOOK_OF, MEMBER_SCALE, beatOf, deskFacesAway, memberAnchor, memberPose } from './pose';
import { SPRITES, guestPalette } from './sprites';

/** Standing on the floor (not on a chair or the sofa): these get a shadow. */
const STANDING = new Set<MemberActivity>(['wave', 'cheer', 'coffee', 'water', 'window', 'plant', 'books']);

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
  const { feetX, feetY, headTop: y } = memberAnchor(view.at, pose);
  const feet = { x: feetX, y: feetY };
  const x = feet.x - 6 * MEMBER_SCALE;
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
      {/* LEVEL UP is drawn with the level badges, above the furniture (ADR-028 §4). */}
      <EmoteSign id={emote === 'level-up' ? null : emote} centerX={feet.x} headTop={y} />
    </g>
  );
}
