"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export type DualProgressBarProps = {
  /** Total completed quantity (all sessions combined) */
  totalCompleted: number;
  /** This session's contribution to the total */
  sessionContribution: number;
  /** Planned/target quantity */
  plannedQuantity: number;
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
 * Industrial-style dual-color progress bar.
 * Shows total job item progress with session contribution highlighted.
 *
 * Visual segments:
 * - Emerald: Prior sessions' contribution
 * - Cyan: This session's contribution (with glow)
 * - Gray: Remaining quantity
 *
 * Heavy borders, bold typography, high contrast for shop floor visibility.
 */
export function DualProgressBar({
  totalCompleted,
  sessionContribution,
  plannedQuantity,
  displayMode,
  className,
  compact = false,
}: DualProgressBarProps) {
  // Calculate percentages
  const { priorPercent, sessionPercent, remainingPercent, remaining } = useMemo(() => {
    const safePlanned = Math.max(1, plannedQuantity);
    const safeTotal = Math.min(totalCompleted, safePlanned);
    const safeSession = Math.min(sessionContribution, safeTotal);

    const prior = Math.max(0, safeTotal - safeSession);
    const priorPct = (prior / safePlanned) * 100;
    const sessionPct = (safeSession / safePlanned) * 100;
    const remainingPct = Math.max(0, 100 - priorPct - sessionPct);
    const rem = Math.max(0, safePlanned - safeTotal);

    return {
      priorPercent: priorPct,
      sessionPercent: sessionPct,
      remainingPercent: remainingPct,
      remaining: rem,
    };
  }, [totalCompleted, sessionContribution, plannedQuantity]);

  const totalPercent = Math.min(100, priorPercent + sessionPercent);
  const isComplete = remaining === 0;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Progress Bar Container - thick industrial border */}
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-lg",
          "border-2 border-border bg-muted/50",
          compact ? "h-6" : "h-8"
        )}
      >
        {/* Prior Sessions Segment - emerald - RTL: anchored to right */}
        {priorPercent > 0 && (
          <div
            className={cn(
              "absolute inset-y-0 right-0",
              "bg-gradient-to-l from-emerald-400 to-emerald-600",
              "transition-all duration-500 ease-out"
            )}
            style={{ width: `${priorPercent}%` }}
          />
        )}

        {/* This Session Segment - cyan with glow - RTL: positioned after prior from right */}
        {sessionPercent > 0 && (
          <div
            className={cn(
              "absolute inset-y-0",
              "bg-gradient-to-l from-cyan-400 to-cyan-600",
              "shadow-[0_0_12px_rgba(6,182,212,0.5)]",
              "transition-all duration-500 ease-out",
              // Slower pulse animation (3s) for less jarring effect
              "animate-pulse-slow"
            )}
            style={{
              right: `${priorPercent}%`,
              width: `${sessionPercent}%`,
            }}
          />
        )}

        {/* Percentage Overlay - centered text */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            compact ? "text-sm" : "text-base",
            "font-bold tabular-nums tracking-tight",
            // Text shadow for readability
            "drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]",
            totalPercent > 50 ? "text-white" : "text-foreground"
          )}
        >
          {displayMode === "percentage" ? (
            <span>{Math.round(totalPercent)}%</span>
          ) : (
            <span>
              {totalCompleted.toLocaleString()} / {plannedQuantity.toLocaleString()}
            </span>
          )}
        </div>

        {/* Completion flash effect */}
        {isComplete && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        )}
      </div>

      {/* Legend - shows breakdown */}
      {!compact && (
        <div className="flex items-center justify-between gap-4 text-xs">
          {/* Prior Progress Legend */}
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-gradient-to-b from-emerald-400 to-emerald-600 border border-emerald-300" />
            <span className="text-muted-foreground">
              {displayMode === "percentage"
                ? `קודם: ${Math.round(priorPercent)}%`
                : `קודם: ${Math.max(0, totalCompleted - sessionContribution).toLocaleString()}`}
            </span>
          </div>

          {/* Session Contribution Legend */}
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-gradient-to-b from-cyan-400 to-cyan-600 border border-cyan-300 shadow-[0_0_6px_rgba(6,182,212,0.4)]" />
            <span className="text-foreground font-medium">
              {displayMode === "percentage"
                ? `משמרת: +${Math.round(sessionPercent)}%`
                : `משמרת: +${sessionContribution.toLocaleString()}`}
            </span>
          </div>

          {/* Remaining Legend */}
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-muted border border-border" />
            <span className="text-muted-foreground/70">
              {displayMode === "percentage"
                ? `נותר: ${Math.round(remainingPercent)}%`
                : `נותר: ${remaining.toLocaleString()}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
