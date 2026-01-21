"use client";

import { GitBranch, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { ProductionLineStepper } from "./production-line-stepper";
import { StationBlock } from "./station-block";
import type { StationSelectionJobItem } from "@/lib/types";

type JobItemCardProps = {
  jobItem: StationSelectionJobItem;
  selectedStationId: string | null;
  onStationSelect: (stationId: string, jobItemStepId: string) => void;
  disabled?: boolean;
};

/**
 * Horizontal split layout for job item station selection.
 * In RTL: First element (info) appears on RIGHT, second element (stations) on LEFT
 */
export const JobItemCard = ({
  jobItem,
  selectedStationId,
  onStationSelect,
  disabled = false,
}: JobItemCardProps) => {
  const { t } = useTranslation();

  // Post Phase 5: All items are pipelines. Determine if it's a multi-station pipeline
  // by checking the station count (single station vs production line UX)
  const stationCount = jobItem.pipelineStations.length;
  const isProductionLine = stationCount > 1;

  // Check if any station in this job item is selected
  const hasSelection = jobItem.pipelineStations.some(
    (s) => s.id === selectedStationId
  );

  // For single station, get the first (and only) station
  const singleStation = !isProductionLine ? jobItem.pipelineStations[0] : null;
  const isSingleStationDisabled = singleStation
    ? disabled || !singleStation.isWorkerAssigned || singleStation.occupancy.isOccupied
    : false;

  return (
    <div
      className={cn(
        // Container with horizontal split
        "flex items-stretch gap-0 rounded-xl border overflow-hidden transition-all",
        hasSelection
          ? "border-cyan-500/50 bg-card/90"
          : "border-border/50 bg-card/50"
      )}
    >
      {/* INFO PANEL - First in DOM = RIGHT side in RTL */}
      <div
        className={cn(
          "w-44 flex-shrink-0 p-4 flex flex-col justify-center",
          "border-l border-border/50",
          isProductionLine ? "bg-blue-950/30" : "bg-cyan-950/30"
        )}
      >
        {/* Icon */}
        <div className="mb-3">
          {isProductionLine ? (
            <GitBranch className="h-7 w-7 text-blue-400" />
          ) : (
            <Cpu className="h-7 w-7 text-cyan-400" />
          )}
        </div>

        {/* Name */}
        <h3 className="text-base font-bold text-foreground leading-tight mb-2">
          {jobItem.name}
        </h3>

        {/* Type badge */}
        <span
          className={cn(
            "inline-flex items-center self-start px-2 py-0.5 rounded text-xs font-medium mb-2",
            isProductionLine
              ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
              : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
          )}
        >
          {isProductionLine ? t("station.productionLine") : t("station.singleStation")}
        </span>

        {/* Stats */}
        <div className="text-xs text-muted-foreground space-y-0.5">
          {isProductionLine && (
            <div>{t("station.stationCount", { count: stationCount })}</div>
          )}
          <div>{t("station.plannedQuantity", { count: jobItem.plannedQuantity.toLocaleString() })}</div>
        </div>
      </div>

      {/* STATION SELECTION - Second in DOM = LEFT side in RTL */}
      <div className="flex-1 p-5 flex items-center justify-center">
        {isProductionLine ? (
          <ProductionLineStepper
            stations={jobItem.pipelineStations}
            selectedStationId={selectedStationId}
            onStationSelect={onStationSelect}
            disabled={disabled}
          />
        ) : (
          singleStation && (
            <StationBlock
              station={singleStation}
              isSelected={selectedStationId === singleStation.id}
              disabled={isSingleStationDisabled}
              showPosition={false}
              onClick={() => {
                if (!isSingleStationDisabled) {
                  onStationSelect(singleStation.id, singleStation.jobItemStepId);
                }
              }}
            />
          )
        )}
      </div>
    </div>
  );
};
