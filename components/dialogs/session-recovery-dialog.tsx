"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/hooks/useTranslation";

// ============================================
// HELPERS
// ============================================

const formatDuration = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((safeSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

// ============================================
// TYPES
// ============================================

export interface SessionRecoveryInfo {
  sessionId: string;
  sessionStartedAt: string;
  stationName?: string | null;
  jobNumber?: string | null;
}

export interface SessionRecoveryDialogProps {
  open: boolean;
  session: SessionRecoveryInfo | null;
  /** Grace period countdown in milliseconds */
  countdownMs: number;
  /** True while resume/discard action is in progress */
  isLoading?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Called when user wants to resume the session */
  onResume: () => void;
  /** Called when user wants to discard the session */
  onDiscard: () => void;
  /** Called when dialog is closed via backdrop click or escape */
  onClose?: () => void;
  /** When true, prevents closing via backdrop click, escape key, or close button */
  preventDismiss?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export function SessionRecoveryDialog({
  open,
  session,
  countdownMs,
  isLoading = false,
  error = null,
  onResume,
  onDiscard,
  onClose,
  preventDismiss = false,
}: SessionRecoveryDialogProps) {
  const { t } = useTranslation();

  // Compute countdown label
  const countdownLabel = useMemo(
    () => formatDuration(Math.ceil(Math.max(countdownMs, 0) / 1000)),
    [countdownMs]
  );

  // Compute elapsed time label based on countdown
  // countdownMs is updated every second so this will recalculate
  const elapsedLabel = useMemo(() => {
    if (!session?.sessionStartedAt) return "00:00:00";
    const sessionStartMs = new Date(session.sessionStartedAt).getTime();
    // Use countdown to calculate current time indirectly
    // This avoids calling Date.now() during render
    const graceEndMs = sessionStartMs + 5 * 60 * 1000; // 5 min grace period
    const currentTimeMs = graceEndMs - countdownMs;
    const elapsedMs = currentTimeMs - sessionStartMs;
    return formatDuration(Math.max(0, Math.floor(elapsedMs / 1000)));
  }, [session, countdownMs]);

  const handleOpenChange = (newOpen: boolean) => {
    // When preventDismiss is true, don't allow closing via onOpenChange
    if (preventDismiss && !newOpen) {
      return;
    }
    if (!newOpen && onClose) {
      onClose();
    }
  };

  if (!session) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        dir="rtl"
        className="border-border bg-card"
        hideCloseButton={preventDismiss}
        onPointerDownOutside={preventDismiss ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={preventDismiss ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {t("station.resume.title")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("station.resume.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-right">
          <Badge
            variant="secondary"
            className="w-full justify-center border-primary/30 bg-primary/10 py-2 text-primary"
          >
            {t("station.resume.countdown", { time: countdownLabel })}
          </Badge>

          <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
            <div>
              <p className="text-xs text-muted-foreground">
                {t("station.resume.station")}
              </p>
              <p className="text-base font-semibold text-foreground">
                {session.stationName ?? t("station.resume.stationFallback")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t("station.resume.job")}
              </p>
              <p className="text-base font-semibold text-foreground">
                {session.jobNumber ?? t("station.resume.jobFallback")}
              </p>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-input bg-secondary px-4 py-3 text-sm text-muted-foreground">
              <span>{t("station.resume.elapsed")}</span>
              <span className="font-semibold text-foreground">{elapsedLabel}</span>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-right text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-start">
          <Button
            type="button"
            variant="outline"
            onClick={onDiscard}
            disabled={isLoading}
            className="w-full justify-center border-input bg-secondary text-foreground/80 can-hover:hover:bg-accent can-hover:hover:text-foreground sm:w-auto"
          >
            {isLoading ? t("station.resume.discarding") : t("station.resume.discard")}
          </Button>
          <Button
            type="button"
            onClick={onResume}
            className="w-full justify-center bg-primary font-medium text-primary-foreground can-hover:hover:bg-primary/90 sm:w-auto"
            disabled={isLoading}
          >
            {t("station.resume.resume")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
