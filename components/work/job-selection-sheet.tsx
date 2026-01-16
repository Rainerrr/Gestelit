"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Briefcase, Search, TrendingUp, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import {
  fetchJobItemsAtStationApi,
  type JobItemAtStation,
} from "@/lib/api/client";

// ============================================
// TYPES
// ============================================

export type JobSelectionResult = {
  job: {
    id: string;
    jobNumber: string;
    clientName: string | null;
    description: string | null;
  };
  jobItem: {
    id: string;
    jobId: string;
    name: string;
    plannedQuantity: number;
    completedGood: number;
    remaining: number;
    jobItemStepId: string;
  };
};

export type JobSelectionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stationId: string;
  stationName?: string;
  stationCode?: string;
  onSelectJobItem: (result: JobSelectionResult) => void;
  /** If true, cannot dismiss without selection */
  required?: boolean;
  isSubmitting?: boolean;
  /** Title override */
  title?: string;
  /** Current job item ID to exclude from selection (when switching jobs) */
  excludeJobItemId?: string;
};

// ============================================
// SUB-COMPONENTS
// ============================================

type ProgressBarProps = {
  completed: number;
  planned: number;
  className?: string;
};

function ProgressBar({ completed, planned, className }: ProgressBarProps) {
  const percentage = planned > 0 ? Math.min(100, (completed / planned) * 100) : 0;
  const isComplete = percentage >= 100;

  return (
    <div className={cn("relative h-2 rounded-full overflow-hidden", className)}>
      {/* Background track */}
      <div className="absolute inset-0 bg-slate-700/50" />

      {/* Progress fill */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out",
          isComplete
            ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
            : "bg-gradient-to-r from-cyan-600 to-cyan-400"
        )}
        style={{ width: `${percentage}%` }}
      />

      {/* Shine effect */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-b from-white/10 to-transparent",
          "pointer-events-none"
        )}
      />
    </div>
  );
}

type CompactJobItemCardProps = {
  jobItem: JobItemAtStation;
  onSelect: () => void;
  animationDelay: number;
  disabled?: boolean;
};

function CompactJobItemCard({ jobItem, onSelect, animationDelay, disabled }: CompactJobItemCardProps) {
  const percentage = jobItem.plannedQuantity > 0
    ? Math.round((jobItem.completedGood / jobItem.plannedQuantity) * 100)
    : 0;
  const remaining = Math.max(0, jobItem.plannedQuantity - jobItem.completedGood);
  const isComplete = remaining === 0;

  return (
    <div
      className={cn(
        "group relative rounded-xl border-2 p-3",
        "bg-gradient-to-b from-slate-800/80 to-slate-900/60",
        "transition-all duration-200",
        isComplete || disabled
          ? "border-slate-600/30 opacity-50"
          : "border-slate-600/50 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10",
        // Entrance animation
        "animate-in fade-in slide-in-from-bottom-2"
      )}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Header row: Job number + customer + percentage */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Briefcase className="h-4 w-4 text-cyan-400 flex-shrink-0" />
          <span className="text-sm font-bold text-slate-100 truncate">
            עבודה {jobItem.jobNumber}
          </span>
          {jobItem.customerName && (
            <span className="text-xs text-slate-400 truncate hidden sm:inline">
              • {jobItem.customerName}
            </span>
          )}
        </div>

        {/* Percentage badge */}
        <div
          className={cn(
            "px-2 py-0.5 rounded-md text-xs font-bold tabular-nums flex-shrink-0",
            isComplete
              ? "bg-emerald-500/20 text-emerald-400"
              : percentage > 50
                ? "bg-cyan-500/20 text-cyan-400"
                : "bg-slate-700/50 text-slate-300"
          )}
        >
          {percentage}%
        </div>
      </div>

      {/* Product name */}
      <div className="flex items-center gap-2 mb-2">
        <Package className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-slate-200 truncate">
          {jobItem.name}
        </span>
      </div>

      {/* Progress + stats row */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1">
          <ProgressBar
            completed={jobItem.completedGood}
            planned={jobItem.plannedQuantity}
          />
        </div>
        <span className="text-xs text-slate-400 flex-shrink-0">
          <span className="font-semibold text-slate-200 tabular-nums">
            {jobItem.completedGood.toLocaleString()}
          </span>
          /{jobItem.plannedQuantity.toLocaleString()}
        </span>
        <span className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
          <TrendingUp className="h-3 w-3" />
          <span className="font-semibold text-slate-200 tabular-nums">{remaining.toLocaleString()}</span>
        </span>
      </div>

      {/* Select button - compact */}
      <Button
        onClick={onSelect}
        disabled={isComplete || disabled}
        className={cn(
          "w-full h-10 text-sm font-bold",
          "transition-all duration-200",
          isComplete || disabled
            ? "bg-slate-700 text-slate-500 cursor-not-allowed"
            : [
                "bg-gradient-to-r from-cyan-600 to-cyan-500",
                "hover:from-cyan-500 hover:to-cyan-400",
                "text-slate-900",
                "shadow-lg shadow-cyan-500/20",
                "hover:shadow-cyan-500/40",
                "active:scale-[0.98]",
              ]
        )}
      >
        {isComplete ? "הושלם" : "בחר עבודה זו"}
      </Button>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * Unified job selection bottom sheet for all contexts:
 * - Initial job selection at station
 * - Production entry job selection
 * - Job switching during production
 *
 * Features:
 * - Tile-based job item cards (not dropdowns)
 * - Search by job number, client name, or product name
 * - Compact mobile-responsive design
 * - Single close button (no duplication)
 */
export function JobSelectionSheet({
  open,
  onOpenChange,
  stationId,
  stationName,
  stationCode,
  onSelectJobItem,
  required = false,
  isSubmitting = false,
  title,
  excludeJobItemId,
}: JobSelectionSheetProps) {
  const { t } = useTranslation();

  // State
  const [jobItems, setJobItems] = useState<JobItemAtStation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Load job items when sheet opens
  useEffect(() => {
    if (!open || !stationId) {
      return;
    }

    const loadJobItems = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const items = await fetchJobItemsAtStationApi(stationId);
        setJobItems(items);
      } catch (err) {
        console.error("[JobSelectionSheet] Failed to load job items:", err);
        setError("שגיאה בטעינת עבודות");
      } finally {
        setIsLoading(false);
      }
    };

    void loadJobItems();
  }, [open, stationId]);

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      setJobItems([]);
      setSearchQuery("");
      setError(null);
    }
  }, [open]);

  // Sort job items by job, then by remaining work within each job
  const sortedJobItems = useMemo(() => {
    // First, exclude current job item if specified (for job switching)
    let items = excludeJobItemId
      ? jobItems.filter((item) => item.id !== excludeJobItemId)
      : [...jobItems];

    // Then filter by search if provided
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.jobNumber.toLowerCase().includes(query) ||
          (item.customerName?.toLowerCase().includes(query) ?? false) ||
          item.name.toLowerCase().includes(query)
      );
    }

    // Calculate total remaining per job for sorting jobs
    const jobTotals = new Map<string, number>();
    for (const item of items) {
      const remaining = Math.max(0, item.plannedQuantity - item.completedGood);
      jobTotals.set(item.jobId, (jobTotals.get(item.jobId) ?? 0) + remaining);
    }

    // Sort: first by job (jobs with most remaining work first), then by item remaining within job
    items.sort((a, b) => {
      const aJobTotal = jobTotals.get(a.jobId) ?? 0;
      const bJobTotal = jobTotals.get(b.jobId) ?? 0;

      // Completed jobs go to bottom
      if (aJobTotal === 0 && bJobTotal > 0) return 1;
      if (bJobTotal === 0 && aJobTotal > 0) return -1;

      // Sort by job total remaining (most work first)
      if (aJobTotal !== bJobTotal) return bJobTotal - aJobTotal;

      // Same job - sort by job number for grouping
      if (a.jobNumber !== b.jobNumber) return a.jobNumber.localeCompare(b.jobNumber);

      // Within same job, sort by item remaining
      const aRemaining = a.plannedQuantity - a.completedGood;
      const bRemaining = b.plannedQuantity - b.completedGood;
      return bRemaining - aRemaining;
    });

    return items;
  }, [jobItems, searchQuery, excludeJobItemId]);

  const availableCount = jobItems.filter(
    (j) => j.completedGood < j.plannedQuantity
  ).length;

  // Handlers
  const handleSelect = useCallback(
    (jobItem: JobItemAtStation) => {
      const remaining = Math.max(0, jobItem.plannedQuantity - jobItem.completedGood);
      const result: JobSelectionResult = {
        job: {
          id: jobItem.jobId,
          jobNumber: jobItem.jobNumber,
          clientName: jobItem.customerName,
          description: null, // Not available from job item endpoint
        },
        jobItem: {
          id: jobItem.id,
          jobId: jobItem.jobId,
          name: jobItem.name,
          plannedQuantity: jobItem.plannedQuantity,
          completedGood: jobItem.completedGood,
          remaining,
          jobItemStepId: jobItem.jobItemStepId,
        },
      };
      onSelectJobItem(result);
    },
    [onSelectJobItem]
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && required) {
        // Cannot close when required
        return;
      }
      onOpenChange(isOpen);
    },
    [required, onOpenChange]
  );

  // Computed title
  const displayTitle = title ?? "בחר עבודה לייצור";
  const displaySubtitle = stationCode
    ? `${stationName ?? ""} • ${stationCode} • ${availableCount} עבודות פעילות`
    : `${availableCount} עבודות פעילות`;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "h-[85vh] rounded-t-3xl border-t-2 border-slate-700",
          "bg-gradient-to-b from-slate-900 to-slate-950",
          "flex flex-col",
          // Hide default close button - we handle it ourselves
          "[&>button]:hidden"
        )}
      >
        {/* Header */}
        <SheetHeader className="flex-shrink-0 pb-3 border-b border-slate-800">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="text-xl font-black text-slate-100 truncate">
                {displayTitle}
              </SheetTitle>
              <p className="mt-1 text-sm text-slate-400 truncate">
                {displaySubtitle}
              </p>
            </div>

            {/* Single close button - only show if not required */}
            {!required && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-10 w-10 rounded-full bg-slate-800 hover:bg-slate-700 flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* Search Bar */}
        <div className="flex-shrink-0 px-1 py-3 border-b border-slate-800/50">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <Input
              type="text"
              placeholder="חיפוש לפי מספר עבודה או לקוח..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "pr-10 h-10 text-sm",
                "bg-slate-800/50 border-slate-700",
                "placeholder:text-slate-500",
                "focus:border-cyan-500 focus:ring-cyan-500/20"
              )}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchQuery("")}
                className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-400 hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4 px-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="h-10 w-10 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
              <span className="text-sm text-slate-400">טוען עבודות...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
                <X className="h-8 w-8 text-red-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-red-400">{error}</p>
                <p className="mt-1 text-sm text-slate-500">
                  נסה לרענן את הדף או פנה למנהל
                </p>
              </div>
            </div>
          ) : sortedJobItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-slate-800 flex items-center justify-center">
                <Briefcase className="h-8 w-8 text-slate-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-300">
                  {searchQuery ? "לא נמצאו תוצאות" : "אין עבודות זמינות"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {searchQuery
                    ? "נסה לחפש עם מילות מפתח אחרות"
                    : "לעמדה זו לא הוקצו עבודות כרגע"}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {sortedJobItems.map((jobItem, index) => (
                <CompactJobItemCard
                  key={jobItem.id}
                  jobItem={jobItem}
                  onSelect={() => handleSelect(jobItem)}
                  animationDelay={index * 50}
                  disabled={isSubmitting}
                />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
