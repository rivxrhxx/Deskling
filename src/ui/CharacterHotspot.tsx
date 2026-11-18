import type { CSSProperties, Ref } from 'react';

/**
 * An invisible HTML button laid over Hermes (the SVG scene is role="img", so it cannot contain
 * accessible controls). Native button semantics give click, Enter and Space for free.
 */
export function CharacterHotspot({
  expanded,
  onActivate,
  buttonRef,
  at,
}: {
  expanded: boolean;
  onActivate: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  /** Hermes' feet in the room's 480×320 viewBox; the hotspot follows him around (FR-V7). */
  at: { x: number; y: number };
}) {
  const style = { '--hx': String(at.x), '--hy': String(at.y) } as CSSProperties;
  return (
    <button
      ref={buttonRef}
      type="button"
      className="character-hotspot"
      aria-label="최근 활동 보기"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={onActivate}
      style={style}
      data-no-drag=""
    />
  );
}
