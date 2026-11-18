import { useEffect, useRef, useState } from 'react';
import type { SourceKind, VisualState } from '../core/agentEvent';
import type { Vitals } from '../core/mood';
import type { RoomEntry } from '../core/roomState';
import { sessionLabel } from '../core/roomState';
import { ANGER_LABEL, ENERGY_LABEL, activityKind, describeRoomActivity, formatClock, formatTokens } from './activityText';
import { StateIcon } from './icons';
import { VISUAL_SPEC } from './visualSpec';

export interface DemoPicker {
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string; readonly selected: boolean }>;
  readonly onSelect: (value: string) => void;
}

/** Which room the panel is showing and the user's choice (FR-CC4). */
export interface ViewPicker extends DemoPicker {
  /** Fixed copy, e.g. '지금: 실제 세션'. */
  readonly showing: string;
}

export interface BudgetPicker {
  readonly value: number;
  readonly options: readonly number[];
  readonly onChange: (value: number) => void;
}

/** The desktop pet's card (ADR-018). Care only affects the pet — never the agent. */
export interface PetPanel {
  readonly name: string;
  /** 0–5. */
  readonly hearts: number;
  readonly snacksLeft: number;
  /** True for the demo profile, which grows separately from a real agent's. */
  readonly demo: boolean;
  readonly onPet: () => void;
  readonly onFeed: () => void;
  readonly onRename: (name: string) => void;
}

/** A session in the room (FR-MS6): Hermes, or a friend. `seated` is false for friends beyond the seats. */
export interface PanelSession {
  readonly key: string;
  readonly kind: SourceKind;
  readonly ordinal: number;
  readonly visual: VisualState;
  readonly seated: boolean;
}

export interface ActivityPanelProps {
  readonly entries: readonly RoomEntry[];
  readonly onClose: () => void;
  readonly formatTime?: (at: number) => string;
  /** Present only while a demo source runs. */
  readonly demo?: DemoPicker;
  /** 자동 / 실제 / 데모 (FR-CC4). */
  readonly view?: ViewPicker;
  /** Energy and context numbers (FR-V5). The scene never shows numbers; this panel does. */
  readonly vitals?: Vitals;
  readonly budget?: BudgetPicker;
  readonly pet?: PetPanel;
  /** Who is in the room, Hermes first (FR-MS6). */
  readonly sessions?: readonly PanelSession[];
}

const HEART = 'M8 14 C8 14 1.5 9.8 1.5 5.6 C1.5 3.4 3.2 2 5 2 C6.4 2 7.4 2.8 8 3.8 C8.6 2.8 9.6 2 11 2 C12.8 2 14.5 3.4 14.5 5.6 C14.5 9.8 8 14 8 14 Z';

function PetSection({ pet }: { pet: PetPanel }) {
  // Follow outside name changes without an effect (React: "adjusting state when a prop changes").
  const [draft, setDraft] = useState(pet.name);
  const [savedName, setSavedName] = useState(pet.name);
  if (pet.name !== savedName) {
    setSavedName(pet.name);
    setDraft(pet.name);
  }
  const commit = () => {
    if (draft !== pet.name) pet.onRename(draft);
  };
  return (
    <div className="activity-panel__pet" role="group" aria-label="펫">
      <div className="pet__row">
        <input
          className="pet__name"
          aria-label="이름"
          placeholder="헤르메스"
          maxLength={12}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
          }}
        />
        {pet.demo && <span className="pet__demo">DEMO</span>}
        <span className="pet__hearts" role="img" aria-label={`애정도 하트 5개 중 ${pet.hearts}개`}>
          {[0, 1, 2, 3, 4].map((index) => (
            <svg key={index} viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false" data-filled={index < pet.hearts}>
              <path d={HEART} />
            </svg>
          ))}
        </span>
      </div>
      <div className="pet__actions">
        <button type="button" className="chip" onClick={pet.onPet}>
          쓰다듬기
        </button>
        <button
          type="button"
          className="chip"
          onClick={pet.onFeed}
          disabled={pet.snacksLeft === 0}
          aria-label={`간식 주기, 오늘 ${pet.snacksLeft}개 남음`}
        >
          간식 주기 · {pet.snacksLeft}
        </button>
      </div>
    </div>
  );
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

/** Everyone in the room and their state, in fixed copy (FR-MS6, FR-P4). */
function SessionsSection({ sessions }: { sessions: readonly PanelSession[] }) {
  return (
    <div className="activity-panel__sessions" role="group" aria-label="방에 있는 세션">
      <span className="activity-panel__heading">방에 있는 세션</span>
      <ul className="sessions__list">
        {sessions.map((session) => {
          const spec = VISUAL_SPEC[session.visual];
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
              <span className="session__state">{spec.label}</span>
              {!session.seated && <span className="session__away">(자리 없음)</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A small log screen pinned to the wall: recent facts, newest first (FR-P1–P4). Read-only. */
export function ActivityPanel({ entries, onClose, formatTime = formatClock, demo, view, vitals, budget, pet, sessions }: ActivityPanelProps) {
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
      {pet && <PetSection pet={pet} />}
      {vitals && <VitalsSection vitals={vitals} budget={budget} />}
      {sessions && <SessionsSection sessions={sessions} />}
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
