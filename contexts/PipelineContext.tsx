"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  SessionPipelineContext,
  PipelineNeighborStation,
} from "@/lib/api/client";
import { fetchSessionPipelineContextApi } from "@/lib/api/client";

// ============================================
// TYPES
// ============================================

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

type StoreState = {
  context: SessionPipelineContext | null;
  connectionState: ConnectionState;
  lastUpdated: number;
  error: string | null;
};

type PipelineContextValue = {
  // Pipeline data
  isProductionLine: boolean;
  isSingleStation: boolean;
  currentPosition: number;
  totalSteps: number;
  isTerminal: boolean;
  prevStation: PipelineNeighborStation | null;
  nextStation: PipelineNeighborStation | null;
  upstreamWip: number;
  waitingOutput: number;
  jobItem: SessionPipelineContext["jobItem"];
  // Connection state
  connectionState: ConnectionState;
  error: string | null;
  // For animation detection
  lastUpdated: number;
};

// ============================================
// CONSTANTS
// ============================================

const MAX_CONSECUTIVE_ERRORS = 5; // Reset on successful connection
const MAX_BACKOFF_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;
const RECONNECT_DELAY_MS = 1_000; // Quick reconnect after normal stream end
const VISIBILITY_RECONNECT_DELAY_MS = 500; // Quick reconnect when tab becomes visible

// ============================================
// EXTERNAL STORE
// ============================================

const defaultState: StoreState = {
  context: null,
  connectionState: "connecting",
  lastUpdated: Date.now(),
  error: null,
};

// Each session gets its own store instance
const createStore = () => {
  let state: StoreState = { ...defaultState };
  const listeners = new Set<() => void>();

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const getSnapshot = () => state;

  const emit = () => {
    listeners.forEach((listener) => listener());
  };

  const update = (next: Partial<StoreState>) => {
    state = { ...state, ...next, lastUpdated: Date.now() };
    emit();
  };

  const setContext = (context: SessionPipelineContext) => {
    // Only update if values actually changed
    const prev = state.context;
    if (
      prev &&
      prev.upstreamWip === context.upstreamWip &&
      prev.waitingOutput === context.waitingOutput &&
      prev.currentPosition === context.currentPosition &&
      prev.isTerminal === context.isTerminal &&
      prev.prevStation?.wipAvailable === context.prevStation?.wipAvailable &&
      prev.nextStation?.wipAvailable === context.nextStation?.wipAvailable
    ) {
      return; // No meaningful change
    }
    update({ context, error: null });
  };

  const setConnectionState = (connectionState: ConnectionState) => {
    if (state.connectionState === connectionState) return;
    update({ connectionState });
  };

  const setError = (error: string | null) => {
    update({ error });
  };

  const reset = () => {
    state = { ...defaultState };
    emit();
  };

  return {
    subscribe,
    getSnapshot,
    setContext,
    setConnectionState,
    setError,
    reset,
    getState: () => state,
  };
};

type Store = ReturnType<typeof createStore>;

// ============================================
// CONTEXT
// ============================================

const PipelineStoreContext = createContext<Store | null>(null);

// ============================================
// HOOKS

// Default values returned when outside PipelineProvider
const defaultPipelineValue: PipelineContextValue = {
  isProductionLine: false,
  isSingleStation: false,
  currentPosition: 1,
  totalSteps: 1,
  isTerminal: true,
  prevStation: null,
  nextStation: null,
  upstreamWip: 0,
  waitingOutput: 0,
  jobItem: null,
  connectionState: "disconnected",
  error: null,
  lastUpdated: 0,
};
// Null-safe store access - no-op subscribe when not in provider
const noopSubscribe = () => () => {};

export const usePipelineContext = (): PipelineContextValue => {
  const store = useContext(PipelineStoreContext);

  // When outside provider, return stable defaults
  const state = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? (() => defaultState),
    () => defaultState,
  );

  return useMemo(() => {
    // If no store, return default values
    if (!store) return defaultPipelineValue;

    const ctx = state.context;
    return {
      isProductionLine: ctx?.isProductionLine ?? false,
      isSingleStation: ctx?.isSingleStation ?? false,
      currentPosition: ctx?.currentPosition ?? 1,
      totalSteps: ctx?.totalSteps ?? 1,
      isTerminal: ctx?.isTerminal ?? true,
      prevStation: ctx?.prevStation ?? null,
      nextStation: ctx?.nextStation ?? null,
      upstreamWip: ctx?.upstreamWip ?? 0,
      waitingOutput: ctx?.waitingOutput ?? 0,
      jobItem: ctx?.jobItem ?? null,
      connectionState: state.connectionState,
      error: state.error,
      lastUpdated: state.lastUpdated,
    };
  }, [store, state]);
};

export const usePipelineConnectionState = (): ConnectionState => {
  const store = useContext(PipelineStoreContext);

  const state = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? (() => defaultState),
    () => defaultState,
  );

  return store ? state.connectionState : "disconnected";
};

// ============================================
// PROVIDER
// ============================================

type PipelineProviderProps = {
  sessionId: string;
  children: ReactNode;
};

export function PipelineProvider({ sessionId, children }: PipelineProviderProps) {
  // Create a store instance for this session
  const storeRef = useRef<Store | null>(null);
  if (!storeRef.current) {
    storeRef.current = createStore();
  }
  const store = storeRef.current;

  const eventSourceRef = useRef<EventSource | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const backoffTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCleaningUpRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();

    const runPoll = async () => {
      try {
        const context = await fetchSessionPipelineContextApi(sessionId);
        store.setContext(context);
      } catch (error) {
        console.error("[PipelineContext] Polling failed:", error);
      }
    };

    void runPoll();
    pollIntervalRef.current = setInterval(runPoll, POLL_INTERVAL_MS);
  }, [sessionId, store, stopPolling]);

  const handleStreamMessage = useCallback(
    (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          type: "initial" | "update" | "error";
          context?: SessionPipelineContext;
          message?: string;
        };

        // DEBUG: Log received SSE message
        console.log("[PipelineContext] Received SSE message:", payload);

        if (payload.type === "error") {
          console.error("[PipelineContext] SSE error:", payload.message);
          store.setError(payload.message ?? "Unknown error");
          return;
        }

        if (payload.context) {
          console.log("[PipelineContext] Setting context - jobItem:", payload.context.jobItem);
          store.setContext(payload.context);
        }
      } catch (error) {
        console.error("[PipelineContext] Failed to parse SSE message:", error);
      }
    },
    [store],
  );

  const disconnectStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const connectToStream = useCallback(
    function connect() {
      if (typeof window === "undefined") return;
      if (isCleaningUpRef.current) return;

      stopPolling();
      if (backoffTimeoutRef.current) {
        clearTimeout(backoffTimeoutRef.current);
        backoffTimeoutRef.current = null;
      }
      disconnectStream();

      store.setConnectionState("connecting");

      // Build URL with worker code from localStorage
      const workerCode = window.localStorage.getItem("workerCode") ?? "";
      const url = new URL(
        `/api/sessions/pipeline/stream?sessionId=${encodeURIComponent(sessionId)}`,
        window.location.origin,
      );

      // For simplicity, we'll use a custom fetch-based SSE implementation
      // EventSource doesn't support custom headers (X-Worker-Code)
      const controller = new AbortController();

      const fetchStream = async () => {
        let streamEndedNormally = false;

        try {
          console.log("[PipelineContext] Connecting to SSE stream:", url.toString());

          const response = await fetch(url.toString(), {
            headers: {
              Accept: "text/event-stream",
              "X-Worker-Code": workerCode,
            },
            signal: controller.signal,
          });

          console.log("[PipelineContext] SSE response status:", response.status);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("No response body");
          }

          store.setConnectionState("connected");
          consecutiveErrorsRef.current = 0; // Reset on successful connection

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              streamEndedNormally = true;
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                handleStreamMessage({ data } as MessageEvent<string>);
              }
            }
          }

          // Stream ended normally (server closed connection)
          // This is expected for long-running sessions - reconnect immediately
          if (streamEndedNormally && !controller.signal.aborted && !isCleaningUpRef.current) {
            console.log("[PipelineContext] Stream ended normally, reconnecting...");
            store.setConnectionState("disconnected");
            backoffTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
          }
        } catch (error) {
          if (controller.signal.aborted || isCleaningUpRef.current) return;

          console.error("[PipelineContext] Stream error:", error);
          consecutiveErrorsRef.current += 1;

          if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
            console.log("[PipelineContext] Too many errors, falling back to polling");
            store.setConnectionState("error");
            startPolling();
            return;
          }

          const delay = Math.min(
            MAX_BACKOFF_MS,
            1000 * 2 ** Math.max(0, consecutiveErrorsRef.current - 1),
          );
          store.setConnectionState("disconnected");

          console.log(`[PipelineContext] Reconnecting in ${delay}ms (attempt ${consecutiveErrorsRef.current})`);
          backoffTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      // Store the controller for cleanup
      eventSourceRef.current = { close: () => controller.abort() } as EventSource;
      void fetchStream();
    },
    [sessionId, store, disconnectStream, handleStreamMessage, startPolling, stopPolling],
  );

  useEffect(() => {
    // Reset cleanup flag and store when session changes
    isCleaningUpRef.current = false;
    store.reset();
    connectToStream();

    // Reconnect when tab becomes visible (handles browser throttling)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const currentState = store.getState().connectionState;
        // Only reconnect if not already connected or connecting
        if (currentState === "disconnected" || currentState === "error") {
          console.log("[PipelineContext] Tab visible, reconnecting...");
          consecutiveErrorsRef.current = 0; // Reset errors on visibility
          backoffTimeoutRef.current = setTimeout(connectToStream, VISIBILITY_RECONNECT_DELAY_MS);
        }
      }
    };

    // Reconnect on network recovery
    const handleOnline = () => {
      console.log("[PipelineContext] Network online, reconnecting...");
      consecutiveErrorsRef.current = 0;
      connectToStream();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      isCleaningUpRef.current = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      disconnectStream();
      stopPolling();
      if (backoffTimeoutRef.current) {
        clearTimeout(backoffTimeoutRef.current);
        backoffTimeoutRef.current = null;
      }
    };
  }, [sessionId, connectToStream, disconnectStream, stopPolling, store]);

  return (
    <PipelineStoreContext.Provider value={store}>
      {children}
    </PipelineStoreContext.Provider>
  );
}

export default PipelineProvider;
