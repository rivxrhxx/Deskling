# PROJECT_STATE

_마지막 갱신: 2026-11-18_

## 현재 단계

- **M0 하네스** — 완료(T00). 다음은 M1 스캐폴딩.

## 환경 (2026-11-18 확인)

| 항목 | 값 |
| --- | --- |
| OS | macOS 26.6.2 (arm64) |
| Node / npm | v23.11.0 / 10.9.2 |
| Rust / Cargo | rustc 1.100.0 / cargo 1.100.0 (`~/.cargo/bin`, 셸 PATH에는 없음) |
| Xcode | /Applications/Xcode.app, SDK 26.2, Apple clang 17.0.0 |
| GitHub | `origin` = github.com/rivxrhxx/Deskling |

## 마지막 검증

아직 실행한 테스트·빌드 없음.

## 다음 작업

- `docs/TASKS.md` T00 완료 확인 → T01 스캐폴딩.

## 알려진 문제 / 메모

- 셸 PATH에 cargo가 없음 → npm 스크립트는 `scripts/with-cargo.mjs`로 보정 예정(ADR-010).
- TypeScript 7.0이 최신이지만 typescript-eslint가 `<6.1`만 지원 → 6.0.x 고정(ADR-002).
