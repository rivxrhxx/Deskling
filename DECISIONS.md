# DECISIONS — 설계 결정 기록 (ADR)

형식: 맥락 → 결정 → 결과(trade-off). 아키텍처 변경은 구현 **전에** 여기에 추가한다.
상태: `채택` / `대체됨(ADR-xxx)` / `폐기`.

---

## ADR-001 기술 스택 — 채택 (2026-11-18)

- **맥락:** macOS 우선 데스크톱 오버레이. 작은 메모리, 투명 창, 웹 기술로 빠른 UI 반복이 필요하다.
- **결정:** Tauri 2(Rust 셸) + React 19 + TypeScript + Vite 8. 테스트는 Vitest 5 + React Testing Library + jsdom. 린트는 ESLint 10 flat config + typescript-eslint.
- **결과:** Electron보다 가볍다. 네이티브 기능은 Tauri 플러그인·capability 범위로 제한된다.

## ADR-002 TypeScript 6.0.x 고정 — 채택 (2026-11-18)

- **맥락:** npm 최신은 TypeScript 7.0.2지만 typescript-eslint 8.73의 peer 범위는 `typescript >=4.8.4 <6.1.0`이다.
- **결정:** `typescript@~6.0.3`으로 고정한다.
- **결과:** 린트와 타입 검사가 같은 컴파일러를 쓴다. typescript-eslint가 7.x를 지원하면 ADR을 새로 써서 올린다.

## ADR-003 Provider 중립 AgentEvent v1, 자유 텍스트 없음 — 채택 (2026-11-18)

- **맥락:** 향후 Hermes Agent 등과 연결해야 하지만 UI가 provider에 묶이면 안 된다. 에이전트 이벤트에는 프롬프트·경로·명령 같은 민감 데이터가 섞이기 쉽다.
- **결정:** `docs/EVENT_PROTOCOL.md`의 작은 이벤트 집합만 정의한다. 도구는 4개 카테고리로만 표현하고, v1에는 자유 텍스트 필드가 없다. 정규화는 화이트리스트 복사다.
- **결과:** 민감 데이터가 들어올 구조적 경로가 없다. 대신 "무슨 파일을 고치는지" 같은 세부 정보는 보여줄 수 없다(의도된 제약).

## ADR-004 사실 추적 + 우선순위 도출 리듀서, 시간 기반 전환 없음 — 채택 (2026-11-18)

- **맥락:** 도구 실행·승인·위임이 겹칠 수 있다. "마지막 이벤트가 이긴다" 방식은 겹친 상황에서 사실과 다른 화면을 만든다.
- **결정:** 리듀서는 사실(연결, 턴, 도구 스택, 승인 수, 위임 수, 마지막 결과)을 추적하고 고정 우선순위로 시각 상태를 도출한다. 타이머로 success/error를 idle로 바꾸지 않는다.
- **결과:** 순수·결정적이며 테스트하기 쉽다. adapter가 `agent.idle`을 보내지 않으면 success/error가 계속 표시된다(사실대로).

## ADR-005 데모 adapter는 프런트엔드 TS, 스케줄러·시계 주입 — 채택 (2026-11-18)

- **맥락:** Hermes 연결 전에 전체 기능을 결정적으로 검증해야 한다.
- **결정:** `src/adapters/demo/`에 스크립트(데이터)와 재생기(`createDemoSource`)를 둔다. 재생기는 `setTimeout`류 스케줄러와 `now()`를 주입받고, 원시 객체를 내보내 실제 이벤트와 같은 정규화 경로를 지난다.
- **결과:** fake timer로 전 시나리오를 테스트할 수 있다. 네이티브 쪽 이벤트 경로는 Hermes adapter ADR 때 따로 검증한다.

## ADR-006 투명도는 CSS로 구현 — 채택 (2026-11-18)

- **맥락:** Tauri 2 창 API에는 창 전체 불투명도를 바꾸는 크로스플랫폼 메서드가 없다.
- **결정:** 창 배경은 완전 투명이므로 장면 루트의 CSS `opacity`를 조절해 체감 창 투명도를 구현한다.
- **결과:** 네이티브 권한이 필요 없다. 클릭 판정은 투명도와 무관하게 유지된다.

## ADR-007 macOSPrivateApi 활성화 — 채택 (2026-11-18)

- **맥락:** macOS에서 Tauri 창을 투명하게 하려면 `app.macOSPrivateApi: true`와 `tauri` 크레이트의 `macos-private-api` 기능이 필요하다.
- **결정:** 둘 다 켠다.
- **결과:** Mac App Store 심사를 통과할 수 없다. 직접 배포(.app/.dmg)만 대상으로 한다.

## ADR-008 드래그는 pointerdown에서 `startDragging()` — 채택 (2026-11-18)

- **맥락:** `data-tauri-drag-region`은 이벤트 대상 요소 자체에 속성이 있어야 동작해서 SVG 도형마다 붙여야 하고, 캐릭터 클릭과 구분하기 어렵다.
- **결정:** 장면 루트에서 주 버튼 pointerdown을 받아, 대상이 버튼·입력·캐릭터·패널(`[data-no-drag]`)이 아니면 `WindowControls.startDragging()`을 호출한다.
- **결과:** 클릭과 드래그 경계를 테스트로 검증할 수 있다. capability에 `core:window:allow-start-dragging`이 필요하다.

## ADR-009 로그 플러그인 미사용, 로그는 에러 코드만 — 채택 (2026-11-18)

- **맥락:** 로그는 민감 데이터가 새는 흔한 경로다.
- **결정:** `tauri-plugin-log`를 쓰지 않는다. 프런트엔드는 정규화 실패 시 `console.warn('[deskling] rejected agent event: <code>')`만 남긴다.
- **결과:** 디버깅 정보가 적다. 필요해지면 리댁션 규칙을 정한 ADR 후 추가한다.

## ADR-010 cargo PATH 보정 래퍼 — 채택 (2026-11-18)

- **맥락:** 개발 머신의 셸 PATH에 `~/.cargo/bin`이 없다. `npm run tauri dev`가 cargo를 못 찾으면 필수 명령이 실패한다.
- **결정:** `scripts/with-cargo.mjs`가 `cargo`를 못 찾을 때 `~/.cargo/bin`을 PATH 앞에 붙이고 인자로 받은 명령을 실행한다. `tauri`, `rust:check` 스크립트가 이를 경유한다.
- **결과:** 셸 설정과 무관하게 npm 스크립트가 동작한다. 사용자 셸 설정 파일은 건드리지 않는다.

## ADR-011 레이어 경계를 ESLint로 강제 — 채택 (2026-11-18)

- **맥락:** "Hermes 전용 로직을 React 컴포넌트에 넣지 않는다", "renderer는 정규화된 상태만"은 문서만으로는 지켜지지 않는다.
- **결정:** `no-restricted-imports`로 core/adapters/platform/app/ui 사이 import를 제한한다(ARCHITECTURE §2 표). 규칙 자체를 테스트한다.
- **결과:** 경계 위반이 `npm run lint`에서 실패한다.

## ADR-012 크기 조절은 S/M/L 프리셋 + 창 크기 변경 + rem 스케일 — 채택 (2026-11-18)

- **맥락:** 프레임 없는 투명 창은 OS 리사이즈 핸들을 쓰기 어렵고, 자유 리사이즈는 장면 비율을 깨뜨린다.
- **결정:** 기본 320×280을 기준으로 S(0.8)·M(1.0)·L(1.3) 배율을 `WindowControls.setSize()`로 적용한다. 루트 font-size가 창 너비에 비례하고 모든 UI가 rem/SVG viewBox를 써서 같이 커진다.
- **결과:** 비율이 항상 유지된다. 임의 크기는 지원하지 않는다.

## ADR-013 Node 24 LTS 기준, Node 23은 경고와 함께 허용 — 채택 (2026-11-18)

- **맥락:** 최신 Vitest 5, jsdom 31, ESLint 10은 `node ^20.19 || ^22.13 || >=24`를 요구한다. 개발 머신 기본 `node`는 EOL된 23.11이고, Homebrew `node@24`(24.22.1, keg-only)가 함께 설치돼 있다. npm 10.9는 Vitest 5 설치 중 arborist 버그(`edgesOut` null)로 실패했다.
- **결정:** 프로젝트 기준은 Node 24 LTS(`.node-version` = 24, `engines.node` = `^22.13.0 || >=24`)다. 의존성을 구버전으로 낮추지 않는다. 검증은 Node 24에서 하고, 기본 셸의 Node 23에서도 `verify:fast`가 동작하는지 따로 확인한다.
- **결과:** Node 23에서는 `npm install` 시 EBADENGINE 경고가 난다. 사용자에게 Node 24를 PATH에 올리기를 권장한다(`brew link --overwrite node@24` 등). 셸 설정은 이 저장소에서 바꾸지 않는다.
