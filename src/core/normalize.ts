import type { AgentEvent, AgentEventSource, AgentEventVersion, UsageReport } from './agentEvent';
import {
  AGENT_EVENT_SCHEMA,
  AGENT_EVENT_VERSIONS,
  EVENT_TYPES,
  GUEST_KINDS,
  SOURCE_KINDS,
  TOOL_CATEGORIES,
  TOOL_OUTCOMES,
} from './agentEvent';

/** Opaque identifiers only: no spaces, slashes or anything path- or prose-shaped. */
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,64}$/;

/** The largest epoch-millisecond value a JavaScript Date can represent. */
export const MAX_TIMESTAMP = 8_640_000_000_000_000;

export const NORMALIZE_ERRORS = [
  'not-object',
  'bad-schema',
  'bad-version',
  'bad-id',
  'bad-seq',
  'bad-timestamp',
  'bad-source',
  'bad-type',
  'bad-tool',
  'bad-outcome',
  'bad-usage',
  'bad-target',
] as const;
export type NormalizeError = (typeof NORMALIZE_ERRORS)[number];

export type NormalizeResult =
  | { readonly ok: true; readonly event: AgentEvent }
  | { readonly ok: false; readonly error: NormalizeError };

type UnknownRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Reads an own property only, so nothing inherited (or polluted) leaks in. */
function own(record: UnknownRecord, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0;
}

/** Copies only the numeric usage fields (ADR-016). Returns null when anything is malformed. */
function parseUsage(raw: unknown): UsageReport | null {
  if (!isPlainRecord(raw)) return null;
  const rawTokens = own(raw, 'tokens');
  const rawContext = own(raw, 'context');
  if (rawTokens === undefined && rawContext === undefined) return null;

  let tokens: UsageReport['tokens'];
  if (rawTokens !== undefined) {
    if (!isPlainRecord(rawTokens)) return null;
    const used = own(rawTokens, 'used');
    if (!isNonNegativeSafeInteger(used)) return null;
    tokens = Object.freeze({ used });
  }

  let context: UsageReport['context'];
  if (rawContext !== undefined) {
    if (!isPlainRecord(rawContext)) return null;
    const used = own(rawContext, 'used');
    const limit = own(rawContext, 'limit');
    if (!isNonNegativeSafeInteger(used) || !isPositiveSafeInteger(limit)) return null;
    context = Object.freeze({ used, limit });
  }

  return Object.freeze({ ...(tokens ? { tokens } : {}), ...(context ? { context } : {}) });
}

/** `{ kind, session }` for `source` and `to` alike. Guest kinds exist only from v3 (ADR-022). */
function parseSession(raw: unknown, version: AgentEventVersion): AgentEventSource | null {
  if (!isPlainRecord(raw)) return null;
  const kind = own(raw, 'kind');
  const session = own(raw, 'session');
  if (!oneOf(SOURCE_KINDS, kind) || !isIdentifier(session)) return null;
  if (version < 3 && oneOf(GUEST_KINDS, kind)) return null;
  return Object.freeze({ kind, session });
}

function isVersion(value: unknown): value is AgentEventVersion {
  return typeof value === 'number' && (AGENT_EVENT_VERSIONS as readonly number[]).includes(value);
}

function fail(error: NormalizeError): NormalizeResult {
  return { ok: false, error };
}

/**
 * Trust boundary between adapters and the rest of the app (docs/EVENT_PROTOCOL.md).
 * Builds a brand-new frozen object from whitelisted fields; everything else is discarded unread.
 * Failures carry only an error code — never any part of the input (SEC-3).
 */
export function normalizeAgentEvent(input: unknown): NormalizeResult {
  try {
    return normalize(input);
  } catch {
    // Hostile getters or proxies: treat as unreadable, report nothing about them.
    return fail('not-object');
  }
}

function normalize(input: unknown): NormalizeResult {
  if (!isPlainRecord(input)) return fail('not-object');
  if (own(input, 'schema') !== AGENT_EVENT_SCHEMA) return fail('bad-schema');
  const version = own(input, 'version');
  if (!isVersion(version)) return fail('bad-version');

  const id = own(input, 'id');
  if (!isIdentifier(id)) return fail('bad-id');

  const seq = own(input, 'seq');
  if (!isNonNegativeSafeInteger(seq)) return fail('bad-seq');

  const at = own(input, 'at');
  if (!isNonNegativeSafeInteger(at) || at > MAX_TIMESTAMP) return fail('bad-timestamp');

  const source = parseSession(own(input, 'source'), version);
  if (!source) return fail('bad-source');

  const type = own(input, 'type');
  if (!oneOf(EVENT_TYPES, type)) return fail('bad-type');

  const common = { schema: AGENT_EVENT_SCHEMA, version, id, seq, at, source } as const;

  if (type === 'usage.reported') {
    if (version < 2) return fail('bad-type');
    const usage = parseUsage(own(input, 'usage'));
    if (!usage) return fail('bad-usage');
    return { ok: true, event: Object.freeze({ ...common, type, usage }) };
  }

  if (type === 'session.message') {
    if (version < 3) return fail('bad-type');
    const rawTo = own(input, 'to');
    if (rawTo === undefined) return { ok: true, event: Object.freeze({ ...common, type }) };
    const to = parseSession(rawTo, version);
    if (!to) return fail('bad-target');
    return { ok: true, event: Object.freeze({ ...common, type, to }) };
  }

  if (type === 'tool.started' || type === 'tool.finished') {
    const tool = own(input, 'tool');
    if (!oneOf(TOOL_CATEGORIES, tool)) return fail('bad-tool');
    if (type === 'tool.started') {
      return { ok: true, event: Object.freeze({ ...common, type, tool }) };
    }
    const outcome = own(input, 'outcome');
    if (!oneOf(TOOL_OUTCOMES, outcome)) return fail('bad-outcome');
    return { ok: true, event: Object.freeze({ ...common, type, tool, outcome }) };
  }

  return { ok: true, event: Object.freeze({ ...common, type }) };
}
