"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export type QuantityReportMode = "additional" | "total";

export type QuantityReportResult = {
  /** Additional good units produced during this production event */
  additionalGood: number;
  /** Additional scrap units produced during this production event */
  additionalScrap: number;
  /** Whether the job item should be closed (remaining = 0) */
  shouldCloseJobItem?: boolean;
  /** Scrap report note (required when scrap > 0) */
  scrapNote?: string;
  /** Scrap report image (optional) */
  scrapImage?: File | null;
};

export type QuantityReportDialogProps = {
  /** Whether the dialog is open */
  open: boolean;
  /** Current session totals (for "total" mode calculations) */
  sessionTotals: {
    good: number;
    scrap: number;
  };
  /** Planned quantity for the job item */
  plannedQuantity?: number;
  /** Total completed good (all sessions combined, before this session's contribution) */
  totalCompletedBefore?: number;
  /** Callback when quantities are submitted */
  onSubmit: (result: QuantityReportResult) => void;
  /** Callback when dialog is cancelled (only if not required) */
  onCancel: () => void;
  /** If true, dialog cannot be dismissed without submission */
  required?: boolean;
  /** If true, show loading state */
  isSubmitting?: boolean;
  /** Job item name for display context */
  jobItemName?: string;
};

// ============================================
// COMPONENT
// ============================================

/**
 * Industrial-style quantity reporting dialog - Redesigned v2.
 *
 * Features:
 * - Tab-style mode toggle (כמות נוספת / סה"כ)
 * - LARGE text in input showing current amount as placeholder
 * - + symbol on LEFT side (RTL) closer to text in additive mode
 * - Collapsible red-themed scrap section
 * - RTL progress bar with slower pulse animation
 * - No close button - worker must submit
 * - Mandatory scrap note when scrap > 0
 *
 * Design: High contrast, large touch targets, heavy typography
 */
export function QuantityReportDialog({
  open,
  sessionTotals,
  plannedQuantity,
  totalCompletedBefore = 0,
  onSubmit,
  onCancel,
  required = false,
  isSubmitting = false,
  jobItemName,
}: QuantityReportDialogProps) {
  // State - default to "total" mode
  const [mode, setMode] = useState<QuantityReportMode>("total");
  const [goodInput, setGoodInput] = useState("");
  const [scrapInput, setScrapInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Scrap report state
  const [isScrapExpanded, setIsScrapExpanded] = useState(false);
  const [scrapNote, setScrapNote] = useState("");
  const [scrapImage, setScrapImage] = useState<File | null>(null);
  const [scrapImagePreview, setScrapImagePreview] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setMode("total");
      setGoodInput("");
      setScrapInput("");
      setError(null);
      setIsScrapExpanded(false);
      setScrapNote("");
      setScrapImage(null);
      if (scrapImagePreview) {
        URL.revokeObjectURL(scrapImagePreview);
      }
      setScrapImagePreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cleanup image preview URL on unmount
  useEffect(() => {
    return () => {
      if (scrapImagePreview) {
        URL.revokeObjectURL(scrapImagePreview);
      }
    };
  }, [scrapImagePreview]);

  // Computed values
  const goodNumeric = goodInput === "" ? 0 : parseInt(goodInput, 10) || 0;
  const scrapNumeric = scrapInput === "" ? 0 : parseInt(scrapInput, 10) || 0;

  // Current total reported (what shows as placeholder in total mode)
  const currentReportedTotal = totalCompletedBefore + sessionTotals.good;

  // Calculate preview values
  const previewValues = useMemo(() => {
    const additionalGood = mode === "total"
      ? Math.max(0, goodNumeric - sessionTotals.good)
      : goodNumeric;
    const additionalScrap = mode === "total"
      ? Math.max(0, scrapNumeric - sessionTotals.scrap)
      : scrapNumeric;

    // Total completed after this report (including this session's contribution)
    const totalCompletedAfter = totalCompletedBefore + sessionTotals.good + additionalGood;

    // Remaining after this report
    const remaining = plannedQuantity
      ? Math.max(0, plannedQuantity - totalCompletedAfter)
      : undefined;

    // Progress percentage
    const progressPercent = plannedQuantity && plannedQuantity > 0
      ? Math.min(100, (totalCompletedAfter / plannedQuantity) * 100)
      : undefined;

    return {
      additionalGood,
      additionalScrap,
      totalCompletedAfter,
      remaining,
      progressPercent,
      isComplete: remaining === 0,
    };
  }, [mode, goodNumeric, scrapNumeric, sessionTotals, plannedQuantity, totalCompletedBefore]);

  // Calculate maximum allowed input to prevent overflow
  const maxAllowedGood = useMemo(() => {
    if (!plannedQuantity) return undefined;
    const currentTotal = totalCompletedBefore + sessionTotals.good;
    const maxAdditional = Math.max(0, plannedQuantity - currentTotal);
    return mode === "total"
      ? sessionTotals.good + maxAdditional
      : maxAdditional;
  }, [plannedQuantity, totalCompletedBefore, sessionTotals.good, mode]);

  // Check if current input exceeds max
  const isOverflow = maxAllowedGood !== undefined && goodNumeric > maxAllowedGood;

  // Check if total mode input is less than what's already reported (can't go backwards)
  const isBelowMinGood = mode === "total" && goodInput !== "" && goodNumeric < sessionTotals.good;
  const isBelowMinScrap = mode === "total" && scrapInput !== "" && scrapNumeric < sessionTotals.scrap;

  // Check if scrap note is required but missing
  const isScrapNoteRequired = previewValues.additionalScrap > 0 && !scrapNote.trim();

  // Handlers
  const handleModeChange = useCallback((newMode: QuantityReportMode) => {
    setMode(newMode);
    setGoodInput("");
    setScrapInput("");
    setError(null);
  }, []);

  const handleGoodInputChange = useCallback((value: string) => {
    setGoodInput(value);
    setError(null);
  }, []);

  const handleScrapInputChange = useCallback((value: string) => {
    setScrapInput(value);
    setError(null);
    // Auto-expand scrap section when scrap is entered
    if (parseInt(value, 10) > 0) {
      setIsScrapExpanded(true);
    }
  }, []);

  // Quick-add buttons for good quantity
  const handleQuickAdd = useCallback((amount: number) => {
    const current = goodInput === "" ? 0 : parseInt(goodInput, 10) || 0;
    const newValue = current + amount;
    setGoodInput(String(newValue));
    setError(null);
  }, [goodInput]);

  // Fill remaining to complete job item
  const handleFillRemaining = useCallback(() => {
    if (!plannedQuantity) return;
    const currentTotal = totalCompletedBefore + sessionTotals.good;
    const remaining = Math.max(0, plannedQuantity - currentTotal);
    if (mode === "additional") {
      setGoodInput(String(remaining));
    } else {
      setGoodInput(String(sessionTotals.good + remaining));
    }
    setError(null);
  }, [plannedQuantity, totalCompletedBefore, sessionTotals.good, mode]);

  // Image handling
  const handleScrapImageChange = useCallback((file: File | null) => {
    if (scrapImagePreview) {
      URL.revokeObjectURL(scrapImagePreview);
    }
    setScrapImage(file);
    if (file) {
      setScrapImagePreview(URL.createObjectURL(file));
    } else {
      setScrapImagePreview(null);
    }
  }, [scrapImagePreview]);

  const handleSubmit = useCallback(() => {
    if (isOverflow) {
      setError(`לא ניתן לדווח יותר מ-${maxAllowedGood} יחידות`);
      return;
    }

    // Validate total mode doesn't go below what's already reported
    if (isBelowMinGood) {
      setError(`לא ניתן לדווח סהכ פחות מ-${sessionTotals.good} (כבר דווח)`);
      return;
    }
    if (isBelowMinScrap) {
      setError(`לא ניתן לדווח סהכ פסול פחות מ-${sessionTotals.scrap} (כבר דווח)`);
      return;
    }

    const { additionalGood, additionalScrap, isComplete } = previewValues;

    // Validate inputs
    if (additionalGood < 0 || additionalScrap < 0) {
      setError("הכמויות חייבות להיות חיוביות");
      return;
    }

    // Validate scrap note when scrap > 0
    if (additionalScrap > 0 && !scrapNote.trim()) {
      setError("יש להזין תיאור כאשר מדווחים על פסול");
      setIsScrapExpanded(true);
      return;
    }

    onSubmit({
      additionalGood,
      additionalScrap,
      shouldCloseJobItem: isComplete,
      scrapNote: additionalScrap > 0 ? scrapNote.trim() : undefined,
      scrapImage: additionalScrap > 0 ? scrapImage : undefined,
    });
  }, [isOverflow, maxAllowedGood, isBelowMinGood, isBelowMinScrap, sessionTotals.good, sessionTotals.scrap, previewValues, scrapNote, scrapImage, onSubmit]);

  const handleDialogChange = useCallback((isOpen: boolean) => {
    if (!isOpen && !required) {
      onCancel();
    }
  }, [required, onCancel]);

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent
        hideCloseButton={required}
        className="max-w-lg border-2 border-slate-700 bg-slate-900 text-right"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-100">
            דיווח כמויות
          </DialogTitle>
          {jobItemName ? (
            <DialogDescription className="text-slate-400">
              מוצר: <span className="font-semibold text-slate-300">{jobItemName}</span>
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ============================================ */}
          {/* TAB-STYLE MODE TOGGLE */}
          {/* ============================================ */}
          <div className="relative flex rounded-xl border-2 border-slate-600 bg-slate-800/50 p-1">
            {/* Sliding background indicator */}
            <div
              className={cn(
                "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-cyan-500/30 border border-cyan-500/50 transition-all duration-300 ease-out",
                mode === "additional" ? "right-1" : "left-1"
              )}
            />

            {/* Additional Tab */}
            <button
              type="button"
              onClick={() => handleModeChange("additional")}
              className={cn(
                "relative flex-1 py-2.5 rounded-lg font-bold text-base transition-colors z-10",
                mode === "additional"
                  ? "text-cyan-300"
                  : "text-slate-400 hover:text-slate-300"
              )}
            >
              כמות נוספת
            </button>

            {/* Total Tab */}
            <button
              type="button"
              onClick={() => handleModeChange("total")}
              className={cn(
                "relative flex-1 py-2.5 rounded-lg font-bold text-base transition-colors z-10",
                mode === "total"
                  ? "text-cyan-300"
                  : "text-slate-400 hover:text-slate-300"
              )}
            >
              סה״כ
            </button>
          </div>

          {/* ============================================ */}
          {/* GOOD QUANTITY - IMPROVED LAYOUT */}
          {/* ============================================ */}
          <div className="space-y-3">
            {/* Header row with label and total required */}
            <div className="flex items-center justify-between">
              <Label className="text-lg font-bold text-emerald-400">
                {mode === "additional" ? "כמות נוספת" : "סהכ עד עכשיו"}
              </Label>
              {plannedQuantity && (
                <span className="text-sm text-slate-400">
                  נדרש סהכ: <span className="font-bold text-emerald-300">{plannedQuantity.toLocaleString()}</span>
                </span>
              )}
            </div>

            {/* Quick-add buttons ABOVE input */}
            <div className="flex gap-2">
              {[100, 50, 10].map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAdd(amount)}
                  className="flex-1 h-9 text-sm font-bold border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20"
                >
                  +{amount}
                </Button>
              ))}
            </div>

            {/* Large input with + on LEFT side (RTL) in additive mode */}
            <div className="relative">
              {/* Plus symbol on the LEFT (appears after the number in RTL) */}
              {mode === "additional" && goodInput && (
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[3rem] font-bold text-emerald-400/60 pointer-events-none leading-none">
                  +
                </span>
              )}
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                max={maxAllowedGood}
                placeholder={currentReportedTotal.toLocaleString()}
                value={goodInput}
                onChange={(e) => handleGoodInputChange(e.target.value)}
                onFocus={(e) => {
                  // In total mode, select all on focus so user can replace
                  if (mode === "total") e.target.select();
                }}
                style={{ fontSize: "3.5rem", lineHeight: "1" }}
                className={cn(
                  "h-24 text-center font-bold tabular-nums",
                  "border-2 bg-slate-800/50",
                  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                  "placeholder:text-slate-500 placeholder:opacity-100",
                  // Add left padding when + is visible to avoid overlap
                  mode === "additional" && goodInput && "pl-16",
                  isOverflow || isBelowMinGood
                    ? "border-red-500 text-red-400 focus-visible:ring-red-500/50"
                    : "border-emerald-500/50 text-emerald-400 focus-visible:ring-emerald-500/50"
                )}
              />
            </div>

            {/* Fill remaining - prominent full-width button */}
            {plannedQuantity && previewValues.remaining !== undefined && previewValues.remaining > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleFillRemaining}
                className="w-full h-10 border-2 border-emerald-500/60 bg-emerald-500/10 text-emerald-300 font-bold text-base hover:bg-emerald-500/20 hover:border-emerald-400"
              >
                השלם נותר: {previewValues.remaining.toLocaleString()} יחידות
              </Button>
            )}
          </div>

          {/* ============================================ */}
          {/* COLLAPSIBLE SCRAP SECTION (Red Theme) */}
          {/* ============================================ */}
          <div className="rounded-lg border-2 border-rose-500/30 bg-rose-500/5 overflow-hidden">
            {/* Scrap header - clickable to expand */}
            <button
              type="button"
              onClick={() => setIsScrapExpanded(!isScrapExpanded)}
              className={cn(
                "w-full flex items-center justify-between p-4",
                "hover:bg-rose-500/10 transition-colors"
              )}
            >
              <div className="flex items-center gap-3">
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-rose-400 transition-transform duration-300",
                    isScrapExpanded && "rotate-180"
                  )}
                />
                <span className="text-base font-bold text-rose-400">
                  {mode === "additional" ? "פסול (נוסף)" : "סהכ פסול"}
                </span>
              </div>

              {/* Scrap count badge (always visible) */}
              {scrapNumeric > 0 && (
                <span className="rounded-md bg-rose-500/20 px-2 py-0.5 text-sm font-bold tabular-nums text-rose-400 border border-rose-500/40">
                  {scrapNumeric}
                </span>
              )}
            </button>

            {/* Collapsible content */}
            <div
              className={cn(
                "grid transition-all duration-300 ease-out",
                isScrapExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <div className="p-4 pt-0 space-y-4">
                  {/* Scrap quantity input - matching good input style but smaller */}
                  <div className="relative">
                    {/* Plus symbol on the LEFT (appears after the number in RTL) */}
                    {mode === "additional" && scrapInput && (
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[2rem] font-bold text-rose-400/60 pointer-events-none leading-none">
                        +
                      </span>
                    )}
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder={mode === "total" ? sessionTotals.scrap.toLocaleString() : "0"}
                      value={scrapInput}
                      onChange={(e) => handleScrapInputChange(e.target.value)}
                      style={{ fontSize: "2.5rem", lineHeight: "1" }}
                      className={cn(
                        "h-[4.5rem] text-center font-bold tabular-nums",
                        "border-2 bg-slate-800/50",
                        "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                        "placeholder:text-rose-400/40 placeholder:opacity-100",
                        // Add left padding when + is visible to avoid overlap
                        mode === "additional" && scrapInput && "pl-14",
                        isBelowMinScrap
                          ? "border-red-500 text-red-400 focus-visible:ring-red-500/50"
                          : "border-rose-500/50 text-rose-400 focus-visible:ring-rose-500/50"
                      )}
                    />
                  </div>

                  {/* Note textarea (required if scrap > 0) */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-rose-300">
                      תיאור הפסול {previewValues.additionalScrap > 0 && <span className="text-rose-500">*</span>}
                    </Label>
                    <Textarea
                      value={scrapNote}
                      onChange={(e) => setScrapNote(e.target.value)}
                      placeholder="תאר את סיבת הפסול..."
                      className={cn(
                        "border-rose-500/30 bg-slate-800/50 text-rose-100",
                        "placeholder:text-rose-300/50 min-h-20",
                        "focus-visible:ring-rose-500/50"
                      )}
                      rows={3}
                    />
                    {isScrapNoteRequired && (
                      <p className="text-xs text-rose-400">יש להזין תיאור כאשר מדווחים על פסול</p>
                    )}
                  </div>

                  {/* Image upload */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-rose-300">תמונה (אופציונלי)</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      className="border-rose-500/30 bg-slate-800/50 text-rose-100 file:bg-rose-500/20 file:text-rose-300 file:border-0"
                      onChange={(e) => handleScrapImageChange(e.target.files?.[0] ?? null)}
                    />
                    {scrapImagePreview && (
                      <div className="relative overflow-hidden rounded-lg border border-rose-500/30">
                        <Image
                          src={scrapImagePreview}
                          alt="Scrap preview"
                          width={800}
                          height={400}
                          className="h-32 w-full object-cover"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleScrapImageChange(null)}
                          className="absolute top-2 left-2 h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ============================================ */}
          {/* PROGRESS BAR - RTL + SLOW PULSE */}
          {/* ============================================ */}
          {plannedQuantity && (
            <div className="space-y-1.5 rounded-lg border border-slate-700 bg-slate-800/30 p-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">מצב עבודה</span>
                <span className="font-bold tabular-nums text-slate-300">
                  {previewValues.totalCompletedAfter.toLocaleString()} / {plannedQuantity.toLocaleString()}
                </span>
              </div>

              {/* Progress Bar - RTL: fills from RIGHT to LEFT */}
              <div className="relative h-5 overflow-hidden rounded-md border border-slate-600 bg-slate-900/50">
                {/* Previous progress (before input) - anchored to right */}
                <div
                  className="absolute inset-y-0 right-0 bg-gradient-to-l from-emerald-600 to-emerald-500 transition-all duration-300"
                  style={{
                    width: `${Math.min(100, ((totalCompletedBefore + sessionTotals.good) / plannedQuantity) * 100)}%`,
                  }}
                />
                {/* New contribution (live preview) - slower pulse animation */}
                {previewValues.additionalGood > 0 && (
                  <div
                    className="absolute inset-y-0 bg-gradient-to-l from-cyan-500 to-cyan-400 animate-pulse-slow transition-all duration-300"
                    style={{
                      right: `${Math.min(100, ((totalCompletedBefore + sessionTotals.good) / plannedQuantity) * 100)}%`,
                      width: `${Math.min(100 - ((totalCompletedBefore + sessionTotals.good) / plannedQuantity) * 100, (previewValues.additionalGood / plannedQuantity) * 100)}%`,
                    }}
                  />
                )}
                {/* Percentage overlay */}
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {Math.round(previewValues.progressPercent ?? 0)}%
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center justify-between text-[11px]">
                <span className={cn(
                  "font-semibold",
                  previewValues.isComplete ? "text-emerald-400" : "text-slate-400"
                )}>
                  נותר: {(previewValues.remaining ?? 0).toLocaleString()}
                </span>
                {previewValues.additionalGood > 0 && (
                  <span className="text-cyan-400 font-semibold">
                    +{previewValues.additionalGood.toLocaleString()}
                  </span>
                )}
                <span className="text-slate-500">
                  נוכחי: {(totalCompletedBefore + sessionTotals.good).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* ERROR MESSAGE */}
          {/* ============================================ */}
          {error && (
            <p className="text-sm font-semibold text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          {/* Submit button only - no cancel when required */}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isOverflow || isBelowMinGood || isBelowMinScrap || isScrapNoteRequired}
            className={cn(
              "w-full min-w-36 font-bold text-lg h-12",
              previewValues.isComplete
                ? "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400"
                : "bg-primary hover:bg-primary/90"
            )}
          >
            {isSubmitting
              ? "שומר..."
              : previewValues.isComplete
                ? "סגור פריט עבודה"
                : "עדכן כמות"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
