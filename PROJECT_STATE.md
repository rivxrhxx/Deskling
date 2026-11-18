# PROJECT_STATE

_마지막 갱신: 2026-11-18_

## 현재 단계

- **M0–M8 완료.** vertical slice, MVP 화면, 독립 리뷰 반영(T34), 생활감(M7: 에너지·화남·침대·하루 일과 데모),
  키우기(M8: 완료한 작업 = 경험치, 아기→어린이→어른, 방 꾸미기 해금, 이름·쓰다듬기·간식)가 동작한다.
- 이벤트 규격은 v2(`usage.reported` 추가, ADR-016). 방은 침대가 있는 400×260 디오라마(ADR-017).
- 실제 에이전트(Hermes 등)와는 아직 연결되지 않았다. 앱은 결정적 데모 소스로만 동작하며 항상 DEMO 배지를 보인다.

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
| `npm run verify` (Node 24) | 통과 — typecheck, lint(경고 0), **545 tests / 25 files**, vite build, cargo fmt·clippy(`-D warnings`)·test (M8 완료 시점) |
| `npm run verify:fast` (Node 23.11) | 통과 — 334 tests (T34 이전 시점). Node 23은 EBADENGINE 경고만 남 |
| `npm run build:app` | 통과 — `src-tauri/target/release/bundle/macos/Deskling.app` (9.7 MiB, arm64, ad-hoc 서명) |
| `npm run tauri dev` | 실행됨 — 투명 창, layer 5(항상 위), M6 시점 11개 상태 네이티브 캡처, M7은 DOM 프로브 |

### 네이티브 확인 내역

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

## 다음 작업

1. Hermes Agent adapter ADR — 전송 방식, 위치(Rust/TS), 세션 교차 규칙(ADR-014), 인증. `usage.reported` 매핑 포함.
2. 사람이 직접: `npm run tauri dev`로 드래그·핀·크기·모션 버튼, 예산 선택, 이름·쓰다듬기·간식을 눌러 TEST_PLAN §5의 남은 항목 확인.
3. 키우기 다듬기 후보(요청 시): 성장 순간 축하 연출, 더 많은 소품, 애정도에 따른 반응 차이.
4. 백로그: 메뉴 막대 아이콘, 창 위치 기억, 클릭 통과 모드, 전체 화면 Space 위 표시.
