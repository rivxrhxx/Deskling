#!/usr/bin/env node
// Deskling hook for Codex (ADR-026 §1). Node >= 18, no dependencies. Same rules as the Claude Code hook (ADR-024 §1):
// reads the hook JSON from stdin, sends at most one hook record line to Deskling's Unix socket, and exits.
// It never writes to stdout/stderr (hook output can reach Codex's context), always exits 0, and stops
// within 300 ms. When Deskling is not running the socket is missing or refuses, and the hook just ends.
import { runHook } from '../shared/sendRecord.mjs';
import { toCodexRecord } from './codexRecord.mjs';

runHook(toCodexRecord);
