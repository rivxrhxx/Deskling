# Deskling

AI 에이전트가 실제로 일하는 모습을 바탕화면 위 작은 캐릭터와 미니어처 작업실 애니메이션으로 보여주는 macOS 데스크톱 앱.

> **상태:** vertical slice, MVP 화면(11개 상태, 활동 패널, 창 설정), 생활감(에너지·화남·침대)이 동작한다. 아직 실제 에이전트(Hermes 등)와는 연결되지 않았고
> 결정적(deterministic) **데모 이벤트**로만 동작한다. 데모로 동작하는 동안 화면에는 항상 `DEMO` 배지가 표시된다.
> 진행 상황과 검증 기록은 [PROJECT_STATE.md](PROJECT_STATE.md)에 있다.

![Deskling 방 — 에너지와 화남](docs/images/room-moods.png)

방 안을 엿보는 느낌의 디오라마. 왼쪽 위부터 대기(침대에서 뒹굴), 코딩(짜증), 터미널(지치고 화남), 웹 탐색(바닥난 에너지, 폭발 직전).

## 무엇을 하나

- 투명하고 프레임 없는 오버레이 창에 어두운 미니어처 개발자 작업실과 캐릭터를 띄운다.
- 에이전트 이벤트를 받아 `offline`, `idle`, `thinking`, `coding`, `browsing`, `terminal`, `file-work`,
  `waiting-approval`, `delegated`, `success`, `error` 상태를 포즈·아이콘·텍스트로 보여준다.
- **방에서 생활하는 모습:** 일이 없으면 침대로 걸어가 뒹굴고, 연결이 끊기면 불을 끄고 이불 덮고 잔다. 일이 들어오면 책상으로 돌아온다.
- **에너지 = 남은 토큰:** 정한 예산(기본 200k) 대비 남은 토큰이 줄면 더듬이 전구가 흐려지고 눈꺼풀이 내려오고 책상에 빈 에너지 캔이 쌓인다.
- **화남 = 컨텍스트:** 컨텍스트 창이 찰수록 일자 눈썹 → 찡그림과 핏줄 표시 → 머리 위 김과 붉어진 볼.
- 장면에는 숫자를 그리지 않는다. 캐릭터를 클릭하면 열리는 활동 패널에 남은 토큰·컨텍스트 숫자와 최근 활동이 나온다.
- 항상 위 표시, 드래그 이동, 크기·투명도 조절, reduced-motion을 지원한다.

### 11개 상태

상태마다 포즈·아이콘·텍스트·모니터 화면이 다르다(실제 마크업과 CSS를 WebKit으로 렌더링).
데모 시나리오는 활동 패널에서 고른다: **전체 상태**(11개 상태 순서대로), **기본 흐름**(`idle → thinking → coding → terminal → success → idle`), **하루 일과**(침대 → 일 → 지치고 화남 → 다시 침대 → 잠).

![11개 상태](docs/images/all-states.png)

### 활동 패널과 창 설정

캐릭터를 클릭하면 활동 패널(에너지·컨텍스트 숫자, 토큰 예산, 최근 활동)이, 마우스를 올리면 창 설정 툴바(크기 S/M/L, 불투명도, 항상 위, 모션, 닫기)가 나타난다.

![활동 패널과 툴바](docs/images/panel-and-toolbar.png)

## 하지 않는 것

- 에이전트에게 명령을 보내거나 권한을 승인하지 않는다. **관찰만 한다.**
- chain-of-thought, 프롬프트, 파일 내용·경로, 터미널 명령어, 환경변수, API 키, 헤더, tool arguments를 표시하거나 저장하지 않는다.
- 진행률이나 작업 내용을 추측하지 않는다. 화면은 실제 도착한 이벤트만 반영한다.

## 요구 사항

- macOS (Apple Silicon에서 개발·검증)
- Node.js 20.19+ 또는 22.12+ (개발 환경: 23.11)
- Rust stable (개발 환경: 1.100) — `rustup`으로 설치
- Xcode Command Line Tools

`cargo`가 셸 PATH에 없어도 npm 스크립트가 `~/.cargo/bin`을 자동으로 추가한다.
터미널에서 직접 `cargo`를 쓰려면 `~/.zshrc`에 `. "$HOME/.cargo/env"`를 추가한다.

## 시작하기

```bash
npm install
npm run tauri dev      # 네이티브 오버레이 창 실행
```

## 명령

| 명령 | 설명 |
| --- | --- |
| `npm run test` | 테스트 실행 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | 린트 |
| `npm run build` | 프런트엔드 프로덕션 빌드 |
| `npm run verify:fast` | typecheck + lint + test |
| `npm run verify` | verify:fast + build + Rust fmt/clippy/test |
| `npm run tauri dev` | 개발 모드로 앱 실행 |
| `npm run build:app` | macOS 앱 번들 빌드 → `src-tauri/target/release/bundle/macos/Deskling.app` |

## 구조

```
src/core/       이벤트 규격·정규화·리듀서 (순수 TS)
src/adapters/   이벤트 소스 (demo; 향후 Hermes)
src/platform/   Tauri 창 API 래퍼
src/app/        조립·설정
src/ui/         작업실 장면과 패널 컴포넌트
src-tauri/      Tauri 2 / Rust 셸
docs/           제품·요구사항·설계·테스트 문서
```

## 문서

- [AGENTS.md](AGENTS.md) — 작업 규칙
- [docs/PRODUCT.md](docs/PRODUCT.md) — 제품 정의
- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) — 요구사항
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 아키텍처
- [docs/EVENT_PROTOCOL.md](docs/EVENT_PROTOCOL.md) — AgentEvent 규격
- [docs/DESIGN.md](docs/DESIGN.md) — 시각 디자인
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md) — 테스트 계획
- [docs/TASKS.md](docs/TASKS.md) — 작업 체크리스트
- [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) — 인수 기준
- [PROJECT_STATE.md](PROJECT_STATE.md) — 현재 상태
- [DECISIONS.md](DECISIONS.md) — 설계 결정 기록
