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
- [x] **T24** 작업실 아트·상태 애니메이션 CSS, reduced-motion CSS 규칙 — DESIGN §3~§6
  - 검증: 테스트 통과 + `npm run tauri dev` 화면 확인

## M5 상호작용

- [x] **T25** `ActivityPanel`: 캐릭터 클릭·Enter로 열기, 닫기 버튼·Esc, 고정 문구 — FR-P1~P4
- [x] **T26** `settings`: 검증·로드·저장, 저장 키 하나 — FR-W6, SEC-7
- [x] **T27** `WindowControls` 인터페이스, Tauri/no-op 구현 선택
- [x] **T28** `WindowToolbar`: 크기 S/M/L, 투명도, 항상 위, 모션, 닫기 — FR-W2, W4, W5, W7, W8, FR-M2
- [x] **T29** 드래그: 빈 영역 pointerdown → `startDragging`, 캐릭터·컨트롤은 제외 — FR-W3
- [x] **T30** 데모 시나리오 선택(`tour` 기본 / `core`) — FR-D3

## M6 네이티브 검증

- [x] **T31** `npm run verify` 전체 통과 — NFR-4
- [x] **T35** 원본 앱 아이콘으로 Tauri 기본 로고 교체 — NFR-3
  - 검증: `src-tauri/icons/*` 재생성, `npm run build:app`
- [x] **T32** `npm run build:app` macOS 번들 빌드 — NFR-1
- [x] **T33** `npm run tauri dev` 실행 + 스크린샷으로 투명 오버레이·장면 확인 — TEST_PLAN §5
- [x] **T34** 독립 리뷰(보안·정확성) 후 지적 반영
  - [x] **T34a** `at`을 JS Date 범위(≤ 8.64e15)로 제한 + 루트 ErrorBoundary (리뷰 HIGH)
  - [x] **T34b** capability에서 `core:default` 제거, 창 권한 4개만 (리뷰 MEDIUM, SEC-5)
  - [x] **T34c** 멈춘 소스의 늦은 이벤트 무시 + 소스 전환 시 offline 깜빡임 제거 (리뷰 MEDIUM/LOW)
  - [x] **T34d** 최근 활동 항목에서 provider `id` 제거, 리듀서 카운터 key 사용 (리뷰 LOW)
  - [x] **T34e** 동적 `import()`·`__TAURI*` 전역 접근으로 레이어 경계 우회 금지 (리뷰 LOW, SEC-6)
  - [x] **T34f** 데모 소스: 재시작 시 첫 단계 재생 안 함, 단계 중간 stop 존중 (리뷰 LOW)
  - [x] **T34g** 설정 연속 변경 유실 방지, 기본 투어 테스트 강화 (리뷰 LOW)
  - [x] **T34h** 세션 교차(interleave) 한계와 dev 의존성 advisory를 ADR/상태 문서에 기록

## M7 생활감: 에너지·화남·침대 (ADR-016, ADR-017)

- [x] **T36** ADR-016/017, EVENT_PROTOCOL v2, REQUIREMENTS FR-V*, DESIGN §3·§4.1 문서화
- [x] **T37** `normalizeAgentEvent`: v2 `usage.reported` 검증(`bad-usage`), v1 호환 — FR-V1
- [x] **T38** 리듀서: 세션별 최신 사용량 스냅샷, 최근 목록 제외, 세션 전환 시 초기화 — FR-V1
- [x] **T39** `src/core/mood.ts`: 에너지·화남 단계 순수 함수 — FR-V2, FR-V3
- [x] **T40** 설정: 토큰 예산(50k~1M, 기본 200k) — FR-V6
- [x] **T42** 방 확장(400×260)과 침대 가구, 기본 창 400×280 — ADR-017 (침대가 있어야 침대 포즈를 그릴 수 있어 T41보다 먼저)
- [x] **T41** visualSpec 위치(desk/bed)·침대 포즈 + **T43** 침대 포즈 그림(뒹굴/잠)·걷기 전환·위치 따라가는 hotspot — FR-V7, FR-V8
- [x] **T44** 장면 분위기 표시: 전구·눈꺼풀·캔(에너지), 눈썹·핏줄·김(화남) — FR-V4
- [x] **T45** 활동 패널: 남은 토큰·컨텍스트 숫자, 예산 선택 — FR-V5, FR-V6
- [x] **T46** 데모: 사용량 보고 추가, "하루 일과" 시나리오 — FR-V1~V4
- [x] **T47** App 통합: 사용량 → 분위기 → 장면·패널 — FR-V2~V6
- [x] **T48** 화면 검증(WebKit 렌더링·네이티브), 문서·상태 갱신

## M8 키우기 (ADR-018)

- [x] **T49** ADR-018, REQUIREMENTS FR-G*·SEC-7, EVENT_PROTOCOL §4, DESIGN §4.2 문서화
- [x] **T50** 리듀서: `completedTurns` (수용된 `turn.succeeded` 수, 세션 전환에도 유지) — FR-G1
- [x] **T51** `src/core/growth.ts`: 성장 단계, 해금 소품, 쓰다듬기·간식 규칙, 이름 정리 — FR-G2~G5
- [x] **T52** `src/app/pet.ts`: 프로필(demo/live) 검증·로드·저장, 키 하나 — FR-G1, FR-G6, SEC-7
- [x] **T53** `usePet`: 완료 작업 증가분 → 경험치, 돌보기 동작, 반응 타이머 — FR-G1, FR-G4
- [x] **T54** 장면: 성장 단계 모습, 해금 소품, 하트·간식 반응 — FR-G2~G4
- [x] **T55** 패널 "펫" 영역: 이름 짓기, 하트, 쓰다듬기·간식 버튼, DEMO 표시 — FR-G4~G6
- [x] **T56** App 통합, 화면 검증, 문서·상태 갱신

## M9 미니룸: 헤르메스의 사생활 (ADR-019, ADR-020, ADR-021)

- [x] **T57** ADR-019/020/021, REQUIREMENTS FR-R*·FR-W2·SEC-5, DESIGN §9 문서화
- [x] **T58** 바탕화면에 박힌 창: 항상 아래 기본, Dock 숨김, 480×340, 위에 띄우기 토글 — FR-R7
- [x] **T59** `src/core/room.ts`: 아이소메트릭 좌표·깊이, 방 배치(장소·통로·문) — FR-R1
- [x] **T60** `src/core/life.ts`: 상태별 필수 행동, 대기 일상·친구 방문, 걷기 경로·시간(시드 고정) — FR-R2~R6
- [x] **T61** 픽셀 스프라이트: ASCII 맵 → SVG, 헤르메스·친구 포즈, 이모트 — FR-R1, FR-R2
- [x] **T62** `MiniRoom` 장면: 방·가구·깊이 정렬·캐릭터·친구·이모트·밤·성장·소품 — FR-R1~R5, FR-G2~G4, FR-V4
- [x] **T63** App 통합: 일상 엔진 구동(틱·reduced-motion), 친구 초대, 기존 작업실 제거, visualSpec·DESIGN 정리
- [x] **T64** 화면 검증(WebKit·네이티브), 문서·상태, verify·build, push

## M10 세션 친구들 (ADR-022, ADR-023) — 데모로 먼저

- [x] **T65** ADR-022/023/024, EVENT_PROTOCOL v3, REQUIREMENTS FR-MS*·FR-CC*, TASKS
- [x] **T66** core: AgentEvent v3(종류 `claude-code`·`codex`, `session.message` + `to`, `bad-target`) 정규화 — FR-MS1, FR-MS5
- [x] **T67** core: `roomState` 리듀서 — 세션별 커서·사실·사용량, 집주인/친구 구분, 번호, 끝난 세션 기억, 대화 목록, 합친 최근 활동 — FR-MS1, FR-MS4, FR-MS6
- [x] **T68** core: 생활 엔진의 세션 친구 — 손님 자리 4개, 들어오기/나가기, 자기 상태, 대화(돌아보기·편지), 동네 친구·초대 제거 — FR-MS2, FR-MS3, FR-MS5, FR-R4
- [x] **T69** ui: Claude·Codex 친구 원본 스프라이트(세션 번호별 색), 말풍선·편지 이모트 — FR-MS1, FR-MS5
- [x] **T70** ui/app: 미니룸에 친구들, 패널 세션 목록·알림 줄, 친구 초대 버튼 제거, 데모 "방 친구들" — FR-MS2, FR-MS3, FR-MS6, FR-MS7
- [x] **T71** 화면 검증·문서·verify·build·push

## M11 Claude Code 실제 연결 (ADR-024)

- [x] **T72** 훅 스크립트 `integrations/claude-code/deskling-hook.mjs` + 매핑 문서 — FR-CC1
- [x] **T73** Rust 소켓 브리지 + capability(이벤트 수신) — FR-CC2
- [x] **T74** TS adapter `src/adapters/claudeCode/` + platform 수신 + 실제/데모 전환 — FR-CC3, FR-CC4, FR-CC6
- [x] **T75** 설치/제거 스크립트(백업), 사용자 동의 후 설치, 실제 세션으로 네이티브 검증 — FR-CC5

## M12 사무실 사회 (ADR-025)

- [x] **T76** ADR-025, TASKS
- [x] **T77** core: 방 상태에서 집주인 제거(모든 세션 = 직원, 종류별 번호·이름표), 사무실 요약 집계, 사무실 성장(소품 해금)·저장 이전 — ADR-025 §1, §5, §7
- [x] **T78** core: 사무실 배치(책상 8·라운지·문)와 격자 경로 탐색, 사무실 엔진(입장·책상·라운지·손 흔들기·환호·도우미·퇴장·대화) — §2, §3, §4
- [x] **T79** ui: 에이전트 원본 모습, 모든 종류의 책상(뒤돌아) 포즈, 라운지 포즈(커피·소파·창가), 도우미 봇, 커피 이모트 — §1, §3
- [x] **T80** ui/app: 사무실 장면, 요약 말풍선 버튼, 세션별 에너지·화남, 패널(세션 줄 숫자·사무실 성장), 640×440, 데모 갱신, 헤르메스·침실 제거, DESIGN — §2–§8
- [x] **T81** 화면 검증·문서·verify·build·push·실행

## M13 Codex 실제 연결 (ADR-026)

- [x] **T82** ADR-026, TASKS
- [x] **T83** Codex 훅 스크립트·매핑, 레코드 `agent: codex`·`interrupt`, Rust 브리지·TS 번역기 확장
- [x] **T84** Codex 설치기(`~/.codex/hooks.json`, 백업·덧붙이기·되돌리기) + 문서
- [x] **T85** 동의 후 설치, `/hooks` 신뢰 안내, 실제 Codex 세션으로 확인, verify·build·push

## M14 사무실 움직임 (ADR-027)

- [x] **T86** ADR-027, TASKS
- [x] **T87** core: 라운지 돌아다니기(머무는 시간 시드 고정, 다른 빈 자리, reduced-motion이면 안 함), 책장 앞 라운지 자리 — §1
- [x] **T88** app: 걷는 동안 50ms 렌더 틱(부드러운 걷기), 아무도 안 걸으면 없음 — §2
- [x] **T89** ui: 걷기 b 프레임 1px 뜀, 활동별 작은 반복 동작(숨쉬기·한 모금·흔들림·끄덕임)과 직원별 위상, 구름·화분 잎 — §3
- [x] **T90** DESIGN·README·상태 문서, verify·build·push·실행

## M15 세션마다 레벨 (ADR-028)

- [x] **T91** ADR-028, TASKS
- [x] **T92** core: 직원 레벨 규칙(`memberLevel`), 방 상태의 세션별 완료 수(`completedBy`, 떠난 세션 포함 64개) — §1, §2
- [x] **T93** app: 세션별 경험치 저장(해시 키, 모드별 64명), 피드별 완료 수 기억(두 번 세지 않음), 직원·패널에 레벨 전달 — §2
- [x] **T94** core: 엔진이 레벨을 받아 오르면 `LEVEL_UP_MS` 동안 레벨업 연출, 들어올 때는 연출 없음 — §4
- [x] **T95** ui: 픽셀 글자, 머리 옆 "Lv n" 배지(단계별 색), "LEVEL UP" 문구·반짝임(reduced-motion에서 멈춤), 패널 세션 줄 레벨 — §3–§5
- [ ] **T96** DESIGN·REQUIREMENTS·ACCEPTANCE·TEST_PLAN·README·상태 문서, verify·build·push·실행

## 백로그 (vertical slice 이후, 각각 ADR 먼저)

- [ ] Hermes Agent adapter: 전송 방식·위치 결정 ADR
- [ ] Rust → 프런트 `tauriBridge` 이벤트 소스
- [ ] 메뉴 막대(tray) 아이콘과 표시/숨기기
- [ ] 창 위치 기억, 멀티 모니터
- [ ] 클릭 통과(click-through) 모드
