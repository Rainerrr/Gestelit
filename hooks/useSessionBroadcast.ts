"use client";

import { useEffect, useRef } from "react";

const CHANNEL_NAME = "gestelit_session_channel";

type BroadcastMessage =
  | { type: "SESSION_TAKEOVER"; sessionId: string; instanceId: string }
  | { type: "SESSION_RELEASED"; sessionId: string };

/**
 * Hook for cross-tab session coordination using BroadcastChannel API.
 *
 * When a new tab claims a session, it broadcasts a SESSION_TAKEOVER message.
 * Other tabs with the same session receive this and call onTakeover.
 *
 * This provides instant notification within the same browser (no server roundtrip).
 * Combined with server-side instance validation for cross-device protection.
 */
export function useSessionBroadcast(
  sessionId: string | undefined,
  currentInstanceId: string,
  onTakeover: () => void,
) {
  // Use ref to avoid stale closure
  const onTakeoverRef = useRef(onTakeover);
  onTakeoverRef.current = onTakeover;

  useEffect(() => {
    if (!sessionId || typeof window === "undefined" || !currentInstanceId) {
      return undefined;
    }

    // Check if BroadcastChannel is supported
    if (typeof BroadcastChannel === "undefined") {
      console.warn("[broadcast] BroadcastChannel not supported in this browser");
      return undefined;
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);

    // Announce this tab is taking over the session
    const takeoverMessage: BroadcastMessage = {
      type: "SESSION_TAKEOVER",
      sessionId,
      instanceId: currentInstanceId,
    };
    channel.postMessage(takeoverMessage);

    // Listen for other tabs taking over
    const handleMessage = (event: MessageEvent<BroadcastMessage>) => {
      const message = event.data;

      if (
        message.type === "SESSION_TAKEOVER" &&
        message.sessionId === sessionId &&
        message.instanceId !== currentInstanceId
      ) {
        // Another tab has taken over this session
        onTakeoverRef.current();
      }
    };

    channel.addEventListener("message", handleMessage);

    return () => {
      // Optionally broadcast session release when unmounting
      // (not strictly necessary since takeover handles it)
      channel.removeEventListener("message", handleMessage);
      channel.close();
    };
  }, [sessionId, currentInstanceId]);
}

/**
 * Broadcast that a session has been released (e.g., on logout).
 * This is a one-shot function, not a hook.
 */
export function broadcastSessionRelease(sessionId: string): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return;
  }

  const channel = new BroadcastChannel(CHANNEL_NAME);
  const message: BroadcastMessage = {
    type: "SESSION_RELEASED",
    sessionId,
  };
  channel.postMessage(message);
  channel.close();
}

/**
 * Hook for listening to session takeover events (without broadcasting).
 *
 * Use this on pages that need to react to session takeovers but shouldn't
 * broadcast their own takeover (e.g., station page with recovery dialog).
 */
export function useSessionClaimListener(
  sessionId: string | undefined,
  currentInstanceId: string,
  onClaimed: () => void,
) {
  const onClaimedRef = useRef(onClaimed);
  onClaimedRef.current = onClaimed;

  useEffect(() => {
    if (!sessionId || typeof window === "undefined" || !currentInstanceId) {
      return undefined;
    }

    if (typeof BroadcastChannel === "undefined") {
      console.warn("[broadcast] BroadcastChannel not supported in this browser");
      return undefined;
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);

    const handleMessage = (event: MessageEvent<BroadcastMessage>) => {
      const message = event.data;

      if (
        message.type === "SESSION_TAKEOVER" &&
        message.sessionId === sessionId &&
        message.instanceId !== currentInstanceId
      ) {
        // Another tab has claimed this session
        onClaimedRef.current();
      }
    };

    channel.addEventListener("message", handleMessage);

    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
    };
  }, [sessionId, currentInstanceId]);
}
