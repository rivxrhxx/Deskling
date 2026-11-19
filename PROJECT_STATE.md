# PROJECT_STATE

_마지막 갱신: 2026-11-18_

## 현재 단계

- **M0–M12 완료.** vertical slice, MVP 화면, 독립 리뷰 반영(T34), 생활감(M7: 에너지·화남·침대·하루 일과 데모),
  키우기(M8: 완료한 작업 = 경험치, 아기→어린이→어른, 방 꾸미기 해금, 이름·쓰다듬기·간식)가 동작한다.
- **M9 미니룸(ADR-019~021):** 어두운 작업실을 밝은 아이소메트릭 픽셀 미니룸으로 교체했다. 헤르메스가 방을 걸어 다니며 대기 중 일상(샤워·밥·TV·책·창밖·스트레칭·물주기·낮잠·친구 초대)을 살고,
  에이전트 상태가 필수 행동을 정한다(작업 → 책상, 승인 대기 → 방 앞에서 손 흔들기, 위임 → 친구 도우미, 오프라인 → 불 끄고 잠). 일상은 펫의 생활이며 에이전트에 대한 주장이 아니다(ADR-020).
  창은 기본이 바탕화면에 박힌 항상 아래·Dock 없음·480×340이고 "위에 띄우기"로 바꾼다(ADR-021).
  T64에서 독립 코드 리뷰(HIGH 1: 빠른 도구 전환 때 책상에 못 가고 맴돎 → 수정)와 장면별 시각 QA(가림·배지·포스터·밤 가장자리 수정)를 반영했다.
- **M10 세션 친구(ADR-022/023):** 세션마다 캐릭터 하나 — `hermes`·`demo`·`custom`은 집주인 헤르메스, `claude-code`·`codex` 세션은 세션마다 친구(번호·색으로 구분).
  세션별 커서·사실·사용량(ADR-014 대체), 방석 4개, 들어오기/나가기, 자기 상태만 표시, `session.message`로 실제 대화(말풍선) 또는 편지, 패널 세션 목록·알림 줄, 데모 "방 친구들". 동네 친구·친구 초대는 없앴다.
- **M11 Claude Code 실제 연결(ADR-024):** 훅 스크립트 → Unix 소켓(0600) → Rust 엄격 검증 → Tauri 이벤트 → TS 번역 → 재정규화. 보기 자동/실제/데모.
  사용자 동의를 받아 2026-11-19 훅 설치(백업 `~/.claude/settings.json.deskling-backup-20261119-011220`, 기존 훅 핸들러 34개 그대로). 제거는 `npm run hooks:uninstall`.
- **M12 사무실 사회(ADR-025):** 침실·헤르메스·펫 키우기를 걷어내고 원본 아이소메트릭 픽셀 사무실(640×440, 책상 8개, 회의 테이블, 커피머신, 정수기, 소파, 책장, 화이트보드, 프린터)로 바꿨다.
  모든 세션이 직원 한 명 — 책상에서 자기 상태대로 일하고, 승인 대기면 손 흔들고, 대기면 라운지로 가서 쉬고, 끝나면 나간다. 격자 A* 걷기. 말풍선은 사무실 요약이자 패널 버튼.
  세션별 에너지·화남, 사무실 성장(소품 해금), 직원 모습 3종(Claude·Codex·에이전트). 데모 "사무실 하루".
- 이벤트 규격은 v3(v2 `usage.reported`, v3 `claude-code`·`codex` 종류와 `session.message`). 방 모양은 ADR-019가 ADR-017을 대체했다(이전 400×260 디오라마).
- Hermes·Codex와는 아직 실제로 연결되지 않았다(데모로 표현). 데모가 보이는 동안에는 항상 DEMO 배지를 보인다.

## 환경 (2026-11-18 확인)

| 항목 | 값 |
| --- | --- |
| OS | macOS 26.6.2 (arm64) |
| Node / npm | 기준 v24.22.1 / 11.19.1 (`/opt/homebrew/opt/node@24`), 기본 셸 v23.11.0 / 10.9.2 |
| Rust / Cargo | rustc 1.100.0 / cargo 1.100.0 (`~/.cargo/bin`, 셸 PATH에는 없음 → `scripts/with-cargo.mjs`) |
| Xcode | /Applications/Xcode.app, SDK 26.2, Apple clang 17.0.0 |
| GitHub | `origin` = github.com/rivxrhxx/Deskling |

## 마지막 검증 (실제로 실행한 명령과 결과)

| 명령 | 결과 |
| --- | --- |
| `npm run verify` (Node 24) | 통과 — typecheck, lint(경고 0), **1443 tests / 38 files**, vite build, cargo fmt·clippy(`-D warnings`)·**test 21개** (M12 완료 시점, 2026-11-19) |
| `npm run verify:fast` (Node 23.11) | 통과 — 334 tests (T34 이전 시점). Node 23은 EBADENGINE 경고만 남 |
| `npm run build:app` | 통과 — `src-tauri/target/release/bundle/macos/Deskling.app` (9.7 MiB, arm64, 번들 ad-hoc 서명 + hardened runtime, `codesign --verify --deep --strict` 통과, M9 실행·렌더링·바탕화면 층 확인, 2026-11-19) |
| `npm run tauri dev` | 실행됨 — 투명 창, layer 5(항상 위), M6 시점 11개 상태 네이티브 캡처, M7은 DOM 프로브 |

### 네이티브 확인 내역

- **M12 (release 번들 + 실제 Claude Code):** 사무실 창이 바탕화면 층(layer −1)에 뜨고, 이 개발 세션이 Claude 1 직원으로 1번 책상에 앉아 터미널 작업 중인 것과
  요약 말풍선 "1명 일하는 중"을 창 캡처로 확인(자동 모드 → 실제 사무실, DEMO 배지 없음). 패널 세션 줄이 글자를 한 글자씩 세로로 접던 문제를 WebKit 렌더에서 발견해 고쳤다.

- **M11 (release 번들 + 실제 Claude Code):** 앱 데이터 폴더 0700, 소켓 `agent-events.sock` 0600 생성. 훅 설치 직후 **이 개발 세션(Claude Code) 자신이 Claude 1 친구로 방에 들어와**
  방석에서 노트북으로 일하는 것을 창 캡처로 확인 — 자동 모드가 실제 방으로 바뀌어 DEMO 배지 없음, 헤르메스는 미연결이라 불 끄고 잠. 창 layer −1, UIElement.

- **M9 (release 번들):** 창 layer −1(바탕화면 층, 다른 창 아래) + onscreen, 프로세스 type `UIElement`(Dock·⌘Tab 없음).
  데모 투어 동안 창 캡처 9장: 말풍선은 항상 실제 상태, 헤르메스는 상태별 자리로 걸어감(오프라인 → 밤 + 침대, 승인 대기 → 방 앞 + 호박색 !, 위임 → 친구 도우미).
  창 밖 영역 완전 투명(캡처 픽셀의 약 60%). README 이미지는 실제 `MiniRoom`/`App` 마크업+CSS의 WebKit 렌더링.

이전 마일스톤:

- 창 밖 영역 alpha 0(창 픽셀의 약 36% 완전 투명), 창 레벨 floating(항상 위).
- 축소된 capability(창 권한 4개)로 실제 크기 변경 416×364, 항상 위 해제(layer 0) 확인 — 임시 기본값 변경 후 원복.
- release 번들이 엄격한 CSP에서 장면을 그대로 렌더링.
- T34 수정 이후 dev 빌드의 실제 WKWebView DOM을 임시 프로브로 확인: 54초 동안 11개 상태 전부 순환, JS 오류 0, ErrorBoundary 대체 화면 0, 루트가 빈 적 0.
- M7 이후 같은 방식의 DOM 프로브: 투어 동안 idle·offline은 침대, 나머지는 책상. 에너지 full→ok→low→empty, 화남 calm→annoyed→angry→furious,
  빈 캔 0~3개, 잠잘 때 표시 0개, JS 오류 0. 장면 이미지는 실제 마크업+CSS의 WebKit 렌더링(`docs/images/*`).
- M8 DOM 프로브: 데모 투어의 성공 이벤트에서 실제 webview localStorage의 데모 펫 경험치가 0→1로 저장, 단계 baby, JS 오류 0.
  (이 프로브 실행으로 개발 머신의 데모 펫 경험치가 1 올라가 있다.)

### 확인하지 못한 것

- 실제 마우스로 창 드래그, 핀 버튼 토글, S/M/L 버튼 클릭 — 이 환경에서 computer-use 도구가 설정되지 않아 수행 못 함(로직은 App 테스트로 검증).
- M7 네이티브 창 캡처 — Deskling 창이 다른 디스플레이(x < 0)에 있어 window capture가 실패했다. 사용자의 창 위치는 건드리지 않고
  DOM 프로브와 WebKit 렌더링으로 대신 확인했다.
- `cargo audit` — 미설치로 실행하지 않음.

## 알려진 문제 / 메모

- **세션 교차(ADR-014):** 리듀서는 마지막 세션 하나의 `(session, seq)`만 기억한다. Hermes adapter ADR에서 반드시 결정.
- **전체 화면 앱 위 표시:** `visibleOnAllWorkspaces`만으로는 다른 앱의 전체 화면 Space 위에 뜨지 않는다. 그때 WebKit은 페이지를
  `hidden`으로 보고 그리기를 멈춘다(DOM 프로브에서 visible/hidden 전환 관찰). 필요하면 full-screen auxiliary 동작을 백로그에서 검토.
- **dev 의존성 advisory:** `npm audit`이 picomatch ≤ 4.0.7 ReDoS(GHSA-fc5q-39xc-vjpf)를 vite·vitest·typescript-eslint 경유로 보고한다.
  dev 전용이며 `npm audit --omit=dev`는 0건. 4.0.7이 최신이라 패치 버전이 나오면 `overrides`로 올린다.
- TypeScript는 typescript-eslint 호환 때문에 6.0.x 고정(ADR-002). npm 10.9는 Vitest 5 설치 시 arborist 버그가 있어 Node 24의 npm 11 사용(ADR-013).
- DMG는 만들지 않는다(`--bundles app`). DMG 생성은 Finder AppleScript를 쓰기 때문.
- **리뷰에서 받아들인 것(M9):** 데모 시나리오를 바꾸면 새 피드가 사실 없는 상태(offline)로 시작해, 그 순간 생활 엔진도 offline을 한 번 본다
  (손님이 나가고 헤르메스가 하던 일상을 바꿀 수 있음). "사실만 반영" 원칙과 맞아 그대로 둔다.
  헤르메스가 침대·샤워·소파 그룹을 드나들 때 스프라이트가 다시 마운트되어 이모트 흔들림이 처음부터 시작된다.
  소파 옆을 걸어 지날 때 한순간 팔걸이가 다리 위에 그려질 수 있다(가구 하나에 깊이 하나). 짜증(annoyed)이면 작업 이모트 대신 땀 이모트가 보인다(DESIGN §3.2 우선순위).

## 다음 작업

1. Hermes Agent adapter ADR — 전송 방식, 위치(Rust/TS), 세션 교차 규칙(ADR-014), 인증. `usage.reported` 매핑 포함.
2. 사람이 직접: `npm run tauri dev`로 드래그·핀·크기·모션 버튼, 예산 선택, 이름·쓰다듬기·간식을 눌러 TEST_PLAN §5의 남은 항목 확인.
3. 키우기 다듬기 후보(요청 시): 성장 순간 축하 연출, 더 많은 소품, 애정도에 따른 반응 차이.
4. 백로그: 메뉴 막대 아이콘, 창 위치 기억, 클릭 통과 모드, 전체 화면 Space 위 표시.
