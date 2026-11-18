import { useEffect, useRef } from 'react';
import type { RecentEntry } from '../core/agentState';
import type { Vitals } from '../core/mood';
import { ANGER_LABEL, ENERGY_LABEL, activityKind, describeActivity, formatClock, formatTokens } from './activityText';
import { StateIcon } from './icons';

export interface DemoPicker {
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string; readonly selected: boolean }>;
  readonly onSelect: (value: string) => void;
}

export interface BudgetPicker {
  readonly value: number;
  readonly options: readonly number[];
  readonly onChange: (value: number) => void;
}

export interface ActivityPanelProps {
  readonly entries: readonly RecentEntry[];
  readonly onClose: () => void;
  readonly formatTime?: (at: number) => string;
  /** Present only while a demo source runs. */
  readonly demo?: DemoPicker;
  /** Energy and context numbers (FR-V5). The scene never shows numbers; this panel does. */
  readonly vitals?: Vitals;
  readonly budget?: BudgetPicker;
}

function Meter({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="vital__meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="vital__fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

function VitalsSection({ vitals, budget }: { vitals: Vitals; budget?: BudgetPicker }) {
  const { energy, anger } = vitals;
  const energyPercent = energy.ratio === null ? null : Math.round(energy.ratio * 100);
  const contextPercent = anger.ratio === null ? null : Math.round(anger.ratio * 100);
  return (
    <div className="activity-panel__vitals" role="group" aria-label="에너지와 컨텍스트">
      <div className="vital" data-vital="energy" data-level={energy.level}>
        <div className="vital__row">
          <span className="vital__name">에너지</span>
          {energy.remaining === null ? (
            <span className="vital__value">보고 없음</span>
          ) : (
            <span className="vital__value">
              남은 토큰 {formatTokens(energy.remaining)} / {formatTokens(energy.budget)}
              <span className="vital__level"> · {ENERGY_LABEL[energy.level]}</span>
            </span>
          )}
        </div>
        {energyPercent !== null && <Meter label="남은 에너지" percent={energyPercent} />}
        {budget && (
          <label className="vital__budget">
            <span>예산</span>
            <select
              aria-label="토큰 예산"
              value={budget.value}
              onChange={(event) => budget.onChange(Number(event.currentTarget.value))}
            >
              {budget.options.map((option) => (
                <option key={option} value={option}>
                  {formatTokens(option)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="vital" data-vital="context" data-level={anger.level}>
        <div className="vital__row">
          <span className="vital__name">컨텍스트</span>
          {anger.used === null || anger.limit === null ? (
            <span className="vital__value">보고 없음</span>
          ) : (
            <span className="vital__value">
              {formatTokens(anger.used)} / {formatTokens(anger.limit)} · {contextPercent}%
              <span className="vital__level"> · {ANGER_LABEL[anger.level]}</span>
            </span>
          )}
        </div>
        {contextPercent !== null && <Meter label="컨텍스트 사용량" percent={contextPercent} />}
      </div>
    </div>
  );
}

/** A small log screen pinned to the wall: recent facts, newest first (FR-P1–P4). Read-only. */
export function ActivityPanel({ entries, onClose, formatTime = formatClock, demo, vitals, budget }: ActivityPanelProps) {
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
      {vitals && <VitalsSection vitals={vitals} budget={budget} />}
      {entries.length === 0 ? (
        <p className="activity-panel__empty">아직 기록된 활동이 없습니다.</p>
      ) : (
        <ol className="activity-panel__list">
          {entries.map((entry) => {
            const kind = activityKind(entry);
            return (
              <li key={entry.key} className="activity-panel__item" data-kind={kind}>
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
