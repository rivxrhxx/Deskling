import type { Ref } from 'react';

/**
 * An invisible HTML button laid over the character (the SVG scene is role="img", so it cannot
 * contain accessible controls). Native button semantics give click, Enter and Space for free.
 */
export function CharacterHotspot({
  expanded,
  onActivate,
  buttonRef,
  place,
}: {
  expanded: boolean;
  onActivate: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  /** Follows the character between desk and bed (ADR-017). */
  place: 'desk' | 'bed';
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="character-hotspot"
      aria-label="최근 활동 보기"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={onActivate}
      data-place={place}
      data-no-drag=""
    />
  );
}
