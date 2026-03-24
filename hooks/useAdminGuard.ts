"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  isAdminLoggedIn,
  validateAdminSession,
  clearAdminLoggedIn,
} from "@/lib/api/auth-helpers";

const ADMIN_STORAGE_KEY = "isAdmin";
/** Refresh session cookie every 5 minutes while active */
const KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000;

const getSnapshot = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(ADMIN_STORAGE_KEY) === "true";
};

const subscribe = (callback: () => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === ADMIN_STORAGE_KEY) {
      callback();
    }
  };

  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
};

/**
 * Check if a dialog/modal is currently open.
 * Detects open dialogs by checking for common dialog indicators:
 * - Radix UI dialog overlay (data-state="open")
 * - Any element with role="dialog" or role="alertdialog"
 */
function isDialogOpen(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelectorAll(
    '[role="dialog"], [role="alertdialog"], [data-state="open"][data-radix-dialog-overlay]'
  ).length > 0;
}

export const useAdminGuard = () => {
  const router = useRouter();
  const clientHasAccess = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const [isValidating, setIsValidating] = useState(true);
  const [serverValidated, setServerValidated] = useState(false);
  const hadActivityRef = useRef(false);

  // Validate session with server on mount
  useEffect(() => {
    let mounted = true;

    const validate = async () => {
      // First check client-side flag
      if (!isAdminLoggedIn()) {
        if (mounted) {
          setIsValidating(false);
          setServerValidated(false);
        }
        return;
      }

      // Validate with server (this also refreshes the cookie)
      const isValid = await validateAdminSession();

      if (mounted) {
        setServerValidated(isValid);
        setIsValidating(false);

        if (!isValid) {
          // Server says session is invalid, clear client state
          clearAdminLoggedIn();
        }
      }
    };

    void validate();

    return () => {
      mounted = false;
    };
  }, []);

  // Keep-alive: refresh session periodically while user is active
  useEffect(() => {
    if (!serverValidated) return;

    const markActive = () => {
      hadActivityRef.current = true;
    };

    // Track user activity (mouse, keyboard, touch, scroll)
    window.addEventListener("mousemove", markActive, { passive: true });
    window.addEventListener("keydown", markActive, { passive: true });
    window.addEventListener("touchstart", markActive, { passive: true });
    window.addEventListener("scroll", markActive, { passive: true, capture: true });
    window.addEventListener("click", markActive, { passive: true });

    const interval = setInterval(async () => {
      // Refresh if user was active OR a dialog is open (prevent logout mid-edit)
      if (!hadActivityRef.current && !isDialogOpen()) return;
      hadActivityRef.current = false;

      const isValid = await validateAdminSession();
      if (!isValid) {
        clearAdminLoggedIn();
      }
    }, KEEP_ALIVE_INTERVAL_MS);

    return () => {
      window.removeEventListener("mousemove", markActive);
      window.removeEventListener("keydown", markActive);
      window.removeEventListener("touchstart", markActive);
      window.removeEventListener("scroll", markActive);
      window.removeEventListener("click", markActive);
      clearInterval(interval);
    };
  }, [serverValidated]);

  // Redirect if not authenticated (after validation completes)
  // But don't redirect if a dialog is open — wait for it to close
  useEffect(() => {
    if (!isValidating && !serverValidated) {
      if (isDialogOpen()) {
        // Poll until dialog closes, then redirect
        const check = setInterval(() => {
          if (!isDialogOpen()) {
            clearInterval(check);
            router.replace("/");
          }
        }, 1000);
        return () => clearInterval(check);
      }
      router.replace("/");
    }
  }, [isValidating, serverValidated, router]);

  // Also redirect if client state changes (e.g., logout in another tab)
  useEffect(() => {
    if (!isValidating && !clientHasAccess) {
      if (isDialogOpen()) {
        const check = setInterval(() => {
          if (!isDialogOpen()) {
            clearInterval(check);
            router.replace("/");
          }
        }, 1000);
        return () => clearInterval(check);
      }
      router.replace("/");
    }
  }, [clientHasAccess, isValidating, router]);

  return {
    hasAccess: !isValidating && serverValidated && clientHasAccess,
    isValidating,
  };
};
