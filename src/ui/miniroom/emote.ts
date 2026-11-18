import type { AngerLevel, EnergyLevel } from '../../core/mood';
import type { ActorActivity } from './pose';

export interface CareReaction {
  readonly kind: 'hearts' | 'snack';
  readonly id: number;
}

export interface EmoteInput {
  readonly activity: ActorActivity;
  readonly walking: boolean;
  readonly energy: EnergyLevel;
  readonly anger: AngerLevel;
  readonly reaction: CareReaction | null;
}

const ACTIVITY_EMOTE: Partial<Record<ActorActivity, string>> = {
  'type-code': 'code',
  browse: 'globe',
  'type-terminal': 'prompt',
  'handle-files': 'folder',
  ponder: 'dots',
  delegate: 'arrow',
  celebrate: 'sparkle',
  shower: 'bubbles',
  eat: 'note',
  'watch-tv': 'note',
  'host-friend': 'note',
  'look-outside': 'moon',
  'water-plant': 'water',
  stretch: 'sparkle',
};

/**
 * One pixel sign above Hermes' head (DESIGN §9.3, §4.1). Priority:
 * the user's care > what the agent needs from the user > sleep > anger > energy > the activity itself.
 */
export function emoteFor({ activity, walking, energy, anger, reaction }: EmoteInput): string | null {
  if (reaction) return reaction.kind === 'hearts' ? 'heart' : 'note';
  if (activity === 'call-user') return 'exclaim-amber';
  if (activity === 'frustrated') return 'exclaim-ember';
  if (activity === 'sleep' || activity === 'nap') return 'zzz';
  if (anger === 'furious') return 'steam';
  if (anger === 'angry') return 'vein';
  if (energy === 'empty') return 'battery';
  if (anger === 'annoyed') return 'sweat';
  if (walking) return null;
  return ACTIVITY_EMOTE[activity] ?? null;
}
