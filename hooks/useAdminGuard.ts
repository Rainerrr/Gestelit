"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  isAdminLoggedIn,
  validateAdminSession,
  clearAdminLoggedIn,
} from "@/lib/api/auth-helpers";

const ADMIN_STORAGE_KEY = "isAdmin";

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

export const useAdminGuard = () => {
  const router = useRouter();
  const clientHasAccess = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const [isValidating, setIsValidating] = useState(true);
  const [serverValidated, setServerValidated] = useState(false);

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

  // Redirect if not authenticated (after validation completes)
  useEffect(() => {
    if (!isValidating && !serverValidated) {
      router.replace("/");
    }
  }, [isValidating, serverValidated, router]);

  // Also redirect if client state changes (e.g., logout in another tab)
  useEffect(() => {
    if (!isValidating && !clientHasAccess) {
      router.replace("/");
    }
  }, [clientHasAccess, isValidating, router]);

  return {
    hasAccess: !isValidating && serverValidated && clientHasAccess,
    isValidating,
  };
};
