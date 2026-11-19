#!/usr/bin/env node
// Deskling hook for Claude Code (ADR-024 §1, FR-CC1). Node >= 18, no dependencies.
// Reads the hook JSON from stdin, sends at most one hook record line to Deskling's Unix socket, and exits.
// It never writes to stdout/stderr (hook output can reach Claude's context), always exits 0, and stops
// within 300 ms. When Deskling is not running the socket is missing or refuses, and the hook just ends.
// The I/O lives in ../shared/sendRecord.mjs (shared with the Codex hook, ADR-026).
import { runHook } from '../shared/sendRecord.mjs';
import { toHookRecord } from './hookRecord.mjs';

runHook(toHookRecord);
