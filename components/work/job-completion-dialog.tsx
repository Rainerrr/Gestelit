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
  | { action: "setup" };

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

  const handleSetup = useCallback(() => {
    onComplete({ action: "setup" });
  }, [onComplete]);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg border-2 border-emerald-600/50 bg-card">
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
          <DialogDescription className="text-muted-foreground">
            <span className="font-semibold">{completedJobItemName}</span> הושלם בהצלחה.
            <br />
            מה תרצה לעשות עכשיו?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-emerald-400" />
            </div>
          )}

          {/* Available Job Items */}
          {!isLoading && availableJobItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground text-right">
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
                          : "border-border bg-card/50 hover:border-border/80 hover:bg-accent"
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
                                : "border-border"
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
                              ? "bg-muted text-muted-foreground"
                              : "bg-emerald-500/20 text-emerald-400"
                          )}>
                            {progress}%
                          </span>
                        </div>
                        <div className="flex-1 text-right">
                          <div className="font-semibold text-foreground">
                            עבודה {item.jobNumber}
                          </div>
                          {item.customerName && (
                            <div className="text-xs text-muted-foreground">
                              {item.customerName}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Product Name */}
                      <div className="mt-2 text-sm text-foreground">
                        {item.name}
                      </div>

                      {/* Stats */}
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {item.completedGood.toLocaleString()} / {item.plannedQuantity.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground">
                          נותר: {remaining.toLocaleString()}
                        </span>
                      </div>

                      {/* Mini progress bar */}
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
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
            <div className="rounded-lg border-2 border-dashed border-border bg-muted/30 p-6 text-center">
              <div className="text-muted-foreground">
                אין עבודות נוספות זמינות בעמדה זו
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          {/* Setup Button */}
          <Button
            variant="outline"
            onClick={handleSetup}
            disabled={isSubmitting}
            className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
          >
            הכנה
          </Button>

          {/* Select Job Button */}
          <Button
            onClick={handleSelectJobItem}
            disabled={isSubmitting || !selectedJobItemId}
            className={cn(
              "min-w-32 font-bold",
              selectedJobItemId
                ? "bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400"
                : "bg-muted"
            )}
          >
            {isSubmitting ? "מעביר..." : "בחר עבודה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
