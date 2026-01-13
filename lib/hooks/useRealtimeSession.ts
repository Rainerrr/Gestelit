"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAdminLoggedIn } from "@/lib/api/auth-helpers";
import type { SessionDetailStream } from "@/app/api/admin/dashboard/session/[id]/stream/route";

export type { SessionDetailStream };

type StreamMessage =
  | { type: "initial"; data: SessionDetailStream }
  | { type: "update"; data: SessionDetailStream }
  | { type: "error"; message: string };

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

const MAX_RETRIES = 10;
const MAX_BACKOFF_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;

type UseRealtimeSessionArgs = {
  sessionId: string | null;
  enabled?: boolean;
};

type UseRealtimeSessionResult = {
  session: SessionDetailStream | null;
  isLoading: boolean;
  isRefreshing: boolean;
  connectionState: ConnectionState;
  error: string | null;
  refresh: () => Promise<void>;
};

export const useRealtimeSession = ({
  sessionId,
  enabled = true,
}: UseRealtimeSessionArgs): UseRealtimeSessionResult => {
  const [session, setSession] = useState<SessionDetailStream | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const backoffTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isClosingRef = useRef(false);

  // Fetch session data via API (for polling fallback)
  const fetchSession = useCallback(async (): Promise<SessionDetailStream | null> => {
    if (!sessionId) return null;
    try {
      const response = await fetch(`/api/admin/dashboard/session/${sessionId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "FETCH_FAILED");
      }
      const data = await response.json();
      return data.session as SessionDetailStream;
    } catch (err) {
      console.error("[useRealtimeSession] fetch failed", err);
      throw err;
    }
  }, [sessionId]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Start polling fallback
  const startPolling = useCallback(() => {
    stopPolling();

    const runPoll = async () => {
      try {
        const data = await fetchSession();
        if (data && !isClosingRef.current) {
          setSession(data);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("[useRealtimeSession] polling failed", err);
        setIsLoading(false);
      }
    };

    void runPoll();
    pollIntervalRef.current = setInterval(runPoll, POLL_INTERVAL_MS);
  }, [fetchSession, stopPolling]);

  // Disconnect stream
  const disconnectStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Connect to SSE stream
  const connectToStream = useCallback(() => {
    if (typeof window === "undefined" || !sessionId) return;

    // Don't reconnect if closing or already connected
    if (isClosingRef.current) return;
    if (eventSourceRef.current?.readyState === EventSource.OPEN) return;

    // Don't try to connect if not logged in
    if (!isAdminLoggedIn()) {
      setConnectionState("error");
      setIsLoading(false);
      setError("NOT_LOGGED_IN");
      return;
    }

    stopPolling();
    if (backoffTimeoutRef.current) {
      clearTimeout(backoffTimeoutRef.current);
      backoffTimeoutRef.current = null;
    }
    disconnectStream();

    setConnectionState("connecting");
    setError(null);

    const url = new URL(`/api/admin/dashboard/session/${sessionId}/stream`, window.location.origin);
    const es = new EventSource(url.toString(), { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      if (isClosingRef.current) {
        es.close();
        return;
      }
      retryCountRef.current = 0;
      setConnectionState("connected");
    };

    es.onmessage = (event: MessageEvent<string>) => {
      if (isClosingRef.current) return;
      try {
        const payload = JSON.parse(event.data) as StreamMessage;
        if (payload.type === "initial" || payload.type === "update") {
          setSession(payload.data);
          setIsLoading(false);
        } else if (payload.type === "error") {
          console.error("[useRealtimeSession] SSE error event", payload.message);
          if (payload.message === "SESSION_NOT_FOUND") {
            setError("SESSION_NOT_FOUND");
            setIsLoading(false);
            disconnectStream();
          } else if (
            payload.message === "SESSIONS_CHANNEL_CLOSED" ||
            payload.message === "REFETCH_FAILED"
          ) {
            // Force reconnection
            disconnectStream();
            const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, retryCountRef.current));
            retryCountRef.current += 1;
            setConnectionState("disconnected");
            backoffTimeoutRef.current = setTimeout(connectToStream, delay);
          }
        }
      } catch (err) {
        console.error("[useRealtimeSession] Failed to handle SSE message", err);
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;

      if (isClosingRef.current) return;

      // Don't retry if not logged in
      if (!isAdminLoggedIn()) {
        setConnectionState("error");
        setIsLoading(false);
        setError("NOT_LOGGED_IN");
        return;
      }

      if (retryCountRef.current >= MAX_RETRIES) {
        setConnectionState("error");
        setError("MAX_RETRIES_EXCEEDED");
        startPolling();
        return;
      }

      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, retryCountRef.current));
      retryCountRef.current += 1;
      setConnectionState("disconnected");

      if (backoffTimeoutRef.current) clearTimeout(backoffTimeoutRef.current);
      backoffTimeoutRef.current = setTimeout(connectToStream, delay);
    };
  }, [sessionId, disconnectStream, stopPolling, startPolling]);

  // Main effect: connect/disconnect based on sessionId and enabled
  useEffect(() => {
    if (!enabled || !sessionId) {
      setIsLoading(false);
      return;
    }

    isClosingRef.current = false;
    retryCountRef.current = 0;
    setIsLoading(true);
    setError(null);

    connectToStream();

    return () => {
      isClosingRef.current = true;
      disconnectStream();
      stopPolling();
      if (backoffTimeoutRef.current) {
        clearTimeout(backoffTimeoutRef.current);
        backoffTimeoutRef.current = null;
      }
    };
  }, [sessionId, enabled, connectToStream, disconnectStream, stopPolling]);

  // Manual refresh
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await fetchSession();
      if (data) {
        setSession(data);
      }
    } catch (err) {
      console.error("[useRealtimeSession] refresh failed", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchSession]);

  return {
    session,
    isLoading,
    isRefreshing,
    connectionState,
    error,
    refresh,
  };
};
