# ACCEPTANCE — Deskling 인수 기준

각 기준은 "검증 방법"에 적힌 방식으로 실제 확인했을 때만 충족으로 본다.

## A. 첫 vertical slice

| ID | 기준 (Given / When / Then) | 검증 방법 |
| --- | --- | --- |
| VS-1 | 깨끗한 클론에서 `npm install` 후 `npm run tauri dev`를 실행하면 macOS에서 Deskling 창이 뜬다. | 수동 실행 |
| VS-2 | 창에는 타이틀바·테두리·그림자가 없고 디오라마 밖 영역은 투명하다. | 설정 테스트 + 스크린샷 |
| VS-3 | 창은 기본적으로 바탕화면에 박혀 있고(다른 창 아래), "위에 띄우기"로 항상 위로 바꿀 수 있다(ADR-021). | App 테스트 + 네이티브 창 층 확인 |
| VS-4 | 장면은 직접 만든 SVG·픽셀 맵의 밝은 아이소메트릭 미니룸(침대, 책상·컴퓨터, 샤워 부스, 냉장고, 식탁, TV, 소파, 책장, 문)과 헤르메스로 구성된다. 외부 이미지가 없다. | MiniRoom 테스트 + 코드 리뷰 |
| VS-5 | 데모 `core` 시나리오를 재생하면 시각 상태가 `idle → thinking → coding → terminal → success → idle` 순서로 바뀌고 반복된다. | scripts 테스트 + App 통합 테스트 |
| VS-6 | 각 상태는 헤르메스의 행동(`data-activity`), 아이콘(`data-icon`), 모니터 화면, 텍스트가 서로 다르다. | visualSpec + MiniRoom 테스트 |
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
| MVP-9 | 오프라인이면 불 꺼진 방에서 이불 덮고 잔다. 일이 시작되면 책상으로 걸어간다. 대기 중에는 컴퓨터를 쓰지 않고 일상을 보낸다. | life·useLife·App 테스트 + 네이티브 DOM 프로브 |
| MVP-10 | 보고된 토큰 사용량이 예산을 소모할수록 에너지 단계가 full → ok → low → empty로 바뀌고 장면 신호(빈 캔·배터리·걷는 속도)가 달라진다. | mood·MiniRoom·life·App 테스트 |
| MVP-11 | 컨텍스트가 찰수록 화남 단계가 calm → annoyed → angry → furious로 바뀌고 땀·핏줄·김 이모트로 보인다. | mood·MiniRoom 테스트 |
| MVP-12 | 숫자는 활동 패널에만 있고 장면에는 없다. 예산을 바꾸면 에너지가 다시 계산되고 저장된다. | ActivityPanel·App 테스트 |
| MVP-13 | 완료한 작업 수만큼 경험치가 쌓이고 앱을 다시 켜도 유지되며, 5개에 어린이·25개에 어른이 된다. | growth·usePet·App 테스트 + 네이티브 DOM 프로브(xp 0→1) |
| MVP-14 | 경험치에 따라 포스터·화분·줄 조명·러그·책장·트로피가 하나씩 생긴다. | growth·MiniRoom·App 테스트 |
| MVP-15 | 이름을 짓고, 쓰다듬기·간식으로 하트 반응과 애정도 상승을 볼 수 있다. 에이전트 상태·에너지·화남은 바뀌지 않는다. | usePet·ActivityPanel·App 테스트 |
| MVP-16 | 데모로 자란 펫과 실제 에이전트 펫은 따로 저장되고, 데모 펫에는 DEMO 표시가 붙는다. | pet·usePet·App 테스트 |
| MVP-17 | 대기 중 헤르메스가 방을 걸어 다니며 샤워·밥·TV·책·창밖·스트레칭·물주기·낮잠을 한다. | life·useLife 테스트 + 스냅샷 |
| MVP-18 | 친구가 문으로 들어와 소파에 함께 앉았다가 나간다. 패널의 "친구 초대"로도 부를 수 있다. 위임 중에는 친구가 도우미로 옆에서 일한다. | life·ActivityPanel·App 테스트 + 스냅샷 |
| MVP-19 | 승인 대기면 방 앞으로 나와 손을 흔든다(호박색 !). 말풍선은 걷는 중에도 실제 상태를 보여준다. | life·MiniRoom·App 테스트 |

## C. 보안 수용 기준 (항상)

- 정규화 결과에는 EVENT_PROTOCOL §2 필드만 존재한다.
- 검증 실패 로그 문자열에 입력값이 포함되지 않는다.
- localStorage에는 `deskling.settings.v1`(설정 스키마)과 `deskling.pet.v1`(숫자와 사용자 이름) 두 키만 쓴다(ADR-018).
- Tauri capability에 셸·파일시스템·HTTP 권한이 없다.
