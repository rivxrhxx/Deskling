# PROJECT_STATE

_마지막 갱신: 2026-11-18_

## 현재 단계

- **M0–M6 완료.** vertical slice와 MVP 화면(11개 상태, 활동 패널, 창 설정, 드래그, reduced-motion, 데모 시나리오 선택)이 동작한다.
- **T34 독립 리뷰 반영 완료.** 보안 리뷰(medium 1, low 4)와 정확성 리뷰(high 1, medium 1, low 6)를 T34a–T34h로 처리했다.
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
| `npm run verify` (Node 24) | 통과 — typecheck, lint(경고 0), **356 tests / 21 files**, vite build, cargo fmt·clippy(`-D warnings`)·test |
| `npm run verify:fast` (Node 23.11) | 통과 — 334 tests (T34 이전 시점). Node 23은 EBADENGINE 경고만 남 |
| `npm run build:app` | 통과 — `src-tauri/target/release/bundle/macos/Deskling.app` (9.7 MiB, arm64, ad-hoc 서명) |
| `npm run tauri dev` | 실행됨 — 투명 창, layer 5(항상 위), 11개 상태 캡처(`docs/images/all-states.png`) |

### 네이티브 확인 내역

- 창 밖 영역 alpha 0(창 픽셀의 약 36% 완전 투명), 창 레벨 floating(항상 위).
- 축소된 capability(창 권한 4개)로 실제 크기 변경 416×364, 항상 위 해제(layer 0) 확인 — 임시 기본값 변경 후 원복.
- release 번들이 엄격한 CSP에서 장면을 그대로 렌더링.
- T34 수정 이후 dev 빌드의 실제 WKWebView DOM을 임시 프로브로 확인: 54초 동안 11개 상태 전부 순환, JS 오류 0, ErrorBoundary 대체 화면 0, 루트가 빈 적 0.

### 확인하지 못한 것

- 실제 마우스로 창 드래그, 핀 버튼 토글, S/M/L 버튼 클릭 — 이 환경에서 computer-use 도구가 설정되지 않아 수행 못 함(로직은 App 테스트로 검증).
- T34 이후 최종 화면 캡처 — 세션 중간부터 macOS 화면 캡처가 모든 창에서 실패("could not create image from window")해 찍지 못했다.
  위 DOM 프로브로 대신 확인했다.
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

1. Hermes Agent adapter ADR — 전송 방식, 위치(Rust/TS), 세션 교차 규칙(ADR-014), 인증.
2. Rust → 프런트 `tauriBridge` 이벤트 소스 + 통합 테스트.
3. 사람이 직접: `npm run tauri dev`로 드래그·핀·크기·모션 버튼을 눌러 TEST_PLAN §5의 남은 항목 확인.
4. 백로그: 메뉴 막대 아이콘, 창 위치 기억, 클릭 통과 모드, 전체 화면 Space 위 표시.
