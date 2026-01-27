"use client";

import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineNeighborStation } from "@/lib/api/client";

// Format large numbers compactly (e.g., 3M, 1.5K)
const formatCompactNumber = (num: number): string => {
  if (num >= 1_000_000) {
    const millions = num / 1_000_000;
    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (num >= 10_000) {
    const thousands = num / 1_000;
    return thousands % 1 === 0 ? `${thousands}K` : `${thousands.toFixed(1)}K`;
  }
  return num.toLocaleString();
};

// ============================================
// TYPES
// ============================================

export type PipelinePositionIndicatorProps = {
  /** Current position in the pipeline (1-indexed) */
  currentPosition: number;
  /** Whether current station is terminal (last in pipeline) */
  isTerminal: boolean;
  /** Previous station info (null if first station) */
  prevStation: PipelineNeighborStation | null;
  /** Next station info (null if last station) */
  nextStation: PipelineNeighborStation | null;
  /** WIP units waiting from upstream */
  upstreamWip: number;
  /** Units waiting for next station */
  waitingOutput: number;
  /** Current station name for simplified display */
  currentStationName?: string;
  /** This session's good count (pending product amount) */
  sessionGoodCount?: number;
  /** Optional compact mode */
  compact?: boolean;
  /** Additional class names */
  className?: string;
};

// ============================================
// COMPONENT
// ============================================

/**
 * Industrial-style pipeline position indicator.
 *
 * Shows current position in the production pipeline flow:
 * - Previous station (if exists) with upstream WIP count
 * - Current position indicator
 * - Next station (if exists) with waiting output count
 *
 * RTL layout: Previous is on the right, Next is on the left (production flow direction)
 *
 * Design: High contrast, industrial HMI aesthetic
 */
export function PipelinePositionIndicator({
  currentPosition,
  isTerminal,
  prevStation,
  nextStation,
  upstreamWip,
  waitingOutput,
  currentStationName,
  sessionGoodCount = 0,
  compact = false,
  className,
}: PipelinePositionIndicatorProps) {
  // Don't render if no pipeline context (single station or no neighbors)
  if (!prevStation && !nextStation) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border/50 bg-muted/30 p-3",
        compact && "p-2",
        className
      )}
    >
      {/* Header */}
      <div className="mb-2 text-xs font-medium text-muted-foreground text-right">
        מיקום בקו הייצור
      </div>

      {/* Pipeline Flow Visualization */}
      <div className="flex items-center justify-center gap-1.5 min-w-0">
        {/* Previous Station (RTL: on the right) - UPSTREAM */}
        {prevStation ? (
          <StationNode
            name={prevStation.name}
            code={prevStation.code}
            position={prevStation.position}
            isOccupied={!!prevStation.occupiedBy}
            occupiedBy={prevStation.occupiedBy}
            wipCount={upstreamWip}
            wipLabel="ממתינים לנו"
            variant="previous"
            compact={compact}
          />
        ) : (
          <div className="flex h-16 min-w-14 max-w-20 flex-1 flex-col items-center justify-center rounded-lg border-2 border-dashed border-emerald-500/30 text-[10px] text-emerald-500/70 px-1">
            <span>התחלה</span>
          </div>
        )}

        {/* Arrow: Previous → Current */}
        <ChevronLeft className="h-4 w-4 flex-shrink-0 text-muted-foreground" />

        {/* Current Station - Simplified */}
        <div
          className={cn(
            "flex flex-col items-center justify-center rounded-xl border-2 px-2 py-2 min-w-0 flex-shrink-0",
            "border-cyan-500/50 bg-cyan-500/10",
            compact ? "max-w-20" : "max-w-28"
          )}
        >
          <span className="text-[10px] font-medium text-cyan-400/70 uppercase tracking-wider">
            את כאן
          </span>
          {currentStationName && (
            <span className="text-xs font-bold text-cyan-300 line-clamp-1 text-center mt-0.5 max-w-full truncate px-1">
              {currentStationName}
            </span>
          )}
          <div className="mt-1 flex flex-col items-center">
            <span className="text-sm font-bold tabular-nums text-cyan-400">
              {formatCompactNumber(sessionGoodCount)}
            </span>
            <span className="text-[9px] text-cyan-400/60">דווח במשמרת</span>
          </div>
          {isTerminal && (
            <span className="text-[9px] font-medium text-emerald-400 mt-0.5">סיום</span>
          )}
        </div>

        {/* Arrow: Current → Next */}
        <ChevronLeft className="h-4 w-4 flex-shrink-0 text-muted-foreground" />

        {/* Next Station (RTL: on the left) - DOWNSTREAM */}
        {nextStation ? (
          <StationNode
            name={nextStation.name}
            code={nextStation.code}
            position={nextStation.position}
            isOccupied={!!nextStation.occupiedBy}
            occupiedBy={nextStation.occupiedBy}
            wipCount={waitingOutput}
            wipLabel="יוצאים הלאה"
            variant="next"
            compact={compact}
          />
        ) : (
          <div className="flex h-16 min-w-14 max-w-20 flex-1 flex-col items-center justify-center rounded-lg border-2 border-dashed border-rose-500/30 text-[10px] text-rose-500/70 px-1">
            <span>סיום</span>
          </div>
        )}
      </div>

      {/* WIP Summary Bar */}
      <div className="mt-2 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1">
          {waitingOutput > 0 && (
            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-semibold text-rose-400 tabular-nums">
              {formatCompactNumber(waitingOutput)} יוצא →
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {upstreamWip > 0 && (
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-semibold text-emerald-400 tabular-nums">
              ← {formatCompactNumber(upstreamWip)} ממתין
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

type StationNodeProps = {
  name: string;
  code: string;
  position: number;
  isOccupied: boolean;
  occupiedBy: string | null;
  wipCount: number;
  wipLabel: string;
  variant: "previous" | "next";
  compact?: boolean;
};

function StationNode({
  name,
  code,
  position,
  isOccupied,
  occupiedBy,
  wipCount,
  wipLabel,
  variant,
  compact = false,
}: StationNodeProps) {
  const isPrevious = variant === "previous";

  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border-2 px-1.5 py-1.5 transition-colors min-w-0 flex-1 max-w-24 overflow-hidden",
        isOccupied
          ? "border-amber-500/40 bg-amber-500/5"
          : isPrevious
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-rose-500/30 bg-rose-500/5"
      )}
    >
      {/* Station Name - truncated */}
      <span
        className={cn(
          "text-[10px] font-bold truncate max-w-full px-0.5",
          isOccupied
            ? "text-amber-400"
            : isPrevious
              ? "text-emerald-400"
              : "text-rose-400"
        )}
      >
        {name}
      </span>

      {/* Occupancy or WIP status */}
      {isOccupied ? (
        <span className="truncate text-[9px] text-amber-500 max-w-full">
          {occupiedBy?.split(" ")[0] ?? "תפוס"}
        </span>
      ) : (
        <span className="text-[9px] text-muted-foreground">פנוי</span>
      )}

      {/* WIP count - prominently displayed */}
      <div className="mt-0.5 flex flex-col items-center">
        <span className="text-[9px] text-muted-foreground">{wipLabel}</span>
        <span
          className={cn(
            "text-sm font-bold tabular-nums",
            isPrevious ? "text-emerald-400" : "text-rose-400"
          )}
        >
          {formatCompactNumber(wipCount)}
        </span>
      </div>
    </div>
  );
}
