# Codex 연결 (ADR-026)

Codex 세션을 Deskling 사무실의 "Codex n" 직원으로 보여주는 경로다. 관찰만 한다. Deskling은 Codex에 아무것도 보내지 않고,
훅은 결정(허용·거부·차단)을 내리지 않는다. 훅 레코드 형식, 소켓, Rust 브리지는 Claude Code와 같다
([`CLAUDE_CODE.md`](CLAUDE_CODE.md) §3, §6). 이 문서는 Codex만의 매핑, 설정 블록, 설치기를 다룬다.

## 1. 데이터 흐름

```
Codex ──(훅 stdin JSON)──▶ deskling-codex-hook.mjs ──(훅 레코드 1줄, agent "codex")──▶ 같은 Unix 소켓 ──▶ Rust hook_bridge
                            │ session_id, hook_event_name,                                        │ serde 엄격 검증, 속도 제한,
                            │ tool_name만 읽음                                                     │ 다시 직렬화
                            ▼                                                                     ▼
                    나머지 필드는 읽지 않음                                    Tauri 이벤트 deskling://hook-record
                                                                                                  │
                                         src/platform/hookRecords.ts (listen) ◀───────────────────┘
                                                      │ payload = unknown
                                                      ▼
            src/adapters/claudeCode/ 번역기: 훅 레코드 → AgentEvent v3 (source.kind "codex") → normalizeAgentEvent → 리듀서
```

| 단계 | 파일 | 하는 일 |
| --- | --- | --- |
| 훅 | `integrations/codex/deskling-codex-hook.mjs` | stdin 읽기 → `toCodexRecord` → 소켓에 한 줄 쓰기. 출력 없음, 항상 exit 0, 300ms 상한 |
| 매핑 | `integrations/codex/codexRecord.mjs` | 순수 함수 `toCodexRecord(hookJson, now)`. 아래 §2 표 |
| 전송 | `integrations/shared/sendRecord.mjs`, `integrations/shared/socketPath.mjs` | Claude Code 훅과 같은 stdin·소켓·시간 상한 코드 |
| 브리지 | `src-tauri/src/hook_bridge.rs` | `agent: "codex"`와 이벤트 `interrupt`를 받아들인다. 그 밖의 규칙은 Claude Code와 같다 |
| 번역 | `src/adapters/claudeCode/` | 두 agent를 같은 리스너에서 받고, agent 값을 `source.kind`로 쓴다. Codex 이벤트 id 접두사는 `cx-` |
| 설치 | `integrations/codex/install.mjs` | 사용자가 동의하고 직접 실행할 때만 `hooks.json`에 덧붙인다. §5 |

## 2. 매핑 (ADR-026 §1–2)

| Codex 훅 | 조건 | 훅 레코드 | 번역 (CLAUDE_CODE.md §4와 같은 규칙) |
| --- | --- | --- | --- |
| `SessionStart` | — | `session-start` | `agent.online` (직원 입장) |
| `SessionEnd` | — | `session-end` | `agent.offline` (직원 퇴장) |
| `UserPromptSubmit` | — | `prompt` | `turn.started` |
| `PreToolUse` | 아래 범주 안의 도구 | `tool-start` + `tool` | `tool.started` / `delegate`면 `delegation.started` |
| `PostToolUse` | 아래 범주 안의 도구 | `tool-end` + `tool`, `ok: true` | `tool.finished` `outcome: ok` / `delegate`면 `delegation.finished` |
| `PermissionRequest` | 도구 상관없음 | `approval` | `approval.requested` |
| `Stop` | — | `stop` | `turn.succeeded` → `agent.idle` |
| `Interrupt` | — | `interrupt` (새 레코드 이벤트, `tool`·`ok` 없음) | 승인 대기 해제 + `agent.idle` (턴이 결과 없이 끝남) |
| 그 밖 (`PreModelRequest`, `PostModelRequest`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`) | — | 보내지 않음 (설치기도 등록하지 않음) | — |

도구 → 범주:

| 범주 | Codex 도구 이름 |
| --- | --- |
| `terminal` | `Bash`, `exec_command` |
| `code` | `apply_patch`, `Edit`, `Write` |
| `delegate` | `spawn_agent`, `Agent` |
| (보내지 않음) | `update_plan`, `view_image`, `write_stdin`, 모든 `mcp__*` 도구, 그 밖의 모든 도구 |

Codex에는 "도구 실패" 훅이 없다. 그래서 `tool-end`는 항상 `ok: true`다.

## 3. 절대 읽거나 보내지 않는 것

- **훅:** stdin JSON에서 `session_id`, `hook_event_name`, `tool_name`만 읽는다. `prompt`, `tool_input`, `tool_response`,
  `last_assistant_message`, `transcript_path`, `cwd`, `turn_id`, `model`, `permission_mode`, `source`, `reason`은 읽지 않는다.
  환경변수는 소켓 경로를 정하는 `DESKLING_SOCKET`과 `HOME`만 읽는다. stdout·stderr에는 아무것도 쓰지 않는다
  (훅 출력이 Codex 컨텍스트에 들어갈 수 있다).
- **토큰 수치:** `PostModelRequest`의 `token_usage`는 아직 보내지 않는다(ADR-026 §4).
- **설치기:** 다른 훅의 명령이나 `hooks.json`의 다른 값은 출력하지 않고 개수만 센다. JSON 파싱 오류 메시지도 파일 일부를 인용하므로
  출력하지 않는다. `config.toml`에서는 `[features]`의 `hooks`(와 예전 이름 `codex_hooks`) 한 키만 줄 단위로 찾고, 그 밖의 값은
  해석하지도 출력하지도 않는다. Codex가 저장하는 신뢰 상태는 읽지 않는다.

## 4. hooks.json 훅 설정 블록

설치 스크립트(§5)가 `hooks.json`에 덧붙이는 블록이다. 사용자가 `npm run hooks:codex:install`을 직접 실행할 때만 들어간다
(ADR-026 §3). `<NODE>`는 설치 스크립트를 실행한 node의 경로(Homebrew면 `brew upgrade`에도 남는 `<prefix>/opt/<formula>/bin/node`),
`<HOOK>`은 `integrations/codex/deskling-codex-hook.mjs`의 실제 절대 경로다. 둘 다 sh용 작은따옴표로 감싸고, 경로 안의 `'`는 `'\''`로 바꾼다.
`install.test.mjs`가 설치 스크립트의 블록이 아래 JSON과 같은지 확인한다.

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }] }],
    "PreToolUse": [
      {
        "matcher": "^(Bash|exec_command|apply_patch|Edit|Write|spawn_agent|Agent)$",
        "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "^(Bash|exec_command|apply_patch|Edit|Write|spawn_agent|Agent)$",
        "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }]
      }
    ],
    "PermissionRequest": [{ "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }] }],
    "Interrupt": [{ "hooks": [{ "type": "command", "command": "'<NODE>' '<HOOK>'", "timeout": 2 }] }]
  }
}
```

설계 메모:

- Codex의 `matcher`는 정규식이다. 그래서 `^(…)$`로 매핑되는 도구 이름만 정확히 맞춘다. MCP 도구나 `update_plan`에서는 node 프로세스를 아예 띄우지 않는다.
  `UserPromptSubmit`·`Stop`·`Interrupt`는 matcher를 지원하지 않고, `SessionStart`·`SessionEnd`·`PermissionRequest`는 전부 받도록 matcher를 생략한다.
- `timeout`은 초 단위이고 Codex 쪽 안전망이다(Codex 기본값은 600초, `SessionEnd`·`Interrupt`는 기본 1초·최대 3초). 훅 자체는 300ms 안에 끝난다.
- `async`를 넣지 않는다(동기 실행). `PreToolUse` 훅이 끝난 뒤 도구가 실행되므로 `tool-start`가 `tool-end`보다 먼저 도착한다(ADR-026 §3).

## 5. 설치 스크립트 (`integrations/codex/install.mjs`)

사용자가 동의하고 직접 실행할 때만 파일을 바꾼다. 의존성 없음, Node 18 이상.

```sh
npm run hooks:codex:print      # 덧붙일 hooks 블록을 stdout에 JSON으로 출력. 아무것도 바꾸지 않음
npm run hooks:codex:status     # 설치 여부(이벤트별), 다른 훅 개수, 훅 스크립트·소켓 유무, [features] hooks. 아무것도 바꾸지 않음
npm run hooks:codex:install    # 백업 → Deskling 훅 덧붙이기 → /hooks 신뢰 안내
npm run hooks:codex:uninstall  # 백업 → Deskling 훅만 제거
npm run hooks:codex:install -- --hooks /다른/경로/hooks.json      # 기본값: $CODEX_HOME/hooks.json ($CODEX_HOME이 없으면 $HOME/.codex)
npm run hooks:codex:status -- --config /다른/경로/config.toml     # 기본값: $CODEX_HOME/config.toml
```

종료 코드: `0` 완료(바꿀 것이 없던 경우 포함), `1` 거부·실패(파일은 그대로), `2` 사용법 오류.

파일 처리는 Claude Code 설치기와 같은 코드(`integrations/shared/hooksFile.mjs`)를 쓴다. 규칙 전체는 [`CLAUDE_CODE.md`](CLAUDE_CODE.md) §8과 같다.

| 규칙 | 동작 |
| --- | --- |
| Deskling 항목 식별 | `command`에 `deskling-codex-hook.mjs`의 절대 경로(또는 그 sh 인용 형태)가 들어 있는 handler. 경로는 폴더를 `realpathSync.native`로 풀어 만들므로 스크립트가 없어도 같다 |
| install | 훅 스크립트가 없으면 거부한다(exit 1, 아무것도 만들거나 바꾸지 않음). 이벤트별 배열 **끝에** Deskling 그룹을 덧붙이고, 기존 그룹·handler·`description` 같은 다른 최상위 키는 그대로, 키 순서 유지. 이미 Deskling handler가 있는 이벤트는 건너뛴다(멱등) |
| uninstall | Deskling handler만 지운 뒤, 그 때문에 비게 된 matcher 그룹·이벤트 배열·`hooks` 객체만 지운다. 훅 스크립트가 지워졌어도 동작한다. 멱등 |
| 파일 없음 | install은 디렉터리(`0700`)와 파일(`0600`)을 만들고 `hooks` 블록만 쓴다. uninstall·status·print는 아무것도 만들지 않는다 |
| 백업 | 쓰기 전에 같은 디렉터리에 `hooks.json.deskling-backup-<YYYYMMDD-HHMMSS>`(같은 초면 `-2`, `-3` …)로 원본 바이트를 원래 권한 그대로 저장. 바꿀 것이 없으면 백업도 쓰기도 하지 않는다 |
| 쓰기 | 같은 디렉터리의 임시 파일 → fsync → rename(원자적). 원래 파일 권한 유지, 2칸 들여쓰기 JSON + 끝 줄바꿈. symlink면 링크를 유지하고 대상 파일에 쓴다 |
| 형식 오류 | `JSON.parse`가 실패하거나(JSONC 포함) 최상위·`hooks`·이벤트 값의 형태가 다르면 중단한다(파일·백업 변화 없음, exit 1) |
| status의 `config.toml` | `[features]` 표의 `hooks = false`(또는 맨 위의 `features.hooks = false`, 예전 이름 `codex_hooks`)를 찾으면 "꺼짐"으로 알린다. 파일이 없거나 키가 없으면 기본값 "켜짐" |
| 출력 | 한국어 + 관련 경로. 다른 훅의 명령이나 설정 값은 출력하지 않고 개수만 센다 |

## 6. 신뢰 단계 (`/hooks`)

Codex는 사용자가 관리하는 훅(managed가 아닌 훅)을 **검토하고 신뢰(trust)한 뒤에만 실행한다.** 설치만으로는 Deskling에 아무것도 오지 않는다.

1. `npm run hooks:codex:install`을 실행한다. 출력 끝에 신뢰 안내가 나온다.
2. Codex를 열고 `/hooks`를 실행한다. Deskling 훅(8개 이벤트, 명령은 `'<NODE>' '<HOOK>'`)을 검토하고 신뢰한다.
3. 이미 열려 있던 Codex 세션은 다시 시작해야 반영될 수 있다.
4. `npm run hooks:codex:status`로 설치와 `[features] hooks`를 확인하고, Deskling 앱을 켜서 소켓이 "있음"인지 본다.
   설치기는 신뢰 상태를 읽지 않으므로 신뢰 여부는 Codex의 `/hooks`에서만 확인할 수 있다.

신뢰는 훅의 현재 내용에 묶여 있어서 명령이 바뀌면(저장소를 옮긴 뒤 다시 설치, 다른 node로 다시 설치) `/hooks`에서 다시 신뢰해야 한다.

## 7. 알려진 한계

- 웹 검색 같은 **호스팅 도구는 Codex 훅에 잡히지 않아** 표시되지 않는다.
- 세션이 비정상 종료되면 **`SessionEnd`가 오지 않을 수 있다.** 그 세션의 직원이 퇴장하지 않고 남을 수 있다.
- **토큰 수치는 아직 없다**(ADR-026 §4).
- Codex에는 도구 실패 훅이 없어서 실패한 도구도 `ok: true`로 끝난다.
- Codex는 여러 곳의 훅(`/etc/codex/hooks.json`, `$CODEX_HOME/hooks.json`, 신뢰한 프로젝트의 `.codex/hooks.json`, 각 위치 `config.toml`의 `[hooks]`)을
  모두 합쳐 실행한다. 설치기는 파일 하나만 다룬다. 같은 Deskling 명령을 다른 곳에도 넣으면 레코드가 두 번 온다.
- `config.toml` 검사는 줄 단위다. `features = { hooks = false }` 같은 인라인 표나 여러 줄 문자열 안의 키는 알아보지 못한다.
- 원래 서식은 2칸 JSON으로 다시 쓴다. install 전부터 비어 있던 이벤트 배열이나 `"hooks": {}`는 uninstall이 지운다(Claude Code 설치기와 같음).
- 저장소를 옮기면 예전 경로의 항목은 Deskling 것으로 알아보지 못한다. 옮기기 전에 uninstall한다.

## 8. 테스트

| 테스트 | 확인하는 것 |
| --- | --- |
| `integrations/codex/install.test.mjs` | 임시 HOME·명시적 경로만 사용(실제 `~/.codex/`는 읽지도 쓰지도 않음). §4 블록과 일치, 등록 이벤트·도구가 `toCodexRecord`로 레코드가 됨, matcher 정규식이 매핑 도구만 맞춤, `async` 없음, sh 인용(공백·`'`·`$`, 실제 `/bin/sh` 실행), 파일 없음·`{}`·다른 도구의 훅 보존(deep-equal, 키 순서), 멱등, uninstall이 원래 객체로 복원, 백업 바이트·권한·이름 충돌, JSONC·형태 오류 중단, 권한 유지, symlink, 훅 스크립트 없음 → install 거부, print/status 무변경, `[features] hooks` 판별, 출력에 다른 훅·설정 내용 없음, CLI 기본 경로·`$CODEX_HOME`·`--hooks`·`--config`·사용법, npm 스크립트 |
| `integrations/codex/codexRecord.test.mjs` | Codex 훅 JSON → 레코드 매핑 (T83) |
| `integrations/codex/deskling-codex-hook.test.mjs` | 실제 훅 프로세스 (T83) |
| `src-tauri/src/hook_bridge.rs` (`cargo test`) | `agent: "codex"` 레코드, `interrupt`의 `tool`·`ok` 금지 (T83) |
