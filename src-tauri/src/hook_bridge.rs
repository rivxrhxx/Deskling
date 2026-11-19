//! Agent hook bridge (ADR-024 §3–4, FR-CC2; ADR-026 §2).
//!
//! Listens on a Unix socket for hook records written by `integrations/claude-code/deskling-hook.mjs`
//! and `integrations/codex/deskling-codex-hook.mjs`, validates each one strictly and forwards only the
//! re-serialized record to the webview.
//! Raw bytes never leave this module, and failures are counted by code only — nothing is logged (ADR-009).
//! The socket is receive-only: Deskling never writes back to an agent (AGENTS.md §1.1).

use serde::{Deserialize, Deserializer, Serialize};
use std::fs::{self, Permissions};
use std::io::{self, Read};
use std::os::unix::fs::{FileTypeExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// Tauri event the webview listens to (`src/platform/hookRecords.ts`).
pub const EVENT_NAME: &str = "deskling://hook-record";
/// Socket file inside the app data directory (`~/Library/Application Support/com.deskling.desktop/`).
pub const SOCKET_FILE: &str = "agent-events.sock";

const MAX_RECORD_BYTES: usize = 1024;
const READ_TIMEOUT: Duration = Duration::from_millis(200);
const RATE_WINDOW: Duration = Duration::from_secs(1);
const MAX_RECORDS_PER_WINDOW: u32 = 50;
/// The largest valid ECMAScript time value (8.64e15 ms).
const MAX_AT: u64 = 8_640_000_000_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Agent {
    ClaudeCode,
    Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HookEvent {
    SessionStart,
    SessionEnd,
    Prompt,
    ToolStart,
    ToolEnd,
    Approval,
    Stop,
    StopFailure,
    SubagentStop,
    /// The user interrupted the turn; it ended without an outcome (ADR-026 §2).
    Interrupt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ToolCategory {
    Code,
    Browser,
    Terminal,
    File,
    Delegate,
    Message,
}

/// Hook record v1. Only `parse_record` builds one, so every instance has passed validation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HookRecord {
    v: u64,
    agent: Agent,
    session: String,
    event: HookEvent,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    tool: Option<ToolCategory>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    ok: Option<bool>,
    at: u64,
}

/// An optional field may be absent, but an explicit `null` is a type error.
fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(d: D) -> Result<Option<T>, D::Error> {
    T::deserialize(d).map(Some)
}

/// Why a connection produced no record. Only these codes are ever recorded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reject {
    Io = 0,
    Timeout,
    Oversize,
    BadSchema,
    BadVersion,
    BadSession,
    BadTimestamp,
    BadTool,
    BadOutcome,
    RateLimited,
}

const REJECT_CODES: usize = Reject::RateLimited as usize + 1;

/// Parses and validates one record line (without its newline).
pub fn parse_record(line: &[u8]) -> Result<HookRecord, Reject> {
    let record: HookRecord = serde_json::from_slice(line).map_err(|_| Reject::BadSchema)?;
    record.validate()?;
    Ok(record)
}

impl HookRecord {
    fn validate(&self) -> Result<(), Reject> {
        if self.v != 1 {
            return Err(Reject::BadVersion);
        }
        if !is_identifier(&self.session) {
            return Err(Reject::BadSession);
        }
        if self.at > MAX_AT {
            return Err(Reject::BadTimestamp);
        }
        let tool_event = matches!(self.event, HookEvent::ToolStart | HookEvent::ToolEnd);
        if self.tool.is_some() != tool_event {
            return Err(Reject::BadTool);
        }
        if self.ok.is_some() != (self.event == HookEvent::ToolEnd) {
            return Err(Reject::BadOutcome);
        }
        Ok(())
    }
}

/// `^[A-Za-z0-9._:-]{1,64}$` — the EVENT_PROTOCOL identifier rule.
fn is_identifier(value: &str) -> bool {
    (1..=64).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

/// Reads one line of at most `MAX_RECORD_BYTES` before `deadline`, then parses it.
/// The record ends at the first newline or at EOF; nothing after the newline is read.
pub fn read_record(stream: &mut UnixStream, deadline: Instant) -> Result<HookRecord, Reject> {
    let mut buf = [0u8; MAX_RECORD_BYTES + 1];
    let mut len = 0;
    loop {
        if let Some(end) = buf[..len].iter().position(|&b| b == b'\n') {
            return parse_record(&buf[..end]);
        }
        if len == buf.len() {
            return Err(Reject::Oversize);
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(Reject::Timeout);
        }
        // macOS refuses SO_RCVTIMEO (EINVAL) once the peer has closed — the normal case, since the
        // hook writes and exits. Everything it sent is then already buffered, so a non-blocking read
        // drains it without waiting; a WouldBlock still ends as a timeout, never as a hang.
        if stream.set_read_timeout(Some(remaining)).is_err() {
            stream.set_nonblocking(true).map_err(|_| Reject::Io)?;
        }
        match stream.read(&mut buf[len..]) {
            Ok(0) => return parse_record(&buf[..len]),
            Ok(n) => len += n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
            Err(e)
                if matches!(
                    e.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
                ) =>
            {
                return Err(Reject::Timeout);
            }
            Err(_) => return Err(Reject::Io),
        }
    }
}

/// Fixed one-second window: at most `MAX_RECORDS_PER_WINDOW` connections are read per window.
struct RateLimiter {
    window_start: Instant,
    count: u32,
}

impl RateLimiter {
    fn new(now: Instant) -> Self {
        Self {
            window_start: now,
            count: 0,
        }
    }

    fn allow(&mut self, now: Instant) -> bool {
        if now.saturating_duration_since(self.window_start) >= RATE_WINDOW {
            self.window_start = now;
            self.count = 0;
        }
        if self.count >= MAX_RECORDS_PER_WINDOW {
            return false;
        }
        self.count += 1;
        true
    }
}

/// Per-connection handling with rate limiting and failure counts.
struct Bridge {
    limiter: RateLimiter,
    rejected: [u64; REJECT_CODES],
}

impl Bridge {
    fn new(now: Instant) -> Self {
        Self {
            limiter: RateLimiter::new(now),
            rejected: [0; REJECT_CODES],
        }
    }

    fn handle(&mut self, stream: &mut UnixStream, now: Instant) -> Option<HookRecord> {
        let result = if self.limiter.allow(now) {
            read_record(stream, now + READ_TIMEOUT)
        } else {
            Err(Reject::RateLimited)
        };
        match result {
            Ok(record) => Some(record),
            Err(code) => {
                self.rejected[code as usize] += 1;
                None
            }
        }
    }

    #[cfg(test)]
    fn rejected(&self, code: Reject) -> u64 {
        self.rejected[code as usize]
    }
}

/// Creates the socket's directory (0700), replaces a stale socket and binds a new one (0600).
/// Refuses to delete anything that is not a socket, and refuses a socket another instance still serves.
pub fn bind(path: &Path) -> io::Result<UnixListener> {
    let dir = path
        .parent()
        .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidInput))?;
    fs::create_dir_all(dir)?;
    fs::set_permissions(dir, Permissions::from_mode(0o700))?;
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_socket() => {
            if UnixStream::connect(path).is_ok() {
                return Err(io::Error::from(io::ErrorKind::AddrInUse));
            }
            fs::remove_file(path)?;
        }
        Ok(_) => return Err(io::Error::from(io::ErrorKind::AlreadyExists)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    let listener = UnixListener::bind(path)?;
    fs::set_permissions(path, Permissions::from_mode(0o600))?;
    Ok(listener)
}

fn serve(listener: UnixListener, mut deliver: impl FnMut(&HookRecord)) {
    let mut bridge = Bridge::new(Instant::now());
    for stream in listener.incoming() {
        match stream {
            Ok(mut stream) => {
                if let Some(record) = bridge.handle(&mut stream, Instant::now()) {
                    deliver(&record);
                }
            }
            // Accept errors (e.g. out of file descriptors) must not spin the thread.
            Err(_) => thread::sleep(Duration::from_millis(10)),
        }
    }
}

/// Starts the bridge on its own thread. Without a socket the app simply shows no live sessions.
pub fn start(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let Ok(listener) = bind(&dir.join(SOCKET_FILE)) else {
        return;
    };
    let app = app.clone();
    let _ = thread::Builder::new()
        .name("deskling-hook-bridge".into())
        .spawn(move || {
            serve(listener, |record| {
                let _ = app.emit(EVENT_NAME, record);
            })
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const SESSION: &str = "0f4c9a3e-6c1d-4f3e-9b8a-2d7e5c1a9b00";

    fn parse(json: &str) -> Result<HookRecord, Reject> {
        parse_record(json.as_bytes())
    }

    fn line(event: &str, extra: &str) -> String {
        line_of("claude-code", event, extra)
    }

    fn line_of(agent: &str, event: &str, extra: &str) -> String {
        format!(
            r#"{{"v":1,"agent":"{agent}","session":"{SESSION}","event":"{event}"{extra},"at":1763500000000}}"#
        )
    }

    fn reserialized(json: &str) -> String {
        serde_json::to_string(&parse(json).expect("valid record")).expect("serializable")
    }

    #[test]
    fn accepts_a_valid_record_for_every_event() {
        for event in [
            "session-start",
            "session-end",
            "prompt",
            "approval",
            "stop",
            "stop-failure",
            "subagent-stop",
            "interrupt",
        ] {
            let json = line(event, "");
            assert_eq!(reserialized(&json), json, "{event}");
        }
        let start = line("tool-start", r#","tool":"code""#);
        assert_eq!(reserialized(&start), start);
        for tool in ["code", "browser", "terminal", "file", "delegate", "message"] {
            for ok in ["true", "false"] {
                let end = line("tool-end", &format!(r#","tool":"{tool}","ok":{ok}"#));
                assert_eq!(reserialized(&end), end, "{tool} {ok}");
            }
        }
    }

    #[test]
    fn accepts_codex_records_for_every_event_it_sends() {
        // ADR-026 §2: the same record v1, with agent "codex".
        for event in [
            "session-start",
            "session-end",
            "prompt",
            "approval",
            "stop",
            "interrupt",
        ] {
            let json = line_of("codex", event, "");
            assert_eq!(reserialized(&json), json, "{event}");
        }
        for tool in ["code", "terminal", "delegate"] {
            let start = line_of("codex", "tool-start", &format!(r#","tool":"{tool}""#));
            assert_eq!(reserialized(&start), start, "{tool}");
            let end = line_of(
                "codex",
                "tool-end",
                &format!(r#","tool":"{tool}","ok":true"#),
            );
            assert_eq!(reserialized(&end), end, "{tool}");
        }
    }

    #[test]
    fn interrupt_carries_neither_tool_nor_ok() {
        for agent in ["claude-code", "codex"] {
            assert_eq!(
                parse(&line_of(agent, "interrupt", r#","tool":"terminal""#)),
                Err(Reject::BadTool),
                "{agent}"
            );
            assert_eq!(
                parse(&line_of(agent, "interrupt", r#","ok":true"#)),
                Err(Reject::BadOutcome),
                "{agent}"
            );
            assert_eq!(
                parse(&line_of(agent, "interrupt", r#","tool":"code","ok":false"#)),
                Err(Reject::BadTool),
                "{agent}"
            );
        }
    }

    #[test]
    fn reserializes_in_schema_order_regardless_of_input_order_and_whitespace() {
        let shuffled = format!(
            "{{ \"at\": 5, \"ok\": false, \"tool\": \"terminal\", \"event\": \"tool-end\", \"session\": \"{SESSION}\", \"agent\": \"claude-code\", \"v\": 1 }}"
        );
        assert_eq!(
            reserialized(&shuffled),
            format!(
                r#"{{"v":1,"agent":"claude-code","session":"{SESSION}","event":"tool-end","tool":"terminal","ok":false,"at":5}}"#
            )
        );
    }

    #[test]
    fn rejects_unknown_fields() {
        for extra in [
            r#","prompt":"please refactor auth""#,
            r#","tool_input":{"command":"rm -rf /"}"#,
            r#","cwd":"/Users/someone""#,
            r#","seq":1"#,
            r#","V":1"#,
        ] {
            assert_eq!(
                parse(&line("stop", extra)),
                Err(Reject::BadSchema),
                "{extra}"
            );
        }
    }

    #[test]
    fn rejects_wrong_types() {
        let cases = [
            format!(
                r#"{{"v":"1","agent":"claude-code","session":"{SESSION}","event":"stop","at":1}}"#
            ),
            format!(
                r#"{{"v":1.0,"agent":"claude-code","session":"{SESSION}","event":"stop","at":1}}"#
            ),
            r#"{"v":1,"agent":"claude-code","session":7,"event":"stop","at":1}"#.to_string(),
            format!(
                r#"{{"v":1,"agent":"claude-code","session":"{SESSION}","event":"stop","at":"1"}}"#
            ),
            format!(
                r#"{{"v":1,"agent":"claude-code","session":"{SESSION}","event":"stop","at":1.5}}"#
            ),
            format!(
                r#"{{"v":1,"agent":"claude-code","session":"{SESSION}","event":"stop","at":-1}}"#
            ),
            format!(
                r#"{{"v":1,"agent":"claude-code","session":"{SESSION}","event":"stop","at":1e3}}"#
            ),
            format!(r#"{{"v":1,"agent":"claude-code","session":"{SESSION}","event":null,"at":1}}"#),
            line("tool-end", r#","tool":"code","ok":"true""#),
            line("tool-end", r#","tool":"code","ok":1"#),
            line("tool-end", r#","tool":"code","ok":null"#),
            line("tool-start", r#","tool":null"#),
            line("tool-start", r#","tool":3"#),
            line("tool-start", r#","tool":["code"]"#),
        ];
        for json in cases {
            assert_eq!(parse(&json), Err(Reject::BadSchema), "{json}");
        }
    }

    #[test]
    fn rejects_unknown_enum_values() {
        let cases = [
            line_of("hermes", "stop", ""),
            line_of("Codex", "stop", ""),
            line_of("codex-cli", "stop", ""),
            line_of("openai", "stop", ""),
            line_of("", "stop", ""),
            format!(
                r#"{{"v":1,"agent":"Claude-Code","session":"{SESSION}","event":"stop","at":1}}"#
            ),
            line("thinking", ""),
            line("Stop", ""),
            line("Interrupt", ""),
            line("interrupted", ""),
            line_of("codex", "Interrupt", ""),
            line_of("codex", "PreModelRequest", ""),
            line_of("codex", "tool-start", r#","tool":"apply_patch""#),
            line("tool-start", r#","tool":"mcp__github__get_issue""#),
            line("tool-start", r#","tool":"Bash""#),
        ];
        for json in cases {
            assert_eq!(parse(&json), Err(Reject::BadSchema), "{json}");
        }
    }

    #[test]
    fn rejects_missing_and_duplicate_fields() {
        let cases = [
            format!(r#"{{"agent":"claude-code","session":"{SESSION}","event":"stop","at":1}}"#),
            format!(r#"{{"v":1,"session":"{SESSION}","event":"stop","at":1}}"#),
            r#"{"v":1,"agent":"claude-code","event":"stop","at":1}"#.to_string(),
            format!(r#"{{"v":1,"agent":"claude-code","session":"{SESSION}","at":1}}"#),
            format!(r#"{{"v":1,"agent":"claude-code","session":"{SESSION}","event":"stop"}}"#),
            format!(
                r#"{{"v":1,"agent":"claude-code","session":"{SESSION}","event":"stop","event":"prompt","at":1}}"#
            ),
        ];
        for json in cases {
            assert_eq!(parse(&json), Err(Reject::BadSchema), "{json}");
        }
    }

    #[test]
    fn rejects_anything_that_is_not_one_json_object() {
        for bad in [
            &b""[..],
            b"   ",
            b"null",
            b"[]",
            b"\"stop\"",
            b"{",
            b"{}{}",
            b"\xff\xfe",
        ] {
            assert_eq!(parse_record(bad), Err(Reject::BadSchema));
        }
        let mut trailing = line("stop", "");
        trailing.push_str(" x");
        assert_eq!(parse(&trailing), Err(Reject::BadSchema));
    }

    #[test]
    fn rejects_other_versions() {
        for v in ["0", "2", "18446744073709551615"] {
            let json = format!(
                r#"{{"v":{v},"agent":"claude-code","session":"{SESSION}","event":"stop","at":1}}"#
            );
            assert_eq!(parse(&json), Err(Reject::BadVersion), "{v}");
        }
    }

    #[test]
    fn rejects_sessions_outside_the_identifier_rule() {
        let long = "a".repeat(65);
        for session in [
            "",
            long.as_str(),
            "has space",
            "../etc",
            "a/b",
            "sëssion",
            r"a\nb",
            r"a\u0000",
        ] {
            let json = format!(
                r#"{{"v":1,"agent":"claude-code","session":"{session}","event":"stop","at":1}}"#
            );
            assert_eq!(parse(&json), Err(Reject::BadSession), "{session}");
        }
        let edge = "Az09._:-".repeat(8);
        let json =
            format!(r#"{{"v":1,"agent":"claude-code","session":"{edge}","event":"stop","at":1}}"#);
        assert!(parse(&json).is_ok());
    }

    #[test]
    fn accepts_timestamps_up_to_8_64e15_only() {
        let at = |value: &str| {
            parse(&format!(
                r#"{{"v":1,"agent":"claude-code","session":"{SESSION}","event":"stop","at":{value}}}"#
            ))
        };
        assert!(at("0").is_ok());
        assert!(at("8640000000000000").is_ok());
        assert_eq!(at("8640000000000001"), Err(Reject::BadTimestamp));
        assert_eq!(at("18446744073709551615"), Err(Reject::BadTimestamp));
        assert_eq!(at("18446744073709551616"), Err(Reject::BadSchema));
    }

    #[test]
    fn tool_is_required_on_tool_events_and_forbidden_elsewhere() {
        assert_eq!(parse(&line("tool-start", "")), Err(Reject::BadTool));
        assert_eq!(
            parse(&line("tool-end", r#","ok":true"#)),
            Err(Reject::BadTool)
        );
        for event in [
            "session-start",
            "prompt",
            "approval",
            "stop",
            "subagent-stop",
        ] {
            assert_eq!(
                parse(&line(event, r#","tool":"code""#)),
                Err(Reject::BadTool),
                "{event}"
            );
        }
    }

    #[test]
    fn ok_is_required_on_tool_end_and_forbidden_elsewhere() {
        assert_eq!(
            parse(&line("tool-end", r#","tool":"code""#)),
            Err(Reject::BadOutcome)
        );
        assert_eq!(
            parse(&line("tool-start", r#","tool":"code","ok":true"#)),
            Err(Reject::BadOutcome)
        );
        for event in ["session-end", "approval", "stop", "stop-failure"] {
            assert_eq!(
                parse(&line(event, r#","ok":false"#)),
                Err(Reject::BadOutcome),
                "{event}"
            );
        }
    }

    fn send(bytes: &[u8], close: bool) -> (UnixStream, UnixStream) {
        let (mut client, server) = UnixStream::pair().expect("pair");
        client.write_all(bytes).expect("write");
        if close {
            client
                .shutdown(std::net::Shutdown::Write)
                .expect("shutdown");
        }
        (client, server)
    }

    fn soon() -> Instant {
        Instant::now() + Duration::from_millis(100)
    }

    #[test]
    fn reads_one_newline_terminated_line_and_ignores_the_rest() {
        let record = line("stop", "");
        let (_client, mut server) = send(format!("{record}\n{record}\ngarbage").as_bytes(), false);
        assert_eq!(read_record(&mut server, soon()), parse(&record));

        let (_client, mut server) = send(record.as_bytes(), true);
        assert_eq!(
            read_record(&mut server, soon()),
            parse(&record),
            "EOF ends the line too"
        );
    }

    #[test]
    fn reads_a_record_whose_writer_already_exited() {
        // The hook writes and exits before the bridge reads; macOS then rejects read timeouts.
        let record = line("stop", "");
        let (client, mut server) = send(format!("{record}\n").as_bytes(), false);
        drop(client);
        assert_eq!(read_record(&mut server, soon()), parse(&record));
    }

    #[test]
    fn rejects_lines_over_1024_bytes() {
        let record = line("stop", "");
        let padded = |len: usize| format!("{record}{}", " ".repeat(len - record.len()));

        let (_client, mut server) = send(format!("{}\n", padded(1024)).as_bytes(), true);
        assert!(
            read_record(&mut server, soon()).is_ok(),
            "1024 bytes is the limit"
        );

        let (_client, mut server) = send(format!("{}\n", padded(1025)).as_bytes(), true);
        assert_eq!(read_record(&mut server, soon()), Err(Reject::Oversize));

        // Stays under the socket buffer (8 KiB on macOS) so the unread write cannot block.
        let (_client, mut server) = send(&[b'x'; 4096], false);
        assert_eq!(read_record(&mut server, soon()), Err(Reject::Oversize));
    }

    #[test]
    fn times_out_when_the_line_never_arrives() {
        let (_client, mut server) = send(br#"{"v":1"#, false);
        let started = Instant::now();
        assert_eq!(
            read_record(&mut server, Instant::now() + Duration::from_millis(50)),
            Err(Reject::Timeout)
        );
        assert!(started.elapsed() < Duration::from_millis(500));
    }

    #[test]
    fn rate_limits_to_50_records_per_second() {
        let t0 = Instant::now();
        let mut limiter = RateLimiter::new(t0);
        for i in 0..50 {
            assert!(limiter.allow(t0 + Duration::from_millis(i)), "record {i}");
        }
        assert!(!limiter.allow(t0 + Duration::from_millis(999)));
        assert!(
            limiter.allow(t0 + Duration::from_millis(1000)),
            "a new window opens"
        );
    }

    #[test]
    fn bridge_delivers_valid_records_and_counts_failures_by_code() {
        let now = Instant::now();
        let mut bridge = Bridge::new(now);
        let record = line("prompt", "");

        let (_c, mut s) = send(format!("{record}\n").as_bytes(), true);
        assert_eq!(bridge.handle(&mut s, now), parse(&record).ok());

        let (_c, mut s) = send(line("prompt", r#","prompt":"SECRET""#).as_bytes(), true);
        assert_eq!(bridge.handle(&mut s, now), None);
        assert_eq!(bridge.rejected(Reject::BadSchema), 1);

        for _ in 0..60 {
            let (_c, mut s) = send(format!("{record}\n").as_bytes(), true);
            bridge.handle(&mut s, now);
        }
        assert_eq!(
            bridge.rejected(Reject::RateLimited),
            12,
            "50 per window, 2 already used"
        );
    }

    static DIRS: AtomicUsize = AtomicUsize::new(0);

    /// A fresh, short directory path (macOS limits socket paths to 104 bytes).
    fn temp_socket() -> (PathBuf, PathBuf) {
        let n = DIRS.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!("dkl-{}-{n}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let dir = root.join("app");
        (root, dir.join(SOCKET_FILE))
    }

    fn mode(path: &Path) -> u32 {
        fs::metadata(path).expect("metadata").permissions().mode() & 0o777
    }

    #[test]
    fn binds_with_private_permissions() {
        let (root, path) = temp_socket();
        let listener = bind(&path).expect("bind");
        assert!(fs::symlink_metadata(&path).unwrap().file_type().is_socket());
        assert_eq!(mode(path.parent().unwrap()), 0o700);
        assert_eq!(mode(&path), 0o600);
        drop(listener);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn replaces_a_stale_socket_but_not_a_live_one_or_a_regular_file() {
        let (root, path) = temp_socket();
        let first = bind(&path).expect("first bind");
        assert_eq!(
            bind(&path).map(|_| ()).unwrap_err().kind(),
            io::ErrorKind::AddrInUse,
            "another instance still serves it"
        );
        drop(first); // the file stays behind: a stale socket
        assert!(path.exists());
        let second = bind(&path).expect("stale socket is replaced");
        drop(second);

        fs::remove_file(&path).unwrap();
        fs::write(&path, b"user data").unwrap();
        assert!(bind(&path).is_err());
        assert_eq!(
            fs::read(&path).unwrap(),
            b"user data",
            "never deletes a non-socket"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn round_trips_a_record_through_the_socket() {
        let (root, path) = temp_socket();
        let listener = bind(&path).expect("bind");
        let record = line("tool-end", r#","tool":"browser","ok":true"#);

        let mut client = UnixStream::connect(&path).expect("connect");
        client.write_all(format!("{record}\n").as_bytes()).unwrap();
        drop(client);

        let (mut stream, _) = listener.accept().expect("accept");
        let mut bridge = Bridge::new(Instant::now());
        let received = bridge
            .handle(&mut stream, Instant::now())
            .expect("valid record");
        assert_eq!(serde_json::to_string(&received).unwrap(), record);
        drop(listener);
        fs::remove_dir_all(root).unwrap();
    }
}
