import { MAX_LEVEL } from '../../core/growth';
import { PixelSprite } from './PixelSprite';
import { textMap } from './pixelText';
import type { LevelTier } from './pose';
import { levelTier } from './pose';

/** Plate and ink of a level badge by its tier (ADR-028 §3). */
const PLATE: Readonly<Record<LevelTier, { readonly fill: string; readonly ink: string }>> = {
  rookie: { fill: '#ffffff', ink: '#3b2a20' },
  pro: { fill: '#bfe6ff', ink: '#24496e' },
  star: { fill: '#ffd23f', ink: '#7a3d0a' },
};

export interface LevelBadgeProps {
  readonly memberKey: string;
  readonly desk: string;
  readonly level: number;
  /** The member's feet and the top of its head (`memberAnchor`). */
  readonly feetX: number;
  readonly headTop: number;
  /** The level has just risen. */
  readonly shine: boolean;
}

/**
 * "Lv n" in pixels on a small plate by the top right of a member's head (ADR-028 §3). Drawn above the furniture,
 * so a monitor in front never hides it. It shines while the level has just risen (§4).
 */
export function LevelBadge({ memberKey, desk, level, feetX, headTop, shine }: LevelBadgeProps) {
  const shown = Number.isSafeInteger(level) && level >= 1 ? Math.min(level, MAX_LEVEL) : 1;
  const tier = levelTier(shown);
  const plate = PLATE[tier];
  const text = textMap(`Lv${shown}`);
  const width = (text[0]?.length ?? 0) + 4;
  const left = Math.round(feetX + 7);
  const top = Math.round(headTop - 3);
  return (
    <g
      data-part="level"
      data-member={memberKey}
      data-desk={desk}
      data-level={shown}
      data-tier={tier}
      data-shine={shine ? 'true' : 'false'}
      className="level-badge"
    >
      <rect x={left} y={top} width={width} height={9} rx={2} fill={plate.fill} stroke={plate.ink} strokeWidth={1} />
      <PixelSprite map={text} palette={{ t: plate.ink }} x={left + 2} y={top + 2} />
    </g>
  );
}
