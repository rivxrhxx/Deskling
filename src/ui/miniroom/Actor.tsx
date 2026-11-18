import type { GrowthStage } from '../../core/growth';
import type { AngerLevel, EnergyLevel } from '../../core/mood';
import type { Facing, Tile } from '../../core/room';
import { toScreen } from '../../core/room';
import type { CareReaction } from './emote';
import { emoteFor } from './emote';
import { PixelSprite } from './PixelSprite';
import type { ActorActivity, Who } from './pose';
import { FRIEND_SCALE, STAGE_SCALE, spriteFor } from './pose';
import { EMOTES, FRIEND_PALETTES, HERMES_PALETTE, SPRITES } from './sprites';

export interface ActorView {
  readonly activity: ActorActivity;
  readonly at: Tile;
  readonly walking: boolean;
  readonly face: Facing;
}


/** Poses that show Hermes' chest, where the adult star badge sits (not his back, not behind a book). */
const CHEST_VISIBLE = new Set(['front', 'front-walk-a', 'front-walk-b', 'sit-front', 'wave', 'arms-up', 'water']);

export interface ActorProps {
  readonly who: Who;
  readonly view: ActorView;
  readonly frame: number;
  readonly stage?: GrowthStage;
  readonly energy?: EnergyLevel;
  readonly anger?: AngerLevel;
  readonly reaction?: CareReaction | null;
  /** Top-left of the sprite when furniture positions it (head on the pillow, behind shower glass). */
  readonly anchor?: { x: number; y: number };
}

/** Hermes or a friend: a pixel sprite on its tile, an emote above the head. */
export function Actor({ who, view, frame, stage = 'adult', energy = 'unknown', anger = 'unknown', reaction = null, anchor }: ActorProps) {
  const pose = spriteFor({ activity: view.activity, walking: view.walking, face: view.face, frame, who });
  const map = SPRITES[pose.name];
  if (!map) return null;
  const isHermes = who === 'hermes';
  const palette = isHermes ? HERMES_PALETTE : (FRIEND_PALETTES[who === 'friend-a' ? 0 : 1] ?? HERMES_PALETTE);
  const scale = isHermes ? STAGE_SCALE[stage] : FRIEND_SCALE;
  const feet = toScreen(view.at);
  const x = anchor?.x ?? feet.x - 6 * scale;
  const y = (anchor?.y ?? (pose.seated ? feet.y - 10 - 13 * scale : feet.y - 15 * scale)) + pose.bob;

  const emoteId = isHermes
    ? emoteFor({ activity: view.activity, walking: view.walking, energy, anger, reaction })
    : view.activity === 'visit' && !view.walking
      ? 'note'
      : null;
  const emote = emoteId ? EMOTES[emoteId] : undefined;
  const emoteWidth = (emote?.map[0]?.length ?? 0) * 2;
  const emoteHeight = (emote?.map.length ?? 0) * 2;

  return (
    <g
      data-part={isHermes ? 'hermes' : 'friend'}
      data-activity={view.activity}
      data-pose={pose.name}
      data-stage={isHermes ? stage : undefined}
      data-walking={view.walking ? 'true' : 'false'}
      className={`actor actor--${who}`}
    >
      <ellipse cx={x + 6 * scale} cy={feet.y} rx={5 * scale} ry={1.6 * scale} fill="#3b2a20" opacity={pose.seated || anchor ? 0 : 0.18} />
      <PixelSprite part="sprite" map={map} palette={palette} x={x} y={y} scale={scale} flip={pose.flip} />
      {isHermes && stage === 'adult' && CHEST_VISIBLE.has(pose.name) && (
        <path
          data-part="star-badge"
          d={`M${x + 6 * scale} ${y + 9.4 * scale} l1 2 2.2 .3 -1.6 1.5 .4 2.2 -2 -1.1 -2 1.1 .4 -2.2 -1.6 -1.5 2.2 -.3z`}
          fill="#f2d27a"
          stroke="#3b2a20"
          strokeWidth="0.5"
        />
      )}
      {emote && emoteId && (
        <g data-part="emote" data-emote={emoteId} className="emote">
          <PixelSprite map={emote.map} palette={emote.palette} x={x + 6 * scale - emoteWidth / 2} y={y - emoteHeight - 4} scale={2} />
        </g>
      )}
      {isHermes && reaction?.kind === 'snack' && (
        <g data-part="cookie" className="cookie" key={reaction.id}>
          <circle cx={x + 10 * scale} cy={y + 11 * scale} r={3.6} fill="#c8955c" stroke="#3b2a20" strokeWidth="0.8" />
          <circle cx={x + 10 * scale - 1} cy={y + 11 * scale - 1} r={0.7} fill="#5a3a24" />
          <circle cx={x + 10 * scale + 1.2} cy={y + 11 * scale + 0.8} r={0.7} fill="#5a3a24" />
        </g>
      )}
    </g>
  );
}
