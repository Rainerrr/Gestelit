/**
 * Session state persistence utilities for browser sessionStorage.
 *
 * This enables workers to recover their session after a page refresh without
 * having to manually re-enter their worker code. The state is stored per-tab
 * (sessionStorage) so each tab maintains its own session context.
 */

const SESSION_STATE_KEY = "gestelit_session_state";

export type PersistedSessionState = {
  sessionId: string;
  workerId: string;
  workerCode: string;
  workerFullName: string;
  stationId: string;
  stationName: string;
  stationCode: string;
  jobId: string | null; // Optional - job binding deferred to production entry
  jobNumber: string | null; // Optional - job binding deferred to production entry
  startedAt: string;
  totals: { good: number; scrap: number };
};

/**
 * Persist current session state to sessionStorage.
 * Called after session creation and when totals change.
 */
export function persistSessionState(state: PersistedSessionState): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("[session-storage] Failed to persist session state:", error);
  }
}

/**
 * Update only the totals in the persisted session state.
 * More efficient than re-persisting the entire state.
 */
export function updatePersistedTotals(totals: { good: number; scrap: number }): void {
  if (typeof window === "undefined") return;
  const current = getPersistedSessionState();
  if (!current) return;
  persistSessionState({ ...current, totals });
}

/**
 * Get persisted session state from sessionStorage.
 * Returns null if no state exists or if parsing fails.
 */
export function getPersistedSessionState(): PersistedSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSessionState;
  } catch {
    return null;
  }
}

/**
 * Clear persisted session state from sessionStorage.
 * Called on session complete, session transfer, or explicit logout.
 */
export function clearPersistedSessionState(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_STATE_KEY);
  } catch (error) {
    console.warn("[session-storage] Failed to clear session state:", error);
  }
}
