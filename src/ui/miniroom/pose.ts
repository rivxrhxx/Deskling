import type { Activity } from '../../core/life';
import type { Facing } from '../../core/room';

/** What an actor is doing: Hermes' activities, or a friend's visit/help/leave. */
export type ActorActivity = Activity | 'visit' | 'help' | 'leave';
export type Who = 'hermes' | 'friend-a' | 'friend-b';

export interface PoseInput {
  readonly activity: ActorActivity;
  readonly walking: boolean;
  readonly face: Facing;
  /** Animation frame (0/1): walking legs, typing hands, small bounces. */
  readonly frame: number;
  readonly who?: Who;
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

/** Picks the sprite for an actor (FR-R2, FR-R3). Pure. */
export function spriteFor({ activity, walking, face, frame, who = 'hermes' }: PoseInput): Pose {
  const flip = face === 'front-left' || face === 'back-left';
  const back = face === 'back-right' || face === 'back-left';
  const odd = frame % 2 === 1;

  if (who !== 'hermes') {
    if (walking) return { name: `${who}-${back ? 'back-walk' : 'walk'}-${odd ? 'b' : 'a'}`, flip, seated: false, bob: 0 };
    if (activity === 'visit') return { name: `${who}-sit-front`, flip, seated: true, bob: 0 };
    if (activity === 'help') return { name: `${who}-sit-back${odd ? '-type' : ''}`, flip, seated: true, bob: 0 };
    return { name: `${who}-${back ? 'back' : 'front'}`, flip, seated: false, bob: 0 };
  }

  if (walking) return { name: `${back ? 'back' : 'front'}-walk-${odd ? 'b' : 'a'}`, flip, seated: false, bob: 0 };

  const pose = (name: string, bob = 0): Pose => ({ name, flip, seated: SEATED.has(name), bob });
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
    case 'host-friend':
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
