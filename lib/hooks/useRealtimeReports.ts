"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAdminLoggedIn } from "@/lib/api/auth-helpers";
import type { ReportWithDetails, ReportType } from "@/lib/types";
import type { StationWithReports, StationWithScrapReports } from "@/lib/data/reports";

type ReportsData = {
  general: ReportWithDetails[];
  malfunction: StationWithReports[];
  scrap: StationWithScrapReports[];
};

type StreamMessage =
  | { type: "initial"; data: ReportsData }
  | { type: "update"; data: ReportsData }
  | { type: "error"; message: string };

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

const MAX_RETRIES = 10;
const MAX_BACKOFF_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;

// Global store for reports data (shared across all hook instances)
let storeData: ReportsData = {
  general: [],
  malfunction: [],
  scrap: [],
};
let isInitialLoading = true;
let connectionState: ConnectionState = "connecting";
let lastUpdated = 0;

const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const updateStore = (data: ReportsData) => {
  storeData = data;
  isInitialLoading = false;
  lastUpdated = Date.now();
  emit();
};

const setConnectionState = (state: ConnectionState) => {
  if (connectionState === state) return;
  connectionState = state;
  emit();
};

const setInitialLoading = (loading: boolean) => {
  if (isInitialLoading === loading) return;
  isInitialLoading = loading;
  emit();
};

// SSE connection management (singleton)
let eventSource: EventSource | null = null;
let retryCount = 0;
let backoffTimeout: ReturnType<typeof setTimeout> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let isConnecting = false;

const stopPolling = () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
};

const startPolling = (fetchData: () => Promise<ReportsData>) => {
  stopPolling();

  const runPoll = async () => {
    try {
      const data = await fetchData();
      updateStore(data);
    } catch (error) {
      console.error("[reports-realtime] Polling failed", error);
      setInitialLoading(false);
    }
  };

  void runPoll();
  pollInterval = setInterval(runPoll, POLL_INTERVAL_MS);
};

// Store fetchAll reference for reconnection from error handler
let reconnectFetchRef: (() => Promise<ReportsData>) | null = null;

const handleStreamMessage = (event: MessageEvent<string>) => {
  try {
    const payload = JSON.parse(event.data) as StreamMessage;
    if (payload.type === "initial" || payload.type === "update") {
      updateStore(payload.data);
    } else if (payload.type === "error") {
      console.error("[reports-realtime] SSE error event", payload.message);
      // On channel closed error, force disconnect to trigger reconnection
      if (payload.message === "REPORTS_CHANNEL_CLOSED" || payload.message === "REFETCH_FAILED") {
        disconnectStream();
        // The es.onerror handler will trigger reconnection with backoff
        if (reconnectFetchRef) {
          const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, retryCount));
          retryCount += 1;
          setConnectionState("disconnected");
          if (backoffTimeout) clearTimeout(backoffTimeout);
          backoffTimeout = setTimeout(() => {
            backoffTimeout = null;
            connectToStream(reconnectFetchRef!);
          }, delay);
        }
      }
    }
  } catch (error) {
    console.error("[reports-realtime] Failed to handle SSE message", error);
  }
};

const disconnectStream = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  isConnecting = false;
};

const connectToStream = (fetchData: () => Promise<ReportsData>) => {
  if (typeof window === "undefined") return;

  // Don't reconnect if already connecting or connected
  if (isConnecting || eventSource?.readyState === EventSource.OPEN) return;

  // Don't try to connect if not logged in
  if (!isAdminLoggedIn()) {
    setConnectionState("error");
    setInitialLoading(false);
    return;
  }

  // Store fetchData for reconnection from error handler
  reconnectFetchRef = fetchData;

  stopPolling();
  if (backoffTimeout) {
    clearTimeout(backoffTimeout);
    backoffTimeout = null;
  }
  disconnectStream();

  isConnecting = true;
  setConnectionState("connecting");

  const url = new URL("/api/admin/reports/stream", window.location.origin);
  const es = new EventSource(url.toString(), { withCredentials: true });
  eventSource = es;

  es.onopen = () => {
    retryCount = 0;
    isConnecting = false;
    setConnectionState("connected");
  };

  es.onmessage = handleStreamMessage;

  es.onerror = () => {
    es.close();
    eventSource = null;
    isConnecting = false;

    // Don't retry if not logged in
    if (!isAdminLoggedIn()) {
      setConnectionState("error");
      setInitialLoading(false);
      return;
    }

    if (retryCount >= MAX_RETRIES) {
      setConnectionState("error");
      startPolling(fetchData);
      return;
    }

    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, retryCount));
    retryCount += 1;
    setConnectionState("disconnected");

    if (backoffTimeout) clearTimeout(backoffTimeout);
    backoffTimeout = setTimeout(() => {
      backoffTimeout = null;
      connectToStream(fetchData);
    }, delay);
  };
};

// Track active hook instances
let activeHooks = 0;

type UseRealtimeReportsArgs<T> = {
  reportType: ReportType;
  fetchData: () => Promise<T>;
  enabled?: boolean;
};

type UseRealtimeReportsResult<T> = {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export const useRealtimeReports = <T>({
  reportType,
  fetchData,
  enabled = true,
}: UseRealtimeReportsArgs<T>): UseRealtimeReportsResult<T> => {
  const [, forceUpdate] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Store fetchData that returns all reports for the SSE fallback
  const fetchAllRef = useRef(async (): Promise<ReportsData> => {
    // Import dynamically to avoid circular deps
    const { fetchAllReportsAdminApi } = await import("@/lib/api/admin-management");
    return fetchAllReportsAdminApi();
  });

  // Subscribe to store changes
  useEffect(() => {
    if (!enabled) return;

    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);

    activeHooks += 1;

    // Connect if this is the first hook
    if (activeHooks === 1) {
      connectToStream(fetchAllRef.current);
    }

    return () => {
      listeners.delete(listener);
      activeHooks -= 1;

      // Disconnect if no more hooks
      if (activeHooks === 0) {
        disconnectStream();
        stopPolling();
        if (backoffTimeout) {
          clearTimeout(backoffTimeout);
          backoffTimeout = null;
        }
      }
    };
  }, [enabled]);

  // Extract the relevant data for this report type
  const data = enabled
    ? (storeData[reportType] as unknown as T)
    : null;

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Refresh by calling the original fetchData and updating the store slice
      const result = await fetchData();
      // Update just this slice
      storeData = {
        ...storeData,
        [reportType]: result,
      };
      emit();
    } catch (error) {
      console.error(`[useRealtimeReports:${reportType}] refresh failed`, error);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchData, reportType]);

  return {
    data,
    isLoading: enabled && isInitialLoading,
    isRefreshing,
    error: connectionState === "error" ? "CONNECTION_ERROR" : null,
    refresh,
  };
};
