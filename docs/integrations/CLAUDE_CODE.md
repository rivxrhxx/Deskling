# Claude Code 연결 (ADR-024)

Claude Code 세션을 Deskling의 "Claude 친구"로 보여주는 경로. 관찰 전용이다. Deskling은 Claude Code에 아무것도 보내지 않고,
훅은 결정(허용·거부·차단)을 내리지 않는다.

## 1. 데이터 흐름

```
Claude Code ──(훅 stdin JSON)──▶ deskling-hook.mjs ──(훅 레코드 1줄)──▶ Unix 소켓 ──▶ Rust hook_bridge
                                   │ session_id, hook_event_name,                         │ serde 엄격 검증, 속도 제한,
                                   │ tool_name, notification_type만 읽음                   │ 다시 직렬화
                                   ▼                                                      ▼
                           나머지 필드는 읽지 않음                     Tauri 이벤트 deskling://hook-record
                                                                                          │
                                         src/platform/hookRecords.ts (listen) ◀───────────┘
                                                      │ payload = unknown
                                                      ▼
                       src/adapters/claudeCode/ (T74): 훅 레코드 → AgentEvent v3 → normalizeAgentEvent → 리듀서
```

| 단계 | 파일 | 하는 일 |
| --- | --- | --- |
| 훅 | `integrations/claude-code/deskling-hook.mjs` | stdin 읽기 → `toHookRecord` → 소켓에 한 줄 쓰기. 출력 없음, 항상 exit 0, 300ms 상한 |
| 매핑 | `integrations/claude-code/hookRecord.mjs` | 순수 함수 `toHookRecord(hookJson, now)`, `resolveSocketPath(env, home)` |
| 브리지 | `src-tauri/src/hook_bridge.rs` | 소켓 수신, 검증, `app.emit("deskling://hook-record", record)` |
| 수신 | `src/platform/hookRecords.ts` | `listenHookRecords(onRecord)` — Tauri 밖에서는 no-op |
| 번역 | `src/adapters/claudeCode/` (T74) | 훅 레코드 → AgentEvent v3. 결과는 core에서 다시 정규화 |

## 2. 공식 문서로 확인한 사실 (2026-11-19)

출처: <https://code.claude.com/docs/en/hooks> (`https://docs.claude.com/en/docs/claude-code/hooks`가 301로 이동),
<https://code.claude.com/docs/en/tools-reference>. 2026-11-19에 읽었다.

**공통 입력 필드:** `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `permission_mode`, `effort`,
`hook_event_name`, (서브에이전트 안에서) `agent_id`, `agent_type`. 훅이 읽는 것은 `session_id`와 `hook_event_name`뿐이다.

| 훅 이벤트 | 언제 | 문서의 고유 필드 | 훅이 읽는 필드 |
| --- | --- | --- | --- |
| `SessionStart` | 세션 시작·재개 (`source`: `startup`/`resume`/`clear`/`compact`/`fork`) | `source`, `model`, … | — |
| `SessionEnd` | 세션 종료 (`reason`: `clear`/`resume`/`logout`/`prompt_input_exit`/`other`). 훅 예산 1.5초 | `reason` | — |
| `UserPromptSubmit` | 프롬프트 제출 직후 | `prompt` | — |
| `PreToolUse` | 도구 호출 전 (차단 가능) | `tool_name`, `tool_input`, `tool_use_id` | `tool_name` |
| `PermissionRequest` | 권한 대화상자를 띄우기 직전 | `tool_name`, `tool_input`, `permission_suggestions` | — |
| `PostToolUse` | 도구가 성공한 뒤 | `tool_input`, `tool_response`, `tool_use_id`, `duration_ms` | `tool_name` |
| `PostToolUseFailure` | 도구가 실패한 뒤 | `tool_input`, `error`, `is_interrupt`, `duration_ms` | `tool_name` |
| `Notification` | 알림. `notification_type`: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`, … | `message`, `title`, `notification_type` | `notification_type` |
| `Stop` | 메인 에이전트 응답 끝 (사용자 인터럽트 때는 안 옴, API 오류 때는 `StopFailure`) | `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons` | — |
| `StopFailure` | API 오류로 턴이 끝남. 출력·exit code 무시 | `error`, `error_details`, `last_assistant_message` | — |
| `SubagentStart` | 서브에이전트 시작 | `agent_id`, `agent_type` | (매핑 안 함) |
| `SubagentStop` | 서브에이전트 끝. 프롬프트 제안·`/btw` 같은 **내부 에이전트에서도** 온다 | `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message` | — |

그 밖에 문서에 있는 이벤트(`Setup`, `UserPromptExpansion`, `PermissionDenied`, `PostToolBatch`, `MessageDisplay`, `TaskCreated`,
`TaskCompleted`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`,
`WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `Elicitation`,
`ElicitationResult`)는 레코드를 보내지 않는다.

**출력과 종료 코드 (훅이 아무것도 출력하지 않는 이유):** exit 0이면 stdout의 JSON을 적용하고, 평문 stdout은
`UserPromptSubmit`·`UserPromptExpansion`·`SessionStart`·`PostModelSwitch`에서 Claude의 컨텍스트에 들어간다.
exit 2는 차단 가능한 이벤트에서 차단(stderr가 Claude에게 감)이고, 그 밖의 코드는 transcript에 훅 오류로 표시된다.
그래서 훅은 stdout·stderr에 쓰지 않고 항상 exit 0이다. 결정 JSON을 내지 않으므로 권한 흐름은 바뀌지 않는다.

**`Notification`의 `permission_prompt`:** 권한 대화상자가 뜨고 약 6초 동안 입력이 없으면 온다.
바로 알려면 `PermissionRequest`를 쓰라고 문서가 권한다.

**도구 이름 (tools-reference):** 현재 내장 도구는 `Agent`(예전 `Task`), `Bash`, `Edit`, `Write`, `Read`, `Glob`, `Grep`,
`NotebookEdit`, `WebFetch`, `WebSearch`, `SendMessage`, `PowerShell`, `Monitor`, `LSP` 등이다. `MultiEdit`, `LS`, `BashOutput`,
`KillShell`, `Task`는 현재 목록에 없지만 예전 버전 호환을 위해 매핑에 남겼다. MCP 도구 이름은 `mcp__<server>__<tool>`이다.

**matcher:** `""`·`"*"`·생략은 전부. 글자·숫자·`_`·`-`·공백·`,`·`|`만 있으면 정확히 일치하는 이름 목록, 그 밖의 문자가 있으면 정규식이다.
`timeout`은 초 단위. 같은 이벤트에 맞는 훅은 병렬로 실행된다.

## 3. 훅 레코드 v1

한 연결에 JSON 한 줄(`\n`으로 끝남), 1024바이트 이하. 키 순서는 아래와 같다.

```json
{"v":1,"agent":"claude-code","session":"0f4c9a3e-6c1d-4f3e-9b8a-2d7e5c1a9b00","event":"tool-end","tool":"terminal","ok":true,"at":1763500000000}
```

| 필드 | 규칙 |
| --- | --- |
| `v` | 정확히 `1` |
| `agent` | `"claude-code"` (이 훅) \| `"codex"` (Codex 훅, ADR-026) |
| `session` | `^[A-Za-z0-9._:-]{1,64}$` (EVENT_PROTOCOL 식별자 규칙). 어긋나면 훅은 아무것도 보내지 않는다 |
| `event` | `session-start` \| `session-end` \| `prompt` \| `tool-start` \| `tool-end` \| `approval` \| `stop` \| `stop-failure` \| `subagent-stop` \| `interrupt` |
| `tool` | `tool-start`·`tool-end`에서 **필수**, 그 밖에서는 금지. `code` \| `browser` \| `terminal` \| `file` \| `delegate` \| `message` |
| `ok` | `tool-end`에서 **필수**, 그 밖에서는 금지. boolean |
| `at` | 훅이 실행된 시각(epoch ms). `0` 이상 `8.64e15` 이하 정수 |

Rust 브리지는 이 밖의 모든 것을 거부한다: 모르는 필드, 중복 필드, 잘못된 타입, 명시적 `null`, 모르는 enum 값, 1024바이트 초과,
200ms 안에 줄이 오지 않음, 초당 50개 초과. 거부는 코드(`Io`, `Timeout`, `Oversize`, `BadSchema`, `BadVersion`, `BadSession`,
`BadTimestamp`, `BadTool`, `BadOutcome`, `RateLimited`)별 개수만 센다. 입력은 기록하지 않는다.
통과한 레코드는 원문 바이트가 아니라 **검증된 구조체를 다시 직렬화한 값**이 webview로 간다.

> **Codex도 같은 레코드를 쓴다 (ADR-026).** 레코드 v1은 버전을 그대로 둔 채 `agent: "codex"`와 이벤트 `interrupt`(턴이 결과 없이 끝남,
> `tool`·`ok` 금지)를 더했다. Claude Code 훅은 `interrupt`를 보내지 않는다. 브리지·adapter는 두 agent를 같은 소켓·같은 리스너에서 받고,
> adapter는 (agent, session)별로 seq·승인·위임을 따로 센다(`source.kind`는 agent 값, 이벤트 id 접두사 `cc-`/`cx-`).
> Codex 훅의 매핑과 설치는 [`CODEX.md`](CODEX.md)에 있다. 소켓 쓰기·stdin·시간 상한은 두 훅이 `integrations/shared/sendRecord.mjs`를 같이 쓴다.

## 4. 매핑

| Claude Code 훅 | 조건 | 훅 레코드 | AgentEvent 의도 (T74 adapter가 확정) |
| --- | --- | --- | --- |
| `SessionStart` | — | `session-start` | `agent.online` (친구 입장) |
| `SessionEnd` | — | `session-end` | `agent.offline` (친구 퇴장) |
| `UserPromptSubmit` | — | `prompt` | `turn.started` |
| `PreToolUse` | 도구가 `code`·`file`·`terminal`·`browser` | `tool-start` + `tool` | `tool.started` |
| `PreToolUse` | `Task`·`Agent` | `tool-start`, `tool: delegate` | `delegation.started` |
| `PreToolUse` | `SendMessage` | `tool-start`, `tool: message` | `session.message` (`to` 없음 — 받는 쪽은 모름) |
| `PostToolUse` | 범주 안의 도구 | `tool-end` + `tool`, `ok: true` | `tool.finished` `outcome: ok` / `delegate`면 `delegation.finished` |
| `PostToolUseFailure` | 범주 안의 도구 | `tool-end` + `tool`, `ok: false` | `tool.finished` `outcome: error` / `delegate`면 `delegation.finished` |
| `PermissionRequest` | 도구 상관없음 | `approval` | `approval.requested` |
| `Notification` | `notification_type == "permission_prompt"` | `approval` | `approval.requested` |
| `Stop` | — | `stop` | `turn.succeeded` → `agent.idle` |
| `StopFailure` | — | `stop-failure` | `turn.failed` → `agent.idle` |
| `SubagentStop` | — | `subagent-stop` | 아래 주의 참고 |
| 그 밖의 이벤트 | — | 보내지 않음 | — |

도구 → 범주:

| 범주 | 도구 이름 |
| --- | --- |
| `code` | `Edit`, `Write`, `MultiEdit`, `NotebookEdit` |
| `file` | `Read`, `Glob`, `Grep`, `LS` |
| `terminal` | `Bash`, `BashOutput`, `KillShell` |
| `browser` | `WebFetch`, `WebSearch` |
| `delegate` | `Task`, `Agent` |
| `message` | `SendMessage` |
| (보내지 않음) | 그 밖의 모든 도구, 모든 `mcp__*` 도구 |

adapter(T74)가 알아야 할 점:

- **승인 해제 이벤트는 없다.** Claude Code에는 "권한 대화상자가 닫힘" 훅이 없다. 같은 세션의 다음 `tool-end`·`tool-start`·`prompt`·`stop`·
  `stop-failure`·`session-end`가 도착했다는 사실로 승인 대기를 해제한다.
- **승인은 두 번 올 수 있다.** `PermissionRequest`와 `Notification(permission_prompt)`을 둘 다 등록하면 같은 대화상자에 레코드가 두 개 온다.
  리듀서의 `pendingApprovals`는 개수이므로 adapter가 세션별 "대기 중" 플래그로 중복을 막는다(아래 설정 초안은 `PermissionRequest`만 쓴다).
- **`SubagentStop`은 위임 종료의 근거로 약하다.** 문서상 내부 에이전트(프롬프트 제안, `/btw`)에서도 오고, `Agent` 도구의 `PostToolUse`가 이미
  `delegation.finished`를 준다. 위임 개수를 줄이는 데 쓰지 않거나, adapter가 연 위임이 있을 때만 쓰는 것을 권한다.
- 서브에이전트 안의 도구 호출도 같은 `session_id`로 온다(`agent_id`는 읽지 않는다). Claude 친구 한 명의 작업으로 보인다.
- `SessionStart`는 `resume`·`compact` 때 같은 세션에 다시 올 수 있다. 이미 방에 있는 세션이면 무시한다.

## 5. 절대 읽거나 보내지 않는 것

훅은 stdin 전체를 메모리에서 JSON으로 파싱하지만(최대 8 MiB, 넘으면 아무것도 보내지 않음), 다음 필드는 **접근하지 않는다**.
`hookRecord.test.mjs`가 Proxy로 실제 접근한 키가 `session_id`, `hook_event_name`, `tool_name`, `notification_type`뿐인지 확인한다.

- `prompt`, `last_assistant_message`, `message`, `title` (프롬프트·응답·알림 본문)
- `tool_input`, `tool_response`, `error`, `error_details`, `permission_suggestions` (도구 인자·결과, 명령, 파일 경로·내용)
- `transcript_path`, `agent_transcript_path`, `cwd`, `scratchpad_dir` (경로)
- `agent_id`, `agent_type`, `tool_use_id`, `prompt_id`, `background_tasks`, `session_crons`, `model`, `effort`
- 환경변수, API 키, Authorization 헤더 (훅은 `process.env`에서 `DESKLING_SOCKET`과 `HOME`만 읽는다)

토큰·컨텍스트 수치는 transcript를 읽어야 하므로 가져오지 않는다(ADR-024 §9, FR-CC6).

## 6. 소켓

- 경로: `~/Library/Application Support/com.deskling.desktop/agent-events.sock` (Tauri `app_data_dir()` + `agent-events.sock`).
  테스트에서는 `DESKLING_SOCKET`으로 바꾼다.
- 앱 시작 시 디렉터리를 만들고 `0700`으로 맞춘다. 같은 경로에 **소켓**이 있으면: 연결되면 다른 인스턴스가 쓰는 중이므로 브리지를 켜지 않고,
  연결이 거부되면 낡은 소켓이라 지운다. 소켓이 아닌 파일은 지우지 않고 브리지를 켜지 않는다. bind 직후 소켓을 `0600`으로 맞춘다.
- 받기 전용이다. 브리지는 소켓에 쓰지 않는다. localhost TCP 포트는 쓰지 않는다(브라우저가 닿을 수 있음).
- 훅은 연결 → 한 줄 쓰기 → 즉시 종료한다. 소켓이 없거나 연결이 거부되거나 300ms 안에 끝나지 않으면 조용히 끝난다.
- macOS는 상대가 이미 닫힌 소켓에 `SO_RCVTIMEO` 설정을 거부한다(EINVAL). 브리지는 그때 non-blocking 읽기로 버퍼를 비운다
  (`reads_a_record_whose_writer_already_exited`, `round_trips_a_record_through_the_socket`).
- macOS의 Unix 소켓 경로 한도는 104바이트다. 사용자 이름이 아주 길면 bind가 실패하고 실제 모드에 세션이 나타나지 않는다.

## 7. settings.json 훅 설정 블록

설치 스크립트(§8)가 사용자 설정에 덧붙이는 블록이다. 사용자가 `npm run hooks:install`을 직접 실행할 때만 들어간다
(ADR-024 §8, FR-CC5). `<NODE>`는 설치 스크립트를 실행한 node의 절대 경로(`process.execPath`), `<HOOK>`은 `deskling-hook.mjs`의
절대 경로다(`hookRecord.mjs`가 같은 디렉터리에, `../shared/`가 그 옆에 있어야 한다). 둘 다 sh용 작은따옴표로 감싸고, 경로 안의 `'`는 `'\''`로 바꾼다.
`install.test.mjs`가 설치 스크립트의 블록이 아래 JSON과 같은지 확인한다.

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }] }],
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit|Read|Glob|Grep|LS|Bash|BashOutput|KillShell|WebFetch|WebSearch|Task|Agent|SendMessage",
        "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit|Read|Glob|Grep|LS|Bash|BashOutput|KillShell|WebFetch|WebSearch|Task|Agent|SendMessage",
        "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit|Read|Glob|Grep|LS|Bash|BashOutput|KillShell|WebFetch|WebSearch|Task|Agent|SendMessage",
        "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }]
      }
    ],
    "PermissionRequest": [{ "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }] }],
    "StopFailure": [{ "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }] }]
  }
}
```

설계 메모:

- matcher는 매핑되는 도구 이름의 정확 일치 목록이다. MCP 도구 등에서는 node 프로세스를 아예 띄우지 않는다.
- `timeout: 2`는 Claude Code 쪽 안전망이다. 훅 자체가 300ms 안에 끝난다.
- 동기 훅(기본값)으로 둔다. Claude Code는 `PreToolUse` 훅이 끝난 뒤 도구를 실행하므로 `tool-start`가 `tool-end`보다 먼저 도착한다.
  `"async": true`로 바꾸면 도구 호출마다 생기는 node 실행 지연(측정 약 30ms)은 사라지지만, 빠른 도구에서 두 레코드의 도착 순서가 바뀔 수 있다.
- `Notification`(`permission_prompt`)은 `PermissionRequest`보다 약 6초 늦고 중복이므로 블록에서 뺐다. 훅 스크립트는 둘 다 처리한다.

## 8. 설치 스크립트 (`integrations/claude-code/install.mjs`)

사용자가 동의하고 직접 실행할 때만 설정을 바꾼다. 의존성 없음, Node 18 이상.

```sh
npm run hooks:print      # 덧붙일 hooks 블록을 stdout에 JSON으로 출력. 아무것도 바꾸지 않음
npm run hooks:status     # 설치 여부(이벤트별), 다른 훅 개수, Deskling 소켓 유무. 아무것도 바꾸지 않음
npm run hooks:install    # 백업 → Deskling 훅 덧붙이기
npm run hooks:uninstall  # 백업 → Deskling 훅만 제거
npm run hooks:install -- --settings /다른/경로/settings.json   # 기본값: $HOME/.claude/settings.json
```

종료 코드: `0` 완료(바꿀 것이 없던 경우 포함), `1` 거부·실패(설정 파일은 그대로), `2` 사용법 오류.

| 규칙 | 동작 |
| --- | --- |
| Deskling 항목 식별 | `command`에 `deskling-hook.mjs`의 절대 경로(또는 그 sh 인용 형태)가 들어 있는 handler. 경로는 `realpathSync.native`로 대소문자까지 맞춘다 |
| install | 이벤트별 배열 **끝에** Deskling 그룹을 덧붙인다. 기존 그룹·handler·다른 키는 그대로, 키 순서 유지(새 키는 끝에). 이미 Deskling handler가 있는 이벤트는 건너뛴다(멱등) |
| uninstall | Deskling handler만 지운 뒤, 그 때문에 비게 된 matcher 그룹·이벤트 배열·`hooks` 객체만 지운다. 원래 비어 있던 그룹·배열은 남긴다. 멱등 |
| 파일 없음 | install은 디렉터리(`0700`)와 파일(`0600`)을 만들고 `hooks` 블록만 쓴다. uninstall·status·print는 아무것도 만들지 않는다 |
| 백업 | 쓰기 전에 같은 디렉터리에 `settings.json.deskling-backup-<YYYYMMDD-HHMMSS>`(같은 초면 `-2`, `-3` …)로 원본 바이트를 원래 권한 그대로 저장. 바꿀 것이 없으면 백업도 쓰기도 하지 않는다 |
| 쓰기 | 같은 디렉터리의 임시 파일 → fsync → rename(원자적). 원래 파일 권한 유지, 2칸 들여쓰기 JSON + 끝 줄바꿈. symlink면 링크를 유지하고 대상 파일에 쓴다 |
| JSONC | 지원하지 않는다. `JSON.parse`가 실패하거나 최상위·`hooks`·이벤트 값의 형태가 다르면 중단한다(파일·백업 변화 없음, exit 1) |
| 출력 | 한국어 + 관련 경로. 다른 훅의 명령이나 설정 값은 출력하지 않고 개수만 센다. JSON 파싱 오류 메시지도 파일 일부를 인용하므로 출력하지 않는다 |

알려진 한계:

- 들여쓰기·줄바꿈 등 원래 서식은 2칸 JSON으로 다시 쓴다. 숫자처럼 생긴 키(`"1"`)는 `JSON.parse`가 앞으로 옮긴다.
- install 전부터 비어 있던 이벤트 배열(`"Stop": []`)이나 `"hooks": {}`는 Deskling 항목을 지운 뒤 비게 된 것과 구별할 수 없어 uninstall이 지운다.
- 저장소를 옮기면 예전 경로의 항목은 Deskling 것으로 알아보지 못한다. 옮기기 전에 uninstall한다.
- `<NODE>`는 설치할 때의 `process.execPath`다. Homebrew node는 버전 디렉터리(`/opt/homebrew/Cellar/node@24/<버전>/bin/node`)라서
  `brew upgrade` 뒤에는 경로가 사라진다. 그때는 uninstall → install로 다시 넣는다.

## 9. 테스트

| 테스트 | 확인하는 것 |
| --- | --- |
| `integrations/claude-code/hookRecord.test.mjs` | 매핑 표, 도구 범주, 범주 밖 도구·모르는 이벤트 → `null`, 세션 ID 규칙, 금지 데이터가 직렬화 결과에 없음, 읽는 키 4개뿐 |
| `integrations/claude-code/deskling-hook.test.mjs` | 실제 프로세스: 소켓에 정확히 한 줄, 출력 없음, exit 0, 소켓 없음·거부·무응답 서버·닫히지 않는 stdin에서 300ms 상한 |
| `integrations/claude-code/install.test.mjs` | 임시 HOME만 사용. §7 블록과 일치, 등록 이벤트·도구가 레코드로 매핑됨, sh 인용(공백·`'`·`$`), 파일 없음·`{}`·기존 설정/훅 보존(deep-equal, 키 순서), 멱등, uninstall이 원래 구조로 복원, 백업 바이트·권한, JSONC·형태 오류 중단, 권한 유지, symlink, print/status 무변경, 출력에 다른 훅 내용 없음, CLI 기본 경로·사용법 |
| `src-tauri/src/hook_bridge.rs` (`cargo test`) | 이벤트별 유효 레코드, 재직렬화 순서, 모르는·중복 필드, 잘못된 타입·`null`, enum, 버전, 세션, `at` 범위, `tool`/`ok` 위치, 1024바이트, 타임아웃, 닫힌 상대, 속도 제한, 소켓 권한·낡은 소켓 |
| `src/platform/hookRecords.test.ts` | 이벤트 이름, Tauri 밖 no-op, payload를 그대로 전달, listen 실패 시 상세 없이 경고 |
| `src/config/tauriConfig.test.ts` | capability = 창 권한 5개 + `core:event:allow-listen`·`allow-unlisten`, emit 권한 없음 |
