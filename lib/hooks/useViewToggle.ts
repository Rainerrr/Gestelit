"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";

export type ViewMode = "feed" | "station";

/**
 * Hook for managing view toggle state via URL search params.
 * Persists view preference in URL for shareable links and refresh survival.
 */
export function useViewToggle(defaultView: ViewMode = "feed"): [ViewMode, (view: ViewMode) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const view = (searchParams.get("view") as ViewMode) ?? defaultView;

  const setView = useCallback(
    (newView: ViewMode) => {
      const params = new URLSearchParams(searchParams.toString());

      if (newView === defaultView) {
        // Remove param if it's the default to keep URLs clean
        params.delete("view");
      } else {
        params.set("view", newView);
      }

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;

      // Use replace to avoid polluting browser history with every toggle
      router.replace(newUrl, { scroll: false });
    },
    [router, pathname, searchParams, defaultView]
  );

  return [view, setView];
}
