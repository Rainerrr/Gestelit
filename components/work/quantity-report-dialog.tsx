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
  /** Total completed scrap (all sessions combined, before this session's contribution) */
  totalCompletedScrapBefore?: number;
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
 * 4-segment progress bar preview matching the DualProgressBar standard:
 * Prior Scrap (dark rose) | Session Scrap (light rose) | Prior Good (dark emerald) | Session Good (cyan) + 100% tick
 */
const QuantityReportProgressPreview = ({
  plannedQuantity,
  totalCompletedBefore,
  totalCompletedScrapBefore,
  sessionTotals,
  previewValues,
}: {
  plannedQuantity: number;
  totalCompletedBefore: number;
  totalCompletedScrapBefore: number;
  sessionTotals: { good: number; scrap: number };
  previewValues: {
    additionalGood: number;
    additionalScrap: number;
    totalCompletedAfter: number;
    totalGoodAfter: number;
    totalScrapAfter: number;
    remaining?: number;
    progressPercent?: number;
    isComplete: boolean;
  };
}) => {
  const safePlanned = Math.max(1, plannedQuantity);

  // Calculate all 4 segments
  const priorGood = totalCompletedBefore;
  const sessionGood = sessionTotals.good + previewValues.additionalGood;
  const priorScrap = totalCompletedScrapBefore;
  const sessionScrap = sessionTotals.scrap + previewValues.additionalScrap;

  // Raw percentages
  const rawPriorGood = (priorGood / safePlanned) * 100;
  const rawSessionGood = (sessionGood / safePlanned) * 100;
  const rawPriorScrap = (priorScrap / safePlanned) * 100;
  const rawSessionScrap = (sessionScrap / safePlanned) * 100;
  const rawTotal = rawPriorGood + rawSessionGood + rawPriorScrap + rawSessionScrap;

  const isOverflow = rawTotal > 100;
  const scale = isOverflow ? 100 / rawTotal : 1;

  const priorGoodPct = rawPriorGood * scale;
  const sessionGoodPct = rawSessionGood * scale;
  const priorScrapPct = rawPriorScrap * scale;
  const sessionScrapPct = rawSessionScrap * scale;

  const minW = (pct: number) => (pct > 0 ? Math.max(pct, 0.5) : 0);

  // Cumulative offsets from right for RTL positioning
  const pGoodW = minW(priorGoodPct);
  const sGoodW = minW(sessionGoodPct);
  const pScrapW = minW(priorScrapPct);
  const sScrapW = minW(sessionScrapPct);

  const sGoodRight = pGoodW;
  const pScrapRight = pGoodW + sGoodW;
  const sScrapRight = pGoodW + sGoodW + pScrapW;

  // 100% tick position for overflow
  const tickPosition = isOverflow ? (100 / rawTotal) * 100 : 100;

  // Before values (current state before this report)
  const beforeGood = totalCompletedBefore + sessionTotals.good;
  const beforeScrap = totalCompletedScrapBefore + sessionTotals.scrap;

  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-card/80 p-2">
      {/* Header: label + overflow badge */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">מצב עבודה</span>
          {isOverflow && (
            <span className="text-[9px] font-bold bg-amber-500/90 text-amber-950 px-1.5 py-0.5 rounded">
              ייצור עודף
            </span>
          )}
        </div>
        <span dir="ltr" className="font-bold tabular-nums text-foreground">
          {(previewValues.totalGoodAfter + previewValues.totalScrapAfter).toLocaleString()} / {plannedQuantity.toLocaleString()}
        </span>
      </div>

      {/* Progress Bar - 4 segments */}
      <div className="relative">
        <div className="relative h-5 overflow-hidden rounded-md border border-border bg-muted/50">
          {/* Prior Good - dark emerald - anchored to right */}
          {priorGoodPct > 0 && (
            <div
              className="absolute inset-y-0 right-0 bg-emerald-600 transition-all duration-300"
              style={{ width: `${pGoodW}%` }}
            />
          )}

          {/* Session Good - light emerald with pulse */}
          {sessionGoodPct > 0 && (
            <div
              className="absolute inset-y-0 bg-emerald-400 shadow-[inset_0_0_8px_rgba(255,255,255,0.2)] animate-pulse-slow"
              style={{ right: `${sGoodRight}%`, width: `${sGoodW}%`, transition: "width 300ms, right 300ms" }}
            />
          )}

          {/* Prior Scrap - dark rose */}
          {priorScrapPct > 0 && (
            <div
              className="absolute inset-y-0 bg-rose-700"
              style={{ right: `${pScrapRight}%`, width: `${pScrapW}%`, transition: "width 300ms, right 300ms" }}
            />
          )}

          {/* Session Scrap - lighter rose */}
          {sessionScrapPct > 0 && (
            <div
              className="absolute inset-y-0 bg-rose-400 animate-pulse-slow"
              style={{ right: `${sScrapRight}%`, width: `${sScrapW}%`, transition: "width 300ms, right 300ms" }}
            />
          )}

          {/* 100% tick mark for overflow */}
          {isOverflow && (
            <div
              className="absolute inset-y-0 z-20 w-[3px] bg-amber-400"
              style={{ right: `${tickPosition}%`, transform: "translateX(50%)" }}
            />
          )}

          {/* Units overlay */}
          <div dir="ltr" className="absolute inset-0 flex items-center justify-center text-xs font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] text-white tabular-nums">
            {(previewValues.totalGoodAfter + previewValues.totalScrapAfter).toLocaleString()} / {plannedQuantity.toLocaleString()}
          </div>
        </div>

        {/* 100% tick below bar */}
        <div className="relative w-full h-4">
          <div
            className="absolute top-0 flex flex-col items-center"
            style={isOverflow
              ? { right: `${tickPosition}%`, transform: "translateX(50%)" }
              : { left: 0, transform: "translateX(-50%)" }
            }
          >
            <div className={cn("h-1.5", isOverflow ? "w-[2px] bg-amber-400" : "w-[2px] bg-amber-500/70")} />
            <span className={cn("text-[9px] font-mono font-semibold leading-none", isOverflow ? "text-amber-400" : "text-amber-500/80")}>
              100%
            </span>
          </div>
        </div>
      </div>

      {/* Before / After row — dashboard format: good +scrap / planned */}
      <div className="flex items-center justify-between text-[11px]">
        {/* Before */}
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">לפני:</span>
          <div dir="ltr" className="flex items-baseline gap-1 tabular-nums">
            <span className="font-semibold text-foreground">{beforeGood.toLocaleString()}</span>
            {beforeScrap > 0 && (
              <span className="text-rose-400 font-semibold">+{beforeScrap.toLocaleString()}</span>
            )}
            <span className="text-muted-foreground/70">/</span>
            <span className="text-muted-foreground/70">{plannedQuantity.toLocaleString()}</span>
          </div>
        </div>

        {/* After */}
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">אחרי:</span>
          <div dir="ltr" className="flex items-baseline gap-1 tabular-nums">
            <span className={cn("font-bold", previewValues.isComplete ? "text-emerald-400" : "text-foreground")}>
              {previewValues.totalGoodAfter.toLocaleString()}
            </span>
            {previewValues.totalScrapAfter > 0 && (
              <span className="text-rose-400 font-bold">+{previewValues.totalScrapAfter.toLocaleString()}</span>
            )}
            <span className="text-muted-foreground/70">/</span>
            <span className="text-muted-foreground/70">{plannedQuantity.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  totalCompletedScrapBefore = 0,
  onSubmit,
  onCancel,
  required = false,
  isSubmitting = false,
  jobItemName,
}: QuantityReportDialogProps) {
  // Mode is fixed to "additional" (legacy modes "total"/"totalJob" kept in QuantityReportMode type)
  const mode: QuantityReportMode = "additional";
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

  // Calculate preview values (additional mode: input is direct additional amount)
  const previewValues = useMemo(() => {
    const additionalGood = goodNumeric;
    const additionalScrap = scrapNumeric;

    // Total completed after this report (including this session's contribution)
    const totalGoodAfter = totalCompletedBefore + sessionTotals.good + additionalGood;
    const totalScrapAfter = totalCompletedScrapBefore + sessionTotals.scrap + additionalScrap;
    const totalCompletedAfter = totalGoodAfter + totalScrapAfter;

    // Remaining after this report (good + scrap count toward completion)
    const remaining = plannedQuantity
      ? Math.max(0, plannedQuantity - totalCompletedAfter)
      : undefined;

    // Progress percentage (allow >100% for overproduction)
    const progressPercent = plannedQuantity && plannedQuantity > 0
      ? (totalCompletedAfter / plannedQuantity) * 100
      : undefined;

    return {
      additionalGood,
      additionalScrap,
      totalCompletedAfter,
      totalGoodAfter,
      totalScrapAfter,
      remaining,
      progressPercent,
      isComplete: remaining === 0,
    };
  }, [goodNumeric, scrapNumeric, sessionTotals, plannedQuantity, totalCompletedBefore, totalCompletedScrapBefore]);

  // Overproduction is now allowed - no cap on good input

  // Check if scrap note is required but missing
  const isScrapNoteRequired = previewValues.additionalScrap > 0 && !scrapNote.trim();

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
    const totalDone = totalCompletedBefore + totalCompletedScrapBefore + sessionTotals.good + sessionTotals.scrap;
    return Math.max(0, plannedQuantity - totalDone);
  }, [plannedQuantity, totalCompletedBefore, totalCompletedScrapBefore, sessionTotals.good, sessionTotals.scrap]);

  // Calculate the scrap value needed to fill remaining as scrap
  const scrapFillValue = useMemo(() => {
    if (!plannedQuantity || previewValues.remaining === undefined) return 0;
    return previewValues.remaining;
  }, [plannedQuantity, previewValues.remaining]);

  // Fill remaining to complete job item
  const handleFillRemaining = useCallback(() => {
    if (!plannedQuantity) return;
    setGoodInput(String(fillToCompleteValue));
    setError(null);
  }, [plannedQuantity, fillToCompleteValue]);

  // Fill scrap to complete job item (remaining as scrap)
  const handleFillScrapToComplete = useCallback(() => {
    if (!plannedQuantity || previewValues.remaining === undefined || previewValues.remaining <= 0) return;
    setScrapInput(String(previewValues.remaining));
    setIsScrapExpanded(true);
    setError(null);
  }, [plannedQuantity, previewValues.remaining]);

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
  }, [previewValues, scrapNote, scrapImage, onSubmit]);

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

        {/* ============================================ */}
        {/* PROGRESS BAR - TOP OF DIALOG */}
        {/* ============================================ */}
        {plannedQuantity && (
          <QuantityReportProgressPreview
            plannedQuantity={plannedQuantity}
            totalCompletedBefore={totalCompletedBefore}
            totalCompletedScrapBefore={totalCompletedScrapBefore}
            sessionTotals={sessionTotals}
            previewValues={previewValues}
          />
        )}

        <div className="space-y-4 py-2">
          {/* ============================================ */}
          {/* GOOD QUANTITY */}
          {/* ============================================ */}
          <div className="space-y-3">
            {/* Header row with label and total required */}
            <div className="flex items-center justify-between">
              <Label className="text-lg font-bold text-emerald-400">
                כמות נוספת
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

            {/* Large input with + on LEFT side (RTL) */}
            <div className="relative">
              <span className={cn(
                "absolute left-4 top-1/2 -translate-y-1/2 text-[3rem] font-bold pointer-events-none leading-none transition-colors",
                goodInput ? "text-emerald-400/60" : "text-muted-foreground"
              )}>
                +
              </span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="0"
                value={goodInput}
                onChange={(e) => handleGoodInputChange(e.target.value)}
                style={{ fontSize: "3.5rem", lineHeight: "1", height: "7rem" }}
                className={cn(
                  "!h-28 text-center font-bold tabular-nums !py-4",
                  "border-2 bg-card/50",
                  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                  "placeholder:text-muted-foreground placeholder:opacity-100",
                  "border-emerald-500/50 text-emerald-400 focus-visible:ring-emerald-500/50"
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
                  פסול נוסף
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
                  {/* Scrap quantity input */}
                  <div className="relative">
                    <span className={cn(
                      "absolute left-4 top-1/2 -translate-y-1/2 text-[2rem] font-bold pointer-events-none leading-none transition-colors",
                      scrapInput ? "text-rose-400/60" : "text-muted-foreground"
                    )}>
                      +
                    </span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      value={scrapInput}
                      onChange={(e) => handleScrapInputChange(e.target.value)}
                      style={{ fontSize: "2.5rem", lineHeight: "1" }}
                      className={cn(
                        "h-[4.5rem] text-center font-bold tabular-nums",
                        "border-2 bg-card/50",
                        "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                        "placeholder:text-rose-400/40 placeholder:opacity-100",
                        "border-rose-500/50 text-rose-400 focus-visible:ring-rose-500/50"
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
            disabled={isSubmitting || isScrapNoteRequired}
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
