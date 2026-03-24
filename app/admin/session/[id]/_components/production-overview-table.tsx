"use client";

import { useMemo } from "react";
import { Clock, Package, PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { JobProgressBar } from "@/components/work/job-progress-bar";
import type { ProductionPeriod } from "@/app/api/admin/dashboard/session/[id]/route";

type ProductionOverviewTableProps = {
  productionPeriods: ProductionPeriod[];
};

const formatTime = (dateStr: string) =>
  new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));

const formatDuration = (startedAt: string, endedAt: string | null) => {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")} שע׳`;
  }
  return `${minutes} דק׳`;
};


export const ProductionOverviewTable = ({
  productionPeriods,
}: ProductionOverviewTableProps) => {
  if (productionPeriods.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">אין נתוני ייצור</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
              פריט
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
              התקדמות
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
              ייצור במשמרת
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
              זמנים
            </th>
          </tr>
        </thead>
        <tbody>
          {productionPeriods.map((period, idx) => {
            // Total produced = good + scrap at this step across all sessions
            const totalProduced = period.stepTotalGood + (period.stepTotalScrap ?? 0);
            const isComplete = totalProduced >= period.plannedQuantity;

            return (
              <tr
                key={period.jobItemId}
                className={cn(
                  "border-b border-border/50 last:border-0",
                  isComplete
                    ? "bg-emerald-500/10"
                    : idx % 2 === 0 ? "bg-card/30" : "bg-card/10"
                )}
              >
                {/* Job Item Name */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {period.jobItemName}
                      </span>
                      {period.stepPosition !== null && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0",
                            period.isTerminal
                              ? "border-emerald-500/30 text-emerald-400"
                              : "border-blue-500/30 text-blue-400"
                          )}
                        >
                          {period.isTerminal ? "תחנה סופית" : `שלב ${period.stepPosition}`}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      #{period.jobNumber}
                    </span>
                  </div>
                </td>

                {/* Progress - dual bar with text overlay */}
                <td className="px-4 py-3">
                  <div className="flex flex-col items-center gap-2 min-w-[200px] w-full">
                    {/* Text: produced +scrap / required (LTR) */}
                    <div dir="ltr" className="flex items-baseline gap-1.5 flex-wrap justify-center">
                      <span
                        className={cn(
                          "text-lg font-bold tabular-nums",
                          isComplete ? "text-emerald-400" : "text-foreground"
                        )}
                      >
                        {period.stepTotalGood.toLocaleString()}
                      </span>
                      {(period.stepTotalScrap ?? 0) > 0 && (
                        <span className="text-sm font-semibold text-rose-400 tabular-nums">
                          +{(period.stepTotalScrap ?? 0).toLocaleString()}
                        </span>
                      )}
                      <span className="text-muted-foreground">/</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {period.plannedQuantity.toLocaleString()}
                      </span>
                    </div>

                    <div className="w-full">
                      <JobProgressBar
                        plannedQuantity={period.plannedQuantity}
                        totalGood={period.stepTotalGood}
                        totalScrap={period.stepTotalScrap ?? 0}
                        sessionGood={period.quantityGood}
                        sessionScrap={period.quantityScrap}
                        size="md"
                        showOverlay={false}
                      />
                    </div>
                  </div>
                </td>

                {/* Session production — matching dashboard "במשמרת זו" style */}
                <td className="px-4 py-3">
                  <div className="flex flex-col items-center gap-1">
                    {period.quantityGood > 0 && (
                      <div className="flex items-center gap-1.5" dir="ltr">
                        <Package className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-sm font-semibold text-emerald-400 tabular-nums">
                          +{period.quantityGood.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {period.quantityScrap > 0 && (
                      <div className="flex items-center gap-1.5" dir="ltr">
                        <PackageX className="h-3.5 w-3.5 text-rose-400" />
                        <span className="text-sm font-semibold text-rose-400 tabular-nums">
                          +{period.quantityScrap.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {period.quantityGood === 0 && period.quantityScrap === 0 && (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>
                </td>

                {/* Times */}
                <td className="px-4 py-3">
                  <div className="flex flex-col items-center gap-0.5 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span className="tabular-nums">
                        {formatTime(period.startedAt)}
                      </span>
                      <span>-</span>
                      <span className="tabular-nums">
                        {period.endedAt ? formatTime(period.endedAt) : "עכשיו"}
                      </span>
                    </div>
                    <span className="text-muted-foreground">
                      ({formatDuration(period.startedAt, period.endedAt)})
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
