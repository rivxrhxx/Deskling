# TEST_PLAN — Deskling

## 1. 원칙

- 행동은 **실패하는 테스트를 먼저** 작성하고, 실제로 실패하는 것을 확인한 뒤 구현한다.
- `test.skip`, `test.only`, `it.todo`, 빈 테스트는 커밋하지 않는다(완료 증거로 인정하지 않음).
- 시간은 `vi.useFakeTimers()`와 주입 시계로만 다룬다. 실제 `sleep`에 의존하지 않는다. 사무실 엔진은 시드와 `now`를 넣어 재현한다.
- 테스트는 공개 행동(반환값, DOM, 호출된 인터페이스)을 검증한다. 내부 구현 세부에 묶이지 않는다.
- 테스트를 나중에 쓴 경우(그림·문구처럼)는 옛 조건으로 되돌려 실패하는지 확인한다(mutation check).
- 결과 보고는 실제 실행한 명령의 출력만 근거로 한다.

## 2. 테스트 레벨

| 레벨 | 대상 | 도구 | 위치 |
| --- | --- | --- | --- |
| 단위 | core(정규화, 리듀서, 사무실 엔진, 길찾기, 분위기, 성장), adapters(demo, 훅 번역), settings·경험치 저장 | Vitest (node/jsdom) | `src/**/*.test.ts` |
| 컴포넌트 | OfficeRoom·픽셀 스프라이트, StatusBubble, AttentionLine, DemoBadge, ActivityPanel, WindowToolbar | Vitest + RTL + jsdom | `src/ui/**/*.test.tsx` |
| 통합 | App + demo source + 가짜 훅 리스너 + fake timers + mock WindowControls | Vitest + RTL | `src/app/*.test.tsx` |
| 설정·계약 | `tauri.conf.json`, capability, 앱 아이콘, 레이어 경계 린트 규칙, CSS 계약, DESIGN.md 표 ↔ 코드 | Vitest (JSON·raw import, ESLint API) | `src/config/*.test.ts`, `src/styles/styles.test.ts`, `src/ui/visualSpec.test.ts` |
| 외부 연동 | 훅 레코드 매핑, 훅 진입점(출력·종료 코드·시간 상한), 설치기(백업·병합·제거) | Vitest | `integrations/**/*.test.mjs` |
| 네이티브 | 훅 브리지 검증·재직렬화·소켓, Rust 컴파일·clippy·fmt, 앱 번들 | cargo, tauri CLI | `src-tauri/src/hook_bridge.rs`(`#[cfg(test)]`), `npm run verify`, `npm run build:app` |
| 수동 시각 | 투명 창, 바탕화면 층, 실제 세션 입장, 드래그 | 실행 + 창 캡처 | §5 체크리스트 |

## 3. 요구사항 ↔ 테스트 매핑

| 요구사항 | 테스트 파일 | 핵심 단언 |
| --- | --- | --- |
| FR-E1, FR-E3 | `src/core/normalize.test.ts` | 유효 이벤트 → 규격 필드만 가진 동결 객체, v1–v3 버전 규칙 |
| §8 에러 코드 | `src/core/normalize.test.ts` | 각 잘못된 입력 → 지정 코드(`bad-target` 포함) |
| SEC-1, SEC-2 | `src/core/normalize.test.ts`, `src/adapters/claudeCode/translate.test.ts` | 민감 필드·값이 출력 JSON에 없음 |
| FR-E2, SEC-3 | `src/core/ingest.test.ts`, `src/app/useAgentFeed.test.tsx` | 실패 시 dispatch 없음, 보고에 입력값 없음, stop 이후 입력 무시 |
| FR-E4~E6 | `src/core/agentState.test.ts` | 우선순위 규칙, seq 무시, 시간 무관 |
| FR-MS4, FR-P2 | `src/core/roomState.test.ts` | 세션별 커서·사실·사용량, 끝난 세션 커서 64, 최근 12 최신순, 세션 이름 |
| FR-MS1 | `src/core/roomState.test.ts`, `src/ui/office/pixel.test.tsx` | 종류 안 번호, `sessionLabel`, 모습 3종 |
| FR-MS2, FR-MS3 | `src/core/office.test.ts`, `src/app/useOffice.test.tsx` | 가장 작은 빈 책상, 문으로 입장·퇴장, 9번째 자리 없음, 직원끼리 독립 |
| FR-MS5 | `src/core/roomState.test.ts`, `src/core/office.test.ts`, `src/ui/office/OfficeRoom.test.tsx` | 대화 8개 기억, 말풍선 4초·편지 3초, 내용 없음 |
| FR-MS6, FR-P5 | `src/ui/ActivityPanel.test.tsx`, `src/ui/AttentionLine.test.tsx`, `src/app/App.test.tsx` | 사무실 묶음, 세션 줄, 알림 줄 이름·나머지 수 |
| FR-MS7, FR-D2, FR-D3 | `src/adapters/demo/scripts.test.ts` | 스크립트를 리듀서에 적용한 상태 열, `office` 입장·퇴장·대화·승인·오류·위임 |
| FR-D1, FR-D4 | `src/adapters/demo/demoSource.test.ts` | 고정 간격, 반복, seq 증가, stop 후 무발행 |
| FR-D6 | `src/adapters/demo/scripts.test.ts` | 모든 스크립트 이벤트가 정규화 통과 |
| FR-D5 | `src/ui/DemoBadge.test.tsx`, `src/app/App.test.tsx` | 데모 모드 모든 상태에서 배지, 실제 모드에서 없음 |
| FR-S3, FR-S6 | `src/ui/visualSpec.test.ts`, `src/ui/office/OfficeRoom.test.tsx` | 11개 상태 라벨·아이콘·화면·포즈 고유, DESIGN §4·§3.3·§4.2 표와 코드 일치, 장면에 텍스트 노드 없음 |
| FR-S4, FR-S7 | `src/ui/StatusBubble.test.tsx`, `src/core/roomState.test.ts` | `aria-live`, 고정 순서 문구, 톤·아이콘 |
| FR-S5 | `src/ui/visualSpec.test.ts`, `src/ui/AttentionLine.test.tsx` | 승인 대기 호박색, 오류 붉은 주황 |
| FR-R1 | `src/core/room.test.ts`, `src/ui/office/OfficeRoom.test.tsx` | 투영 좌표, 가구·자리가 바닥 안, 가구 부품 |
| FR-R2~R5 | `src/core/office.test.ts`, `src/app/useOffice.test.tsx` | 상태별 자세, 대기 1.5초 뒤 라운지, 환호 3초, 도우미 봇, 퇴장, 빈 사무실 불 끔 |
| FR-R6 | `src/core/room.test.ts`, `src/core/office.test.ts`, `src/app/useOffice.test.tsx` | A* 경로가 가구를 지나지 않음, 밖은 문 경유, reduced-motion 순간 이동, 언마운트 시 타이머 정리 |
| FR-R7, FR-W2 | `src/app/App.test.tsx`, `src/config/tauriConfig.test.ts` | 기본 바탕화면 층, "위에 띄우기" 전환, Accessory 정책 |
| FR-V1 | `src/core/normalize.test.ts`, `src/core/roomState.test.ts` | `usage.reported` 숫자만, `bad-usage`, 세션별 스냅샷, 최근 목록 제외 |
| FR-V2, FR-V3 | `src/core/mood.test.ts` | 에너지·화남 단계 경계값 |
| FR-V4 | `src/ui/office/OfficeRoom.test.tsx` | 직원별 캔 수, 이모트 우선순위(땀·핏줄·김·배터리), 텍스트 없음 |
| FR-V5, FR-V6 | `src/ui/ActivityPanel.test.tsx`, `src/app/settings.test.ts`, `src/app/App.test.tsx` | 보고된 숫자만, 예산 선택·저장·재계산 |
| FR-G1, FR-G6 | `src/app/officeProgress.test.ts`, `src/app/useOfficeProgress.test.tsx`, `src/app/App.test.tsx` | 증가분만 경험치, 데모/실제 분리, `pet.v1` 이전, 저장·재시작 |
| FR-G3 | `src/core/growth.test.ts`, `src/ui/office/OfficeRoom.test.tsx` | 해금 경계값, 소품 렌더링 |
| FR-M1~M3 | `src/app/useReducedMotion.test.tsx`, `src/app/App.test.tsx`, `src/styles/styles.test.ts` | `data-motion` 값, reduced에서 애니메이션 끔 |
| FR-P1, FR-P3, FR-P4 | `src/ui/StatusBubble.test.tsx`, `src/ui/ActivityPanel.test.tsx`, `src/app/App.test.tsx` | 열기/닫기, Esc, 포커스 복귀, 고정 문구 |
| FR-W3 | `src/app/App.test.tsx` | 빈 영역 mousedown → startDragging, 말풍선·컨트롤은 아님 |
| FR-W4, W5, W8 | `src/ui/WindowToolbar.test.tsx`, `src/app/App.test.tsx`, `src/platform/windowControls.test.ts` | controls 호출 인자, Tauri 밖 no-op |
| FR-W6, SEC-7 | `src/app/settings.test.ts`, `src/app/officeProgress.test.ts` | 검증·폴백·이전, 저장 키 두 개 |
| FR-W1, SEC-5 | `src/config/tauriConfig.test.ts` | transparent/decorations/alwaysOnTop/shadow/macOSPrivateApi/CSP, 권한 7개 목록 |
| SEC-6 | `src/config/boundaries.test.ts` | ui에서 adapters·tauri import 시 린트 에러, 동적 import·`__TAURI*` 금지 |
| FR-CC1 | `integrations/claude-code/hookRecord.test.mjs`, `integrations/claude-code/deskling-hook.test.mjs`, `integrations/codex/codexRecord.test.mjs`, `integrations/codex/deskling-codex-hook.test.mjs` | 레코드 필드만, 도구 범주 매핑, 출력 없음·exit 0·시간 상한 |
| FR-CC2 | `src-tauri/src/hook_bridge.rs`(`cargo test`), `src/platform/hookRecords.test.ts` | 거부 규칙, 스키마 순서 재직렬화, 소켓 수명, listen 실패 시 no-op |
| FR-CC3 | `src/adapters/claudeCode/translate.test.ts`, `src/adapters/claudeCode/source.test.ts` | 세션별 seq, 승인 해제, 위임, 메시지, 중단, `cc-`/`cx-`, StrictMode 재시작 |
| FR-CC4 | `src/app/App.test.tsx`, `src/app/settings.test.ts` | 자동/실제/데모 전환, 새 사무실, 저장 |
| FR-CC5 | `integrations/claude-code/install.test.mjs`, `integrations/codex/install.test.mjs` | print 기본, 백업, 다른 훅 보존, 제거, 안정적인 Node 경로 |
| 기타 | `scripts/with-cargo.test.mjs`, `src/config/appIcon.test.ts`, `src/app/ErrorBoundary.test.tsx` | cargo PATH 보정, 아이콘 원본, 렌더 오류 대체 화면 |

## 4. 명령

```bash
npm run test          # 전체 Vitest 1회 (src + integrations + scripts)
npm run verify:fast   # typecheck + lint + test
npm run verify        # + build + Rust fmt/clippy/test
npm run build:app     # macOS 번들
npm run hooks:status        # Claude Code 훅 설치 상태 (읽기만)
npm run hooks:codex:status  # Codex 훅 설치 상태 (읽기만)
```

## 5. 수동 시각 체크리스트

`[x]`는 실제 창 캡처·렌더링으로 확인한 항목, `[ ]`는 아직 사람이 직접 조작해 확인해야 하는 항목이다. 날짜와 근거는 `PROJECT_STATE.md`.

- [x] 창 테두리·타이틀바·그림자가 없다. 사무실 밖은 바탕화면이 비친다(창 캡처 alpha).
- [x] 창이 바탕화면 층에 뜬다 — CGWindowList layer −1, 프로세스 `UIElement`(Dock·⌘Tab 없음).
- [x] 실제 Claude Code 세션이 "Claude 1" 직원으로 책상에 앉고, 자동 보기가 실제 사무실로 바뀌며 DEMO 배지가 사라진다(M12).
- [x] 설치된 Codex 훅 스크립트에 넣은 시험 세션이 "Codex 1"로 들어와 터미널 작업을 하고 SessionEnd에 나간다(M13).
- [x] 요약 말풍선 → 활동 패널(실제 마크업 + CSS의 WebKit 렌더링, `docs/images/panel-and-toolbar.png`). 세션 줄이 한 줄로 보인다.
- [x] 데모 "사무실 하루"에서 입장·작업·라운지·대화·승인 대기·오류·위임·환호·퇴장이 보인다(`docs/images/session-friends.png`, `docs/images/all-states.png`).
- [x] release 번들(`npm run build:app`)이 엄격한 CSP 아래에서도 같은 장면을 렌더링한다.
- [ ] 실제 Codex 세션 — 사용자가 Codex에서 `/hooks`로 신뢰한 뒤 확인.
- [ ] 벽·바닥 빈 곳을 끌면 창이 움직인다. (네이티브 조작 미확인, 로직은 App 테스트)
- [ ] 크기 S/M/L, 투명도 슬라이더, 위에 띄우기 버튼이 실제 창에 적용된다. (로직은 App 테스트)
- [ ] 모션 "줄이기"에서 애니메이션이 멈추고 직원이 순간 이동하며 상태 구분은 유지된다. (CSS 규칙·속성은 테스트로 확인, 화면 미확인)

## 6. 범위 밖

- 실제 Hermes Agent 연동 테스트 (adapter 구현 시 추가)
- 픽셀 단위 시각 회귀 테스트 (검토 중 — 지금은 WebKit 렌더 + 사람 확인)
- WebDriver 기반 네이티브 E2E (macOS WKWebView WebDriver 미지원으로 보류)
