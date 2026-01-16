"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export type AvailableJobItemForCompletion = {
  id: string;
  jobId: string;
  jobNumber: string;
  customerName: string | null;
  name: string;
  plannedQuantity: number;
  completedGood: number;
  jobItemStepId: string;
};

export type JobCompletionResult =
  | { action: "select"; jobItem: AvailableJobItemForCompletion }
  | { action: "stoppage" };

export type JobCompletionDialogProps = {
  /** Whether the dialog is open */
  open: boolean;
  /** Completed job item name */
  completedJobItemName: string;
  /** Available job items to select from */
  availableJobItems: AvailableJobItemForCompletion[];
  /** Whether loading available items */
  isLoading?: boolean;
  /** Callback when selection is made */
  onComplete: (result: JobCompletionResult) => void;
  /** Whether submitting selection */
  isSubmitting?: boolean;
};

// ============================================
// COMPONENT
// ============================================

/**
 * Job completion dialog - shown when a job item reaches 100%.
 *
 * Features:
 * - Celebratory completion message
 * - List of available job items at current station
 * - Quick select or switch to stoppage status
 *
 * Industrial design: Bold typography, high contrast, clear CTAs
 */
export function JobCompletionDialog({
  open,
  completedJobItemName,
  availableJobItems,
  isLoading = false,
  onComplete,
  isSubmitting = false,
}: JobCompletionDialogProps) {
  const [selectedJobItemId, setSelectedJobItemId] = useState<string | null>(null);

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedJobItemId(null);
    }
  }, [open]);

  const handleSelectJobItem = useCallback(() => {
    if (!selectedJobItemId) return;
    const jobItem = availableJobItems.find((item) => item.id === selectedJobItemId);
    if (jobItem) {
      onComplete({ action: "select", jobItem });
    }
  }, [selectedJobItemId, availableJobItems, onComplete]);

  const handleStoppage = useCallback(() => {
    onComplete({ action: "stoppage" });
  }, [onComplete]);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg border-2 border-emerald-600/50 bg-slate-900">
        <DialogHeader className="text-center">
          {/* Success Icon */}
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 border-2 border-emerald-500/50">
            <svg
              className="h-8 w-8 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <DialogTitle className="text-2xl font-bold text-emerald-400">
            פריט עבודה הושלם!
          </DialogTitle>
          <DialogDescription className="text-slate-300">
            <span className="font-semibold">{completedJobItemName}</span> הושלם בהצלחה.
            <br />
            מה תרצה לעשות עכשיו?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-emerald-400" />
            </div>
          )}

          {/* Available Job Items */}
          {!isLoading && availableJobItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-400 text-right">
                עבודות זמינות בעמדה:
              </h4>
              <div className="max-h-[280px] space-y-2 overflow-y-auto pe-1">
                {availableJobItems.map((item) => {
                  const progress = item.plannedQuantity > 0
                    ? Math.round((item.completedGood / item.plannedQuantity) * 100)
                    : 0;
                  const remaining = Math.max(0, item.plannedQuantity - item.completedGood);
                  const isSelected = selectedJobItemId === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedJobItemId(item.id)}
                      className={cn(
                        "w-full rounded-lg border-2 p-3 text-right transition-all",
                        isSelected
                          ? "border-cyan-500/50 bg-cyan-500/10"
                          : "border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800"
                      )}
                    >
                      {/* Job Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {/* Selection indicator */}
                          <div
                            className={cn(
                              "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                              isSelected
                                ? "border-cyan-400 bg-cyan-400"
                                : "border-slate-600"
                            )}
                          >
                            {isSelected && (
                              <svg className="h-3 w-3 text-slate-900" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          {/* Progress badge */}
                          <span className={cn(
                            "text-xs font-bold tabular-nums px-2 py-0.5 rounded",
                            progress === 0
                              ? "bg-slate-700 text-slate-400"
                              : "bg-emerald-500/20 text-emerald-400"
                          )}>
                            {progress}%
                          </span>
                        </div>
                        <div className="flex-1 text-right">
                          <div className="font-semibold text-slate-200">
                            עבודה {item.jobNumber}
                          </div>
                          {item.customerName && (
                            <div className="text-xs text-slate-500">
                              {item.customerName}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Product Name */}
                      <div className="mt-2 text-sm text-slate-300">
                        {item.name}
                      </div>

                      {/* Stats */}
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-slate-500">
                          {item.completedGood.toLocaleString()} / {item.plannedQuantity.toLocaleString()}
                        </span>
                        <span className="text-slate-400">
                          נותר: {remaining.toLocaleString()}
                        </span>
                      </div>

                      {/* Mini progress bar */}
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* No Available Jobs */}
          {!isLoading && availableJobItems.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-slate-700 bg-slate-800/30 p-6 text-center">
              <div className="text-slate-500">
                אין עבודות נוספות זמינות בעמדה זו
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          {/* Stoppage Button */}
          <Button
            variant="outline"
            onClick={handleStoppage}
            disabled={isSubmitting}
            className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
          >
            הפסקה
          </Button>

          {/* Select Job Button */}
          <Button
            onClick={handleSelectJobItem}
            disabled={isSubmitting || !selectedJobItemId}
            className={cn(
              "min-w-32 font-bold",
              selectedJobItemId
                ? "bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400"
                : "bg-slate-700"
            )}
          >
            {isSubmitting ? "מעביר..." : "בחר עבודה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
