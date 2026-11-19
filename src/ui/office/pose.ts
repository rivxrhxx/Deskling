import type { SourceKind } from '../../core/agentEvent';
import type { MemberActivity } from '../../core/office';
import type { DeskId, Facing } from '../../core/room';
import { SPOTS } from '../../core/room';
import type { GuestKind as Look } from './sprites';

/**
 * Which original look draws a session kind (ADR-025 §1): the look only, no behaviour.
 * Claude and Codex keep their own; every other kind is an office agent.
 */
export const LOOK_OF: Readonly<Record<SourceKind, Look>> = {
  'claude-code': 'claude',
  codex: 'codex',
  hermes: 'agent',
  demo: 'agent',
  custom: 'agent',
};

/** Pixel scale of a member's 12×16 sprite. */
export const MEMBER_SCALE = 2.25;
/** How far the sofa cushion lifts a sitter off the floor (px). */
const SOFA_LIFT = 4;

/**
 * A member's own beat in [0, 1) from its session key, so the small loops (ADR-027 §3) do not all run in step.
 * Stable: the same key gives the same beat on every render.
 */
export function beatOf(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

/** Desks whose chair has its back to the viewer, so we see the monitor beyond the member (1, 2, 5, 6). */
export const deskFacesAway = (desk: DeskId) => SPOTS[desk].face.startsWith('back');

export interface PoseInput {
  readonly look: Look;
  readonly activity: MemberActivity;
  readonly walking: boolean;
  readonly face: Facing;
  /** Animation frame (0/1): walking legs, typing hands, waving, a small bob. */
  readonly frame: number;
  /** Whether the member's desk faces away from the viewer (`deskFacesAway`). */
  readonly away: boolean;
}

export interface Pose {
  /** Key into SPRITES. */
  readonly name: string;
  readonly flip: boolean;
  /** The member shows its back: drawn in front of its desk and behind its chair back. */
  readonly back: boolean;
  /** Vertical bounce in pixels (negative = up). */
  readonly bob: number;
  /** Height of the seat under the member (px above the floor). */
  readonly lift: number;
}

/** The pose a member takes, by what it does, which way its desk faces and the frame (DESIGN §3.3). Pure. */
export function memberPose({ look, activity, walking, face, frame, away }: PoseInput): Pose {
  const flip = face.endsWith('left');
  const odd = frame % 2 === 1;
  const pose = (name: string, back = false, bob = 0, lift = 0): Pose => ({ name: `${look}-${name}`, flip, back, bob, lift });

  if (walking) {
    const back = face.startsWith('back');
    // A step up on the second frame (ADR-027 §3).
    return pose(`${back ? 'back-walk' : 'walk'}-${odd ? 'b' : 'a'}`, back, odd ? -1 : 0);
  }
  switch (activity) {
    case 'work':
    case 'delegate':
      return away ? pose(odd ? 'sit-desk-type' : 'sit-desk', true) : pose(odd ? 'sit-desk-front-type' : 'sit-desk-front');
    case 'think':
      return away ? pose('sit-desk-back-think', true) : pose('sit-desk-think');
    case 'idle-desk':
      return away ? pose('sit-desk', true) : pose('sit-desk-front');
    // Calling for the user, upset or cheering, a member turns round to the viewer even at a desk that faces away.
    case 'wave':
      return pose(odd ? 'front' : 'wave');
    case 'upset':
      return pose('hands-on-head');
    case 'cheer':
      return pose('arms-up', false, odd ? -3 : 0);
    case 'coffee':
    case 'water':
      return pose('hold-mug');
    case 'sofa':
      return pose('sit-sofa', false, 0, SOFA_LIFT);
    case 'window':
    case 'plant':
    case 'books':
      return pose('back', true);
  }
}
