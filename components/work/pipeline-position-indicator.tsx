"use client";

import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineNeighborStation } from "@/lib/api/client";

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
      <div className="flex items-center justify-center gap-2">
        {/* Previous Station (RTL: on the right) */}
        {prevStation ? (
          <StationNode
            name={prevStation.name}
            code={prevStation.code}
            position={prevStation.position}
            isOccupied={!!prevStation.occupiedBy}
            occupiedBy={prevStation.occupiedBy}
            wipCount={upstreamWip}
            wipLabel="ממתין"
            variant="previous"
            compact={compact}
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed border-border/30 text-xs text-muted-foreground">
            התחלה
          </div>
        )}

        {/* Arrow: Previous → Current */}
        <ChevronLeft className="h-4 w-4 flex-shrink-0 text-muted-foreground" />

        {/* Current Station - Simplified */}
        <div
          className={cn(
            "flex flex-col items-center justify-center rounded-xl border-2 px-4 py-3",
            "border-cyan-500/50 bg-cyan-500/10",
            compact ? "min-w-20" : "min-w-24"
          )}
        >
          <span className="text-[10px] font-medium text-cyan-400/70 uppercase tracking-wider">
            העמדה שלנו
          </span>
          {currentStationName ? (
            <span className="text-sm font-bold text-cyan-300 line-clamp-1 text-center mt-0.5">
              {currentStationName}
            </span>
          ) : (
            <span className="text-lg font-bold tabular-nums text-cyan-300">
              #{currentPosition}
            </span>
          )}
          <div className="mt-1 flex items-center gap-1">
            <span className="text-lg font-bold tabular-nums text-cyan-400">
              {sessionGoodCount.toLocaleString()}
            </span>
            <span className="text-[10px] text-cyan-400/60">יחידות</span>
          </div>
          {isTerminal && (
            <span className="text-[10px] font-medium text-emerald-400 mt-0.5">סיום</span>
          )}
        </div>

        {/* Arrow: Current → Next */}
        <ChevronLeft className="h-4 w-4 flex-shrink-0 text-muted-foreground" />

        {/* Next Station (RTL: on the left) */}
        {nextStation ? (
          <StationNode
            name={nextStation.name}
            code={nextStation.code}
            position={nextStation.position}
            isOccupied={!!nextStation.occupiedBy}
            occupiedBy={nextStation.occupiedBy}
            wipCount={waitingOutput}
            wipLabel="יוצא"
            variant="next"
            compact={compact}
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed border-emerald-600/30 text-xs text-emerald-500">
            סיום
          </div>
        )}
      </div>

      {/* WIP Summary Bar */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          {waitingOutput > 0 && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-semibold text-amber-400">
              {waitingOutput} יוצא →
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {upstreamWip > 0 && (
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-semibold text-emerald-400">
              ← {upstreamWip} ממתין
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
        "flex flex-col items-center rounded-lg border-2 px-2 py-1.5 transition-colors",
        isOccupied
          ? "border-amber-500/40 bg-amber-500/5"
          : isPrevious
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-border/30 bg-muted/30",
        compact ? "min-w-14" : "min-w-16"
      )}
    >
      {/* Station Code */}
      <span
        className={cn(
          "text-xs font-bold",
          isOccupied
            ? "text-amber-400"
            : isPrevious
              ? "text-emerald-400"
              : "text-muted-foreground"
        )}
      >
        {code}
      </span>

      {/* Position Number */}
      <span className="text-sm font-semibold tabular-nums text-foreground">
        #{position}
      </span>

      {/* Occupancy or WIP */}
      {isOccupied ? (
        <span className="truncate text-[10px] text-amber-500 max-w-full">
          {occupiedBy?.split(" ")[0] ?? "תפוס"}
        </span>
      ) : wipCount > 0 ? (
        <span
          className={cn(
            "text-[10px] font-medium",
            isPrevious ? "text-emerald-400" : "text-amber-400"
          )}
        >
          {wipCount} {wipLabel}
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground">פנוי</span>
      )}
    </div>
  );
}
