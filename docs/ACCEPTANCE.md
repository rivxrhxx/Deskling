# ACCEPTANCE — Deskling 인수 기준

각 기준은 "검증 방법"에 적힌 방식으로 실제 확인했을 때만 충족으로 본다.

## A. 첫 vertical slice

| ID | 기준 (Given / When / Then) | 검증 방법 |
| --- | --- | --- |
| VS-1 | 깨끗한 클론에서 `npm install` 후 `npm run tauri dev`를 실행하면 macOS에서 Deskling 창이 뜬다. | 수동 실행 |
| VS-2 | 창에는 타이틀바·테두리·그림자가 없고 디오라마 밖 영역은 투명하다. | 설정 테스트 + 스크린샷 |
| VS-3 | 창은 기본적으로 항상 위에 있다. | 설정 테스트 + 수동 |
| VS-4 | 장면은 직접 만든 SVG의 어두운 작업실(벽, 바닥, 책상, 모니터, 의자, 소품)과 캐릭터로 구성된다. 외부 이미지가 없다. | Workshop 테스트 + 코드 리뷰 |
| VS-5 | 데모 `core` 시나리오를 재생하면 시각 상태가 `idle → thinking → coding → terminal → success → idle` 순서로 바뀌고 반복된다. | scripts 테스트 + App 통합 테스트 |
| VS-6 | 각 상태는 포즈(`data-pose`), 아이콘(`data-icon`), 텍스트가 서로 다르다. | visualSpec + Workshop 테스트 |
| VS-7 | 데모 모드에서는 모든 상태에서 `DEMO` 배지가 보인다. | App 통합 테스트 |
| VS-8 | 시스템 "동작 줄이기"가 켜져 있으면 `data-motion="reduced"`이고 CSS 애니메이션이 꺼진다. | useReducedMotion 테스트 + CSS 규칙 확인 |
| VS-9 | 리듀서는 순수 함수이며 같은 이벤트 열에 같은 결과를 낸다. | agentState 테스트 |
| VS-10 | 민감 필드가 담긴 원시 이벤트를 넣어도 정규화 결과·리듀서 상태·DOM 어디에도 그 값이 나타나지 않는다. | normalize + App 테스트 |
| VS-11 | `npm run test`, `typecheck`, `lint`, `build`, `verify:fast`, `verify`가 통과한다. | 명령 실행 로그 |

## B. MVP

| ID | 기준 | 검증 방법 |
| --- | --- | --- |
| MVP-1 | 데모 `tour`가 11개 상태를 모두 순서대로 보여준다. | scripts 테스트 |
| MVP-2 | 캐릭터 클릭(또는 Enter)으로 최근 활동 패널이 열리고, 최근 12개 이벤트가 최신순으로 고정 문구와 시각으로 보인다. Esc로 닫힌다. | ActivityPanel + App 테스트 |
| MVP-3 | 빈 영역 드래그로 창이 이동하고, 캐릭터 클릭은 드래그가 아니다. | App 테스트 + 수동 |
| MVP-4 | 크기 S/M/L과 투명도(30~100%)를 바꿀 수 있고 재시작 후 유지된다. | WindowToolbar + settings 테스트 + 수동 |
| MVP-5 | 항상 위를 끄고 켤 수 있다. | WindowToolbar 테스트 + 수동 |
| MVP-6 | 승인 대기는 호박색, 오류는 붉은 주황색 강조를 쓴다. | visualSpec 테스트 + 스크린샷 |
| MVP-7 | 앱 어디에도 에이전트에게 명령·승인을 보내는 코드 경로가 없다. | 코드 리뷰 + capability 테스트 |
| MVP-8 | `npm run build:app`이 macOS `.app` 번들을 만든다. | 명령 실행 로그 |

## C. 보안 수용 기준 (항상)

- 정규화 결과에는 EVENT_PROTOCOL §2 필드만 존재한다.
- 검증 실패 로그 문자열에 입력값이 포함되지 않는다.
- localStorage에는 `deskling.settings.v1` 키 하나만 쓰고, 그 값은 설정 스키마만 담는다.
- Tauri capability에 셸·파일시스템·HTTP 권한이 없다.
