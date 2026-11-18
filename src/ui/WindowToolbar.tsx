import type { ReactNode } from 'react';

/** The toolbar's own view of the settings it edits (structurally compatible with app settings). */
export interface ToolbarValues {
  readonly size: 's' | 'm' | 'l';
  readonly opacity: number;
  readonly floatOnTop: boolean;
  readonly motion: 'system' | 'reduced' | 'full';
}

export interface WindowToolbarProps {
  readonly values: ToolbarValues;
  readonly onChange: (patch: Partial<ToolbarValues>) => void;
  readonly onClose: () => void;
}

const SIZES: ReadonlyArray<{ id: ToolbarValues['size']; text: string; label: string }> = [
  { id: 's', text: 'S', label: '작게' },
  { id: 'm', text: 'M', label: '보통 크기' },
  { id: 'l', text: 'L', label: '크게' },
];

const MOTION_LABEL: Record<ToolbarValues['motion'], string> = { system: '시스템 설정', reduced: '줄이기', full: '전체' };
const NEXT_MOTION: Record<ToolbarValues['motion'], ToolbarValues['motion']> = {
  system: 'reduced',
  reduced: 'full',
  full: 'system',
};

const Glyph = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 16 16"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

/** Window controls, revealed on hover or keyboard focus (FR-W7). Never talks to the agent. */
export function WindowToolbar({ values, onChange, onClose }: WindowToolbarProps) {
  const motionLabel = `모션: ${MOTION_LABEL[values.motion]}`;
  return (
    <div className="window-toolbar" role="toolbar" aria-label="창 설정" data-no-drag="">
      <div className="window-toolbar__group">
        {SIZES.map((size) => (
          <button
            key={size.id}
            type="button"
            className="icon-button icon-button--text"
            aria-label={size.label}
            title={size.label}
            aria-pressed={values.size === size.id}
            onClick={() => onChange({ size: size.id })}
          >
            {size.text}
          </button>
        ))}
      </div>
      <input
        className="window-toolbar__opacity"
        type="range"
        min={30}
        max={100}
        step={5}
        value={Math.round(values.opacity * 100)}
        aria-label="불투명도"
        title={`불투명도 ${Math.round(values.opacity * 100)}%`}
        onChange={(event) => onChange({ opacity: Number(event.currentTarget.value) / 100 })}
      />
      <button
        type="button"
        className="icon-button"
        aria-label="위에 띄우기"
        title="위에 띄우기 (끄면 바탕화면에 박힘)"
        aria-pressed={values.floatOnTop}
        onClick={() => onChange({ floatOnTop: !values.floatOnTop })}
      >
        <Glyph>
          <path d="M6 2.5h4l-.6 4 2.6 2.5H4L6.6 6.5z" />
          <path d="M8 9v4.5" />
        </Glyph>
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={motionLabel}
        title={motionLabel}
        data-motion-setting={values.motion}
        onClick={() => onChange({ motion: NEXT_MOTION[values.motion] })}
      >
        <Glyph>
          <path d="M1.5 8c1.6-3 3.3-3 4.9 0s3.3 3 4.9 0 2.2-2.2 3.2-1.6" />
        </Glyph>
      </button>
      <button type="button" className="icon-button" aria-label="Deskling 닫기" title="Deskling 닫기" onClick={onClose}>
        <Glyph>
          <path d="M4 4l8 8M12 4l-8 8" />
        </Glyph>
      </button>
    </div>
  );
}
