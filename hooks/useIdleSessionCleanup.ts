"use client";

import { useEffect } from "react";

const CLEANUP_INTERVAL_MS = 10_000; // Check every 10 seconds

type CleanupCallback = () => void | Promise<void>;

export const useIdleSessionCleanup = (onSessionsClosed?: CleanupCallback) => {
  useEffect(() => {
    const triggerCleanup = async () => {
      console.log("[idle-cleanup] Triggering cleanup check...");
      try {
        const response = await fetch("/api/cron/close-idle-sessions");
        const result = await response.json();
        console.log("[idle-cleanup] Cleanup result:", result);
        
        if (result.closed > 0) {
          console.log(
            `[idle-cleanup] Closed ${result.closed} idle sessions, forcing dashboard refresh`,
            result.closedIds,
          );
          if (onSessionsClosed) {
            await onSessionsClosed();
          }
        }
      } catch (error) {
        console.error("[idle-cleanup] Failed to trigger cleanup", error);
      }
    };

    console.log("[idle-cleanup] Starting idle session cleanup with 10s interval");
    triggerCleanup();
    const intervalId = window.setInterval(triggerCleanup, CLEANUP_INTERVAL_MS);

    return () => {
      console.log("[idle-cleanup] Stopping idle session cleanup");
      window.clearInterval(intervalId);
    };
  }, [onSessionsClosed]);
};

