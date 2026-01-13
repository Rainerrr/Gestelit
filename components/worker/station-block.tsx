"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { OccupancyIndicator } from "./occupancy-indicator";
import type { PipelineStationOption } from "@/lib/types";

type StationBlockProps = {
  station: PipelineStationOption;
  isSelected: boolean;
  disabled: boolean;
  showPosition?: boolean;
  onClick: () => void;
};

/**
 * Big, simple, clickable station selection block.
 * Blue/cyan color scheme to match page theme.
 */
export const StationBlock = ({
  station,
  isSelected,
  disabled,
  showPosition = false,
  onClick,
}: StationBlockProps) => {
  const { t } = useTranslation();

  const isOccupied = station.occupancy.isOccupied;
  const isNotAssigned = !station.isWorkerAssigned;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // Base styles - big block with internal padding for position badge
        "relative flex flex-col items-center justify-center",
        "min-h-[90px] min-w-[110px] px-3 py-3",
        showPosition && "pt-5", // Extra top padding when showing position
        "rounded-lg border transition-all duration-150",
        // Selection states - blue/cyan theme
        isSelected
          ? "border-cyan-400 bg-cyan-500/15 ring-1 ring-cyan-500/40 shadow-lg shadow-cyan-500/10"
          : disabled
            ? "border-slate-700/50 bg-slate-800/30 cursor-not-allowed"
            : "border-slate-600 bg-slate-800/60 hover:border-slate-500 hover:bg-slate-800 cursor-pointer active:scale-[0.98]"
      )}
    >
      {/* Position badge (for production lines) - inside button bounds */}
      {showPosition && (
        <span
          className={cn(
            "absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center",
            "rounded text-xs font-bold",
            isSelected
              ? "bg-cyan-500 text-slate-900"
              : disabled
                ? "bg-slate-700 text-slate-500"
                : "bg-slate-600 text-slate-200"
          )}
        >
          {station.position}
        </span>
      )}

      {/* Station name */}
      <span
        className={cn(
          "text-sm font-semibold text-center leading-tight",
          isSelected
            ? "text-cyan-100"
            : disabled
              ? "text-slate-500"
              : "text-slate-100"
        )}
      >
        {station.name}
      </span>

      {/* Occupancy indicator (only shows when occupied) */}
      <OccupancyIndicator occupancy={station.occupancy} className="mt-1.5" />

      {/* Not assigned label */}
      {isNotAssigned && !isOccupied && (
        <span className="mt-1 text-[10px] text-slate-500 font-medium">
          {t("station.notAssigned")}
        </span>
      )}

      {/* Terminal badge */}
      {station.isTerminal && (
        <span className="mt-0.5 text-[10px] text-blue-400 font-semibold">
          {t("station.terminal")}
        </span>
      )}
    </button>
  );
};
