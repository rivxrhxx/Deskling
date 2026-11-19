import type { VisualState } from '../../core/agentEvent';
import type { Chat, MemberActivity } from '../../core/office';
import type { AngerLevel, EnergyLevel } from '../../core/mood';

export interface EmoteInput {
  readonly visual: VisualState;
  readonly activity: MemberActivity;
  readonly walking: boolean;
  /** The member's part in a conversation (ADR-023). */
  readonly chat: Chat['kind'] | null;
  /** The session's own vitals (ADR-016); unreported is `unknown`. */
  readonly energy?: EnergyLevel;
  readonly anger?: AngerLevel;
}

/** Work signs at the desk, by the tool in use. */
const WORK_EMOTE: Partial<Record<VisualState, string>> = {
  coding: 'code',
  browsing: 'globe',
  terminal: 'prompt',
  'file-work': 'folder',
};

/**
 * One pixel sign over a member's head (DESIGN §3.3, §4.1). Priority:
 * a conversation > what the user is needed for > anger > no energy left > walking (nothing) > its work > a coffee break.
 */
export function memberEmote({ visual, activity, walking, chat, energy = 'unknown', anger = 'unknown' }: EmoteInput): string | null {
  if (chat) return chat;
  if (activity === 'wave') return 'exclaim-amber';
  if (activity === 'upset') return 'exclaim-ember';
  if (anger === 'furious') return 'steam';
  if (anger === 'angry') return 'vein';
  if (energy === 'empty') return 'battery';
  if (anger === 'annoyed') return 'sweat';
  if (walking) return null;
  switch (activity) {
    case 'work':
      return WORK_EMOTE[visual] ?? null;
    case 'think':
      return 'dots';
    case 'delegate':
      return 'arrow';
    case 'cheer':
      return 'sparkle';
    case 'coffee':
    case 'water':
      return 'coffee';
    default:
      return null;
  }
}
