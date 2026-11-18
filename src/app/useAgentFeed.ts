import { useLayoutEffect, useReducer } from 'react';
import type { AgentEventSource } from '../adapters/types';
import type { AgentEvent } from '../core/agentEvent';
import type { RejectReporter } from '../core/ingest';
import { createIngest, warnRejected } from '../core/ingest';
import type { RoomViewState } from '../core/roomState';
import { initialRoomState, reduceRoom } from '../core/roomState';

interface FeedState {
  readonly source: AgentEventSource | null;
  readonly room: RoomViewState;
}

interface FeedAction {
  readonly source: AgentEventSource;
  readonly event: AgentEvent;
}

/** A feed belongs to one source: events from a new source start from an empty room. */
function feedReducer(state: FeedState, action: FeedAction): FeedState {
  const base = state.source === action.source ? state.room : initialRoomState;
  const room = reduceRoom(base, action.event);
  return room === base && state.source === action.source ? state : { source: action.source, room };
}

const EMPTY_FEED: FeedState = { source: null, room: initialRoomState };

/**
 * Subscribes to a source and folds its events into the room: one view per session (ADR-022).
 * Every raw object passes through createIngest → normalizeAgentEvent before the reducer (FR-E2).
 */
export function useAgentFeed(source: AgentEventSource, onReject: RejectReporter = warnRejected): RoomViewState {
  const [feed, dispatch] = useReducer(feedReducer, EMPTY_FEED);

  // Layout effect: a source that emits synchronously on start (the demo) is applied before paint,
  // so switching sources never flashes the "offline" placeholder.
  useLayoutEffect(() => {
    let active = true;
    const ingest = createIngest((event) => dispatch({ source, event }), onReject);
    const stop = source.start((raw) => {
      // Adapters may deliver late (e.g. an async unlisten). Once stopped, a source is ignored entirely.
      if (active) ingest(raw);
    });
    return () => {
      active = false;
      stop();
    };
  }, [source, onReject]);

  return feed.source === source ? feed.room : initialRoomState;
}
