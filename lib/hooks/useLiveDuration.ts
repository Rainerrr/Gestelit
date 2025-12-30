"use client";

import { useSyncExternalStore, useMemo } from "react";

// Shared ticker for all duration components (1-second interval)
let nowInterval: number | null = null;
let nowValue = Date.now();
const nowListeners = new Set<() => void>();

const getNow = () => nowValue;

const subscribeNow = (callback: () => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  nowListeners.add(callback);
  if (nowInterval === null) {
    nowInterval = window.setInterval(() => {
      nowValue = Date.now();
      nowListeners.forEach((listener) => listener());
    }, 1000);
  }

  return () => {
    nowListeners.delete(callback);
    if (nowListeners.size === 0 && nowInterval !== null) {
      window.clearInterval(nowInterval);
      nowInterval = null;
    }
  };
};

export const useNow = () =>
  useSyncExternalStore(subscribeNow, getNow, () => Date.now());

export const useLiveDuration = (
  startedAt: string,
  endedAt?: string | null
): { seconds: number; isLive: boolean } => {
  const now = useNow();

  return useMemo(() => {
    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : now;

    if (Number.isNaN(start)) {
      return { seconds: 0, isLive: false };
    }

    const diffSeconds = Math.max(0, Math.floor((end - start) / 1000));
    return {
      seconds: diffSeconds,
      isLive: !endedAt,
    };
  }, [startedAt, endedAt, now]);
};

export const formatDuration = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}ש׳ ${minutes}דק׳`;
  }
  if (minutes > 0) {
    return `${minutes}דק׳`;
  }
  return "פחות מדקה";
};

export const formatDurationHMS = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");

  // Hide hours when zero, show h:mm:ss when >= 1 hour
  if (hours === 0) {
    return `${mm}:${ss}`;
  }
  return `${hours}:${mm}:${ss}`;
};
