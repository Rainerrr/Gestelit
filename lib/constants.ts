/**
 * Shared application constants.
 */

/**
 * Session grace period in milliseconds.
 * Sessions that haven't received a heartbeat within this period are considered idle.
 * Workers can resume sessions within this period after disconnection.
 */
export const SESSION_GRACE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Session idle threshold in milliseconds.
 * Sessions older than this threshold without activity will be auto-closed.
 */
export const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Heartbeat interval in milliseconds.
 * How often the client should send heartbeat pings.
 */
export const HEARTBEAT_INTERVAL_MS = 15 * 1000; // 15 seconds
