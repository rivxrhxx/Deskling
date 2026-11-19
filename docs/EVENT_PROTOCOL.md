# EVENT_PROTOCOL — AgentEvent v3

Deskling이 이해하는 유일한 입력 형식. provider(Hermes Agent 등)에 의존하지 않는다.
코드상의 진실 공급원은 `src/core/agentEvent.ts`이며, 이 문서와 항상 같은 커밋에서 바뀐다.

## 1. 원칙

1. **관찰된 사실만.** 이벤트는 "도구 실행이 시작됐다" 같은 사실을 말한다. 진행률·예상·의도를 담지 않는다.
2. **내용 없음.** v1에는 자유 텍스트 필드가 없다. 무엇을 하는지(코드·명령·URL·경로)는 전달하지 않고 **종류**만 전달한다.
3. **화이트리스트.** 정규화는 아래 정의된 필드만 새 객체에 복사한다. 그 밖의 필드는 읽어서 버리고 기록하지 않는다.
4. **이중 검증.** adapter가 이미 걸렀더라도 core의 `normalizeAgentEvent()`가 다시 검증한다.

## 2. 형식

```json
{
  "schema": "deskling.agent-event",
  "version": 1,
  "id": "demo-core-0004",
  "seq": 4,
  "at": 1767225612000,
  "source": { "kind": "demo", "session": "demo-core" },
  "type": "tool.started",
  "tool": "terminal"
}
```

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| `schema` | string | 정확히 `"deskling.agent-event"` |
| `version` | number | `1`, `2`, `3`. `usage.reported`는 `2` 이상, `session.message`와 `claude-code`·`codex` 종류는 `3`에서만 허용 |
| `id` | string | `^[A-Za-z0-9._:-]{1,64}$` |
| `seq` | integer | `0` 이상 safe integer. 세션 안에서 단조 증가 |
| `at` | integer | Unix epoch 밀리초, `0` 이상 `8.64e15` 이하 정수 (JavaScript Date가 표현할 수 있는 범위) |
| `source.kind` | string | `"demo"` \| `"hermes"` \| `"custom"` \| `"claude-code"`(v3) \| `"codex"`(v3) — §3.2 |
| `source.session` | string | `^[A-Za-z0-9._:-]{1,64}$` — 내용 없는 불투명 세션 ID |
| `type` | string | §3의 이벤트 타입 |
| `tool` | string | `tool.*` 이벤트에서 필수. `"code"` \| `"browser"` \| `"terminal"` \| `"file"` |
| `outcome` | string | `tool.finished`에서 필수. `"ok"` \| `"error"` |
| `usage` | object | `usage.reported`에서 필수. §3.1 |
| `to` | object | `session.message`에서 선택. `{ kind, session }` — `source`와 같은 규칙. 없으면 상대를 모름 |

`tool`, `outcome`, `usage`, `to`는 해당 타입이 아닌 이벤트에 있으면 무시한다(출력에 복사하지 않음).

## 3. 이벤트 타입

| type | 의미 (관찰된 사실) | 추가 필드 |
| --- | --- | --- |
| `agent.online` | adapter가 에이전트 런타임에 연결됨 | — |
| `agent.offline` | 연결이 끊김 / 런타임 종료 | — |
| `agent.idle` | 에이전트가 작업 없이 대기 중임을 알림 | — |
| `turn.started` | 에이전트가 새 작업(턴)을 시작함 | — |
| `tool.started` | 도구 실행 시작 | `tool` |
| `tool.finished` | 도구 실행 종료 | `tool`, `outcome` |
| `approval.requested` | 에이전트가 사용자 승인을 기다림 | — |
| `approval.resolved` | 승인 요청이 처리됨(승인/거절 여부는 전달하지 않음) | — |
| `delegation.started` | 하위 에이전트에게 작업을 넘김 | — |
| `delegation.finished` | 위임한 작업이 끝남 | — |
| `turn.succeeded` | 턴이 성공으로 끝남 | — |
| `turn.failed` | 턴이 실패로 끝남 | — |
| `usage.reported` | 사용량 보고(v2) — 활동이 아니라 계측값 | `usage` |
| `session.message` | 이 세션이 다른 세션에 메시지를 보냄(v3, ADR-023). 본문·제목 없음 | `to`(선택) |

### 3.2 세션 종류와 직원 (v3, ADR-022 → ADR-025)

모든 세션이 사무실 직원 한 명이다(집주인 없음). 종류는 직원의 **모습과 이름표만** 정하고 행동 규칙은 모두 같다.

| `source.kind` | 이름표 | 모습 | 실제 연결 |
| --- | --- | --- | --- |
| `claude-code` | Claude n | `claude` | Claude Code 훅(ADR-024) |
| `codex` | Codex n | `codex` | Codex 훅(ADR-026) |
| `hermes` | Hermes n | `agent` | 아직 없음 |
| `demo` | 데모 n | `agent` | 데모 adapter |
| `custom` | 에이전트 n | `agent` | — |

번호 n은 같은 종류 안에서 도착 순서로 붙는다(1, 2, …). (원래 `hermes`·`demo`·`custom` = 집주인 헤르메스 한 명 → ADR-025 §1로 대체)

### 3.1 `usage.reported` (v2)

```json
{
  "schema": "deskling.agent-event",
  "version": 2,
  "id": "u-0042",
  "seq": 42,
  "at": 1767225660000,
  "source": { "kind": "demo", "session": "demo-life" },
  "type": "usage.reported",
  "usage": { "tokens": { "used": 120000 }, "context": { "used": 156000, "limit": 200000 } }
}
```

| 필드 | 규칙 |
| --- | --- |
| `usage` | 객체. `tokens`, `context` 중 하나 이상 필요 |
| `usage.tokens.used` | 이 세션에서 지금까지 쓴 토큰 수. `0` 이상 safe integer |
| `usage.context.used` | 현재 컨텍스트 창에 차 있는 토큰 수. `0` 이상 safe integer |
| `usage.context.limit` | 컨텍스트 창 한도. `1` 이상 safe integer |

숫자 외의 내용(모델 이름, 비용, 프롬프트 등)은 받지 않는다. 그 밖의 키는 버린다. 실패 코드는 `bad-usage`.

### 도구 카테고리

| tool | 시각 상태 | adapter 매핑 예 (provider 무관) |
| --- | --- | --- |
| `code` | `coding` | 코드 편집·패치 적용 |
| `browser` | `browsing` | 웹 검색·페이지 열기 |
| `terminal` | `terminal` | 셸 명령 실행 |
| `file` | `file-work` | 파일 읽기·목록·이동 |

네 카테고리에 맞지 않는 도구는 adapter가 **이벤트를 보내지 않는다**(화면은 직전 사실 상태 유지).
새 카테고리는 ADR과 규격 버전 업으로만 추가한다.

## 4. 리듀서가 추적하는 사실

| 사실 | 갱신 |
| --- | --- |
| `connection` | `agent.offline` → `offline`, 그 외 수용된 모든 이벤트 → `online` (이벤트 도착 자체가 연결의 증거) |
| `turnActive` | `turn.started` → true. `turn.succeeded`/`turn.failed`/`agent.idle`/`agent.offline` → false |
| `activeTools` | `tool.started` → 스택에 push. `tool.finished` → 같은 카테고리 중 가장 최근 것 제거 |
| `pendingApprovals` | `approval.requested` +1, `approval.resolved` −1 (0 미만 불가) |
| `delegations` | `delegation.started` +1, `delegation.finished` −1 (0 미만 불가) |
| `lastOutcome` | `turn.succeeded` → `success`, `turn.failed` → `error`. `turn.started`/`agent.idle`/`agent.offline` → 없음 |
| `completedTurns` (뷰 상태) | 수용된 `turn.succeeded`마다 +1. 피드(소스)가 바뀌기 전까지 세션이 바뀌어도 유지. 키우기 경험치의 출처(ADR-018) |
| `usage` (뷰 상태) | `usage.reported`가 보낸 값만 덮어쓴다(보내지 않은 항목은 유지). 세션이 바뀌면 지운다. 최근 활동 목록에는 넣지 않는다 |

턴 종료(`turn.succeeded`/`turn.failed`), `agent.idle`, `agent.offline`은 `activeTools`, `pendingApprovals`, `delegations`를 비운다.

## 5. 시각 상태 도출 (우선순위)

위에서부터 처음 참인 규칙 하나가 시각 상태다.

1. `connection = offline` → **offline** (초기 상태)
2. `pendingApprovals > 0` → **waiting-approval**
3. `activeTools` 비어 있지 않음 → 스택 맨 위 카테고리의 상태(**coding / browsing / terminal / file-work**)
4. `delegations > 0` → **delegated**
5. `turnActive` → **thinking**
6. `lastOutcome = success` → **success**
7. `lastOutcome = error` → **error**
8. 그 외 → **idle**

`thinking`은 "턴이 진행 중이고 실행 중인 도구가 없다"는 사실이다. 내용이나 추론을 뜻하지 않는다.
`success`/`error`는 다음 이벤트가 올 때까지 유지된다. 시간 경과로 상태를 바꾸지 않는다(FR-E6).
대기로 돌아가는 것은 adapter가 `agent.idle`을 보낼 때다.

## 5.1 에너지와 화남 (ADR-016)

시각 상태와 별개인 분위기 값이다. `src/core/mood.ts`의 순수 함수가 보고된 숫자와 사용자 예산으로 계산한다.

| 값 | 계산 | 단계 |
| --- | --- | --- |
| 에너지 | `1 − tokens.used / 예산` (0~1로 자름) | `full` ≥ 0.6, `ok` ≥ 0.3, `low` ≥ 0.1, `empty` < 0.1, 보고 없음 `unknown` |
| 화남 | `context.used / context.limit` (0~1로 자름) | `calm` < 0.5, `annoyed` < 0.75, `angry` < 0.9, `furious` ≥ 0.9, 보고 없음 `unknown` |

## 6. 순서와 중복 (v3: 세션별, ADR-022)

- 리듀서는 세션 키 `${source.kind}:${source.session}`마다 커서(`lastSeq`)·사실·사용량을 따로 기억한다.
- 같은 세션에서 `seq <= lastSeq`인 이벤트는 무시한다(상태·최근 목록 모두 변화 없음).
- 한 세션의 이벤트는 다른 세션의 사실을 바꾸지 않는다. 세션이 번갈아 와도 초기화되지 않는다.
- `agent.offline`을 받은 세션은 방에서 나간다. 늦게 오는 이벤트를 무시하기 위해 최근에 끝난 세션의 커서를 64개까지 기억한다.
  끝난 세션 키로 `seq`가 더 큰 이벤트가 오면 새로 들어온 것으로 본다.
- 최근 활동 목록은 모든 세션을 합쳐 최신순 12개이며, 각 항목에 세션 키가 붙는다.

## 7. 금지 데이터

다음은 어떤 필드 이름으로 오더라도 정규화 결과에 들어가지 않는다(화이트리스트 밖이므로).
adapter는 이런 데이터를 애초에 읽지 않는 것을 원칙으로 한다.

- chain-of-thought, reasoning, 숨겨진 사고 과정
- 프롬프트·메시지 본문
- 파일 내용, 파일 경로, diff
- 터미널 명령어와 출력
- 환경변수, API 키, 토큰, Authorization 헤더, 쿠키
- raw tool arguments / tool 결과

## 8. 검증 실패

정규화 실패는 다음 코드 중 하나를 반환한다. 코드 외의 정보(입력값, 필드 내용)는 반환·로그하지 않는다.

`not-object`, `bad-schema`, `bad-version`, `bad-id`, `bad-seq`, `bad-timestamp`, `bad-source`, `bad-type`, `bad-tool`, `bad-outcome`, `bad-usage`, `bad-target`

(`bad-target`: `session.message`의 `to`가 있는데 `source`와 같은 규칙을 어김.)

## 9. Adapter 계약

1. 연결되면 `agent.online`, 끊기면 `agent.offline`을 보낸다.
2. 세션마다 `seq`를 단조 증가시킨다.
3. `at`은 provider가 사건을 관찰한 시각(없으면 adapter 수신 시각)이다.
4. 턴이 끝난 뒤 에이전트가 대기 상태가 되면 `agent.idle`을 보낸다.
5. 민감 데이터를 이벤트 객체에 넣지 않는다. 넣더라도 core가 버리지만, 그것에 의존하지 않는다.
6. 에이전트에게 아무것도 보내지 않는다(관찰 전용).
7. Claude Code 훅 매핑은 `docs/integrations/CLAUDE_CODE.md`(ADR-024).

## 10. 버전 관리

- 필드 추가·의미 변경은 `version`을 올리고 ADR을 남긴다.
- 정규화기는 알지 못하는 `version`을 `bad-version`으로 거부한다.
- 자유 텍스트(예: 작업 제목)를 추가하려면 별도 ADR에서 길이 제한·리댁션 파이프라인·표시 위치를 먼저 정한다.
