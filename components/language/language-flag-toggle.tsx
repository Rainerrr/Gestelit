"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

/**
 * A simple flag toggle for switching between Hebrew and Russian.
 * Displays two flag buttons - Israeli flag (for Hebrew) and Russian flag (for Russian).
 * Active language is highlighted, inactive is dimmed.
 * Designed to be placed in the top-right corner of worker pages.
 */
export function LanguageFlagToggle() {
  const { language, setLanguage } = useTranslation();

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card/80 p-1 shadow-sm backdrop-blur-sm">
      {/* Hebrew (Israeli flag) */}
      <button
        type="button"
        onClick={() => setLanguage("he")}
        className={cn(
          "flex h-8 w-10 items-center justify-center rounded-md transition-all",
          language === "he"
            ? "bg-primary/20 ring-2 ring-primary/50"
            : "opacity-50 hover:opacity-80 hover:bg-muted"
        )}
        aria-label="עברית"
        title="עברית"
      >
        {/* Israeli Flag - simplified SVG */}
        <svg
          viewBox="0 0 36 24"
          className="h-5 w-7"
          aria-hidden="true"
        >
          {/* White background */}
          <rect width="36" height="24" fill="#FFFFFF" />
          {/* Blue stripes */}
          <rect y="2" width="36" height="3" fill="#0038B8" />
          <rect y="19" width="36" height="3" fill="#0038B8" />
          {/* Star of David */}
          <g fill="none" stroke="#0038B8" strokeWidth="1.2">
            <path d="M18 6 L22.5 14 L13.5 14 Z" />
            <path d="M18 18 L13.5 10 L22.5 10 Z" />
          </g>
        </svg>
      </button>

      {/* Russian flag */}
      <button
        type="button"
        onClick={() => setLanguage("ru")}
        className={cn(
          "flex h-8 w-10 items-center justify-center rounded-md transition-all",
          language === "ru"
            ? "bg-primary/20 ring-2 ring-primary/50"
            : "opacity-50 hover:opacity-80 hover:bg-muted"
        )}
        aria-label="Русский"
        title="Русский"
      >
        {/* Russian Flag - simplified SVG */}
        <svg
          viewBox="0 0 36 24"
          className="h-5 w-7"
          aria-hidden="true"
        >
          {/* White stripe */}
          <rect width="36" height="8" fill="#FFFFFF" />
          {/* Blue stripe */}
          <rect y="8" width="36" height="8" fill="#0039A6" />
          {/* Red stripe */}
          <rect y="16" width="36" height="8" fill="#D52B1E" />
        </svg>
      </button>
    </div>
  );
}
