"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import type { StationOccupancy } from "@/lib/types";

type OccupancyIndicatorProps = {
  occupancy: StationOccupancy;
  className?: string;
};

/**
 * Only renders when station is occupied.
 * Returns null for available stations (per design requirement).
 */
export const OccupancyIndicator = ({
  occupancy,
  className,
}: OccupancyIndicatorProps) => {
  const { t } = useTranslation();

  // Only show when occupied - available stations show nothing
  if (!occupancy.isOccupied) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium",
        "bg-amber-500/20 text-amber-300 border border-amber-500/30",
        occupancy.isGracePeriod && "animate-pulse",
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full flex-shrink-0",
          occupancy.isGracePeriod ? "bg-amber-400" : "bg-amber-500"
        )}
      />
      <span className="truncate max-w-[80px]">
        {occupancy.occupiedBy?.workerName ?? t("station.occupied")}
      </span>
    </span>
  );
};
