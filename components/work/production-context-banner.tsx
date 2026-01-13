"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import type { ActiveJobItemContext } from "@/contexts/WorkerSessionContext";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export type ProductionContextBannerProps = {
  /** The active job (for display info) */
  job: Job | null | undefined;
  /** The active job item context */
  activeJobItem: ActiveJobItemContext | null | undefined;
  /** Session-level totals (this session's contribution) */
  sessionTotals: {
    good: number;
    scrap: number;
  };
  /** Callback when "Switch Job" is clicked */
  onSwitchJob?: () => void;
  /** Whether switch job action is disabled */
  switchJobDisabled?: boolean;
  /** Additional class names */
  className?: string;
};

// ============================================
// COMPONENT
// ============================================

export function ProductionContextBanner({
  job,
  activeJobItem,
  sessionTotals,
  onSwitchJob,
  switchJobDisabled = false,
  className,
}: ProductionContextBannerProps) {
  const { t } = useTranslation();

  // Don't render if no active job item
  if (!activeJobItem) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/50 dark:bg-emerald-900/20",
        className
      )}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 text-right">
          {/* Job Number and Client */}
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="bg-emerald-100 text-emerald-800 dark:bg-emerald-800/30 dark:text-emerald-200"
            >
              ייצור פעיל
            </Badge>
            {job ? (
              <span className="text-lg font-semibold text-foreground">
                {t("common.job")} {job.job_number}
              </span>
            ) : null}
          </div>
          {job?.customer_name ? (
            <span className="text-sm text-muted-foreground">
              {job.customer_name}
            </span>
          ) : null}
        </div>

        {/* Switch Job Button */}
        {onSwitchJob ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onSwitchJob}
            disabled={switchJobDisabled}
            className="shrink-0 border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
          >
            החלף עבודה
          </Button>
        ) : null}
      </div>

      {/* Job Item Info */}
      <div className="mt-3 space-y-3">
        {/* Job Item Name */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">פריט עבודה:</span>
          <span className="font-medium text-foreground">{activeJobItem.name}</span>
          <Badge
            variant="outline"
            className="text-xs border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400"
          >
            {activeJobItem.kind === "line" ? "קו ייצור" : "תחנה בודדת"}
          </Badge>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {/* Planned */}
          <div className="rounded-lg bg-white/60 px-3 py-2 text-center dark:bg-emerald-950/30">
            <div className="text-xs text-muted-foreground">מתוכנן</div>
            <div className="text-lg font-semibold text-foreground">
              {activeJobItem.plannedQuantity}
            </div>
          </div>

          {/* Session Good */}
          <div className="rounded-lg bg-white/60 px-3 py-2 text-center dark:bg-emerald-950/30">
            <div className="text-xs text-muted-foreground">תקין (משמרת)</div>
            <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {sessionTotals.good}
            </div>
          </div>

          {/* Session Scrap */}
          <div className="rounded-lg bg-white/60 px-3 py-2 text-center dark:bg-emerald-950/30">
            <div className="text-xs text-muted-foreground">פסול (משמרת)</div>
            <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">
              {sessionTotals.scrap}
            </div>
          </div>

          {/* Session Total */}
          <div className="rounded-lg bg-white/60 px-3 py-2 text-center dark:bg-emerald-950/30">
            <div className="text-xs text-muted-foreground">סהכ (משמרת)</div>
            <div className="text-lg font-semibold text-foreground">
              {sessionTotals.good + sessionTotals.scrap}
            </div>
          </div>

          {/* Remaining (for the entire job item) */}
          <div className="rounded-lg bg-white/60 px-3 py-2 text-center dark:bg-emerald-950/30">
            <div className="text-xs text-muted-foreground">נותר (עבודה)</div>
            <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
              {Math.max(0, activeJobItem.plannedQuantity - sessionTotals.good)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
