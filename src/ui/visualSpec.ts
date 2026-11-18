import type { VisualState } from '../core/agentEvent';

/**
 * Single source of truth for each visual state's text, icon, tone and monitor (docs/DESIGN.md §4).
 * What Hermes does and where is the life engine's job (src/core/life.ts, ADR-020).
 * States differ by Hermes' action, icon, screen and text — never by colour alone (FR-S3).
 * All text here is fixed copy; nothing comes from events.
 */

export type Tone = 'dim' | 'cool' | 'violet' | 'amber' | 'ember' | 'mint';

export type IconId =
  | 'plug'
  | 'cup'
  | 'dots'
  | 'brackets'
  | 'globe'
  | 'prompt'
  | 'folder'
  | 'hand'
  | 'branch'
  | 'check'
  | 'alert';

export type ScreenId =
  | 'off'
  | 'screensaver'
  | 'editor-dim'
  | 'editor'
  | 'browser'
  | 'terminal'
  | 'files'
  | 'dialog'
  | 'handoff'
  | 'check'
  | 'alert';

export interface VisualSpec {
  /** Short status text shown in the bubble. */
  readonly label: string;
  /** Longer accessible description of what the fact means. Never speculates. */
  readonly description: string;
  readonly icon: IconId;
  readonly tone: Tone;
  readonly screen: ScreenId;
}

export const VISUAL_SPEC: Readonly<Record<VisualState, VisualSpec>> = Object.freeze({
  offline: {
    label: '오프라인',
    description: '에이전트와 연결되어 있지 않습니다.',
    icon: 'plug',
    tone: 'dim',
    screen: 'off',
  },
  idle: {
    label: '대기 중',
    description: '에이전트가 연결되어 있고 진행 중인 작업이 없습니다.',
    icon: 'cup',
    tone: 'cool',
    screen: 'screensaver',
  },
  thinking: {
    label: '생각 중',
    description: '작업이 진행 중이며 실행 중인 도구는 없습니다.',
    icon: 'dots',
    tone: 'violet',
    screen: 'editor-dim',
  },
  coding: {
    label: '코딩 중',
    description: '코드 편집 도구가 실행 중입니다.',
    icon: 'brackets',
    tone: 'cool',
    screen: 'editor',
  },
  browsing: {
    label: '웹 탐색 중',
    description: '웹 탐색 도구가 실행 중입니다.',
    icon: 'globe',
    tone: 'cool',
    screen: 'browser',
  },
  terminal: {
    label: '터미널 작업 중',
    description: '터미널 도구가 실행 중입니다.',
    icon: 'prompt',
    tone: 'cool',
    screen: 'terminal',
  },
  'file-work': {
    label: '파일 작업 중',
    description: '파일 도구가 실행 중입니다.',
    icon: 'folder',
    tone: 'cool',
    screen: 'files',
  },
  'waiting-approval': {
    label: '승인 대기 중',
    description: '에이전트가 사용자 승인을 기다리고 있습니다. 승인은 에이전트 화면에서 직접 하세요.',
    icon: 'hand',
    tone: 'amber',
    screen: 'dialog',
  },
  delegated: {
    label: '위임됨',
    description: '하위 에이전트가 작업을 맡아 진행 중입니다.',
    icon: 'branch',
    tone: 'violet',
    screen: 'handoff',
  },
  success: {
    label: '완료',
    description: '마지막 작업이 성공으로 끝났습니다.',
    icon: 'check',
    tone: 'mint',
    screen: 'check',
  },
  error: {
    label: '오류',
    description: '마지막 작업이 실패로 끝났습니다.',
    icon: 'alert',
    tone: 'ember',
    screen: 'alert',
  },
});
