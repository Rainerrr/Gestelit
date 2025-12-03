"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

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
  const hasAccess = useSyncExternalStore(subscribe, getSnapshot, () => false);

  useEffect(() => {
    if (!hasAccess) {
      router.replace("/");
    }
  }, [hasAccess, router]);

  return { hasAccess };
};



