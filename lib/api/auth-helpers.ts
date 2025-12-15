/**
 * Get admin password from localStorage
 * This is set when the user logs in via the admin access dialog
 */
export function getAdminPassword(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  // The admin password is stored in localStorage as "isAdmin" flag
  // But we need the actual password. We'll get it from a separate storage key
  return window.localStorage.getItem("adminPassword") ?? null;
}

/**
 * Set admin password in localStorage
 */
export function setAdminPassword(password: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem("adminPassword", password);
  window.localStorage.setItem("isAdmin", "true");
}

/**
 * Clear admin password from localStorage
 */
export function clearAdminPassword(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem("adminPassword");
  window.localStorage.removeItem("isAdmin");
}

/**
 * Get worker code from localStorage or context
 * Workers are stored in the WorkerSessionContext
 */
export function getWorkerCode(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  // Worker code might be stored in localStorage or we need to get it from context
  // For now, we'll get it from localStorage if available
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

