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

export type QuantityReportMode = "totalJob" | "total" | "additional";

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
    // Calculate additional good based on mode:
    // - totalJob: input is total for job, subtract what's already done (totalCompletedBefore + sessionTotals.good)
    // - total: input is total for session, subtract what's already done this session (sessionTotals.good)
    // - additional: input is direct additional amount
    let additionalGood: number;
    if (mode === "totalJob") {
      additionalGood = Math.max(0, goodNumeric - (totalCompletedBefore + sessionTotals.good));
    } else if (mode === "total") {
      additionalGood = Math.max(0, goodNumeric - sessionTotals.good);
    } else {
      additionalGood = goodNumeric;
    }

    // Same logic for scrap (but scrap is session-only for totalJob mode too, as job-level scrap isn't tracked the same way)
    let additionalScrap: number;
    if (mode === "totalJob" || mode === "total") {
      additionalScrap = Math.max(0, scrapNumeric - sessionTotals.scrap);
    } else {
      additionalScrap = scrapNumeric;
    }

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
    const currentJobTotal = totalCompletedBefore + sessionTotals.good;
    const maxAdditional = Math.max(0, plannedQuantity - currentJobTotal);

    if (mode === "totalJob") {
      // In totalJob mode, max is the planned quantity
      return plannedQuantity;
    } else if (mode === "total") {
      // In total session mode, max is current session + remaining
      return sessionTotals.good + maxAdditional;
    } else {
      // In additional mode, max is the remaining amount
      return maxAdditional;
    }
  }, [plannedQuantity, totalCompletedBefore, sessionTotals.good, mode]);

  // Check if current input exceeds max
  const isOverflow = maxAllowedGood !== undefined && goodNumeric > maxAllowedGood;

  // Calculate minimum allowed input (can't go backwards from what's already reported)
  const minAllowedGood = useMemo(() => {
    if (mode === "totalJob") {
      // In totalJob mode, min is the current total for the job (can't reduce)
      return totalCompletedBefore + sessionTotals.good;
    } else if (mode === "total") {
      // In total session mode, min is current session total
      return sessionTotals.good;
    } else {
      // In additional mode, min is 0
      return 0;
    }
  }, [mode, totalCompletedBefore, sessionTotals.good]);

  const minAllowedScrap = useMemo(() => {
    // Scrap is always session-based, so min is current session scrap for total modes
    if (mode === "totalJob" || mode === "total") {
      return sessionTotals.scrap;
    }
    return 0;
  }, [mode, sessionTotals.scrap]);

  // Check if input is below minimum
  const isBelowMinGood = goodInput !== "" && goodNumeric < minAllowedGood;
  const isBelowMinScrap = scrapInput !== "" && scrapNumeric < minAllowedScrap;

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

  // Calculate the value needed in the input box to complete the job item
  const fillToCompleteValue = useMemo(() => {
    if (!plannedQuantity) return 0;
    const currentJobTotal = totalCompletedBefore + sessionTotals.good;
    const remaining = Math.max(0, plannedQuantity - currentJobTotal);

    if (mode === "totalJob") {
      // In totalJob mode, input is total for job = planned quantity
      return plannedQuantity;
    } else if (mode === "total") {
      // In total session mode, input is session total = current + remaining
      return sessionTotals.good + remaining;
    } else {
      // In additional mode, input is the additional amount = remaining
      return remaining;
    }
  }, [plannedQuantity, totalCompletedBefore, sessionTotals.good, mode]);

  // Calculate the scrap value needed to fill remaining as scrap (mode-aware)
  const scrapFillValue = useMemo(() => {
    if (!plannedQuantity || previewValues.remaining === undefined) return 0;
    const scrapFill = previewValues.remaining;
    if (mode === "totalJob" || mode === "total") {
      return sessionTotals.scrap + scrapFill;
    }
    return scrapFill;
  }, [plannedQuantity, previewValues.remaining, mode, sessionTotals.scrap]);

  // Fill remaining to complete job item
  const handleFillRemaining = useCallback(() => {
    if (!plannedQuantity) return;
    setGoodInput(String(fillToCompleteValue));
    setError(null);
  }, [plannedQuantity, fillToCompleteValue]);

  // Fill scrap to complete job item (remaining as scrap)
  const handleFillScrapToComplete = useCallback(() => {
    if (!plannedQuantity || previewValues.remaining === undefined || previewValues.remaining <= 0) return;
    const scrapFill = previewValues.remaining;
    if (mode === "totalJob" || mode === "total") {
      setScrapInput(String(sessionTotals.scrap + scrapFill));
    } else {
      setScrapInput(String(scrapFill));
    }
    setIsScrapExpanded(true);
    setError(null);
  }, [plannedQuantity, previewValues.remaining, mode, sessionTotals.scrap]);

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

    // Validate input doesn't go below what's already reported
    if (isBelowMinGood) {
      const minLabel = mode === "totalJob" ? "סה״כ לפק״ע" : "סה״כ למשמרת";
      setError(`לא ניתן לדווח ${minLabel} פחות מ-${minAllowedGood} (כבר דווח)`);
      return;
    }
    if (isBelowMinScrap) {
      setError(`לא ניתן לדווח סה״כ פסול פחות מ-${minAllowedScrap} (כבר דווח)`);
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
  }, [isOverflow, maxAllowedGood, isBelowMinGood, isBelowMinScrap, minAllowedGood, minAllowedScrap, mode, previewValues, scrapNote, scrapImage, onSubmit]);

  const handleDialogChange = useCallback((isOpen: boolean) => {
    if (!isOpen && !required) {
      onCancel();
    }
  }, [required, onCancel]);

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent
        hideCloseButton={required}
        className="max-w-lg border-2 border-border bg-card text-right"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">
            דיווח כמויות
          </DialogTitle>
          {jobItemName ? (
            <DialogDescription className="text-muted-foreground">
              מוצר: <span className="font-semibold text-foreground">{jobItemName}</span>
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ============================================ */}
          {/* TAB-STYLE MODE TOGGLE (3 tabs) */}
          {/* RTL layout: first DOM element appears on RIGHT */}
          {/* Visual order (right to left): totalJob, total, additional */}
          {/* ============================================ */}
          <div className="relative flex rounded-xl border-2 border-border bg-muted/50 p-1">
            {/* Sliding background indicator - positions for 3 tabs */}
            {/* In RTL flex: first item is at right-1, second at 33.333%, third at left-1 */}
            <div
              className={cn(
                "absolute top-1 bottom-1 w-[calc(33.333%-3px)] rounded-lg bg-cyan-500/30 border border-cyan-500/50 transition-all duration-300 ease-out",
                mode === "totalJob" && "right-1",
                mode === "total" && "left-[calc(33.333%+1px)] right-[calc(33.333%+1px)]",
                mode === "additional" && "left-1"
              )}
              style={mode === "total" ? { left: "calc(33.333% + 2px)", right: "calc(33.333% + 2px)" } : undefined}
            />

            {/* DOM order: totalJob (first=right), total (middle), additional (last=left) */}

            {/* Total per Job Tab (rightmost in visual RTL) */}
            <button
              type="button"
              onClick={() => handleModeChange("totalJob")}
              className={cn(
                "relative flex-1 py-2.5 rounded-lg font-bold text-sm transition-colors z-10",
                mode === "totalJob"
                  ? "text-cyan-300"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              סה״כ לפק״ע
            </button>

            {/* Total per Session Tab (middle) */}
            <button
              type="button"
              onClick={() => handleModeChange("total")}
              className={cn(
                "relative flex-1 py-2.5 rounded-lg font-bold text-sm transition-colors z-10",
                mode === "total"
                  ? "text-cyan-300"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              סה״כ למשמרת
            </button>

            {/* Additional Tab (leftmost in visual RTL) */}
            <button
              type="button"
              onClick={() => handleModeChange("additional")}
              className={cn(
                "relative flex-1 py-2.5 rounded-lg font-bold text-sm transition-colors z-10",
                mode === "additional"
                  ? "text-cyan-300"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              כמות נוספת
            </button>
          </div>

          {/* ============================================ */}
          {/* GOOD QUANTITY - IMPROVED LAYOUT */}
          {/* ============================================ */}
          <div className="space-y-3">
            {/* Header row with label and total required */}
            <div className="flex items-center justify-between">
              <Label className="text-lg font-bold text-emerald-400">
                {mode === "totalJob" && "סה״כ לפק״ע"}
                {mode === "total" && "סה״כ למשמרת"}
                {mode === "additional" && "כמות נוספת"}
              </Label>
              {plannedQuantity && (
                <span className="text-sm text-muted-foreground">
                  נדרש סהכ: <span className="font-bold text-emerald-400">{plannedQuantity.toLocaleString()}</span>
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
              {/* Plus symbol on the LEFT (appears after the number in RTL) - always visible in additive mode */}
              {mode === "additional" && (
                <span className={cn(
                  "absolute left-4 top-1/2 -translate-y-1/2 text-[3rem] font-bold pointer-events-none leading-none transition-colors",
                  goodInput ? "text-emerald-400/60" : "text-muted-foreground"
                )}>
                  +
                </span>
              )}
              <Input
                type="number"
                inputMode="numeric"
                min={minAllowedGood}
                max={maxAllowedGood}
                placeholder={
                  mode === "totalJob"
                    ? currentReportedTotal.toLocaleString()
                    : mode === "total"
                      ? sessionTotals.good.toLocaleString()
                      : "0"
                }
                value={goodInput}
                onChange={(e) => handleGoodInputChange(e.target.value)}
                onFocus={(e) => {
                  // In total modes, select all on focus so user can replace
                  if (mode === "totalJob" || mode === "total") e.target.select();
                }}
                style={{ fontSize: "3.5rem", lineHeight: "1", height: "7rem" }}
                className={cn(
                  "!h-28 text-center font-bold tabular-nums !py-4",
                  "border-2 bg-card/50",
                  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                  "placeholder:text-muted-foreground placeholder:opacity-100",
                  isOverflow || isBelowMinGood
                    ? "border-red-500 text-red-400 focus-visible:ring-red-500/50"
                    : "border-emerald-500/50 text-emerald-400 focus-visible:ring-emerald-500/50"
                )}
              />
            </div>

            {/* Fill to complete - shows the value needed in input box to complete job item */}
            {plannedQuantity && previewValues.remaining !== undefined && previewValues.remaining > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleFillRemaining}
                className="w-full h-10 border-2 border-emerald-500/60 bg-emerald-500/10 text-emerald-300 font-bold text-base hover:bg-emerald-500/20 hover:border-emerald-400"
              >
                {`השלם לסגירת הפק"ע (${fillToCompleteValue.toLocaleString()})`}
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
                  {mode === "totalJob" && "סה״כ פסול למשמרת"}
                  {mode === "total" && "סה״כ פסול למשמרת"}
                  {mode === "additional" && "פסול נוסף"}
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
                    {/* Plus symbol on the LEFT (appears after the number in RTL) - always visible in additive mode */}
                    {mode === "additional" && (
                      <span className={cn(
                        "absolute left-4 top-1/2 -translate-y-1/2 text-[2rem] font-bold pointer-events-none leading-none transition-colors",
                        scrapInput ? "text-rose-400/60" : "text-muted-foreground"
                      )}>
                        +
                      </span>
                    )}
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={minAllowedScrap}
                      placeholder={
                        mode === "totalJob" || mode === "total"
                          ? sessionTotals.scrap.toLocaleString()
                          : "0"
                      }
                      value={scrapInput}
                      onChange={(e) => handleScrapInputChange(e.target.value)}
                      onFocus={(e) => {
                        // In total modes, select all on focus so user can replace
                        if (mode === "totalJob" || mode === "total") e.target.select();
                      }}
                      style={{ fontSize: "2.5rem", lineHeight: "1" }}
                      className={cn(
                        "h-[4.5rem] text-center font-bold tabular-nums",
                        "border-2 bg-card/50",
                        "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                        "placeholder:text-rose-400/40 placeholder:opacity-100",
                        isBelowMinScrap
                          ? "border-red-500 text-red-400 focus-visible:ring-red-500/50"
                          : "border-rose-500/50 text-rose-400 focus-visible:ring-rose-500/50"
                      )}
                    />
                  </div>

                  {/* Fill scrap to complete job item */}
                  {plannedQuantity && previewValues.remaining !== undefined && previewValues.remaining > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleFillScrapToComplete}
                      className="w-full h-10 border-2 border-rose-500/60 bg-rose-500/10 text-rose-300 font-bold text-base hover:bg-rose-500/20 hover:border-rose-400"
                    >
                      {`השלם כמות פסולים לסגירת פק"ע (${scrapFillValue.toLocaleString()})`}
                    </Button>
                  )}

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
                        "border-rose-500/30 bg-card/50 text-rose-100",
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
                      className="border-rose-500/30 bg-card/50 text-rose-100 file:bg-rose-500/20 file:text-rose-300 file:border-0"
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
            <div className="space-y-1.5 rounded-lg border border-border bg-card/80 p-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">מצב עבודה</span>
                <span className="font-bold tabular-nums text-foreground">
                  {previewValues.totalCompletedAfter.toLocaleString()} / {plannedQuantity.toLocaleString()}
                </span>
              </div>

              {/* Progress Bar - RTL: fills from RIGHT to LEFT */}
              <div className="relative h-5 overflow-hidden rounded-md border border-border bg-muted/50">
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
                  previewValues.isComplete ? "text-emerald-400" : "text-muted-foreground"
                )}>
                  נותר: {(previewValues.remaining ?? 0).toLocaleString()}
                </span>
                {previewValues.additionalGood > 0 && (
                  <span className="text-cyan-400 font-semibold">
                    +{previewValues.additionalGood.toLocaleString()}
                  </span>
                )}
                <span className="text-muted-foreground/70">
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
