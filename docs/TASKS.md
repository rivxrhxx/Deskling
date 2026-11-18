# TASKS — Deskling

규칙: 위에서부터 **한 번에 하나**. 행동 작업은 실패 테스트 확인 → 구현 → 통과 후에만 `[x]`.
각 항목의 "검증"은 체크 전에 실제로 실행해야 하는 것이다.

## M0 하네스

- [x] **T00** 하네스 문서 작성 (AGENTS, README, docs 8종, PROJECT_STATE, DECISIONS)
  - 검증: 12개 파일 존재 확인

## M1 스캐폴딩

- [x] **T01** Vite + React + TypeScript + Vitest/RTL 스캐폴딩, App 스모크 테스트
  - 검증: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`
- [x] **T02** 레이어 경계 린트 규칙 (`no-restricted-imports`) — SEC-6
  - 검증: `src/config/boundaries.test.ts` (ui→tauri/adapters, core→react 금지)
- [x] **T03** Tauri 2 스캐폴딩(`src-tauri`), `scripts/with-cargo.mjs`, `npm run rust:check`
  - 검증: `npm run rust:check`
- [x] **T04** 오버레이 창 설정(투명·무테·항상 위·그림자 없음·macOSPrivateApi) + 최소 capability — FR-W1, SEC-5
  - 검증: `src/config/tauriConfig.test.ts`
- [x] **T05** `verify:fast`, `verify`, `build:app` 스크립트 구성
  - 검증: `npm run verify:fast`, `npm run verify`

## M2 이벤트 코어

- [x] **T06** `normalizeAgentEvent` 유효 이벤트 수용·화이트리스트 복사·동결 — FR-E1, FR-E3
- [x] **T07** `normalizeAgentEvent` 잘못된 입력 → 에러 코드 — EVENT_PROTOCOL §8
- [x] **T08** 민감 필드(reasoning, prompt, args, path, command, env, apiKey, headers) 비전파 — SEC-1, SEC-2
- [x] **T09** `createIngest` 성공 시 dispatch, 실패 시 코드만 보고 — FR-E2, SEC-3
- [x] **T10** 리듀서: 초기 offline, online/idle/turn/success/error — FR-E4, FR-E6
- [x] **T11** 리듀서: 도구 스택·승인·위임 우선순위 — EVENT_PROTOCOL §5
- [x] **T12** 리듀서: 같은 세션 seq 중복/역순 무시, 세션 전환 초기화 — FR-E5
- [x] **T13** 리듀서: 최근 활동 최대 12개 최신순 — FR-P2

## M3 데모

- [x] **T14** `core` 스크립트: idle → thinking → coding → terminal → success → idle — FR-D2
- [x] **T15** `tour` 스크립트: 11개 상태 순서대로 — FR-D3
- [x] **T16** 데모 스크립트의 모든 이벤트가 정규화 통과 — FR-D6
- [x] **T17** `createDemoSource`: 고정 간격 재생, 반복 시 seq 증가, stop — FR-D1, FR-D4

## M4 장면 (vertical slice 화면)

- [x] **T18** `visualSpec`: 11개 상태의 고유 라벨·아이콘·포즈·톤 — FR-S3
- [x] **T19** `StatusBubble`: 아이콘 + 라벨, `role=status` — FR-S4
- [x] **T20** `DemoBadge` — FR-D5
- [x] **T21** `Workshop` SVG: 상태별 포즈·모니터 화면, 텍스트 노드 없음 — FR-S1, FR-S6
- [x] **T22** `useReducedMotion`: 시스템 설정 + 사용자 설정 → `data-motion` — FR-M1, FR-M3
- [x] **T23** App 통합: 데모 `core` 시나리오가 화면에 순서대로, 모든 상태에서 DEMO 배지 — FR-D2, FR-D5
- [ ] **T24** 작업실 아트·상태 애니메이션 CSS, reduced-motion CSS 규칙 — DESIGN §3~§6
  - 검증: 테스트 통과 + `npm run tauri dev` 화면 확인

## M5 상호작용

- [ ] **T25** `ActivityPanel`: 캐릭터 클릭·Enter로 열기, 닫기 버튼·Esc, 고정 문구 — FR-P1~P4
- [ ] **T26** `settings`: 검증·로드·저장, 저장 키 하나 — FR-W6, SEC-7
- [ ] **T27** `WindowControls` 인터페이스, Tauri/no-op 구현 선택
- [ ] **T28** `WindowToolbar`: 크기 S/M/L, 투명도, 항상 위, 모션, 닫기 — FR-W2, W4, W5, W7, W8, FR-M2
- [ ] **T29** 드래그: 빈 영역 pointerdown → `startDragging`, 캐릭터·컨트롤은 제외 — FR-W3
- [ ] **T30** 데모 시나리오 선택(`tour` 기본 / `core`) — FR-D3

## M6 네이티브 검증

- [ ] **T31** `npm run verify` 전체 통과 — NFR-4
- [ ] **T32** `npm run build:app` macOS 번들 빌드 — NFR-1
- [ ] **T33** `npm run tauri dev` 실행 + 스크린샷으로 투명 오버레이·장면 확인 — TEST_PLAN §5
- [ ] **T34** 독립 리뷰(보안·정확성) 후 지적 반영
- [ ] **T35** 원본 앱 아이콘으로 Tauri 기본 로고 교체 — NFR-3
  - 검증: `src-tauri/icons/*` 재생성, `npm run build:app`

## 백로그 (vertical slice 이후, 각각 ADR 먼저)

- [ ] Hermes Agent adapter: 전송 방식·위치 결정 ADR
- [ ] Rust → 프런트 `tauriBridge` 이벤트 소스
- [ ] 메뉴 막대(tray) 아이콘과 표시/숨기기
- [ ] 창 위치 기억, 멀티 모니터
- [ ] 클릭 통과(click-through) 모드
