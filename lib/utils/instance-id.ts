/**
 * Instance ID utilities for browser tab identification.
 *
 * Each browser tab gets a unique instance ID stored in sessionStorage.
 * This ID is used to prevent the same session from running in multiple tabs/devices.
 *
 * sessionStorage is ideal because:
 * - It persists across page refreshes (same tab keeps same ID)
 * - It does NOT persist across tabs (each tab gets unique ID)
 * - It clears when the tab is closed
 */

const INSTANCE_ID_KEY = "gestelit_instance_id";

/**
 * Generate a unique instance ID.
 * Format: {timestamp}-{random} for uniqueness and debugging.
 */
function generateInstanceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 11);
  return `${timestamp}-${random}`;
}

/**
 * Get the instance ID for this browser tab.
 * Creates one if it doesn't exist.
 */
export function getOrCreateInstanceId(): string {
  if (typeof window === "undefined") {
    // Server-side: return empty string (will be replaced on client)
    return "";
  }

  let instanceId = sessionStorage.getItem(INSTANCE_ID_KEY);

  if (!instanceId) {
    instanceId = generateInstanceId();
    sessionStorage.setItem(INSTANCE_ID_KEY, instanceId);
  }

  return instanceId;
}

/**
 * Get the instance ID for this browser tab.
 * Returns null if not yet created.
 */
export function getInstanceId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return sessionStorage.getItem(INSTANCE_ID_KEY);
}

/**
 * Clear the instance ID for this tab.
 * Called when logging out or session ends.
 */
export function clearInstanceId(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(INSTANCE_ID_KEY);
}
