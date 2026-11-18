import type { VisualState } from '../../core/agentEvent';
import type { GrowthStage } from '../../core/growth';
import type { Activity } from '../../core/life';
import type { Facing } from '../../core/room';

/** What an actor is doing: Hermes' activities, the helper's help/leave, or a session friend's visit/leave. */
export type ActorActivity = Activity | 'visit' | 'help' | 'leave';
/** Hermes, the delegation helper's two looks, or a session friend's sheet (ADR-022). */
export type Who = 'hermes' | 'friend-a' | 'friend-b' | 'claude' | 'codex';

/** Pixel scale of Hermes' sprite per growth stage (DESIGN §4.2), and of friends. */
export const STAGE_SCALE: Readonly<Record<GrowthStage, number>> = { baby: 2, kid: 2.25, adult: 2.5 };
export const FRIEND_SCALE = 2.4;
/** Session friends: a touch smaller than grown-up Hermes, so four fit round the room. */
export const GUEST_SCALE = 2.25;

export interface PoseInput {
  readonly activity: ActorActivity;
  readonly walking: boolean;
  readonly face: Facing;
  /** Animation frame (0/1): walking legs, typing hands, small bounces. */
  readonly frame: number;
  readonly who?: Who;
  /** A session friend's own visual state; it decides the friend's pose (FR-MS3). */
  readonly visual?: VisualState;
}

export interface Pose {
  /** Key into SPRITES. */
  readonly name: string;
  readonly flip: boolean;
  /** Sitting poses are drawn on a seat instead of standing on the floor. */
  readonly seated: boolean;
  /** Vertical bounce in pixels (negative = up). */
  readonly bob: number;
}

const SEATED = new Set(['sit-back', 'sit-back-type', 'sit-front', 'hands-on-head']);
/** Work at the desk: from behind, or turned round on the stool to talk with a friend (ADR-023). */
const DESK_WORK = new Set<ActorActivity>(['type-code', 'type-terminal', 'ponder', 'browse', 'handle-files', 'delegate']);
const TYPING = new Set<VisualState>(['coding', 'browsing', 'terminal', 'file-work']);
const GUEST_SEATED = new Set(['sit-front', 'sit-front-type', 'sit-think', 'hands-on-head']);

/**
 * A session friend at its laptop, by its own session's state (FR-MS3, DESIGN §3.4).
 * Waving for approval and jumping for joy stand up at the seat; everything else sits on the cushion.
 */
function guestPose(visual: VisualState, odd: boolean): { name: string; bob: number } {
  if (TYPING.has(visual)) return { name: odd ? 'sit-front-type' : 'sit-front', bob: 0 };
  switch (visual) {
    case 'thinking':
    case 'delegated':
      return { name: 'sit-think', bob: 0 };
    case 'waiting-approval':
      return { name: odd ? 'front' : 'wave', bob: 0 };
    case 'success':
      return { name: 'arms-up', bob: odd ? -4 : 0 };
    case 'error':
      return { name: 'hands-on-head', bob: 0 };
    default:
      return { name: 'sit-front', bob: 0 };
  }
}

/** Picks the sprite for an actor (FR-R2, FR-R3, FR-MS3). Pure. */
export function spriteFor({ activity, walking, face, frame, who = 'hermes', visual = 'idle' }: PoseInput): Pose {
  const flip = face === 'front-left' || face === 'back-left';
  const back = face === 'back-right' || face === 'back-left';
  const odd = frame % 2 === 1;

  if (who === 'claude' || who === 'codex') {
    // Offline or on the way out: always on the move towards the door.
    if (walking || activity === 'leave') {
      return { name: `${who}-${back ? 'back-walk' : 'walk'}-${odd ? 'b' : 'a'}`, flip, seated: false, bob: 0 };
    }
    const { name, bob } = guestPose(visual, odd);
    return { name: `${who}-${name}`, flip, seated: GUEST_SEATED.has(name), bob };
  }

  if (who !== 'hermes') {
    // The delegation helper: at the side desk's laptop, or on its way.
    if (walking) return { name: `${who}-${back ? 'back-walk' : 'walk'}-${odd ? 'b' : 'a'}`, flip, seated: false, bob: 0 };
    if (activity === 'help') return { name: `${who}-sit-back${odd ? '-type' : ''}`, flip, seated: true, bob: 0 };
    return { name: `${who}-${back ? 'back' : 'front'}`, flip, seated: false, bob: 0 };
  }

  if (walking) return { name: `${back ? 'back' : 'front'}-walk-${odd ? 'b' : 'a'}`, flip, seated: false, bob: 0 };

  const pose = (name: string, bob = 0): Pose => ({ name, flip, seated: SEATED.has(name), bob });
  if (DESK_WORK.has(activity) && !back) return pose('sit-front');
  switch (activity) {
    case 'type-code':
    case 'type-terminal':
      return pose(odd ? 'sit-back-type' : 'sit-back');
    case 'ponder':
    case 'browse':
    case 'handle-files':
    case 'delegate':
      return pose('sit-back');
    case 'watch-tv':
      return pose('sit-front', odd ? -1 : 0);
    case 'frustrated':
      return pose('hands-on-head');
    case 'call-user':
      return pose(odd ? 'front' : 'wave');
    case 'celebrate':
      return pose('arms-up', odd ? -5 : 0);
    case 'stretch':
      return pose('arms-up', odd ? -1 : 0);
    case 'sleep':
    case 'nap':
      return pose('sleep');
    case 'shower':
      return pose('shower', odd ? -1 : 0);
    case 'eat':
      return pose('sit-front', odd ? -1 : 0);
    case 'read':
      return pose('read');
    case 'water-plant':
      return pose('water');
    case 'look-outside':
    case 'fridge':
      return pose('back');
    default:
      return pose(back ? 'back' : 'front');
  }
}
