import type { AgentEvent, AgentEventSource, PlainEventType, ToolCategory, ToolOutcome } from './agentEvent';
import { AGENT_EVENT_SCHEMA, AGENT_EVENT_VERSION } from './agentEvent';

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

function fail(error: NormalizeError): NormalizeResult {
  return { ok: false, error };
}

/**
 * Trust boundary between adapters and the rest of the app (docs/EVENT_PROTOCOL.md).
 * Builds a brand-new frozen object from whitelisted fields; everything else is discarded unread.
 * Failures carry only an error code — never any part of the input (SEC-3).
 */
export function normalizeAgentEvent(input: unknown): NormalizeResult {
  if (!isPlainRecord(input)) {
    return fail('not-object');
  }
  const rawSource = own(input, 'source');
  if (!isPlainRecord(rawSource)) {
    return fail('bad-source');
  }

  const source: AgentEventSource = Object.freeze({
    kind: own(rawSource, 'kind') as AgentEventSource['kind'],
    session: own(rawSource, 'session') as string,
  });
  const common = {
    schema: AGENT_EVENT_SCHEMA,
    version: AGENT_EVENT_VERSION,
    id: own(input, 'id') as string,
    seq: own(input, 'seq') as number,
    at: own(input, 'at') as number,
    source,
  } as const;

  const type = own(input, 'type');
  if (type === 'tool.started') {
    return { ok: true, event: Object.freeze({ ...common, type, tool: own(input, 'tool') as ToolCategory }) };
  }
  if (type === 'tool.finished') {
    return {
      ok: true,
      event: Object.freeze({
        ...common,
        type,
        tool: own(input, 'tool') as ToolCategory,
        outcome: own(input, 'outcome') as ToolOutcome,
      }),
    };
  }
  return { ok: true, event: Object.freeze({ ...common, type: type as PlainEventType }) };
}
