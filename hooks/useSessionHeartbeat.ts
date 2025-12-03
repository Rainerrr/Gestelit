"use client";

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 15_000;

type HeartbeatBody = {
  sessionId: string;
};

const sendHeartbeat = async (body: HeartbeatBody) => {
  try {
    await fetch("/api/sessions/heartbeat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (error) {
    console.error("[heartbeat] Failed to send heartbeat", error);
  }
};

export const useSessionHeartbeat = (sessionId?: string) => {
  useEffect(() => {
    if (!sessionId || typeof window === "undefined") {
      return undefined;
    }

    let hasClosed = false;
    const closingPayload = JSON.stringify({ sessionId });

    const tick = () => {
      void sendHeartbeat({ sessionId });
    };

    tick();
    const intervalId = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);

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
        void sendHeartbeat({ sessionId });
      }
    };

    window.addEventListener("pagehide", handleClose);
    window.addEventListener("beforeunload", handleClose);

    return () => {
      handleClose();
      window.clearInterval(intervalId);
      window.removeEventListener("pagehide", handleClose);
      window.removeEventListener("beforeunload", handleClose);
    };
  }, [sessionId]);
};

