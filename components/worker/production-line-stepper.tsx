"use client";

import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { StationBlock } from "./station-block";
import type { PipelineStationOption } from "@/lib/types";

type ProductionLineStepperProps = {
  stations: PipelineStationOption[];
  selectedStationId: string | null;
  onStationSelect: (stationId: string, jobItemStepId: string) => void;
  disabled?: boolean;
};

/**
 * RTL horizontal stepper for production line station selection.
 * Flow: Station 1 (right) → Station N (left)
 * Arrows point LEFT to show production flow direction.
 */
export const ProductionLineStepper = ({
  stations,
  selectedStationId,
  onStationSelect,
  disabled = false,
}: ProductionLineStepperProps) => {
  const { t } = useTranslation();

  if (stations.length === 0) {
    return (
      <div className="text-sm text-slate-500 text-center py-6">
        {t("station.noStations")}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {stations.map((station, index) => {
        const isSelected = selectedStationId === station.id;
        const isDisabled =
          disabled || !station.isWorkerAssigned || station.occupancy.isOccupied;
        const isLast = index === stations.length - 1;

        return (
          <div key={station.id} className="flex items-center gap-2 flex-shrink-0">
            <StationBlock
              station={station}
              isSelected={isSelected}
              disabled={isDisabled}
              showPosition={true}
              onClick={() => {
                if (!isDisabled) {
                  onStationSelect(station.id, station.jobItemStepId);
                }
              }}
            />

            {/* Arrow connector pointing LEFT (production flow direction in RTL) */}
            {!isLast && (
              <ChevronLeft className="h-5 w-5 text-slate-600 flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
};
