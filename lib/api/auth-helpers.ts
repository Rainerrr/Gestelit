/**
 * Client-side auth helpers
 *
 * For admin auth: Uses HTTP-only cookies managed by the server.
 * The client only tracks UI state (isAdmin flag) - actual auth is via cookies.
 *
 * For worker auth: Uses localStorage for worker code.
 */

const STORAGE_KEYS = {
  isAdmin: "isAdmin",
} as const;

// ============================================
// ADMIN AUTH (Cookie-based)
// ============================================

/**
 * Check if user is logged in as admin (client-side UI state only)
 * Actual authentication is handled by HTTP-only session cookies
 */
export function isAdminLoggedIn(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(STORAGE_KEYS.isAdmin) === "true";
}

/**
 * Set admin logged in state (client-side UI state only)
 * Call this after successful login API response
 */
export function setAdminLoggedIn(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEYS.isAdmin, "true");
}

/**
 * Clear admin logged in state (client-side UI state only)
 * Call this after logout or when session expires
 */
export function clearAdminLoggedIn(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEYS.isAdmin);
}

/**
 * Validate admin session with server
 * Returns true if session is valid, false otherwise
 * Also refreshes the session cookie if valid
 */
export async function validateAdminSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/admin/auth/session", {
      method: "GET",
      credentials: "include", // Important: include cookies
    });

    if (response.ok) {
      const data = await response.json();
      if (data.authenticated) {
        setAdminLoggedIn();
        return true;
      }
    }

    // Session invalid - clear client state
    clearAdminLoggedIn();
    return false;
  } catch {
    // Network error - don't clear state, might be temporary
    return false;
  }
}

/**
 * Logout admin - clear session cookie and client state
 */
export async function logoutAdmin(): Promise<void> {
  try {
    await fetch("/api/admin/auth/session", {
      method: "DELETE",
      credentials: "include",
    });
  } catch {
    // Ignore errors, clear client state anyway
  }
  clearAdminLoggedIn();
}

// ============================================
// WORKER AUTH (localStorage-based)
// ============================================

/**
 * Get worker code from localStorage or context
 * Workers are stored in the WorkerSessionContext
 */
export function getWorkerCode(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem("workerCode") ?? null;
}

/**
 * Set worker code in localStorage
 */
export function setWorkerCode(workerCode: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem("workerCode", workerCode);
}

// ============================================
// LEGACY COMPATIBILITY
// These functions maintain backward compatibility with existing code
// that uses getAdminPassword() pattern. They now work with cookies.
// ============================================

/**
 * @deprecated Use cookie-based auth. This returns null as passwords are no longer stored client-side.
 * Kept for backward compatibility - API calls now rely on session cookies.
 */
export function getAdminPassword(): string | null {
  // No longer store password client-side
  // Auth is handled via HTTP-only session cookies
  return null;
}

/**
 * @deprecated Use setAdminLoggedIn() instead.
 * This now only sets the client-side flag, not the password.
 */
export function setAdminPassword(_password: string): void {
  setAdminLoggedIn();
}

/**
 * @deprecated Use clearAdminLoggedIn() instead.
 */
export function clearAdminPassword(): void {
  clearAdminLoggedIn();
}
