"use client";

import { useMemo } from "react";
import { Clock, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

/**
 * Dual-color progress bar matching the work page style.
 * Shows prior sessions (emerald) + this session (cyan).
 */
function DualProgressBar({
  totalCompleted,
  sessionContribution,
  plannedQuantity,
}: {
  totalCompleted: number;
  sessionContribution: number;
  plannedQuantity: number;
}) {
  const { priorPercent, sessionPercent } = useMemo(() => {
    const safePlanned = Math.max(1, plannedQuantity);
    const safeTotal = Math.min(totalCompleted, safePlanned);
    const safeSession = Math.min(sessionContribution, safeTotal);

    const prior = Math.max(0, safeTotal - safeSession);
    const priorPct = (prior / safePlanned) * 100;
    const sessionPct = (safeSession / safePlanned) * 100;

    return {
      priorPercent: priorPct,
      sessionPercent: sessionPct,
    };
  }, [totalCompleted, sessionContribution, plannedQuantity]);

  const isComplete = totalCompleted >= plannedQuantity;

  return (
    <div
      className={cn(
        "relative w-full h-3 overflow-hidden rounded-full",
        "border border-border bg-muted/50"
      )}
    >
      {/* Prior Sessions Segment - emerald - RTL: anchored to right */}
      {priorPercent > 0 && (
        <div
          className="absolute inset-y-0 right-0 bg-gradient-to-l from-emerald-400 to-emerald-600 transition-all duration-500"
          style={{ width: `${priorPercent}%` }}
        />
      )}

      {/* This Session Segment - cyan with glow - RTL: positioned after prior from right */}
      {sessionPercent > 0 && (
        <div
          className={cn(
            "absolute inset-y-0 bg-gradient-to-l from-cyan-400 to-cyan-600",
            "shadow-[0_0_8px_rgba(6,182,212,0.5)] transition-all duration-500"
          )}
          style={{
            right: `${priorPercent}%`,
            width: `${sessionPercent}%`,
          }}
        />
      )}

      {/* Completion shimmer */}
      {isComplete && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
      )}
    </div>
  );
}

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
              זמנים
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
              פסולים
            </th>
          </tr>
        </thead>
        <tbody>
          {productionPeriods.map((period, idx) => {
            // Always use per-step totals (scoped to this pipeline step)
            const displayTotal = period.stepTotalGood;
            const isComplete = displayTotal >= period.plannedQuantity;

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
                  <div className="flex flex-col items-center gap-2 min-w-[140px]">
                    {/* Text: total / planned with (+session) */}
                    <div className="flex items-baseline gap-1.5 flex-wrap justify-center">
                      <span
                        className={cn(
                          "text-lg font-bold tabular-nums",
                          isComplete ? "text-emerald-400" : "text-foreground"
                        )}
                      >
                        {displayTotal}
                      </span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {period.plannedQuantity}
                      </span>
                      {period.quantityGood > 0 && (
                        <span className="text-sm font-semibold text-cyan-400 tabular-nums">
                          (+{period.quantityGood})
                        </span>
                      )}
                    </div>

                    {/* Dual progress bar */}
                    <DualProgressBar
                      totalCompleted={displayTotal}
                      sessionContribution={period.quantityGood}
                      plannedQuantity={period.plannedQuantity}
                    />
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

                {/* Scrap */}
                <td className="px-4 py-3 text-center">
                  {period.quantityScrap > 0 ? (
                    <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
                      <Trash2 className="h-3 w-3 ml-1" />
                      {period.quantityScrap}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
