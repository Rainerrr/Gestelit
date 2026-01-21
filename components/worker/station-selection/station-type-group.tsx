"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { StationTile, type StationTileData } from "./station-tile";

// ============================================
// TYPES
// ============================================

export type StationTypeGroupProps = {
  /** The station_type value (department name) */
  stationType: string;
  /** Stations in this group */
  stations: StationTileData[];
  /** Currently selected station ID */
  selectedStationId: string | null;
  /** Callback when a station is selected */
  onStationSelect: (stationId: string) => void;
  /** Base animation delay for staggered entrance */
  baseAnimationDelay?: number;
  /** Whether the group starts expanded */
  defaultExpanded?: boolean;
};

// ============================================
// COMPONENT
// ============================================

/**
 * Collapsible group of stations organized by station_type (department).
 * Industrial signage aesthetic - bold headers, clear visual hierarchy.
 */
export function StationTypeGroup({
  stationType,
  stations,
  selectedStationId,
  onStationSelect,
  baseAnimationDelay = 0,
  defaultExpanded = true,
}: StationTypeGroupProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Calculate group stats
  const totalStations = stations.length;
  const availableStations = stations.filter(
    (s) => !s.occupancy.isOccupied && s.jobItemCount > 0
  ).length;
  const totalJobItems = stations.reduce((sum, s) => sum + s.jobItemCount, 0);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/50",
        "bg-gradient-to-b from-muted/50 to-card/30",
        "overflow-hidden",
        // Entrance animation
        "animate-in fade-in slide-in-from-bottom-4 duration-500"
      )}
      style={{ animationDelay: `${baseAnimationDelay}ms` }}
    >
      {/* Header - Industrial signage style */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center justify-between gap-4 p-4",
          "bg-gradient-to-r from-muted to-muted/50",
          "border-b border-border/50",
          "hover:from-accent/80 hover:to-muted/80",
          "transition-colors duration-200",
          "cursor-pointer"
        )}
      >
        {/* Left: Department name + station count */}
        <div className="flex items-center gap-3">
          {/* Department indicator bar */}
          <div
            className={cn(
              "w-1.5 h-10 rounded-full",
              availableStations > 0
                ? "bg-gradient-to-b from-emerald-400 to-emerald-600"
                : "bg-gradient-to-b from-muted-foreground/50 to-muted-foreground/60"
            )}
          />

          <div className="flex flex-col items-start">
            {/* Department name - uppercase industrial signage */}
            <span className="text-lg font-black tracking-wide text-foreground uppercase">
              {stationType || t("station.noType")}
            </span>

            {/* Station count subtitle */}
            <span className="text-xs font-medium text-muted-foreground">
              {t("station.availableCount", { available: availableStations, total: totalStations })}
            </span>
          </div>
        </div>

        {/* Right: Job count badge + chevron */}
        <div className="flex items-center gap-3">
          {/* Total job items badge */}
          <div
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
              "border",
              totalJobItems > 0
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                : "bg-muted/30 border-border/30 text-muted-foreground"
            )}
          >
            <span className="text-sm font-bold tabular-nums">{totalJobItems}</span>
            <span className="text-xs font-medium">{t("station.jobsCount")}</span>
          </div>

          {/* Expand/collapse chevron */}
          <ChevronDown
            className={cn(
              "h-5 w-5 text-muted-foreground transition-transform duration-300",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Content - Station tiles grid */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          isExpanded
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "p-4",
              "grid gap-4",
              // Responsive grid: 2 cols on mobile, 3 on sm, 4 on md, 5 on lg
              "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            )}
          >
            {stations.map((station, index) => (
              <StationTile
                key={station.id}
                station={station}
                isSelected={selectedStationId === station.id}
                onClick={() => onStationSelect(station.id)}
                animationDelay={baseAnimationDelay + 50 + index * 30}
              />
            ))}
          </div>

          {/* Empty state */}
          {stations.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <span className="text-sm">{t("station.noCategoryStations")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
