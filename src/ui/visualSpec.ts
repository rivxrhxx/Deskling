import type { VisualState } from '../core/agentEvent';

/**
 * Single source of truth for how each visual state looks (docs/DESIGN.md §4).
 * States differ by pose, icon, screen and text — never by colour alone (FR-S3).
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

export type PoseId =
  | 'asleep-in-bed'
  | 'lounging'
  | 'pondering'
  | 'typing'
  | 'scrolling'
  | 'leaning-in'
  | 'holding-folder'
  | 'raising-hand'
  | 'pointing'
  | 'cheering'
  | 'distressed';

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

export type Gaze = 'monitor' | 'viewer' | 'closed' | 'up';

/** Where the character is in the room (ADR-017). Derived from the state only — never from elapsed time. */
export type Place = 'desk' | 'bed';

export interface VisualSpec {
  /** Short status text shown in the bubble. */
  readonly label: string;
  /** Longer accessible description of what the fact means. Never speculates. */
  readonly description: string;
  readonly icon: IconId;
  readonly pose: PoseId;
  readonly tone: Tone;
  readonly screen: ScreenId;
  readonly gaze: Gaze;
  readonly place: Place;
}

export const VISUAL_SPEC: Readonly<Record<VisualState, VisualSpec>> = Object.freeze({
  offline: {
    label: '오프라인',
    description: '에이전트와 연결되어 있지 않습니다.',
    icon: 'plug',
    pose: 'asleep-in-bed',
    tone: 'dim',
    screen: 'off',
    gaze: 'closed',
    place: 'bed',
  },
  idle: {
    label: '대기 중',
    description: '에이전트가 연결되어 있고 진행 중인 작업이 없습니다.',
    icon: 'cup',
    pose: 'lounging',
    tone: 'cool',
    screen: 'screensaver',
    gaze: 'up',
    place: 'bed',
  },
  thinking: {
    label: '생각 중',
    description: '작업이 진행 중이며 실행 중인 도구는 없습니다.',
    icon: 'dots',
    pose: 'pondering',
    tone: 'violet',
    screen: 'editor-dim',
    gaze: 'up',
    place: 'desk',
  },
  coding: {
    label: '코딩 중',
    description: '코드 편집 도구가 실행 중입니다.',
    icon: 'brackets',
    pose: 'typing',
    tone: 'cool',
    screen: 'editor',
    gaze: 'monitor',
    place: 'desk',
  },
  browsing: {
    label: '웹 탐색 중',
    description: '웹 탐색 도구가 실행 중입니다.',
    icon: 'globe',
    pose: 'scrolling',
    tone: 'cool',
    screen: 'browser',
    gaze: 'monitor',
    place: 'desk',
  },
  terminal: {
    label: '터미널 작업 중',
    description: '터미널 도구가 실행 중입니다.',
    icon: 'prompt',
    pose: 'leaning-in',
    tone: 'cool',
    screen: 'terminal',
    gaze: 'monitor',
    place: 'desk',
  },
  'file-work': {
    label: '파일 작업 중',
    description: '파일 도구가 실행 중입니다.',
    icon: 'folder',
    pose: 'holding-folder',
    tone: 'cool',
    screen: 'files',
    gaze: 'monitor',
    place: 'desk',
  },
  'waiting-approval': {
    label: '승인 대기 중',
    description: '에이전트가 사용자 승인을 기다리고 있습니다. 승인은 에이전트 화면에서 직접 하세요.',
    icon: 'hand',
    pose: 'raising-hand',
    tone: 'amber',
    screen: 'dialog',
    gaze: 'viewer',
    place: 'desk',
  },
  delegated: {
    label: '위임됨',
    description: '하위 에이전트가 작업을 맡아 진행 중입니다.',
    icon: 'branch',
    pose: 'pointing',
    tone: 'violet',
    screen: 'handoff',
    gaze: 'monitor',
    place: 'desk',
  },
  success: {
    label: '완료',
    description: '마지막 작업이 성공으로 끝났습니다.',
    icon: 'check',
    pose: 'cheering',
    tone: 'mint',
    screen: 'check',
    gaze: 'viewer',
    place: 'desk',
  },
  error: {
    label: '오류',
    description: '마지막 작업이 실패로 끝났습니다.',
    icon: 'alert',
    pose: 'distressed',
    tone: 'ember',
    screen: 'alert',
    gaze: 'viewer',
    place: 'desk',
  },
});
