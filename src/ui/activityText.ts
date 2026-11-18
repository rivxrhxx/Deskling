import type { ToolCategory } from '../core/agentEvent';
import type { RecentEntry } from '../core/agentState';

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
  }
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

export const ENERGY_LABEL = { unknown: '보고 없음', full: '충분', ok: '보통', low: '부족', empty: '바닥' } as const;
export const ANGER_LABEL = { unknown: '보고 없음', calm: '평온', annoyed: '짜증', angry: '화남', furious: '폭발 직전' } as const;
