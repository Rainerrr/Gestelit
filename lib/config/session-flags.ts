/**
 * Session Performance Flag Configuration
 *
 * These thresholds determine when a session is flagged for poor performance.
 * Values are placeholders and should be adjusted based on business requirements.
 */

export const SESSION_FLAG_THRESHOLDS = {
  /**
   * Stoppage time threshold in seconds.
   * Sessions with stoppage time >= this value will be flagged.
   * Default: 30 minutes (1800 seconds)
   */
  stoppageTimeSeconds: 1800,

  /**
   * Setup time threshold in seconds.
   * Sessions with setup time >= this value will be flagged.
   * Default: 30 minutes (1800 seconds)
   */
  setupTimeSeconds: 1800,

  /**
   * Maximum scrap items before flagging.
   * Sessions with totalScrap >= this value will be flagged.
   * Default: 10 items
   */
  maxScrap: 10,

  /**
   * Minimum good items per hour of active (production) work.
   * Sessions with production rate < this value will be flagged.
   * Active time = total duration - stoppage time - setup time
   * Default: 10 items per hour
   */
  minGoodPerHour: 10,

  /**
   * Minimum production time in seconds before the low production flag can be shown.
   * This prevents false positives for sessions that just started.
   * Default: 30 minutes (1800 seconds)
   */
  minProductionTimeForLowProdFlag: 1800,
} as const;

export type SessionFlagType = "high_stoppage" | "high_setup" | "high_scrap" | "low_production";

export type SessionFlags = {
  highStoppage: boolean;
  highSetup: boolean;
  highScrap: boolean;
  lowProduction: boolean;
};

export const SESSION_FLAG_LABELS: Record<SessionFlagType, string> = {
  high_stoppage: "זמן השבתה גבוה",
  high_setup: "זמן הכנה ארוך",
  high_scrap: "כמות פסולים גבוהה",
  low_production: "תפוקה נמוכה",
};
