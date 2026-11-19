import type { ToolCategory } from '../core/agentEvent';
import type { RecentEntry } from '../core/agentState';
import type { OfficeDecorId } from '../core/growth';
import type { Vitals } from '../core/mood';
import type { OfficeCounts, RoomEntry } from '../core/roomState';
import { sessionLabel } from '../core/roomState';
import type { IconId, Tone } from './visualSpec';

/**
 * Fixed copy for the activity panel, built only from protocol enums (FR-P4).
 * Nothing an agent sends can change these strings.
 */

const TOOL_LABEL: Readonly<Record<ToolCategory, string>> = {
  code: '코드 편집',
  browser: '웹 탐색',
  terminal: '터미널',
  file: '파일 작업',
};

const toolLabel = (tool: ToolCategory | undefined) => (tool ? TOOL_LABEL[tool] : '도구');

export type ActivityKind = 'info' | 'attention' | 'error';

export function describeActivity(entry: RecentEntry): string {
  switch (entry.type) {
    case 'agent.online':
      return '에이전트 연결됨';
    case 'agent.offline':
      return '에이전트 연결 끊김';
    case 'agent.idle':
      return '대기 상태로 전환';
    case 'turn.started':
      return '작업 시작';
    case 'tool.started':
      return `${toolLabel(entry.tool)} 시작`;
    case 'tool.finished':
      return `${toolLabel(entry.tool)} ${entry.outcome === 'error' ? '실패' : '완료'}`;
    case 'approval.requested':
      return '승인 요청됨';
    case 'approval.resolved':
      return '승인 요청 처리됨';
    case 'delegation.started':
      return '하위 에이전트에 위임';
    case 'delegation.finished':
      return '위임 작업 종료';
    case 'turn.succeeded':
      return '작업 완료';
    case 'turn.failed':
      return '작업 실패';
    case 'usage.reported':
      return '사용량 보고';
    case 'session.message':
      return '메시지 보냄';
  }
}

/**
 * A recent line that says which session it is about (FR-MS6): "Claude 1 · 코드 편집 시작".
 * A message says only who wrote to whom — "Claude 1 → Codex 1 메시지" — or "Claude 1 메시지 보냄"
 * when the receiver is unknown or was not in the room (ADR-023).
 */
export function describeRoomActivity(entry: RoomEntry): string {
  const who = sessionLabel(entry);
  if (entry.type === 'session.message') {
    return entry.receiver ? `${who} → ${sessionLabel(entry.receiver)} 메시지` : `${who} 메시지 보냄`;
  }
  return `${who} · ${describeActivity(entry)}`;
}

export function activityKind(entry: RecentEntry): ActivityKind {
  if (entry.type === 'turn.failed' || (entry.type === 'tool.finished' && entry.outcome === 'error')) return 'error';
  if (entry.type === 'approval.requested') return 'attention';
  return 'info';
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Local 24-hour HH:MM:SS. */
export function formatClock(at: number): string {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 1500 → "1.5k", 80000 → "80k", 2250000 → "2.3M". Token counts only. */
export function formatTokens(value: number): string {
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (value >= 1_000_000) return `${trim(value / 1_000_000)}M`;
  if (value >= 1_000) return `${trim(value / 1_000)}k`;
  return String(value);
}

/**
 * A member's reported numbers in fixed form (FR-V5, ADR-025 §6): "남은 80k · 컨텍스트 70%".
 * Only what was reported; null when nothing was.
 */
export function describeUsage(vitals: Vitals): string | null {
  const parts: string[] = [];
  if (vitals.energy.remaining !== null) parts.push(`남은 ${formatTokens(vitals.energy.remaining)}`);
  if (vitals.anger.ratio !== null) parts.push(`컨텍스트 ${Math.round(vitals.anger.ratio * 100)}%`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Which part of the office summary leads, most urgent first (ADR-025 §5). */
export type OfficeState = 'waiting' | 'failing' | 'working' | 'resting' | 'empty';

const OFFICE_PARTS: ReadonlyArray<readonly [Exclude<keyof OfficeCounts, 'total'>, string]> = [
  ['working', '일하는 중'],
  ['waiting', '승인 대기'],
  ['failing', '오류'],
  ['resting', '쉬는 중'],
];

/** The office summary's fixed copy (ADR-025 §5): "3명 일하는 중 · 1명 승인 대기", or "아무도 없음". Counts only. */
export function describeOffice(counts: OfficeCounts): string {
  if (counts.total === 0) return '아무도 없음';
  return OFFICE_PARTS.filter(([part]) => counts[part] > 0)
    .map(([part, text]) => `${counts[part]}명 ${text}`)
    .join(' · ');
}

const OFFICE_LOOK: Readonly<Record<OfficeState, { readonly tone: Tone; readonly icon: IconId }>> = {
  waiting: { tone: 'amber', icon: 'hand' },
  failing: { tone: 'ember', icon: 'alert' },
  working: { tone: 'cool', icon: 'brackets' },
  resting: { tone: 'mint', icon: 'cup' },
  empty: { tone: 'dim', icon: 'plug' },
};

/** The summary's state, tone and icon: anyone waiting first, then a failure, then work, then rest. */
export function officeLook(counts: OfficeCounts): { readonly state: OfficeState; readonly tone: Tone; readonly icon: IconId } {
  let state: OfficeState = 'resting';
  if (counts.total === 0) state = 'empty';
  else if (counts.waiting > 0) state = 'waiting';
  else if (counts.failing > 0) state = 'failing';
  else if (counts.working > 0) state = 'working';
  return { state, ...OFFICE_LOOK[state] };
}

/** Names of the office props unlocked by growth (ADR-025 §7). */
export const DECOR_LABEL: Readonly<Record<OfficeDecorId, string>> = {
  poster: '포스터',
  'desk-plants': '책상 화분',
  'string-lights': '줄 조명',
  'lounge-rug': '라운지 러그',
  'full-bookshelf': '책장 가득',
  'trophy-shelf': '트로피 선반',
};
