"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAdminLoggedIn } from "@/lib/api/auth-helpers";
import type { LiveJobProgress } from "@/lib/types";

type StreamMessage =
  | { type: "initial"; jobs: LiveJobProgress[] }
  | { type: "update"; jobs: LiveJobProgress[] }
  | { type: "error"; message: string };

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

const MAX_RETRIES = 10;
const MAX_BACKOFF_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;

type UseRealtimeJobProgressArgs = {
  enabled?: boolean;
};

type UseRealtimeJobProgressResult = {
  jobs: LiveJobProgress[];
  isLoading: boolean;
  connectionState: ConnectionState;
  error: string | null;
};

export const useRealtimeJobProgress = ({
  enabled = true,
}: UseRealtimeJobProgressArgs = {}): UseRealtimeJobProgressResult => {
  const [jobs, setJobs] = useState<LiveJobProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const backoffTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isClosingRef = useRef(false);

  // Fetch job progress data via API (for polling fallback)
  const fetchJobs = useCallback(async (): Promise<LiveJobProgress[]> => {
    try {
      const response = await fetch("/api/admin/dashboard/job-progress", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("FETCH_FAILED");
      }
      const data = await response.json();
      return data.jobs as LiveJobProgress[];
    } catch (err) {
      console.error("[useRealtimeJobProgress] fetch failed", err);
      throw err;
    }
  }, []);

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
        const data = await fetchJobs();
        if (!isClosingRef.current) {
          setJobs(data);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("[useRealtimeJobProgress] polling failed", err);
        setIsLoading(false);
      }
    };

    void runPoll();
    pollIntervalRef.current = setInterval(runPoll, POLL_INTERVAL_MS);
  }, [fetchJobs, stopPolling]);

  // Disconnect stream
  const disconnectStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Connect to SSE stream
  const connectToStream = useCallback(() => {
    if (typeof window === "undefined") return;

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

    const url = new URL("/api/admin/dashboard/job-progress/stream", window.location.origin);
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
          setJobs(payload.jobs);
          setIsLoading(false);
        } else if (payload.type === "error") {
          console.error("[useRealtimeJobProgress] SSE error event", payload.message);
          if (
            payload.message === "CHANNEL_CLOSED" ||
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
        console.error("[useRealtimeJobProgress] Failed to handle SSE message", err);
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
  }, [disconnectStream, stopPolling, startPolling]);

  // Main effect: connect/disconnect based on enabled
  useEffect(() => {
    if (!enabled) {
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
  }, [enabled, connectToStream, disconnectStream, stopPolling]);

  return {
    jobs,
    isLoading,
    connectionState,
    error,
  };
};
