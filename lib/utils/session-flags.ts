import {
  SESSION_FLAG_THRESHOLDS,
  type SessionFlags,
} from "@/lib/config/session-flags";

type SessionForFlags = {
  totalGood: number;
  totalScrap: number;
  durationSeconds: number;
};

/**
 * Calculate performance flags for a session based on thresholds.
 *
 * @param session - Session data with production and duration info
 * @param stoppageTimeSeconds - Total time spent in stoppage statuses (in seconds)
 * @param setupTimeSeconds - Total time spent in setup statuses (in seconds)
 * @returns Object with boolean flags for each performance issue
 */
export const calculateSessionFlags = (
  session: SessionForFlags,
  stoppageTimeSeconds: number,
  setupTimeSeconds: number = 0,
): SessionFlags => {
  const { totalGood, totalScrap, durationSeconds } = session;

  // High stoppage flag: stoppage time >= threshold
  const highStoppage =
    stoppageTimeSeconds >= SESSION_FLAG_THRESHOLDS.stoppageTimeSeconds;

  // High setup flag: setup time >= threshold
  const highSetup =
    setupTimeSeconds >= SESSION_FLAG_THRESHOLDS.setupTimeSeconds;

  // High scrap flag: scrap count >= threshold
  const highScrap = totalScrap >= SESSION_FLAG_THRESHOLDS.maxScrap;

  // Low production flag: good items per active hour < threshold
  // Active time = total duration - stoppage time - setup time (only production time counts)
  const activeTimeSeconds = Math.max(0, durationSeconds - stoppageTimeSeconds - setupTimeSeconds);
  const activeTimeHours = activeTimeSeconds / 3600;

  // Only flag if production time >= minimum threshold (prevents false positives for new sessions)
  // and if there's been at least some active time to calculate a rate
  const lowProduction =
    activeTimeSeconds >= SESSION_FLAG_THRESHOLDS.minProductionTimeForLowProdFlag &&
    activeTimeHours > 0 &&
    totalGood / activeTimeHours < SESSION_FLAG_THRESHOLDS.minGoodPerHour;

  return {
    highStoppage,
    highSetup,
    highScrap,
    lowProduction,
  };
};

/**
 * Check if a session has any performance flags.
 */
export const hasAnyFlag = (flags: SessionFlags): boolean =>
  flags.highStoppage || flags.highSetup || flags.highScrap || flags.lowProduction;

/**
 * Count the number of active flags.
 */
export const countFlags = (flags: SessionFlags): number =>
  [flags.highStoppage, flags.highSetup, flags.highScrap, flags.lowProduction].filter(Boolean)
    .length;
