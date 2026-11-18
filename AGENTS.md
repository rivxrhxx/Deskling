# AGENTS.md — Deskling 작업 규칙

이 문서는 이 저장소에서 일하는 사람과 AI 코딩 에이전트가 따르는 규칙이다.
제품 설명은 `docs/PRODUCT.md`, 현재 진행 상황은 `PROJECT_STATE.md`를 본다.

## 1. 반드시 지킬 보안·제품 규칙

이 규칙은 기능보다 우선한다. 어기는 변경은 리뷰에서 거부한다.

1. **관찰 전용.** Deskling은 에이전트를 관찰만 한다. 명령 실행, 권한 승인, 에이전트 제어 기능을 만들지 않는다.
2. **추측 금지.** 화면 상태는 실제로 도착한 이벤트에서만 도출한다. 진행률, 남은 시간, 작업 내용을 추정하지 않는다.
3. **표시·저장 금지 데이터.** chain-of-thought / 숨겨진 reasoning, 프롬프트 전문, 파일 내용, 파일 경로, 터미널 명령어,
   환경변수, API 키, Authorization 헤더, raw tool arguments는 UI·로그·localStorage 어디에도 남기지 않는다.
4. **정규화된 이벤트만 renderer로.** React 레이어는 `src/core/normalize.ts`를 통과한 `AgentEvent`에서 나온 상태만 받는다.
   검증 실패 로그에는 에러 코드만 남기고 입력값은 절대 출력하지 않는다.
5. **Provider 로직 격리.** Hermes 등 특정 provider 로직은 `src/adapters/<provider>/`(또는 향후 Rust 측 adapter)에만 둔다.
   `src/ui/`, `src/app/` 컴포넌트에 provider 이름이나 provider 전용 분기를 넣지 않는다.
   예외(ADR-022): 프로토콜 enum인 `source.kind` 값(`hermes`, `claude-code`, `codex` …)으로 캐릭터의 **모습·이름표만** 고르는 것은 허용한다
   (상태별 톤을 고르는 것과 같은 표현 매핑). 전송·훅 해석·이벤트 번역 같은 연동 로직은 여전히 adapter에만 둔다.
6. **데모는 항상 표시.** demo adapter가 동작하는 동안 DEMO 배지를 숨기는 옵션을 만들지 않는다.
7. **원본 그래픽만.** 외부 게임·상업 캐릭터 이미지를 복사하지 않는다. MVP 그래픽은 직접 만든 CSS/SVG primitive다.

## 2. 작업 방식

1. `docs/TASKS.md`에서 체크되지 않은 **가장 위의 작업 하나만** 고른다. 동시에 여러 작업을 구현하지 않는다.
2. 행동(behavior)을 추가할 때는 TDD를 따른다.
   - 실패하는 테스트를 먼저 작성한다.
   - `npm run test`로 **실제로 실패하는 것을 확인**한다(실패 이유가 "아직 구현 없음"이어야 한다).
   - 최소 구현으로 통과시킨다. 필요하면 리팩터링한다.
3. 테스트가 통과한 뒤에만 `docs/TASKS.md` 체크박스를 `[x]`로 바꾼다.
4. 실행하지 않은 테스트·빌드를 통과했다고 쓰지 않는다. `PROJECT_STATE.md`에는 실제로 실행한 명령과 결과만 기록한다.
5. 아키텍처를 바꾸는 변경(레이어 경계, 이벤트 규격, 의존성 추가, 창 동작 방식)은 **구현 전에** `DECISIONS.md`에 ADR을 추가한다.
6. 이벤트 규격을 바꾸면 `docs/EVENT_PROTOCOL.md`와 `src/core/agentEvent.ts`를 같은 커밋에서 바꾼다.
7. 세션을 마칠 때 `PROJECT_STATE.md`의 "다음 작업"과 "마지막 검증"을 갱신한다.

## 3. 명령

| 명령 | 용도 |
| --- | --- |
| `npm run test` | Vitest 단위·컴포넌트·통합 테스트 1회 실행 |
| `npm run typecheck` | TypeScript 타입 검사 (`tsc -b`) |
| `npm run lint` | ESLint (경고도 실패로 처리) |
| `npm run build` | 타입 검사 + Vite 프로덕션 빌드 |
| `npm run verify:fast` | typecheck → lint → test |
| `npm run verify` | verify:fast → build → Rust fmt/clippy/test |
| `npm run tauri dev` | 네이티브 오버레이 창으로 앱 실행 |
| `npm run build:app` | macOS `.app` 번들 빌드 |

커밋 전에는 최소 `npm run verify:fast`, 네이티브 코드나 설정을 바꿨다면 `npm run verify`를 실행한다.

`cargo`가 PATH에 없어도 npm 스크립트는 `scripts/with-cargo.mjs`가 `~/.cargo/bin`을 PATH에 추가해서 실행한다.

## 4. 디렉터리 경계

```
src/core/       순수 TypeScript. 이벤트 규격, 정규화, 리듀서. React·Tauri import 금지.
src/adapters/   이벤트 소스(demo, 향후 hermes). React·UI import 금지. 원시 데이터를 내보내고 정규화는 core가 한다.
src/platform/   네이티브 창 API 래퍼. `@tauri-apps/*`를 import할 수 있는 유일한 프런트엔드 폴더.
src/app/        조립 레이어. 소스 → 정규화 → 리듀서 → UI 연결, 설정 저장.
src/ui/         표현 컴포넌트. 시각 상태만 받는다. adapters·platform·Tauri import 금지.
src-tauri/      Rust/Tauri 셸. 창 설정과 capability.
```

경계는 `eslint.config.js`의 `no-restricted-imports`로 강제한다. 규칙을 끄지 말고 구조를 고친다.

## 5. 코드 규칙

- TypeScript `strict`. `any` 금지(테스트의 의도적 잘못된 입력은 `unknown`으로 만든다).
- 리듀서와 정규화 함수는 순수 함수다. 시간·난수·전역 상태를 읽지 않는다.
- 시간이 필요한 코드(데모 재생)는 스케줄러와 시계를 주입받는다.
- UI 텍스트는 `src/ui/visualSpec.ts`, `src/ui/activityText.ts`의 고정 문구만 쓴다. 이벤트에서 온 자유 텍스트를 렌더링하지 않는다.
- 애니메이션은 CSS로 작성하고 `[data-motion="reduced"]`에서 꺼진다. 상태는 색상만이 아니라 포즈·아이콘·텍스트로 구분한다.

## 6. 커밋

- Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `build:`, `refactor:`.
- 한 커밋은 `docs/TASKS.md`의 작업 하나(또는 밀접한 몇 개)에 대응한다.
- `node_modules`, `dist`, `src-tauri/target`, `.omc/`, 비밀값 파일은 커밋하지 않는다.
