"use client";

import { useMemo } from "react";
import { useNow } from "@/lib/hooks/useLiveDuration";

/**
 * Job item timer hook that computes accumulated time for the active job item.
 * Reuses the shared 1-second ticker from useLiveDuration.
 *
 * @param accumulatedSeconds - Pre-computed accumulated seconds from DB (completed events)
 * @param segmentStart - ISO timestamp of current segment start (null if no active segment)
 * @returns totalSeconds (accumulated + current live segment) and isLive flag
 */
export const useJobItemTimer = (
  accumulatedSeconds: number,
  segmentStart: string | null,
): { totalSeconds: number; isLive: boolean } => {
  const now = useNow();

  return useMemo(() => {
    if (!segmentStart) {
      return { totalSeconds: accumulatedSeconds, isLive: false };
    }

    const segmentStartMs = new Date(segmentStart).getTime();
    const currentSegmentSeconds = Math.max(
      0,
      Math.floor((now - segmentStartMs) / 1000),
    );

    return {
      totalSeconds: accumulatedSeconds + currentSegmentSeconds,
      isLive: true,
    };
  }, [accumulatedSeconds, segmentStart, now]);
};
