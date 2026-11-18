# TEST_PLAN — Deskling

## 1. 원칙

- 행동은 **실패하는 테스트를 먼저** 작성하고, 실제로 실패하는 것을 확인한 뒤 구현한다.
- `test.skip`, `test.only`, `it.todo`, 빈 테스트는 커밋하지 않는다(완료 증거로 인정하지 않음).
- 시간은 `vi.useFakeTimers()`와 주입 시계로만 다룬다. 실제 `sleep`에 의존하지 않는다.
- 테스트는 공개 행동(반환값, DOM, 호출된 인터페이스)을 검증한다. 내부 구현 세부에 묶이지 않는다.
- 결과 보고는 실제 실행한 명령의 출력만 근거로 한다.

## 2. 테스트 레벨

| 레벨 | 대상 | 도구 | 위치 |
| --- | --- | --- | --- |
| 단위 | core(정규화, 리듀서, ingest), demo 스크립트·소스, settings | Vitest (node/jsdom) | `src/**/*.test.ts` |
| 컴포넌트 | StatusBubble, DemoBadge, MiniRoom, ActivityPanel, WindowToolbar | Vitest + RTL + jsdom | `src/ui/**/*.test.tsx` |
| 통합 | App + demo source + fake timers + mock WindowControls | Vitest + RTL | `src/app/*.test.tsx` |
| 설정 | `tauri.conf.json`, capability, 레이어 경계 린트 규칙 | Vitest (JSON import, ESLint API) | `src/config/*.test.ts` |
| 네이티브 | Rust 컴파일·clippy·fmt, 앱 번들 | cargo, tauri CLI | `npm run verify`, `npm run build:app` |
| 수동 시각 | 투명 창, 드래그, 실제 애니메이션 | `npm run tauri dev` + 스크린샷 | §5 체크리스트 |

## 3. 요구사항 ↔ 테스트 매핑

| 요구사항 | 테스트 파일 | 핵심 단언 |
| --- | --- | --- |
| FR-E1, FR-E3 | `src/core/normalize.test.ts` | 유효 이벤트 → 규격 필드만 가진 동결 객체 |
| §8 에러 코드 | `src/core/normalize.test.ts` | 각 잘못된 입력 → 지정 코드 |
| SEC-1, SEC-2 | `src/core/normalize.test.ts` | 민감 필드·값이 출력 JSON에 없음 |
| FR-E2, SEC-3 | `src/core/ingest.test.ts` | 실패 시 dispatch 없음, 보고에 입력값 없음 |
| FR-E4~E6 | `src/core/agentState.test.ts` | 우선순위 규칙, seq 무시, 세션 전환, 시간 무관 |
| FR-P2 | `src/core/agentState.test.ts` | recent 최대 12, 최신순 |
| FR-D2, FR-D3 | `src/adapters/demo/scripts.test.ts` | 스크립트를 리듀서에 적용한 시각 상태 열 |
| FR-D1, FR-D4 | `src/adapters/demo/demoSource.test.ts` | 고정 간격, 반복, seq 증가, stop 후 무발행 |
| FR-D6 | `src/adapters/demo/scripts.test.ts` | 모든 스크립트 이벤트가 정규화 통과 |
| FR-S3 | `src/ui/visualSpec.test.ts` | 11개 상태, 라벨·아이콘·화면·행동 모두 고유, DESIGN §4·§4.3 표와 코드 일치 |
| FR-S1, FR-S6 | `src/ui/miniroom/MiniRoom.test.tsx` | 가구, 상태별 화면 `data-screen`, 포즈 `data-pose`, 텍스트 노드 없음 |
| FR-S4 | `src/ui/StatusBubble.test.tsx` | `role=status`, 아이콘·라벨 |
| FR-D5 | `src/ui/DemoBadge.test.tsx`, `src/app/App.test.tsx` | 데모 모드 모든 상태에서 배지 |
| FR-M1~M3 | `src/app/useReducedMotion.test.tsx`, `src/app/App.test.tsx` | `data-motion` 값 |
| FR-P1~P4 | `src/ui/ActivityPanel.test.tsx`, `src/app/App.test.tsx` | 열기/닫기, 고정 문구 |
| FR-W2, W4, W5, W8 | `src/ui/WindowToolbar.test.tsx`, `src/app/App.test.tsx` | controls 호출 인자 |
| FR-W3 | `src/app/App.test.tsx` | 빈 영역 pointerdown → startDragging, 캐릭터 → 패널 |
| FR-W6, SEC-7 | `src/app/settings.test.ts` | 검증·폴백·저장 키 하나 |
| FR-W1, SEC-5 | `src/config/tauriConfig.test.ts` | transparent/decorations/alwaysOnTop/shadow/macOSPrivateApi, 권한 목록 |
| SEC-6 | `src/config/boundaries.test.ts` | ui에서 adapters·tauri import 시 린트 에러, 동적 import·`__TAURI*` 금지 |
| FR-V1 | `src/core/normalize.test.ts`, `src/core/agentState.test.ts` | v2 `usage.reported` 숫자만, `bad-usage`, 세션별 스냅샷, 최근 목록 제외 |
| FR-V2, FR-V3 | `src/core/mood.test.ts` | 에너지·화남 단계 경계값 |
| FR-V4 | `src/ui/miniroom/MiniRoom.test.tsx` | 캔 수, 이모트 우선순위(땀·핏줄·김·배터리), 잠잘 때 z 우선, 텍스트 없음 |
| FR-V5, FR-V6 | `src/ui/ActivityPanel.test.tsx`, `src/app/settings.test.ts`, `src/app/App.test.tsx` | 숫자·meter·보고 없음, 예산 선택·저장·재계산 |
| FR-G1, FR-G6 | `src/core/agentState.test.ts`, `src/app/pet.test.ts`, `src/app/usePet.test.tsx`, `src/app/App.test.tsx` | completedTurns, 증가분만 경험치, demo/live 분리, 저장·재시작 |
| FR-G2, FR-G3 | `src/core/growth.test.ts`, `src/ui/miniroom/MiniRoom.test.tsx` | 단계·해금 경계값, 스프라이트 배율·별 배지, 소품 |
| FR-G4, FR-G5 | `src/core/growth.test.ts`, `src/app/usePet.test.tsx`, `src/ui/ActivityPanel.test.tsx`, `src/app/App.test.tsx` | 쿨다운·하루 간식·상한, 하트·간식 반응, 이름 정리, 에이전트 상태 불변 |
| FR-V7, FR-V8 | `src/app/useLife.test.tsx`, `src/app/App.test.tsx` | 잠 → 책상으로 걸어감, hotspot이 헤르메스 좌표(`--hx`/`--hy`)를 따라감 |
| FR-R1 | `src/core/room.test.ts`, `src/ui/miniroom/MiniRoom.test.tsx` | 투영 좌표, 가구·지점이 바닥 안, 통로가 가구를 지나지 않음, 가구 부품 |
| FR-R2, FR-R3 | `src/core/life.test.ts`, `src/app/useLife.test.tsx` | 상태별 필수 행동 즉시 반영, 대기 중 일상만(컴퓨터 안 씀), 시드 재현 |
| FR-R4, FR-R5 | `src/core/life.test.ts`, `src/ui/ActivityPanel.test.tsx`, `src/app/App.test.tsx` | 친구 방문·퇴장, 위임 도우미, "친구 초대" 버튼과 비활성 조건, 오프라인 밤 |
| FR-R6 | `src/core/life.test.ts`, `src/app/useLife.test.tsx` | 걷기 경로·속도, reduced-motion 순간 이동·프레임 고정, 언마운트 시 타이머 정리 |
| FR-R7 | `src/app/App.test.tsx`, `src/config/tauriConfig.test.ts` | 기본 바탕화면 층, "위에 띄우기" 전환, Accessory 정책 |

## 4. 명령

```bash
npm run test          # 전체 테스트 1회
npm run verify:fast   # typecheck + lint + test
npm run verify        # + build + Rust fmt/clippy/test
npm run build:app     # macOS 번들
```

## 5. 수동 시각 체크리스트 (`npm run tauri dev`)

2026-11-18 검증 결과. `[x]`는 실제 화면 캡처로 확인한 항목, `[ ]`는 아직 사람이 직접 조작해 확인해야 하는 항목이다.

- [x] 창 테두리·타이틀바·그림자가 없다. 디오라마 밖은 바탕화면이 비친다.
  - dev·release 창 캡처에서 모서리 alpha = 0, 창 픽셀의 약 36%가 완전 투명.
- [x] 창이 항상 위 레벨로 뜬다 — CGWindowList에서 Deskling 창 layer = 5(floating).
- [ ] 다른 앱 창을 클릭해도 Deskling이 위에 남는다 / 핀 버튼으로 끄고 켤 수 있다. (네이티브 조작 미확인, 로직은 App 테스트)
- [ ] 벽·바닥 빈 곳을 끌면 창이 움직인다. (네이티브 조작 미확인, 로직은 App 테스트)
- [x] 캐릭터 클릭 → 활동 패널 표시 — 실제 App 마크업 + CSS를 WebKit(Quick Look)으로 렌더링해 확인(`docs/images/panel-and-toolbar.png`).
- [x] 생활감(M7): 네이티브 dev 앱의 실제 WKWebView DOM 프로브로 전체 투어 동안 위치(침대/책상)·에너지·화남 단계·캔 수·표시 개수가 규칙대로 바뀌고 JS 오류가 없음을 확인. 장면 이미지는 WebKit 렌더링(`docs/images/room-moods.png`, `docs/images/all-states.png`).
- [x] DEMO 배지가 항상 보인다 — 투어 26장 캡처 전부에서 확인.
- [x] 데모 투어가 11개 상태를 순서대로 보여주고, 각 상태의 포즈·아이콘·텍스트가 다르다(M6 네이티브 캡처, 현재 레이아웃은 `docs/images/all-states.png`).
- [ ] 크기 S/M/L, 투명도 슬라이더가 실제 창에 적용된다. (네이티브 조작 미확인, 로직은 App 테스트)
- [ ] 모션 "줄이기"에서 애니메이션이 멈추고 상태 구분은 유지된다. (CSS 규칙·속성은 테스트로 확인, 화면 미확인)
- [x] release 번들(`npm run build:app`)이 엄격한 CSP 아래에서도 같은 장면을 렌더링한다(M6 시점 캡처로 확인).

네이티브 클릭·드래그 자동화는 이 개발 환경에서 computer-use 도구가 설정되지 않아 수행하지 못했다.

## 6. 범위 밖

- 실제 Hermes Agent 연동 테스트 (adapter 구현 시 추가)
- 픽셀 단위 시각 회귀 테스트 (MVP 이후 검토)
- WebDriver 기반 네이티브 E2E (macOS WKWebView WebDriver 미지원으로 보류)
