"use client";

import { Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import type { Station, StationOccupancy } from "@/lib/types";

// ============================================
// TYPES
// ============================================

export type StationTileData = Station & {
  occupancy: StationOccupancy;
  jobItemCount: number;
};

export type StationTileProps = {
  station: StationTileData;
  isSelected: boolean;
  onClick: () => void;
  /** Animation delay for staggered entrance */
  animationDelay?: number;
};

// ============================================
// COMPONENT
// ============================================

/**
 * Industrial-style station tile for shop floor use.
 * Large touch target, bold status indicators, visible from distance.
 *
 * Layout: Station name only (centered, prominent).
 * Job count badge with icon in top-left (RTL).
 *
 * States:
 * - FREE: Green accent, clickable
 * - OCCUPIED: Amber accent, shows worker name, disabled
 * - GRACE PERIOD: Pulsing amber, "מנותק" label
 * - SELECTED: Cyan glow ring
 */
export function StationTile({
  station,
  isSelected,
  onClick,
  animationDelay = 0,
}: StationTileProps) {
  const { t } = useTranslation();
  const isOccupied = station.occupancy.isOccupied;
  const isGracePeriod = station.occupancy.isGracePeriod;
  const isDisabled = isOccupied;

  // Determine tile state for styling
  const tileState = isSelected
    ? "selected"
    : isOccupied
      ? "occupied"
      : "available";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      style={{ animationDelay: `${animationDelay}ms` }}
      className={cn(
        // Base - chunky industrial button feel
        "group relative flex flex-col",
        "min-h-[140px] min-w-[160px] p-3",
        "rounded-xl border-2 transition-all duration-200",
        // Entrance animation
        "animate-in fade-in slide-in-from-bottom-2",
        // State-specific styles
        tileState === "selected" && [
          "border-cyan-400 bg-gradient-to-b from-cyan-500/20 to-cyan-600/10",
          "ring-2 ring-cyan-400/50 ring-offset-2 ring-offset-background",
          "shadow-[0_0_30px_rgba(6,182,212,0.3)]",
        ],
        tileState === "available" && [
          "border-emerald-500/60 bg-gradient-to-b from-emerald-500/15 to-emerald-600/5",
          "hover:border-emerald-400 hover:bg-emerald-500/20",
          "hover:shadow-lg hover:shadow-emerald-500/20",
          "active:scale-[0.97] cursor-pointer",
        ],
        tileState === "occupied" && [
          "border-amber-500/50 bg-gradient-to-b from-amber-500/10 to-amber-600/5",
          "cursor-not-allowed",
          isGracePeriod && "animate-pulse",
        ]
      )}
    >
      {/* Top row: Job count badge (left in RTL) + status chip for occupied */}
      <div className="flex items-start justify-between gap-2 mb-2">
        {/* Job count badge with icon */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-lg",
            "text-sm font-bold tabular-nums",
            "border shadow-sm",
            tileState === "selected" && "bg-cyan-500/20 border-cyan-500/50 text-cyan-800 dark:text-cyan-300",
            tileState === "available" && "bg-emerald-500/20 border-emerald-500/50 text-emerald-800 dark:text-emerald-300",
            tileState === "occupied" && "bg-amber-500/20 border-amber-500/50 text-amber-800 dark:text-amber-300"
          )}
        >
          <Briefcase className="h-3.5 w-3.5" />
          <span>{station.jobItemCount}</span>
        </div>

        {/* Status chip for occupied stations */}
        {tileState === "occupied" && (
          <span
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-lg",
              "text-xs font-semibold",
              "bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30",
              isGracePeriod && "animate-pulse"
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
            <span className="truncate max-w-[60px]">
              {isGracePeriod
                ? t("station.tile.disconnected")
                : (station.occupancy.occupiedBy?.workerName ?? t("station.tile.occupied"))}
            </span>
          </span>
        )}
      </div>

      {/* Main content: Name only */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-1">
        {/* Station Name - large and bold, centered */}
        <span
          className={cn(
            "text-base font-bold leading-tight line-clamp-2 break-words",
            tileState === "selected" && "text-cyan-900 dark:text-cyan-100",
            tileState === "available" && "text-emerald-900 dark:text-emerald-100",
            tileState === "occupied" && "text-amber-900 dark:text-amber-100"
          )}
        >
          {station.name}
        </span>
      </div>

      {/* Bottom: Status indicator */}
      <div className="mt-2 h-6 flex items-center justify-center">
        {/* Available - "פנוי" with pulsing dot */}
        {tileState === "available" && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            {t("station.tile.free")}
          </span>
        )}

        {/* Selected - checkmark indicator */}
        {tileState === "selected" && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {t("station.tile.selected")}
          </span>
        )}

        {/* Occupied - already shown in top row, just show status text */}
        {tileState === "occupied" && (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400/70">
            {t("station.tile.occupiedStation")}
          </span>
        )}
      </div>
    </button>
  );
}
