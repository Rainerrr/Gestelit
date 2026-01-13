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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
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
};

export type QuantityReportDialogProps = {
  /** Whether the dialog is open */
  open: boolean;
  /** Current session totals (for "total" mode calculations) */
  sessionTotals: {
    good: number;
    scrap: number;
  };
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

export function QuantityReportDialog({
  open,
  sessionTotals,
  onSubmit,
  onCancel,
  required = false,
  isSubmitting = false,
  jobItemName,
}: QuantityReportDialogProps) {
  const { t } = useTranslation();

  // State
  const [mode, setMode] = useState<QuantityReportMode>("additional");
  const [goodInput, setGoodInput] = useState("");
  const [scrapInput, setScrapInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setMode("additional");
      setGoodInput("");
      setScrapInput("");
      setError(null);
    }
  }, [open]);

  // Handlers
  const handleModeChange = useCallback((newMode: string) => {
    setMode(newMode as QuantityReportMode);
    // Clear inputs when switching modes
    setGoodInput("");
    setScrapInput("");
    setError(null);
  }, []);

  const handleSubmit = useCallback(() => {
    const goodValue = goodInput === "" ? 0 : parseInt(goodInput, 10);
    const scrapValue = scrapInput === "" ? 0 : parseInt(scrapInput, 10);

    // Validate inputs
    if (isNaN(goodValue) || isNaN(scrapValue)) {
      setError("יש להזין מספרים חוקיים");
      return;
    }

    if (goodValue < 0 || scrapValue < 0) {
      setError("הכמויות חייבות להיות חיוביות");
      return;
    }

    let additionalGood: number;
    let additionalScrap: number;

    if (mode === "total") {
      // In total mode, calculate the additional from the difference
      additionalGood = goodValue - sessionTotals.good;
      additionalScrap = scrapValue - sessionTotals.scrap;

      // Validate that totals aren't less than current session totals
      if (additionalGood < 0) {
        setError(`סהכ תקין לא יכול להיות קטן מ-${sessionTotals.good}`);
        return;
      }
      if (additionalScrap < 0) {
        setError(`סהכ פסול לא יכול להיות קטן מ-${sessionTotals.scrap}`);
        return;
      }
    } else {
      // Additional mode - use values as-is
      additionalGood = goodValue;
      additionalScrap = scrapValue;
    }

    onSubmit({ additionalGood, additionalScrap });
  }, [mode, goodInput, scrapInput, sessionTotals, onSubmit]);

  const handleDialogChange = useCallback((isOpen: boolean) => {
    if (!isOpen && !required) {
      onCancel();
    }
  }, [required, onCancel]);

  // Computed values for display
  const goodNumeric = goodInput === "" ? 0 : parseInt(goodInput, 10) || 0;
  const scrapNumeric = scrapInput === "" ? 0 : parseInt(scrapInput, 10) || 0;

  const previewAdditionalGood = mode === "total"
    ? Math.max(0, goodNumeric - sessionTotals.good)
    : goodNumeric;
  const previewAdditionalScrap = mode === "total"
    ? Math.max(0, scrapNumeric - sessionTotals.scrap)
    : scrapNumeric;
  const previewNewTotalGood = mode === "total"
    ? goodNumeric
    : sessionTotals.good + goodNumeric;
  const previewNewTotalScrap = mode === "total"
    ? scrapNumeric
    : sessionTotals.scrap + scrapNumeric;

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-md text-right">
        <DialogHeader>
          <DialogTitle>דיווח כמויות</DialogTitle>
          <DialogDescription>
            {jobItemName
              ? `דווח על כמויות שיוצרו עבור: ${jobItemName}`
              : "דווח על כמויות שיוצרו במהלך פרק הייצור הזה"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Mode Selection */}
          <div className="space-y-3">
            <Label>שיטת דיווח</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "flex-1",
                  mode === "additional" && "border-primary bg-primary/10 text-primary"
                )}
                onClick={() => handleModeChange("additional")}
              >
                כמות נוספת
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "flex-1",
                  mode === "total" && "border-primary bg-primary/10 text-primary"
                )}
                onClick={() => handleModeChange("total")}
              >
                סהכ עד עכשיו
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "additional"
                ? "הזן את הכמות שיצרת בפרק זמן הייצור האחרון"
                : "הזן את הסהכ הכולל עד כה (המערכת תחשב את ההפרש)"}
            </p>
          </div>

          {/* Current Session Totals */}
          <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
            <div className="text-xs text-muted-foreground mb-2">סהכ נוכחי במשמרת:</div>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-xs text-muted-foreground">תקין</div>
                <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {sessionTotals.good}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">פסול</div>
                <div className="font-semibold text-amber-600 dark:text-amber-400">
                  {sessionTotals.scrap}
                </div>
              </div>
            </div>
          </div>

          {/* Quantity Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="good-input">
                {mode === "additional" ? "תקין נוסף" : "סהכ תקין"}
              </Label>
              <Input
                id="good-input"
                type="number"
                min="0"
                placeholder={mode === "total" ? String(sessionTotals.good) : "0"}
                value={goodInput}
                onChange={(e) => setGoodInput(e.target.value)}
                className="text-center text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scrap-input">
                {mode === "additional" ? "פסול נוסף" : "סהכ פסול"}
              </Label>
              <Input
                id="scrap-input"
                type="number"
                min="0"
                placeholder={mode === "total" ? String(sessionTotals.scrap) : "0"}
                value={scrapInput}
                onChange={(e) => setScrapInput(e.target.value)}
                className="text-center text-lg"
              />
            </div>
          </div>

          {/* Preview Calculation */}
          {(goodInput !== "" || scrapInput !== "") ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800/50 dark:bg-blue-900/20">
              <div className="text-xs text-blue-600 dark:text-blue-400 mb-2">תצוגה מקדימה:</div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">נוסף עכשיו</div>
                  <div className="font-semibold">
                    +{previewAdditionalGood} / +{previewAdditionalScrap}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">סהכ חדש</div>
                  <div className="font-semibold">
                    {previewNewTotalGood} / {previewNewTotalScrap}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Error Message */}
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {!required ? (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </Button>
          ) : null}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="min-w-32"
          >
            {isSubmitting ? "שומר..." : "אישור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
