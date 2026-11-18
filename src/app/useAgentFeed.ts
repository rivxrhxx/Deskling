import { useEffect, useReducer } from 'react';
import type { AgentEventSource } from '../adapters/types';
import type { AgentEvent } from '../core/agentEvent';
import type { AgentViewState } from '../core/agentState';
import { initialAgentState, reduceAgentState } from '../core/agentState';
import type { RejectReporter } from '../core/ingest';
import { createIngest, warnRejected } from '../core/ingest';

interface FeedState {
  readonly source: AgentEventSource | null;
  readonly view: AgentViewState;
}

interface FeedAction {
  readonly source: AgentEventSource;
  readonly event: AgentEvent;
}

/** A feed belongs to one source: events from a new source start from a fresh state. */
function feedReducer(state: FeedState, action: FeedAction): FeedState {
  const base = state.source === action.source ? state.view : initialAgentState;
  const view = reduceAgentState(base, action.event);
  return view === base && state.source === action.source ? state : { source: action.source, view };
}

const EMPTY_FEED: FeedState = { source: null, view: initialAgentState };

/**
 * Subscribes to a source and folds its events into view state.
 * Every raw object passes through createIngest → normalizeAgentEvent before the reducer (FR-E2).
 */
export function useAgentFeed(source: AgentEventSource, onReject: RejectReporter = warnRejected): AgentViewState {
  const [feed, dispatch] = useReducer(feedReducer, EMPTY_FEED);

  useEffect(() => {
    const ingest = createIngest((event) => dispatch({ source, event }), onReject);
    return source.start(ingest);
  }, [source, onReject]);

  return feed.source === source ? feed.view : initialAgentState;
}
