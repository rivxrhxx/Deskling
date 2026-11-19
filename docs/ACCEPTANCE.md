# ACCEPTANCE — Deskling 인수 기준

각 기준은 "검증 방법"에 적힌 방식으로 실제 확인했을 때만 충족으로 본다.
대체된 기준은 지우지 않고 줄을 긋고 무엇으로 대체됐는지 적는다(근거 추적용).

## A. 첫 vertical slice

| ID | 기준 (Given / When / Then) | 검증 방법 |
| --- | --- | --- |
| VS-1 | 깨끗한 클론에서 `npm install` 후 `npm run tauri dev`를 실행하면 macOS에서 Deskling 창이 뜬다. | 수동 실행 |
| VS-2 | 창에는 타이틀바·테두리·그림자가 없고 사무실 밖 영역은 투명하다. | 설정 테스트 + 창 캡처 alpha |
| VS-3 | 창은 기본적으로 바탕화면에 박혀 있고(다른 창 아래), "위에 띄우기"로 항상 위로 바꿀 수 있다(ADR-021). | App 테스트 + 네이티브 창 층 확인 |
| VS-4 | 장면은 직접 만든 SVG·픽셀 맵의 밝은 아이소메트릭 **사무실**(책상 8개, 회의 테이블, 커피머신, 정수기, 소파, 책장, 화이트보드, 창문, 화분, 문)과 직원들로 구성된다. 외부 이미지가 없다. (원래 미니룸 → ADR-025) | OfficeRoom 테스트 + 코드 리뷰 |
| VS-5 | 데모 `core` 시나리오를 재생하면 시각 상태가 `idle → thinking → coding → terminal → success → idle` 순서로 바뀌고 반복된다. | scripts 테스트 + App 통합 테스트 |
| VS-6 | 각 상태는 직원의 포즈(`data-pose`)·이모트, 아이콘(`data-icon`), 모니터 화면(`data-screen`), 텍스트가 서로 다르다. | visualSpec + OfficeRoom 테스트 |
| VS-7 | 데모 모드에서는 모든 상태에서 `DEMO` 배지가 보인다. | App 통합 테스트 |
| VS-8 | 시스템 "동작 줄이기"가 켜져 있으면 `data-motion="reduced"`이고 CSS 애니메이션이 꺼지며 직원은 걷지 않고 순간 이동한다. | useReducedMotion·useOffice 테스트 + CSS 규칙 확인 |
| VS-9 | 리듀서와 사무실 엔진은 순수 함수이며 같은 입력에 같은 결과를 낸다. | agentState·roomState·office 테스트 |
| VS-10 | 민감 필드가 담긴 원시 이벤트·훅 입력을 넣어도 정규화 결과·리듀서 상태·DOM·훅 레코드 어디에도 그 값이 나타나지 않는다. | normalize·translate·hookRecord·codexRecord·App 테스트 |
| VS-11 | `npm run test`, `typecheck`, `lint`, `build`, `verify:fast`, `verify`가 통과한다. | 명령 실행 로그 |

## B. MVP

| ID | 기준 | 검증 방법 |
| --- | --- | --- |
| MVP-1 | 데모 `tour`가 11개 상태를 모두 순서대로 보여준다. | scripts 테스트 |
| MVP-2 | 요약 말풍선 클릭(또는 Enter)으로 활동 패널이 열리고, 최근 12개 이벤트가 최신순으로 세션 이름·고정 문구·시각으로 보인다. Esc로 닫히고 포커스는 말풍선으로 돌아간다. (원래 캐릭터 클릭 → ADR-025 §5) | ActivityPanel + App 테스트 |
| MVP-3 | 빈 영역 드래그로 창이 이동하고, 말풍선·컨트롤 클릭은 드래그가 아니다. | App 테스트 + 수동 |
| MVP-4 | 크기 S/M/L과 투명도(30~100%)를 바꿀 수 있고 재시작 후 유지된다. | WindowToolbar + settings 테스트 + 수동 |
| MVP-5 | 위에 띄우기를 끄고 켤 수 있다. | WindowToolbar·App 테스트 + 수동 |
| MVP-6 | 승인 대기는 호박색, 오류는 붉은 주황색 강조를 쓴다(직원·알림 줄·요약 말풍선). | visualSpec·StatusBubble·AttentionLine 테스트 + 스크린샷 |
| MVP-7 | 앱 어디에도 에이전트에게 명령·승인을 보내는 코드 경로가 없다. capability에 emit이 없고 소켓은 받기만 한다. | 코드 리뷰 + capability 테스트 + Rust 테스트 |
| MVP-8 | `npm run build:app`이 macOS `.app` 번들을 만든다. | 명령 실행 로그 |
| MVP-9 | ~~오프라인이면 불 꺼진 방에서 잔다 …~~ **대체됨(ADR-025):** 아무도 없으면 사무실 불이 꺼진다. 작업 중인 직원은 자기 책상, 대기 중인 직원은 라운지. | office·useOffice·App 테스트 + 창 캡처 |
| MVP-10 | 보고된 토큰 사용량이 예산을 소모할수록 그 직원의 에너지 단계가 full → ok → low → empty로 바뀌고 책상 위 빈 캔·배터리 이모트가 달라진다. | mood·OfficeRoom·App 테스트 |
| MVP-11 | 컨텍스트가 찰수록 그 직원의 화남 단계가 calm → annoyed → angry → furious로 바뀌고 땀·핏줄·김 이모트로 보인다. | mood·OfficeRoom 테스트 |
| MVP-12 | 토큰·컨텍스트 숫자는 활동 패널의 세션 줄에만 있고 장면에는 없다(장면의 숫자는 직원 레벨 배지뿐 — ADR-028). 예산을 바꾸면 에너지가 다시 계산되고 저장된다. | ActivityPanel·App·OfficeRoom 테스트 |
| MVP-13 | 완료한 작업 수만큼 사무실 경험치가 쌓이고 앱을 다시 켜도 유지된다. (원래 펫 성장 단계 → ADR-025 §7) | growth·officeProgress·useOfficeProgress·App 테스트 |
| MVP-14 | 경험치 2·4·7·10·15·25에 포스터·책상 화분·줄 조명·라운지 러그·책장 가득·트로피 선반이 하나씩 생긴다. | growth·OfficeRoom·visualSpec 테스트 |
| MVP-15 | ~~이름 짓기·쓰다듬기·간식~~ **대체됨(ADR-025 §7):** 돌보기 기능은 없다. | — |
| MVP-16 | 데모와 실제 에이전트의 사무실 경험치는 따로 저장되고, 데모 사무실 묶음에는 DEMO 표시가 붙는다. | officeProgress·useOfficeProgress·App 테스트 |
| MVP-17 | ~~헤르메스의 일상~~ **대체됨(ADR-025 §3):** 대기 1.5초 뒤 라운지의 빈 자리(시드 고정)로 걸어가 쉬고, 일이 시작되면 책상으로 돌아온다. | office·useOffice 테스트 + 스냅샷 |
| MVP-18 | ~~친구 방문·친구 초대~~ **대체됨(ADR-025):** 위임 중인 직원 책상 옆에 도우미 봇이 있다. 무작위 손님은 없다. | office·OfficeRoom 테스트 |
| MVP-19 | 승인 대기면 그 직원이 일어나 손을 흔든다(호박색 !). 알림 줄이 이름으로 알린다. | office·OfficeRoom·AttentionLine 테스트 |

## C. 여러 세션 (M10, M12)

| ID | 기준 | 검증 방법 |
| --- | --- | --- |
| MS-1 | 새 세션의 첫 이벤트에 직원이 문으로 들어와 비어 있는 가장 작은 번호 책상에 앉고, `agent.offline`에 문으로 나간다. 9번째부터는 패널에만 "(자리 없음)". | office·roomState·App 테스트 |
| MS-2 | 직원 이름은 종류 안 번호(Claude n, Codex n, 데모 n …)이고 모습은 `source.kind`로 정해진다. | roomState·sprites·OfficeRoom 테스트 |
| MS-3 | 한 세션의 이벤트(늦은 seq 포함)가 다른 세션의 상태·위치를 바꾸지 않는다. | roomState·office 테스트 |
| MS-4 | `session.message`: 둘 다 있으면 4초간 서로 돌아보며 말풍선, 아니면 보낸 쪽 위에 편지 3초. 내용은 없다. | roomState·office·OfficeRoom 테스트 |
| MS-5 | 요약 말풍선이 "N명 일하는 중 · N명 승인 대기 · N명 오류 · N명 쉬는 중"을 고정 순서로 세고 `aria-live="polite"`로 알린다. | roomState·StatusBubble·App 테스트 |

## D. 실제 연결 (M11, M13)

| ID | 기준 | 검증 방법 |
| --- | --- | --- |
| CC-1 | 훅 스크립트는 훅 레코드 v1 필드만 보내고, 출력 없이 항상 exit 0으로 300ms 안에 끝난다. 앱이 꺼져 있어도 에이전트를 막지 않는다. | hookRecord·deskling-hook·codexRecord·deskling-codex-hook 테스트 |
| CC-2 | Rust 브리지는 알 수 없는 필드·타입·enum·세션 형식·크기·속도 위반을 거부하고, 통과한 레코드만 다시 직렬화해 보낸다. | `cargo test` 23개 |
| CC-3 | 번역기는 세션별 seq를 늘리고, 승인 대기 해제·위임·메시지·중단을 규칙대로 바꾸며, 결과는 다시 정규화를 통과한다. | translate·source 테스트 |
| CC-4 | 자동 보기에서 실제 세션이 말하면 실제 사무실로 바뀌고 DEMO 배지가 사라진다. 실제/데모로 고정할 수 있고 선택은 저장된다. | App·settings 테스트 + 창 캡처 |
| CC-5 | 설치기는 동의 후 직접 실행할 때만 쓰고, 먼저 백업하며, 다른 도구의 훅을 그대로 두고, 제거하면 Deskling 훅만 빠진다. | install 테스트(Claude Code·Codex) + 실제 설치 기록 |
| CC-6 | 실제 Claude Code 세션과 Codex 훅 경로가 사무실에 직원으로 들어오고 나간다. | 네이티브 창 캡처(PROJECT_STATE "네이티브 확인 내역") |

## E. 직원 레벨 (M15, ADR-028)

| ID | 기준 | 검증 방법 |
| --- | --- | --- |
| LV-1 | 한 세션이 작업을 끝낼 때마다 그 직원만 경험치를 얻고 레벨이 Lv1 → 2(1) → 3(3) → 4(6) → 5(10)처럼 오른다. 다른 직원의 레벨은 그대로다. | growth·roomState·useOfficeProgress·App 테스트 |
| LV-2 | 레벨은 앱을 다시 켜도, 같은 세션이 다시 들어와도 이어진다. 저장소에는 세션 id 대신 해시 id와 숫자만 있다. 데모/실제 따로. | officeProgress·useOfficeProgress·App 테스트 |
| LV-3 | 장면의 직원마다 "Lv n" 픽셀 배지가 단계별 색(흰·하늘·금)으로 보이고 책상·모니터에 가리지 않는다. | OfficeRoom·visualSpec 테스트 + 장면 스냅샷 |
| LV-4 | 사무실에 있는 동안 레벨이 오르면 2.5초 동안 "LEVEL UP!"이 뜨고 배지가 반짝인다. 들어올 때는 뜨지 않는다. | office·useOffice·OfficeRoom·App·styles 테스트 |
| LV-5 | 패널 세션 줄에 "Lv n · 다음까지 k"가 보인다. | ActivityPanel·App 테스트 |

## F. 보안 수용 기준 (항상)

- 정규화 결과에는 EVENT_PROTOCOL §2 필드만 존재한다.
- 검증 실패 로그 문자열에 입력값이 포함되지 않는다(TS·Rust 모두 코드만).
- 훅 레코드에는 `v`, `agent`, `session`, `event`, `tool`, `ok`, `at`만 있다. 프롬프트·도구 입력/결과·경로·명령·transcript는 읽지도 않는다.
- localStorage에는 `deskling.settings.v1`(설정 스키마)과 `deskling.office.v1`(데모/실제 경험치 숫자, 직원별 해시 id → 숫자) 두 키만 쓴다. 세션 id는 저장하지 않는다. `deskling.pet.v1`은 읽기만 한다(SEC-7).
- Tauri capability에 셸·파일시스템·HTTP·emit 권한이 없다. 소켓은 0600, 폴더는 0700이다.
