"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export type DualProgressBarProps = {
  /** Total good quantity (all sessions combined) */
  totalGood: number;
  /** Total scrap quantity (all sessions combined) */
  totalScrap: number;
  /** Planned/target quantity */
  plannedQuantity: number;
  /** This session's good contribution */
  sessionGoodContribution: number;
  /** This session's scrap contribution */
  sessionScrapContribution: number;
  /** Display mode - percentage or absolute numbers */
  displayMode: "percentage" | "numbers";
  /** Optional class names */
  className?: string;
  /** Compact mode for smaller displays */
  compact?: boolean;
};

// ============================================
// COMPONENT
// ============================================

/**
 * Industrial-style multi-segment progress bar.
 * Shows total job item progress with good/scrap and session contribution highlighted.
 *
 * Visual segments (RTL, fill from right):
 * 1. Prior good (dark emerald) → Session good (cyan with glow)
 * 2. Prior scrap (dark rose) → Session scrap (lighter rose)
 * 3. Remaining (gray)
 * 4. Overflow (>100%): Scale all proportionally, show actual %, badge "ייצור עודף"
 *
 * Heavy borders, bold typography, high contrast for shop floor visibility.
 */
export function DualProgressBar({
  totalGood,
  totalScrap,
  plannedQuantity,
  sessionGoodContribution,
  sessionScrapContribution,
  displayMode,
  className,
  compact = false,
}: DualProgressBarProps) {
  const {
    priorGoodPct,
    sessionGoodPct,
    priorScrapPct,
    sessionScrapPct,
    remainingPct,
    remaining,
    totalPct,
    isOverflow,
  } = useMemo(() => {
    const safePlanned = Math.max(1, plannedQuantity);
    const totalProduced = totalGood + totalScrap;

    const priorGood = Math.max(0, totalGood - sessionGoodContribution);
    const priorScrap = Math.max(0, totalScrap - sessionScrapContribution);

    // Calculate raw percentages
    const rawPriorGood = (priorGood / safePlanned) * 100;
    const rawSessionGood = (sessionGoodContribution / safePlanned) * 100;
    const rawPriorScrap = (priorScrap / safePlanned) * 100;
    const rawSessionScrap = (sessionScrapContribution / safePlanned) * 100;
    const rawTotal = rawPriorGood + rawSessionGood + rawPriorScrap + rawSessionScrap;

    const overflow = rawTotal > 100;
    // Scale factor: if overflow, scale down to fit in 100% bar width
    const scale = overflow ? 100 / rawTotal : 1;

    const pGood = rawPriorGood * scale;
    const sGood = rawSessionGood * scale;
    const pScrap = rawPriorScrap * scale;
    const sScrap = rawSessionScrap * scale;
    const rem = overflow ? 0 : Math.max(0, 100 - pGood - sGood - pScrap - sScrap);
    const actualRem = Math.max(0, safePlanned - totalProduced);

    return {
      priorGoodPct: pGood,
      sessionGoodPct: sGood,
      priorScrapPct: pScrap,
      sessionScrapPct: sScrap,
      remainingPct: rem,
      remaining: actualRem,
      totalPct: Math.round((totalProduced / safePlanned) * 100),
      isOverflow: overflow,
    };
  }, [totalGood, totalScrap, plannedQuantity, sessionGoodContribution, sessionScrapContribution]);

  const isComplete = remaining === 0;

  // Minimum width for non-zero segments so they're always visible
  const minWidth = (pct: number) => (pct > 0 ? Math.max(pct, 0.5) : 0);

  return (
    <div className={cn("space-y-2", className)}>
      {/* Progress Bar Container */}
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-lg",
          "border-2 border-border bg-muted/50",
          compact ? "h-6" : "h-8"
        )}
      >
        {/* Prior Good Segment - dark emerald - RTL: anchored to right */}
        {priorGoodPct > 0 && (
          <div
            className="absolute inset-y-0 right-0 bg-emerald-600 transition-all duration-500 ease-out"
            style={{ width: `${minWidth(priorGoodPct)}%` }}
          />
        )}

        {/* Session Good Segment - cyan with glow */}
        {sessionGoodPct > 0 && (
          <div
            className={cn(
              "absolute inset-y-0",
              "bg-cyan-500",
              "shadow-[0_0_12px_rgba(6,182,212,0.5)]",
              "animate-pulse-slow"
            )}
            style={{
              right: `${priorGoodPct}%`,
              width: `${minWidth(sessionGoodPct)}%`,
              transition: "width 500ms ease-out, right 500ms ease-out",
            }}
          />
        )}

        {/* Prior Scrap Segment - dark rose */}
        {priorScrapPct > 0 && (
          <div
            className="absolute inset-y-0 bg-rose-700 transition-all duration-500 ease-out"
            style={{
              right: `${priorGoodPct + sessionGoodPct}%`,
              width: `${minWidth(priorScrapPct)}%`,
            }}
          />
        )}

        {/* Session Scrap Segment - lighter rose */}
        {sessionScrapPct > 0 && (
          <div
            className="absolute inset-y-0 bg-rose-500 animate-pulse-slow transition-all duration-500 ease-out"
            style={{
              right: `${priorGoodPct + sessionGoodPct + priorScrapPct}%`,
              width: `${minWidth(sessionScrapPct)}%`,
            }}
          />
        )}

        {/* Percentage Overlay - centered text */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center gap-2",
            compact ? "text-sm" : "text-base",
            "font-bold tabular-nums tracking-tight",
            "drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]",
            (priorGoodPct + sessionGoodPct) > 50 ? "text-white" : "text-foreground"
          )}
        >
          {displayMode === "percentage" ? (
            <span>{totalPct}%</span>
          ) : (
            <span dir="ltr">
              {totalGood.toLocaleString()} / {plannedQuantity.toLocaleString()}
            </span>
          )}
          {isOverflow && (
            <span className="text-[10px] font-bold bg-amber-500/90 text-amber-950 px-1.5 py-0.5 rounded">
              ייצור עודף
            </span>
          )}
        </div>

        {/* Completion flash effect */}
        {isComplete && !isOverflow && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        )}
      </div>

      {/* Legend - shows breakdown */}
      {!compact && (
        <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
          {/* Good */}
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-emerald-600 border border-emerald-500" />
            <span className="text-muted-foreground">
              {displayMode === "percentage"
                ? `תקין: ${Math.round((totalGood / Math.max(1, plannedQuantity)) * 100)}%`
                : `תקין: ${totalGood.toLocaleString()}`}
            </span>
          </div>

          {/* Session Good */}
          {sessionGoodContribution > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-cyan-500 border border-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.4)]" />
              <span className="text-foreground font-medium">
                {displayMode === "percentage"
                  ? `משמרת: +${Math.round((sessionGoodContribution / Math.max(1, plannedQuantity)) * 100)}%`
                  : `משמרת: +${sessionGoodContribution.toLocaleString()}`}
              </span>
            </div>
          )}

          {/* Scrap */}
          {totalScrap > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-rose-600 border border-rose-500" />
              <span className="text-rose-400">
                {displayMode === "percentage"
                  ? `פסול: ${Math.round((totalScrap / Math.max(1, plannedQuantity)) * 100)}%`
                  : `פסול: ${totalScrap.toLocaleString()}`}
              </span>
            </div>
          )}

          {/* Remaining */}
          {remaining > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-muted border border-border" />
              <span className="text-muted-foreground/70">
                {displayMode === "percentage"
                  ? `נותר: ${Math.round((remaining / Math.max(1, plannedQuantity)) * 100)}%`
                  : `נותר: ${remaining.toLocaleString()}`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
