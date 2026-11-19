# CLAUDE.md — Deskling

이 저장소의 작업 규칙은 `AGENTS.md` 하나에 있다. Claude Code도 사람·Codex와 같은 규칙을 따른다(아래에서 그대로 불러온다).
여기에는 규칙을 다시 쓰지 않고, 어디서 무엇을 찾는지와 Claude Code 세션에만 해당하는 주의만 적는다.

@AGENTS.md

## 문서 지도

| 문서 | 내용 | 언제 본다 |
| --- | --- | --- |
| `PROJECT_STATE.md` | 현재 단계, 마지막 검증(실제 실행한 명령), 알려진 문제, 다음 작업 | 세션 시작할 때 맨 먼저 |
| `docs/TASKS.md` | 마일스톤별 작업 목록(M0–M15) | 다음 작업 고를 때 — 체크 안 된 가장 위 하나 |
| `DECISIONS.md` | ADR-001–028 | 구조·규격·의존성·창 동작을 바꾸기 **전에** ADR 추가 |
| `docs/PRODUCT.md` | 무엇을, 누구를 위해, 하지 않는 것 | 범위 판단 |
| `docs/REQUIREMENTS.md` | FR·SEC·NFR 요구사항 번호 | 테스트 이름·커밋에 근거 달 때 |
| `docs/ARCHITECTURE.md` | 데이터 흐름, 레이어, 모듈 | 파일 위치·경계 판단 |
| `docs/EVENT_PROTOCOL.md` | `AgentEvent` v3 규격 | 이벤트를 만들거나 바꿀 때(`src/core/agentEvent.ts`와 같은 커밋) |
| `docs/DESIGN.md` | 사무실·직원·포즈·이모트·문구 | 화면을 바꿀 때 — 표 일부는 `src/ui/visualSpec.test.ts`가 코드와 대조한다 |
| `docs/ACCEPTANCE.md` | 인수 기준과 검증 방법 | 완료 판단 |
| `docs/TEST_PLAN.md` | 요구사항 ↔ 테스트 파일, 수동 체크리스트 | 테스트 위치 찾을 때 |
| `docs/integrations/CLAUDE_CODE.md`, `docs/integrations/CODEX.md` | 훅 → 소켓 → 앱 매핑, 설치, 한계 | 실제 연결을 건드릴 때 |

## Claude Code 세션에서 주의할 것

- **이 세션도 사무실에 보인다.** 훅이 설치돼 있으면 지금 이 Claude Code 세션이 "Claude n" 직원으로 앉아 있다.
  훅 레코드에는 세션 id·이벤트 종류·도구 범주·시각만 있다. 이 사실을 테스트 근거로 쓰지 말고, 검증은 테스트와 주입한 레코드로 한다.
- **사용자 설정은 동의 없이 바꾸지 않는다.** `~/.claude/settings.json`, `~/.codex/hooks.json`은 사용자가 명시적으로 동의할 때만,
  설치기(`npm run hooks:install` / `npm run hooks:codex:install`)로만 바꾼다. 설치기는 백업을 먼저 만든다. 손으로 편집하지 않는다.
- **Node 24로 실행한다.** 기본 셸 Node가 23이면 `PATH=/opt/homebrew/opt/node@24/bin:$PATH`를 앞에 붙인다(ADR-013).
  `cargo`는 PATH에 없어도 npm 스크립트가 `scripts/with-cargo.mjs`로 찾는다.
- **훅 스크립트는 조용해야 한다.** `integrations/`의 훅은 stdout·stderr에 아무것도 쓰지 않고 항상 exit 0으로 끝난다.
  디버그 출력을 넣으면 Claude Code·Codex 화면에 새어 나간다.
- **커밋 전:** 최소 `npm run verify:fast`, Rust·Tauri 설정·capability를 바꿨으면 `npm run verify`.
