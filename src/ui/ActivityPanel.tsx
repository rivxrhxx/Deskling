import { useEffect, useRef } from 'react';
import type { RecentEntry } from '../core/agentState';
import { activityKind, describeActivity, formatClock } from './activityText';
import { StateIcon } from './icons';

export interface DemoPicker {
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string; readonly selected: boolean }>;
  readonly onSelect: (value: string) => void;
}

export interface ActivityPanelProps {
  readonly entries: readonly RecentEntry[];
  readonly onClose: () => void;
  readonly formatTime?: (at: number) => string;
  /** Present only while a demo source runs. */
  readonly demo?: DemoPicker;
}

/** A small log screen pinned to the wall: recent facts, newest first (FR-P1–P4). Read-only. */
export function ActivityPanel({ entries, onClose, formatTime = formatClock, demo }: ActivityPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="activity-panel" role="dialog" aria-label="최근 활동" data-no-drag="">
      <header className="activity-panel__header">
        <span className="activity-panel__title">최근 활동</span>
        <button ref={closeRef} type="button" className="icon-button" aria-label="닫기" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      {entries.length === 0 ? (
        <p className="activity-panel__empty">아직 기록된 활동이 없습니다.</p>
      ) : (
        <ol className="activity-panel__list">
          {entries.map((entry) => {
            const kind = activityKind(entry);
            return (
              <li key={`${entry.id}-${entry.seq}`} className="activity-panel__item" data-kind={kind}>
                <time dateTime={new Date(entry.at).toISOString()}>{formatTime(entry.at)}</time>
                {kind === 'error' && <StateIcon icon="alert" className="activity-panel__mark" />}
                {kind === 'attention' && <StateIcon icon="hand" className="activity-panel__mark" />}
                <span>{describeActivity(entry)}</span>
              </li>
            );
          })}
        </ol>
      )}
      {demo && (
        <div className="activity-panel__demo" role="group" aria-label="데모 시나리오">
          {demo.options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="chip"
              aria-pressed={option.selected}
              onClick={() => demo.onSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <footer className="activity-panel__footer">관찰 전용 · 승인과 조작은 에이전트 화면에서 하세요</footer>
    </div>
  );
}
