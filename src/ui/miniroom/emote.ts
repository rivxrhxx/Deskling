import type { VisualState } from '../../core/agentEvent';
import type { AngerLevel, EnergyLevel } from '../../core/mood';
import type { ActorActivity } from './pose';

export interface CareReaction {
  readonly kind: 'hearts' | 'snack';
  readonly id: number;
}

/** A conversation emote (ADR-023): talking with someone in the room, or a letter to someone who is not. */
export type ChatEmote = 'talk' | 'letter';

export interface EmoteInput {
  readonly activity: ActorActivity;
  readonly walking: boolean;
  readonly energy: EnergyLevel;
  readonly anger: AngerLevel;
  readonly reaction: CareReaction | null;
  readonly chat?: ChatEmote | null;
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
  'look-outside': 'moon',
  'water-plant': 'water',
  stretch: 'sparkle',
};

/**
 * One pixel sign above Hermes' head (DESIGN §3.2, §4.1). Priority:
 * the user's care > a conversation > what the agent needs from the user > sleep > anger > energy > the activity itself.
 */
export function emoteFor({ activity, walking, energy, anger, reaction, chat = null }: EmoteInput): string | null {
  if (reaction) return reaction.kind === 'hearts' ? 'heart' : 'note';
  if (chat) return chat;
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

/** A session friend's work signs: the same as Hermes' at the desk (DESIGN §3.4). */
const GUEST_WORK_EMOTE: Partial<Record<VisualState, string>> = {
  thinking: 'dots',
  coding: 'code',
  browsing: 'globe',
  terminal: 'prompt',
  'file-work': 'folder',
  delegated: 'arrow',
  success: 'sparkle',
};

export interface GuestEmoteInput {
  readonly visual: VisualState;
  readonly walking: boolean;
  readonly chat: ChatEmote | null;
}

/** One sign above a session friend (FR-MS3, FR-MS5): a conversation > what its session needs from the user > its work. */
export function guestEmoteFor({ visual, walking, chat }: GuestEmoteInput): string | null {
  if (chat) return chat;
  if (visual === 'waiting-approval') return 'exclaim-amber';
  if (visual === 'error') return 'exclaim-ember';
  if (walking) return null;
  return GUEST_WORK_EMOTE[visual] ?? null;
}
