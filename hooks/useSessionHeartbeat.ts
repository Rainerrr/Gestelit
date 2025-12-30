"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 15_000;

type HeartbeatBody = {
  sessionId: string;
  instanceId?: string;
};

type HeartbeatResponse = {
  ok: boolean;
  error?: "INSTANCE_MISMATCH" | "SESSION_NOT_FOUND" | "SESSION_NOT_ACTIVE";
};

const sendHeartbeat = async (body: HeartbeatBody): Promise<HeartbeatResponse> => {
  try {
    const response = await fetch("/api/sessions/heartbeat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
    });

    if (!response.ok) {
      const data = (await response.json()) as HeartbeatResponse;
      return data;
    }

    return { ok: true };
  } catch (error) {
    console.error("[heartbeat] Failed to send heartbeat", error);
    return { ok: false };
  }
};

type UseSessionHeartbeatOptions = {
  sessionId?: string;
  instanceId?: string;
  onInstanceMismatch?: () => void;
};

export const useSessionHeartbeat = (options: UseSessionHeartbeatOptions) => {
  const { sessionId, instanceId, onInstanceMismatch } = options;

  // Use ref to avoid stale closure in interval
  const onInstanceMismatchRef = useRef(onInstanceMismatch);
  onInstanceMismatchRef.current = onInstanceMismatch;

  useEffect(() => {
    if (!sessionId || typeof window === "undefined") {
      return undefined;
    }

    let hasClosed = false;
    const closingPayload = JSON.stringify({ sessionId, instanceId });

    const tick = async () => {
      const result = await sendHeartbeat({ sessionId, instanceId });

      // Handle instance mismatch - another tab/device took over
      if (!result.ok && result.error === "INSTANCE_MISMATCH") {
        onInstanceMismatchRef.current?.();
      }

      // Handle session no longer active - session was abandoned/discarded
      // Treat the same as instance mismatch (redirect to session-transferred)
      if (!result.ok && result.error === "SESSION_NOT_ACTIVE") {
        onInstanceMismatchRef.current?.();
      }
    };

    void tick();
    const intervalId = window.setInterval(() => void tick(), HEARTBEAT_INTERVAL_MS);

    // When tab becomes visible, immediately check session ownership
    // This catches cases where BroadcastChannel messages were missed while in background
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void tick();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleClose = () => {
      if (hasClosed) {
        return;
      }
      hasClosed = true;

      const blob = new Blob([closingPayload], {
        type: "application/json",
      });
      const didSend =
        typeof navigator.sendBeacon === "function" &&
        navigator.sendBeacon("/api/sessions/heartbeat", blob);

      if (!didSend) {
        void sendHeartbeat({ sessionId, instanceId });
      }
    };

    window.addEventListener("pagehide", handleClose);
    window.addEventListener("beforeunload", handleClose);

    return () => {
      handleClose();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handleClose);
      window.removeEventListener("beforeunload", handleClose);
    };
  }, [sessionId, instanceId]);
};

