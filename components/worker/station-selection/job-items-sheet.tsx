"use client";

import { useCallback, useMemo, useState } from "react";
import { X, Briefcase, TrendingUp, Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export type JobItemForSelection = {
  id: string;
  jobId: string;
  jobNumber: string;
  customerName?: string | null;
  name: string;
  plannedQuantity: number;
  completedGood: number;
  jobItemStepId: string;
};

export type JobItemsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stationName: string;
  stationCode: string;
  jobItems: JobItemForSelection[];
  onSelectJobItem: (jobItem: JobItemForSelection) => void;
  isLoading?: boolean;
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
    <div className={cn("relative rounded-full overflow-hidden", className ?? "h-3")}>
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

type JobItemCardProps = {
  jobItem: JobItemForSelection;
  onSelect: () => void;
  animationDelay: number;
};

function JobItemCard({ jobItem, onSelect, animationDelay }: JobItemCardProps) {
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
        isComplete
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
            className="h-2"
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
        disabled={isComplete}
        className={cn(
          "w-full h-10 text-sm font-bold",
          "transition-all duration-200",
          isComplete
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
 * Bottom sheet showing available job items for a selected station.
 * Industrial-modern aesthetic with bold progress indicators.
 * Features search by job number, client name, or product name.
 */
export function JobItemsSheet({
  open,
  onOpenChange,
  stationName,
  stationCode,
  jobItems,
  onSelectJobItem,
  isLoading = false,
}: JobItemsSheetProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Sort: incomplete items first, then by remaining quantity descending
  const sortedJobItems = useMemo(() => {
    return [...jobItems].sort((a, b) => {
      const aRemaining = a.plannedQuantity - a.completedGood;
      const bRemaining = b.plannedQuantity - b.completedGood;
      const aComplete = aRemaining <= 0;
      const bComplete = bRemaining <= 0;

      // Complete items go to bottom
      if (aComplete !== bComplete) return aComplete ? 1 : -1;

      // Sort by remaining (most work first)
      return bRemaining - aRemaining;
    });
  }, [jobItems]);

  // Filter by search query
  const filteredJobItems = useMemo(() => {
    if (!searchQuery.trim()) return sortedJobItems;

    const query = searchQuery.toLowerCase();
    return sortedJobItems.filter(
      (item) =>
        item.jobNumber.toLowerCase().includes(query) ||
        (item.customerName?.toLowerCase().includes(query) ?? false) ||
        item.name.toLowerCase().includes(query)
    );
  }, [sortedJobItems, searchQuery]);

  const availableCount = jobItems.filter(
    (j) => j.completedGood < j.plannedQuantity
  ).length;

  const handleSelect = useCallback(
    (jobItem: JobItemForSelection) => {
      onSelectJobItem(jobItem);
    },
    [onSelectJobItem]
  );

  // Reset search when sheet closes
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setSearchQuery("");
      }
      onOpenChange(isOpen);
    },
    [onOpenChange]
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "h-[85vh] rounded-t-3xl border-t-2 border-slate-700",
          "bg-gradient-to-b from-slate-900 to-slate-950",
          "flex flex-col",
          // Hide default close button - we have our own
          "[&>button]:hidden"
        )}
      >
        {/* Header */}
        <SheetHeader className="flex-shrink-0 pb-3 border-b border-slate-800">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="text-xl font-black text-slate-100 truncate">
                עבודות זמינות בעמדה {stationCode}
              </SheetTitle>
              <p className="mt-1 text-sm text-slate-400 truncate">
                {stationName} • {availableCount} עבודות פעילות
              </p>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleOpenChange(false)}
              className="h-10 w-10 rounded-full bg-slate-800 hover:bg-slate-700 flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </Button>
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
          ) : filteredJobItems.length === 0 ? (
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
              {filteredJobItems.map((jobItem, index) => (
                <JobItemCard
                  key={jobItem.id}
                  jobItem={jobItem}
                  onSelect={() => handleSelect(jobItem)}
                  animationDelay={index * 50}
                />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
