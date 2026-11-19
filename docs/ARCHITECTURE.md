# ARCHITECTURE — Deskling

## 1. 개요

Deskling은 Tauri 2 셸 안에서 React 프런트엔드가 동작하는 데스크톱 앱이다.
데이터는 한 방향으로만 흐른다: **이벤트 소스 → 정규화 → 리듀서 → 사무실 엔진 → React 렌더링**.
앱에서 에이전트 쪽으로 가는 경로는 없다(관찰 전용). Rust는 소켓에서 **받기만** 하고, webview는 Tauri 이벤트를 **듣기만** 한다.

```
 ┌──────────────────────── 신뢰하지 않는 영역 ─────────────────────────┐
 │ Claude Code 훅                 Codex 훅                            │
 │   integrations/claude-code/      integrations/codex/              │
 │   deskling-hook.mjs              deskling-codex-hook.mjs          │
 │   - stdin JSON에서 세션 id·이벤트 이름·도구 이름만 읽고              │
 │     훅 레코드 v1 한 줄 {v, agent, session, event, tool?, ok?, at}  │
 │   - 출력 없음, 항상 exit 0, 300ms 상한                              │
 └──────────────┬──────────────────────────────────────────────────────┘
                │ Unix 소켓 ~/Library/Application Support/com.deskling.desktop/agent-events.sock (0600, 폴더 0700)
                ▼
 ┌──────────────── 신뢰 경계 1: src-tauri/src/hook_bridge.rs ─────────┐
 │ serde deny_unknown_fields, enum·세션 형식·시각 검증, 1KiB·200ms·    │
 │ 초당 50개 상한 → 통과한 레코드만 다시 직렬화                         │
 │ → Tauri 이벤트 deskling://hook-record (거부는 코드 카운터만)         │
 └──────────────┬──────────────────────────────────────────────────────┘
                │ payload: unknown
                ▼
 src/platform/hookRecords.ts  listenHookRecords()       (Tauri 밖이면 no-op)
                │
                ▼
 src/adapters/claudeCode/  translateHookRecord()  훅 레코드 → AgentEvent v3 후보
   (두 agent를 한 리스너에서, 세션별 seq, kind = claude-code | codex)
                │                         src/adapters/demo/  결정적 스크립트 재생
                │ unknown                         │ unknown
                ▼                                 ▼
 ┌──────────────── 신뢰 경계 2: src/core/normalize.ts ────────────────┐
 │ normalizeAgentEvent() 화이트리스트 필드만 새 동결 객체로 복사        │
 │ 실패 시 에러 코드만 반환 (입력값 미포함)                             │
 └──────────────┬──────────────────────────────────────────────────────┘
                │ AgentEvent (검증·정규화·동결됨)
                ▼
 src/core/roomState.ts  reduceRoom()   세션마다 reduceAgentState()   ← 순수 함수
                │ RoomViewState { sessions, memberKeys, conversations, recent, completedTurns, … }
                ▼
 src/app/  useAgentFeed() ×2 (데모 피드 + 실제 피드) → 보기 선택 → useOffice() · useOfficeProgress()
                │ 직원 위치·활동·이모트, 소품, 세션별 에너지·화남, 설정
                ▼
 src/ui/   OfficeRoom(SVG), StatusBubble, AttentionLine, DemoBadge, ActivityPanel, WindowToolbar
                │ 사용자 조작(크기·투명도·위에 띄우기·모션·드래그·닫기)
                ▼
 src/platform/windowControls.ts  → @tauri-apps/api window → Tauri 창
```

## 2. 레이어

| 레이어 | 경로 | 책임 | import 금지 |
| --- | --- | --- | --- |
| core | `src/core/` | `AgentEvent` 타입, 정규화, 리듀서, 사무실 엔진, 방 배치·길찾기, 분위기·성장 규칙 | react, `@tauri-apps/*`, adapters, app, ui, platform |
| adapters | `src/adapters/` | `AgentEventSource` 구현(demo, claudeCode — Claude Code·Codex 훅 레코드 번역) | react, ui, app, platform |
| platform | `src/platform/` | 네이티브 창 제어, 훅 레코드 수신. `@tauri-apps/*`를 쓰는 유일한 프런트엔드 폴더 | ui, adapters, app |
| app | `src/app/` | 소스·정규화·리듀서·사무실 엔진·UI 조립, 설정·경험치 저장, 모션 선호 | `@tauri-apps/*` (platform 경유) |
| ui | `src/ui/` | 순수 표현 컴포넌트, 시각 사양, 고정 문구 | `@tauri-apps/*`, adapters, platform, app |
| native | `src-tauri/` | Tauri 셸, 창 설정, capability, 훅 레코드 Unix 소켓 브리지 | — |
| integrations | `integrations/` | 앱 밖에서 도는 훅 스크립트(의존성 없음)와 동의 후에만 쓰는 설치기 | 앱 소스 import 없음 |

경계는 `eslint.config.js`의 `no-restricted-imports`로 강제하고 `src/config/boundaries.test.ts`가 규칙 자체를 검사한다.

## 3. 핵심 모듈

### 3.1 이벤트 규격 — `src/core/agentEvent.ts`
규격 상수(`EVENT_TYPES`, `TOOL_CATEGORIES`, `SOURCE_KINDS`, `VISUAL_STATES`)와 타입. 버전 1–3을 받는다.
상세는 `docs/EVENT_PROTOCOL.md`.

### 3.2 정규화 — `src/core/normalize.ts`, `src/core/ingest.ts`
- `normalizeAgentEvent(input: unknown)`: 성공이면 `{ ok: true, event }`(새 동결 객체, 규격 필드만), 실패면 `{ ok: false, error }`(에러 코드 문자열만).
- `createIngest(dispatch, onReject)`: 원시 입력을 정규화해 성공하면 dispatch, 실패하면 에러 코드만 onReject로 넘긴다.

### 3.3 세션 리듀서 — `src/core/agentState.ts`, `src/core/roomState.ts`
- `reduceAgentState(state, event)`: 세션 하나의 사실(연결, 진행 중 턴, 실행 중 도구 스택, 승인 대기, 위임 수, 마지막 결과, 사용량)을 갱신하고
  `deriveVisualState()`가 우선순위 규칙으로 시각 상태 하나를 계산한다(EVENT_PROTOCOL §5).
- `reduceRoom(state, event)`: `sessionKey(source)`로 세션을 나눠 각자의 `reduceAgentState`에 넘긴다(ADR-022).
  세션별 `(session, seq)` 커서, 도착 순서 `memberKeys`, 종류 안 번호(`ordinal`), 끝난 세션 커서 64개, 최근 대화 8개(`session.message`),
  세션 이름이 붙은 최근 활동 12개, 수용된 `turn.succeeded` 수(`completedTurns`).
- `sessionLabel()`: "Claude n" / "Codex n" / "Hermes n" / "데모 n" / "에이전트 n". `officeCounts()`: 요약 말풍선용 일하는 중·승인 대기·오류·쉬는 중 수.

### 3.4 사무실 엔진 — `src/core/office.ts`, `src/core/room.ts`
- `room.ts`: 14×12 바닥 타일, viewBox 640×420, 가구 발자국, 책상 8개(`DESK_IDS`)와 라운지 자리 6개(`LOUNGE_SPOTS`), 문·창문,
  투영(`toScreen`, `depthOf`), 0.25 타일 격자 A* + 줄 당기기(`pathBetween`). 밖으로 가는 길은 문을 지난다.
- `office.ts`: 순수·시드 고정 엔진. `stepOffice(state, { members, conversations, now, … })`가 직원별 걷기·자리·활동을 갱신하고
  `memberViewsAt(state, now)`가 그 순간의 위치·활동·이모트를 낸다.
  입장 → 비어 있는 가장 작은 번호 책상, 대기 1.5초 뒤 라운지, 성공 환호 3초, 대화 4초/편지 3초, 퇴장은 문으로.
  시각 상태를 바꾸지 않는다 — 상태는 리듀서가 정하고 엔진은 **어디서 어떤 자세로** 보일지만 정한다(ADR-025 §3).

### 3.5 분위기와 성장 — `src/core/mood.ts`, `src/core/growth.ts`
- `deriveVitals(usage, budget)`: 세션이 보고한 토큰·컨텍스트 숫자 → 에너지(full/ok/low/empty)·화남(calm/annoyed/angry/furious), 보고 없으면 unknown.
- `OFFICE_DECOR`, `unlockedDecor(xp)`, `nextUnlock(xp)`: 경험치 2·4·7·10·15·25에서 포스터·책상 화분·줄 조명·라운지 러그·책장 가득·트로피 선반.
- `memberLevel(xp)`: 한 직원의 경험치(그 세션의 완료 수) → 레벨(n은 누적 n(n−1)/2부터, 최대 `MAX_LEVEL` 99)과 이번·다음 레벨 경계(ADR-028).
  방 상태는 세션별 완료 수 `completedBy`(떠난 세션 포함 최근 64개)를 세고, 사무실 엔진은 레벨이 오르면 `LEVEL_UP_MS` 동안 `levelUp`을 켠다.

### 3.6 이벤트 소스 — `src/adapters/`
```ts
interface AgentEventSource {
  readonly mode: 'demo' | 'live';
  start(emit: (raw: unknown) => void): () => void; // 반환값 = stop
}
```
Adapter는 원시 객체를 내보낸다. 정규화는 adapter를 신뢰하지 않고 core가 다시 한다.

- `demo/scripts.ts`: `office`(기본, Claude 3 + Codex 2 + 에이전트 1, 92초), `core`, `tour`, `life`. 단계 = `{ dwellMs, events[] }`, 세션별 seq.
- `demo/demoSource.ts`: 주입된 스케줄러·시계로 스크립트를 재생하고 끝나면 반복. `seq`는 반복해도 계속 증가.
- `claudeCode/translate.ts`: `translateHookRecord(state, raw)` — 훅 레코드를 다시 검증하고 AgentEvent v3로 번역한다(ADR-024 §5, ADR-026 §2).
  번역기 상태는 `${agent}:${session}` 키, 이벤트 id 접두사 `cc-`/`cx-`. 중단(`interrupt`)은 승인 대기 해제 + `agent.idle`.
- `claudeCode/source.ts`: `createClaudeCodeSource(listen)` — 리스너 하나로 두 agent를 받는다. 번역기 상태는 소스 인스턴스에 있어
  StrictMode의 stop/start에도 세션별 seq가 계속 증가한다.

### 3.7 플랫폼 — `src/platform/`
```ts
interface WindowControls {
  startDragging(): Promise<void>;
  setAlwaysOnTop(on: boolean): Promise<void>;
  setAlwaysOnBottom(on: boolean): Promise<void>; // 바탕화면 층(ADR-021)
  setSize(width: number, height: number): Promise<void>; // 논리 픽셀
  close(): Promise<void>;
}
```
- `windowControls.ts`: Tauri 런타임이면 `@tauri-apps/api/window` 구현, 아니면(브라우저·테스트) no-op. 실패는 삼키고 경고만.
- `hookRecords.ts`: `listenHookRecords(onRecord)` — `deskling://hook-record`를 듣는다. Tauri 밖이거나 실패하면 no-op unlisten.

### 3.8 조립 — `src/app/`
- `App.tsx`: 최상위 조립. `source`, `controls`, `storage`, `liveListen`을 주입받아 테스트 가능.
  두 피드를 항상 접는다 — 데모(또는 주입된 소스)와 실제(`createClaudeCodeSource`). 보기 선택(자동/실제/데모)은 어느 쪽을 **보여줄지**만 정한다.
  자동 = 실제 피드에 수용된 이벤트가 생기기 전까지 데모. 보이는 피드가 바뀌면 사무실을 새로 만든다(`key`).
- `useAgentFeed.ts`: 소스 구독 → ingest → `reduceRoom`. layout effect에서 시작하고, stop 이후 늦게 온 입력은 정규화하지 않고 버린다.
- `useOffice.ts`: 사무실 엔진에 시계와 300ms 틱을 공급한다. 상태 변화는 틱을 기다리지 않고 그리기 전에 반영하고, reduced-motion이면 순간 이동.
- `useOfficeProgress.ts`, `officeProgress.ts`: `completedTurns`·`completedBy` 증가분 → 사무실 경험치와 직원별 경험치(ADR-028). 피드마다 본 수를 따로 기억해 두 번 세지 않는다.
  데모/실제 따로 `deskling.office.v1`에 저장 — 직원은 세션 키의 FNV-1a 해시 id로, 모드마다 최근 64명(예전 `deskling.pet.v1`은 한 번 읽기만).
- `settings.ts`: 크기·투명도·위에 띄우기·모션·토큰 예산·보기·데모 시나리오 검증·로드·저장(`deskling.settings.v1`, try/catch, 기본값 폴백).
- `useReducedMotion.ts`: `prefers-reduced-motion` 구독 + 사용자 설정 결합. `ErrorBoundary.tsx`: 렌더 오류 시 고정 대체 화면.

### 3.9 표현 — `src/ui/`
- `visualSpec.ts`: 상태별 라벨·설명·아이콘·톤·모니터 화면 표(단일 진실 공급원). DESIGN §4·§3.3·§4.2 표와 테스트로 대조.
- `activityText.ts`: 패널·요약·알림 줄의 고정 문구(`describeOffice`, `describeRoomActivity`, `describeUsage`, `officeLook`).
- `office/`: `OfficeRoom`(셸·가구·직원·소품 합성), `Shell`, `Furniture`, `Member`, `MonitorScreen`, `IsoBox`, `PixelSprite`,
  순수 함수 `pose`·`emote`·`deskFrame`·`isoMath`, ASCII 픽셀 맵 `sprites`(모습 3종 × 포즈 20개, 도우미 봇, 이모트), 3×5 픽셀 글자 `pixelText`.
  `LevelBadge`(직원 레벨 배지)와 "LEVEL UP!"은 가구 위 맨 앞 층에 그린다(ADR-028).
- `StatusBubble`(사무실 요약 + 패널 버튼), `AttentionLine`(승인 대기·오류 직원 이름), `DemoBadge`, `ActivityPanel`, `WindowToolbar`, `icons`.

## 4. 네이티브 (src-tauri)

- `tauri.conf.json`: `transparent: true`, `decorations: false`, `alwaysOnTop: false`, `shadow: false`, `visibleOnAllWorkspaces: true`,
  기본 640×440(ADR-025 §2), `app.macOSPrivateApi: true`(ADR-007), 엄격한 CSP(`ipc:`만 연결).
- `capabilities/default.json`: 창 권한 5개(드래그·항상 위·항상 아래·크기·닫기)와 `core:event:allow-listen`·`allow-unlisten`. `core:default`·emit·셸·파일시스템 없음(SEC-5).
- `lib.rs`: macOS `ActivationPolicy::Accessory`(Dock·⌘Tab 없음), unix에서 `hook_bridge::start`. 로그 플러그인 없음(ADR-009).
- `hook_bridge.rs`: 앱 데이터 폴더(0700)에 소켓(0600)을 만든다. 살아 있는 소켓이 이미 있으면 다른 인스턴스로 보고 물러나고,
  소켓이 아닌 파일이면 건드리지 않는다. 연결 하나 = 레코드 한 줄. 검증 실패는 거부 코드별 카운터만 올린다.
  소켓을 못 만들면 실제 세션이 없을 뿐 앱은 그대로 동작한다.

## 5. 외부 연동 (integrations/)

| 폴더 | 파일 | 역할 |
| --- | --- | --- |
| `shared/` | `sendRecord.mjs`, `socketPath.mjs`, `hooksFile.mjs` | stdin 읽기·소켓 쓰기·시간 상한, 소켓 경로(`DESKLING_SOCKET` 또는 기본), 훅 파일 병합·백업, 안정적인 Node 경로 |
| `claude-code/` | `hookRecord.mjs`, `deskling-hook.mjs`, `install.mjs` | Claude Code 훅 → 레코드 매핑, 훅 진입점, `~/.claude/settings.json` 설치기 |
| `codex/` | `codexRecord.mjs`, `deskling-codex-hook.mjs`, `install.mjs` | Codex 훅 → 레코드 매핑, 훅 진입점, `~/.codex/hooks.json` 설치기 |

설치기는 `print`(기본, 아무것도 안 씀) / `status` / `install` / `uninstall`. 쓰기 전에 백업을 만들고 다른 도구의 훅은 그대로 둔다.
매핑 표와 한계는 `docs/integrations/CLAUDE_CODE.md`, `docs/integrations/CODEX.md`.

## 6. 테스트 가능성

- core·adapters는 DOM 없이 단위 테스트한다. 사무실 엔진은 시드·시각을 넣어 재현한다.
- 데모와 사무실 틱은 `vi.useFakeTimers()`와 주입 시계로 시간을 제어한다.
- App은 `source`·`controls`·`storage`·`liveListen`을 주입해 RTL로 통합 테스트한다(실제 피드는 가짜 리스너로 훅 레코드를 흘린다).
- `tauri.conf.json`과 capability는 JSON import로, CSS 계약은 `src/styles/styles.test.ts`로 검사한다.
- Rust 브리지는 `cargo test`(검증 규칙·재직렬화·소켓 수명), 훅 스크립트·설치기는 `node --test`가 아니라 Vitest로 같은 `npm run test`에서 돈다.

## 7. 다음 provider (Hermes 등) 배치

1. ADR로 전송 방식(같은 소켓 + 새 `agent` 값 / 별도 경로)과 인증을 정한다. Hermes Agent는 다른 머신에서 돌 수 있다.
2. 같은 소켓을 쓰면: 훅 레코드 `agent` enum과 Rust `Agent`에 값을 더하고, 번역기는 그 값을 `source.kind`로 쓴다. UI는 바뀌지 않는다.
3. provider 이름과 매핑 표는 `integrations/<provider>/`와 `src/adapters/`에만 둔다. UI는 `source.kind`로 모습·이름표만 고른다(AGENTS.md §1.5).
