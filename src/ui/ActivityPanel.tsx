import { useEffect, useRef } from 'react';
import type { SourceKind, VisualState } from '../core/agentEvent';
import type { MemberLevel, OfficeDecorId } from '../core/growth';
import { OFFICE_DECOR } from '../core/growth';
import type { Vitals } from '../core/mood';
import type { RoomEntry } from '../core/roomState';
import { sessionLabel } from '../core/roomState';
import { DECOR_LABEL, activityKind, describeLevel, describeRoomActivity, describeUsage, formatClock, formatTokens } from './activityText';
import { StateIcon } from './icons';
import { VISUAL_SPEC } from './visualSpec';

export interface DemoPicker {
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string; readonly selected: boolean }>;
  readonly onSelect: (value: string) => void;
}

/** Which office the panel is showing and the user's choice (FR-CC4). */
export interface ViewPicker extends DemoPicker {
  /** Fixed copy, e.g. '지금: 실제 세션'. */
  readonly showing: string;
}

export interface BudgetPicker {
  readonly value: number;
  readonly options: readonly number[];
  readonly onChange: (value: number) => void;
}

/** How far the office has grown (ADR-025 §7). */
export interface OfficePanel {
  readonly xp: number;
  readonly decor: readonly OfficeDecorId[];
  readonly next: { readonly id: OfficeDecorId; readonly xp: number } | null;
  /** True for the demo office, which grows separately from the real one (FR-G6). */
  readonly demo: boolean;
}

/** A member of the office (FR-MS6). `seated` is false for members beyond the eight desks. */
export interface PanelSession {
  readonly key: string;
  readonly kind: SourceKind;
  readonly ordinal: number;
  readonly visual: VisualState;
  readonly seated: boolean;
  /** The member's own energy and context readings (ADR-025 §6). Numbers show only where reported. */
  readonly vitals?: Vitals;
  /** The member's level from its own completed tasks (ADR-028 §5). */
  readonly level?: MemberLevel;
}

export interface ActivityPanelProps {
  readonly entries: readonly RoomEntry[];
  readonly onClose: () => void;
  readonly formatTime?: (at: number) => string;
  /** Present only while a demo source runs. */
  readonly demo?: DemoPicker;
  /** 자동 / 실제 / 데모 (FR-CC4). */
  readonly view?: ViewPicker;
  /** The budget every member's energy is read against (FR-V6). */
  readonly budget?: BudgetPicker;
  readonly office?: OfficePanel;
  /** Who is in the office, in arrival order (FR-MS6). */
  readonly sessions?: readonly PanelSession[];
}

/** The office's growth in fixed copy: XP, unlocked props and what comes next. */
function OfficeSection({ office }: { office: OfficePanel }) {
  return (
    <div className="activity-panel__office" role="group" aria-label="사무실">
      <div className="office__row">
        <span className="activity-panel__heading">사무실</span>
        {office.demo && <span className="office__demo">DEMO</span>}
      </div>
      <div className="office__row office__facts">
        <span>{`경험치 ${office.xp}`}</span>
        <span>{`소품 ${office.decor.length}/${OFFICE_DECOR.length}`}</span>
        <span className="office__next">{office.next ? `다음: ${DECOR_LABEL[office.next.id]} · ${office.next.xp}` : '모두 해금'}</span>
      </div>
    </div>
  );
}

/** Everyone in the office, their state and reported numbers, in fixed copy (FR-MS6, FR-P4, FR-V5). */
function SessionsSection({ sessions, budget }: { sessions: readonly PanelSession[]; budget?: BudgetPicker }) {
  return (
    <div className="activity-panel__sessions" role="group" aria-label="사무실에 있는 세션">
      <span className="activity-panel__heading">사무실에 있는 세션</span>
      {sessions.length === 0 ? (
        <p className="sessions__empty">아무도 없음</p>
      ) : (
        <ul className="sessions__list">
          {sessions.map((session) => {
            const spec = VISUAL_SPEC[session.visual];
            const usage = session.vitals ? describeUsage(session.vitals) : null;
            return (
              <li
                key={session.key}
                className="session"
                data-session-kind={session.kind}
                data-visual={session.visual}
                data-tone={spec.tone}
                data-seated={session.seated ? 'true' : 'false'}
              >
                <span className="session__dot" aria-hidden="true" />
                <span className="session__name">{sessionLabel(session)}</span>
                {session.level && <span className="session__level">{describeLevel(session.level)}</span>}
                <span className="session__state">{spec.label}</span>
                {usage && <span className="session__usage">{usage}</span>}
                {!session.seated && <span className="session__away">(자리 없음)</span>}
              </li>
            );
          })}
        </ul>
      )}
      {budget && (
        <label className="sessions__budget">
          <span>토큰 예산</span>
          <select aria-label="토큰 예산" value={budget.value} onChange={(event) => budget.onChange(Number(event.currentTarget.value))}>
            {budget.options.map((option) => (
              <option key={option} value={option}>
                {formatTokens(option)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** A small log screen pinned to the wall: recent facts, newest first (FR-P1–P4). Read-only. */
export function ActivityPanel({ entries, onClose, formatTime = formatClock, demo, view, budget, office, sessions }: ActivityPanelProps) {
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
      {office && <OfficeSection office={office} />}
      {sessions && <SessionsSection sessions={sessions} budget={budget} />}
      {entries.length === 0 ? (
        <p className="activity-panel__empty">아직 기록된 활동이 없습니다.</p>
      ) : (
        <ol className="activity-panel__list" aria-label="최근 활동 목록">
          {entries.map((entry) => {
            const kind = activityKind(entry);
            return (
              <li key={entry.key} className="activity-panel__item" data-kind={kind}>
                <time dateTime={new Date(entry.at).toISOString()}>{formatTime(entry.at)}</time>
                {kind === 'error' && <StateIcon icon="alert" className="activity-panel__mark" />}
                {kind === 'attention' && <StateIcon icon="hand" className="activity-panel__mark" />}
                <span>{describeRoomActivity(entry)}</span>
              </li>
            );
          })}
        </ol>
      )}
      {view && (
        <div className="activity-panel__demo activity-panel__view" role="group" aria-label="보기">
          {view.options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="chip"
              aria-pressed={option.selected}
              onClick={() => view.onSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
          <span className="activity-panel__showing">{view.showing}</span>
        </div>
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
