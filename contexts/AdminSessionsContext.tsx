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
import { fetchActiveSessionsAdminApi } from "@/lib/api/admin-management";
import { getAdminPassword } from "@/lib/api/auth-helpers";
import type { ActiveSession } from "@/lib/data/admin-dashboard";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

type StreamMessage =
  | { type: "initial"; sessions: ActiveSession[] }
  | { type: "insert" | "update"; session: ActiveSession }
  | { type: "delete"; sessionId: string }
  | { type: "error"; message: string };

type StoreState = {
  sessionsMap: Map<string, ActiveSession>;
  sessionIds: string[];
  stationIds: string[];
  stats: { totalGood: number; totalScrap: number };
  isInitialLoading: boolean;
  connectionState: ConnectionState;
  lastUpdated: number;
};

type AdminSessionsActions = {
  refresh: () => Promise<void>;
};

const AdminSessionsContext = createContext<AdminSessionsActions | null>(null);

const MAX_RETRIES = 10;
const MAX_BACKOFF_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;

const defaultState: StoreState = {
  sessionsMap: new Map(),
  sessionIds: [],
  stationIds: [],
  stats: { totalGood: 0, totalScrap: 0 },
  isInitialLoading: true,
  connectionState: "connecting",
  lastUpdated: Date.now(),
};

let storeState: StoreState = defaultState;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getStoreSnapshot = () => storeState;

const emit = () => {
  listeners.forEach((listener) => listener());
};

const sessionChanged = (a: ActiveSession, b: ActiveSession): boolean =>
  a.status !== b.status ||
  a.currentStatus !== b.currentStatus ||
  a.totalGood !== b.totalGood ||
  a.totalScrap !== b.totalScrap ||
  a.lastStatusChangeAt !== b.lastStatusChangeAt ||
  a.forcedClosedAt !== b.forcedClosedAt ||
  a.lastSeenAt !== b.lastSeenAt ||
  a.jobId !== b.jobId ||
  a.stationId !== b.stationId ||
  a.workerId !== b.workerId ||
  a.jobNumber !== b.jobNumber ||
  a.stationName !== b.stationName ||
  a.workerName !== b.workerName ||
  a.lastEventNote !== b.lastEventNote;

const mergeSession = (
  current: ActiveSession | undefined,
  next: ActiveSession,
): ActiveSession => {
  if (!current) return next;
  if (!sessionChanged(current, next)) return current;
  return { ...current, ...next };
};

const shallowArrayEqual = <T,>(a: T[], b: T[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const computeDerived = (map: Map<string, ActiveSession>) => {
  const sessionIds = Array.from(map.values())
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    .map((session) => session.id);

  const stationIds = Array.from(
    new Set(
      Array.from(map.values())
        .map((session) => session.stationId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  let totalGood = 0;
  let totalScrap = 0;
  map.forEach((session) => {
    totalGood += session.totalGood ?? 0;
    totalScrap += session.totalScrap ?? 0;
  });

  return {
    sessionIds,
    stationIds,
    stats: { totalGood, totalScrap },
  };
};

const updateStore = (next: StoreState) => {
  if (next === storeState) return;
  storeState = next;
  emit();
};

const applySessions = (list: ActiveSession[]) => {
  const prev = storeState;
  const nextMap = new Map<string, ActiveSession>();
  let mapChanged = list.length !== prev.sessionsMap.size;

  list.forEach((session) => {
    const merged = mergeSession(prev.sessionsMap.get(session.id), session);
    if (!mapChanged && merged !== prev.sessionsMap.get(session.id)) {
      mapChanged = true;
    }
    nextMap.set(session.id, merged);
  });

  if (!mapChanged && !prev.isInitialLoading) {
    return;
  }

  const derived = computeDerived(nextMap);
  const next: StoreState = {
    sessionsMap: nextMap,
    sessionIds: shallowArrayEqual(prev.sessionIds, derived.sessionIds)
      ? prev.sessionIds
      : derived.sessionIds,
    stationIds: shallowArrayEqual(prev.stationIds, derived.stationIds)
      ? prev.stationIds
      : derived.stationIds,
    stats:
      prev.stats.totalGood === derived.stats.totalGood &&
      prev.stats.totalScrap === derived.stats.totalScrap
        ? prev.stats
        : derived.stats,
    isInitialLoading: false,
    connectionState: prev.connectionState,
    lastUpdated: Date.now(),
  };

  updateStore(next);
};

const applySingle = (session: ActiveSession) => {
  const prev = storeState;
  const current = prev.sessionsMap.get(session.id);
  const merged = mergeSession(current, session);
  if (current === merged && !prev.isInitialLoading) {
    return;
  }

  const nextMap = new Map(prev.sessionsMap);
  nextMap.set(session.id, merged);

  const derived = computeDerived(nextMap);

  const next: StoreState = {
    sessionsMap: nextMap,
    sessionIds: shallowArrayEqual(prev.sessionIds, derived.sessionIds)
      ? prev.sessionIds
      : derived.sessionIds,
    stationIds: shallowArrayEqual(prev.stationIds, derived.stationIds)
      ? prev.stationIds
      : derived.stationIds,
    stats:
      prev.stats.totalGood === derived.stats.totalGood &&
      prev.stats.totalScrap === derived.stats.totalScrap
        ? prev.stats
        : derived.stats,
    isInitialLoading: false,
    connectionState: prev.connectionState,
    lastUpdated: Date.now(),
  };

  updateStore(next);
};

const applyDelete = (sessionId: string) => {
  const prev = storeState;
  if (!prev.sessionsMap.has(sessionId)) {
    return;
  }

  const nextMap = new Map(prev.sessionsMap);
  nextMap.delete(sessionId);

  const derived = computeDerived(nextMap);

  const next: StoreState = {
    sessionsMap: nextMap,
    sessionIds: shallowArrayEqual(prev.sessionIds, derived.sessionIds)
      ? prev.sessionIds
      : derived.sessionIds,
    stationIds: shallowArrayEqual(prev.stationIds, derived.stationIds)
      ? prev.stationIds
      : derived.stationIds,
    stats:
      prev.stats.totalGood === derived.stats.totalGood &&
      prev.stats.totalScrap === derived.stats.totalScrap
        ? prev.stats
        : derived.stats,
    isInitialLoading: prev.isInitialLoading,
    connectionState: prev.connectionState,
    lastUpdated: Date.now(),
  };

  updateStore(next);
};

const setConnectionState = (connectionState: ConnectionState) => {
  if (storeState.connectionState === connectionState) return;
  updateStore({ ...storeState, connectionState });
};

const setInitialLoading = (isInitialLoading: boolean) => {
  if (storeState.isInitialLoading === isInitialLoading) return;
  updateStore({ ...storeState, isInitialLoading });
};

const refreshSessions = async () => {
  try {
    const { sessions } = await fetchActiveSessionsAdminApi();
    applySessions(sessions);
  } catch (error) {
    console.error("[admin-dashboard] Manual refresh failed", error);
    setInitialLoading(false);
  }
};

export const useAdminSessionsSelector = <T,>(
  selector: (state: StoreState) => T,
) => {
  const state = useSyncExternalStore(
    subscribe,
    getStoreSnapshot,
    () => defaultState,
  );
  return selector(state);
};

export const useAdminSession = (id: string | null | undefined) =>
  useAdminSessionsSelector((state) => (id ? state.sessionsMap.get(id) ?? null : null));

export const useAdminSessionIds = () =>
  useAdminSessionsSelector((state) => state.sessionIds);

export const useAdminStationIds = () =>
  useAdminSessionsSelector((state) => state.stationIds);

export const useAdminSessionsLoading = () =>
  useAdminSessionsSelector((state) => state.isInitialLoading);

export const useAdminConnectionState = () =>
  useAdminSessionsSelector((state) => state.connectionState);

export const useAdminSessionStats = () =>
  useAdminSessionsSelector((state) => state.stats);

export const useAdminSessionCount = () =>
  useAdminSessionsSelector((state) => state.sessionIds.length);

const AdminSessionsActionsProvider = ({
  children,
  value,
}: {
  children: ReactNode;
  value: AdminSessionsActions;
}) => (
  <AdminSessionsContext.Provider value={value}>
    {children}
  </AdminSessionsContext.Provider>
);

export const useAdminSessionsRefresh = () => {
  const ctx = useContext(AdminSessionsContext);
  if (!ctx) {
    throw new Error("useAdminSessionsRefresh must be used within AdminSessionsProvider");
  }
  return ctx.refresh;
};

export function AdminSessionsProvider({ children }: { children: ReactNode }) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const backoffTimeoutRef = useRef<number | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    const runPoll = async () => {
      try {
        const { sessions } = await fetchActiveSessionsAdminApi();
        applySessions(sessions);
      } catch (error) {
        console.error("[admin-dashboard] Polling failed", error);
        setInitialLoading(false);
      }
    };

    void runPoll();
    pollIntervalRef.current = window.setInterval(runPoll, POLL_INTERVAL_MS);
  }, [stopPolling]);

  const handleStreamMessage = useCallback((event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as StreamMessage;
      if (payload.type === "initial") {
        applySessions(payload.sessions ?? []);
        return;
      }
      if (payload.type === "insert" || payload.type === "update") {
        if (payload.session) {
          applySingle(payload.session);
        }
        return;
      }
      if (payload.type === "delete") {
        applyDelete(payload.sessionId);
        return;
      }
      if (payload.type === "error") {
        console.error("[admin-dashboard] SSE error event", payload.message);
      }
    } catch (error) {
      console.error("[admin-dashboard] Failed to handle SSE message", error);
    }
  }, []);

  const disconnectStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const connectToStream = useCallback(function connect() {
    if (typeof window === "undefined") {
      return;
    }

    stopPolling();
    if (backoffTimeoutRef.current) {
      window.clearTimeout(backoffTimeoutRef.current);
      backoffTimeoutRef.current = null;
    }
    disconnectStream();

    const password = getAdminPassword();
    const url = new URL(
      "/api/admin/dashboard/active-sessions/stream",
      window.location.origin,
    );
    if (password) {
      url.searchParams.set("password", password);
    }

    setConnectionState("connecting");

    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      retryRef.current = 0;
      setConnectionState("connected");
    };

    eventSource.onmessage = handleStreamMessage;

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
      if (retryRef.current >= MAX_RETRIES) {
        setConnectionState("error");
        startPolling();
        return;
      }

      const delay = Math.min(
        MAX_BACKOFF_MS,
        1000 * 2 ** Math.max(0, retryRef.current),
      );
      retryRef.current += 1;
      setConnectionState("disconnected");

      if (backoffTimeoutRef.current) {
        window.clearTimeout(backoffTimeoutRef.current);
      }
      backoffTimeoutRef.current = window.setTimeout(() => {
        backoffTimeoutRef.current = null;
        connect();
      }, delay);
    };
  }, [disconnectStream, handleStreamMessage, startPolling, stopPolling]);

  useEffect(() => {
    connectToStream();

    return () => {
      disconnectStream();
      stopPolling();
      if (backoffTimeoutRef.current) {
        window.clearTimeout(backoffTimeoutRef.current);
        backoffTimeoutRef.current = null;
      }
    };
  }, [connectToStream, disconnectStream, stopPolling]);

  const actions = useMemo(
    () => ({
      refresh: refreshSessions,
    }),
    [],
  );

  return (
    <AdminSessionsActionsProvider value={actions}>
      {children}
    </AdminSessionsActionsProvider>
  );
}
