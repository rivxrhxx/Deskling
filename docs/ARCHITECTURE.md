# ARCHITECTURE — Deskling

## 1. 개요

Deskling은 Tauri 2 셸 안에서 React 프런트엔드가 동작하는 데스크톱 앱이다.
데이터는 한 방향으로만 흐른다: **이벤트 소스 → 정규화 → 리듀서 → 시각 상태 → React 렌더링**.
앱에서 에이전트 쪽으로 가는 경로는 없다(관찰 전용).

```
 ┌──────────────── 신뢰하지 않는 영역 ────────────────┐
 │ Provider (향후 Hermes Agent 등)                    │
 │        │ provider 고유 이벤트                       │
 │        ▼                                           │
 │ Adapter (src/adapters/<provider>, 향후 Rust)        │
 │   - provider 이벤트 → AgentEvent 후보(원시 객체)     │
 │   - 민감 데이터는 여기서 버리고 넘기지 않는다         │
 └────────┬──────────────────────────────────────────┘
          │ unknown (원시 입력)
          ▼
 ┌──────────────── 신뢰 경계 ─────────────────────────┐
 │ src/core/normalize.ts   normalizeAgentEvent()      │
 │   - 화이트리스트 필드만 새 객체로 복사                │
 │   - 실패 시 에러 코드만 반환 (입력값 미포함)          │
 └────────┬──────────────────────────────────────────┘
          │ AgentEvent (검증·정규화·동결됨)
          ▼
 src/core/agentState.ts   reduceAgentState(state, event)   ← 순수 함수
          │ AgentViewState { visual, recent, ... }
          ▼
 src/app/  useAgentFeed() · useLife() · usePet() → <App/>  (조립, 설정)
          │ visual state, Hermes/friend 위치, recent entries, settings
          ▼
 src/ui/   MiniRoom(SVG), StatusBubble, DemoBadge, ActivityPanel, WindowToolbar
          │ 사용자 조작(크기·투명도·항상 위·드래그·닫기)
          ▼
 src/platform/windowControls.ts  → @tauri-apps/api window  → Tauri 창
```

## 2. 레이어

| 레이어 | 경로 | 책임 | import 금지 |
| --- | --- | --- | --- |
| core | `src/core/` | `AgentEvent` 타입, 정규화, 리듀서, ingest | react, `@tauri-apps/*`, adapters, app, ui, platform |
| adapters | `src/adapters/` | `AgentEventSource` 구현(demo; 향후 hermes) | react, ui, app, platform |
| platform | `src/platform/` | 네이티브 창 제어 인터페이스와 Tauri/no-op 구현 | ui, adapters, app |
| app | `src/app/` | 소스·정규화·리듀서·UI 조립, 설정 저장, 모션 선호 | `@tauri-apps/*` (platform 경유) |
| ui | `src/ui/` | 순수 표현 컴포넌트, 시각 사양, 고정 문구 | `@tauri-apps/*`, adapters, platform, app |
| native | `src-tauri/` | Tauri 셸, 창 설정, capability | — |

경계는 `eslint.config.js`의 `no-restricted-imports`로 강제한다.

## 3. 핵심 모듈

### 3.1 `src/core/agentEvent.ts`
규격 상수(`EVENT_TYPES`, `TOOL_CATEGORIES`, `SOURCE_KINDS`, `VISUAL_STATES`)와 타입. 규격 상세는 `docs/EVENT_PROTOCOL.md`.

### 3.2 `src/core/normalize.ts`
`normalizeAgentEvent(input: unknown): NormalizeResult`
- 성공: `{ ok: true, event }` — 새로 만든 동결 객체, 규격 필드만 포함.
- 실패: `{ ok: false, error: NormalizeError }` — 에러 코드 문자열만.

### 3.3 `src/core/agentState.ts`
`reduceAgentState(state, event): AgentViewState` — 순수 함수.
내부 사실(연결, 진행 중 턴, 실행 중 도구 스택, 승인 대기, 위임 수, 마지막 결과)을 갱신하고
`deriveVisualState()`가 우선순위 규칙으로 시각 상태 하나를 계산한다(규칙은 EVENT_PROTOCOL §5).

### 3.3.1 피드 수명
`useAgentFeed`는 소스를 layout effect에서 시작하고(첫 이벤트가 그려지기 전에 적용), cleanup 이후 같은 소스가 늦게 보낸 원시 입력은 정규화하지 않고 버린다. 소스가 바뀌면 상태는 초기값에서 다시 시작한다.

### 3.3.2 분위기와 키우기 (ADR-016, ADR-018)
- `src/core/mood.ts`: 사용량 스냅샷 + 예산 → 에너지·화남 단계(순수).
- `src/core/growth.ts`: 경험치 → 성장 단계·해금 소품, 쓰다듬기·간식 규칙, 이름 정리(순수).
- `src/app/pet.ts`: demo/live 펫 프로필 저장(`deskling.pet.v1`). `src/app/usePet.ts`: `completedTurns` 증가분 → 경험치, 돌보기, 반응 타이머.
- 돌보기는 펫 프로필만 바꾼다. 에이전트로 가는 경로는 여전히 없다.

### 3.4 `src/core/ingest.ts`
`createIngest(dispatch, onReject)` — 원시 입력을 정규화해 성공하면 dispatch, 실패하면 에러 코드만 onReject로 넘긴다.

### 3.5 `src/adapters/types.ts`
```ts
interface AgentEventSource {
  readonly mode: 'demo' | 'live';
  start(emit: (raw: unknown) => void): () => void; // 반환값 = stop
}
```
Adapter는 원시 객체를 내보낸다. 정규화는 adapter를 신뢰하지 않고 core가 다시 한다.

### 3.6 `src/adapters/demo/`
- `scripts.ts`: `core`, `tour` 스크립트. 단계(step) = `{ dwellMs, events[] }`.
- `demoSource.ts`: 주입된 스케줄러·시계로 스크립트를 재생하고 끝나면 반복. `seq`는 반복해도 계속 증가.

### 3.7 `src/platform/windowControls.ts`
```ts
interface WindowControls {
  startDragging(): Promise<void>;
  setAlwaysOnTop(on: boolean): Promise<void>;
  setSize(width: number, height: number): Promise<void>; // 논리 픽셀
  close(): Promise<void>;
}
```
Tauri 런타임이면 `@tauri-apps/api/window` 구현, 아니면(브라우저·테스트) no-op 구현.

### 3.8 `src/app/`
- `App.tsx`: 최상위 조립. `source`, `controls`, `storage`를 주입받아 테스트 가능.
- `useAgentFeed.ts`: 소스 구독 → ingest → `useReducer`.
- `settings.ts`: 설정 검증·로드·저장(try/catch, 기본값 폴백).
- `useReducedMotion.ts`: `prefers-reduced-motion` 구독 + 사용자 설정 결합.
- `useLife.ts`: 순수 생활 엔진(`core/life.ts`)에 시계·틱(300ms)·초대를 공급한다. 에이전트 상태 변화는 그리기 전에 즉시 반영한다(ADR-020).

### 3.9 `src/ui/`
- `visualSpec.ts`: 상태별 라벨·설명·아이콘·톤·모니터 화면 표(단일 진실 공급원). 행동·장소는 `core/life.ts`.
- `miniroom/`: 픽셀 미니룸(`MiniRoom`, `Actor`, `MonitorScreen`, `IsoBox`), 순수 함수 `spriteFor`·`emoteFor`, 픽셀 맵 `sprites`.
- `StatusBubble`, `DemoBadge`, `ActivityPanel`, `WindowToolbar`, `icons`.

## 4. 네이티브 창 (src-tauri)

- `tauri.conf.json`: `transparent: true`, `decorations: false`, `alwaysOnTop: false`, `shadow: false`,
  `visibleOnAllWorkspaces: true`, 기본 480×340(ADR-021), `app.macOSPrivateApi: true`(macOS 투명 창에 필요, ADR-007).
  바탕화면 층(always on bottom)은 앱이 실행 중에 설정한다(ADR-021).
- `capabilities/default.json`: 창 드래그·항상 위·크기·닫기 권한 4개만. `core:default`는 쓰지 않는다(ADR-015).
- Rust 측은 현재 Tauri 빌더만 실행한다. 로그 플러그인을 쓰지 않는다(ADR-009).

## 5. 테스트 가능성

- core·adapters는 DOM 없이 단위 테스트한다.
- 데모는 `vi.useFakeTimers()`와 주입 시계로 시간을 제어한다.
- App은 `source`·`controls`·`storage`를 주입해 RTL로 통합 테스트한다.
- `tauri.conf.json`과 capability는 JSON import로 설정 테스트한다.

## 6. 향후 Hermes adapter 배치 (미구현)

1. ADR로 전송 방식(로컬 소켓/WebSocket/로그 tail)과 위치(Rust vs TS)를 결정한다.
   Hermes Agent는 다른 머신에서 돌 수 있으므로 전송 방식과 인증은 그 ADR에서 정한다.
2. Rust에 둘 경우: Rust가 provider 이벤트를 받아 민감 필드를 버리고 AgentEvent 후보만 Tauri 이벤트(`deskling://agent-event`)로 보낸다.
   프런트엔드 `src/adapters/tauriBridge/`가 이를 `AgentEventSource`로 감싸고, core가 **다시** 정규화한다.
3. Hermes 이름과 매핑 표는 adapter 폴더 안에만 둔다. UI는 바뀌지 않는다.
