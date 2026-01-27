"use client";

import { FormEvent, useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { ChecklistItemsList } from "@/components/checklists/checklist-items";
import { FormSection } from "@/components/forms/form-section";
import { PageHeader } from "@/components/layout/page-header";
import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkerSession } from "@/contexts/WorkerSessionContext";
import {
  abandonSessionApi,
  fetchChecklistApi,
} from "@/lib/api/client";
import { clearPersistedSessionState } from "@/lib/utils/session-storage";
import type { SessionAbandonReason, StationChecklist, StationChecklistItem } from "@/lib/types";
import {
  SessionRecoveryDialog,
  type SessionRecoveryInfo,
} from "@/components/dialogs/session-recovery-dialog";

export default function OpeningChecklistPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const {
    worker,
    station,
    pendingStation,
    job,
    sessionId,
    sessionStartedAt,
    checklist: checklistState,
    hasActiveSession,
    completeChecklist,
    reset,
    setWorker,
  } = useWorkerSession();

  // Station to use: either from active session or pending (new flow)
  const effectiveStation = station ?? pendingStation;

  const [responses, setResponses] = useState<Record<string, boolean>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Recovery dialog state for back-navigation detection
  const [resumeCountdownMs, setResumeCountdownMs] = useState(0);
  const [resumeActionLoading, setResumeActionLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  // Detect back-navigation: user already completed start checklist and is back on this page
  // This means they navigated backward from /work
  const isBackNavigationRecovery = hasActiveSession && checklistState.startCompleted;

  // Compute grace expiry for back-navigation scenario (5 minutes from now)
  const backNavGraceExpiresAt = useMemo(() => {
    if (!isBackNavigationRecovery) return null;
    return new Date(Date.now() + 5 * 60 * 1000).toISOString();
  }, [isBackNavigationRecovery]);

  // Create recovery info for back-navigation scenario
  const recoveryInfo: SessionRecoveryInfo | null = useMemo(() => {
    if (!isBackNavigationRecovery || !sessionId) return null;
    return {
      sessionId,
      sessionStartedAt: sessionStartedAt ?? new Date().toISOString(),
      stationName: station?.name ?? null,
      jobNumber: job?.job_number ?? null,
    };
  }, [isBackNavigationRecovery, sessionId, sessionStartedAt, station?.name, job?.job_number]);

  type ChecklistState = {
    loading: boolean;
    checklist: StationChecklist | null;
  };

  const [state, dispatch] = useReducer(
    (
      prev: ChecklistState,
      action:
        | { type: "start" }
        | { type: "resolve"; payload: StationChecklist | null },
    ) => {
      switch (action.type) {
        case "start":
          return { ...prev, loading: true };
        case "resolve":
          return { loading: false, checklist: action.payload };
        default:
          return prev;
      }
    },
    { loading: true, checklist: null },
  );

  useEffect(() => {
    if (!worker) {
      router.replace("/login");
      return;
    }
    // Need either station (from existing session) or pendingStation (new flow)
    if (worker && !effectiveStation) {
      router.replace("/station");
      return;
    }
    // Job is now optional - bound when entering production status
  }, [worker, effectiveStation, router]);

  useEffect(() => {
    if (!effectiveStation) {
      return;
    }
    let active = true;
    dispatch({ type: "start" });
    fetchChecklistApi(effectiveStation.id, "start")
      .then((result) => {
        if (!active) return;
        dispatch({ type: "resolve", payload: result });
      })
      .catch(() => {
        if (!active) return;
        dispatch({ type: "resolve", payload: null });
      });
    return () => {
      active = false;
    };
  }, [effectiveStation]);

  // ===== Recovery Handlers =====
  // Define handlers before the countdown effect that uses them
  const handleDiscardSession = useCallback(
    async (reason: SessionAbandonReason = "worker_choice") => {
      if (!sessionId) return;

      setResumeActionLoading(true);
      setResumeError(null);

      try {
        await abandonSessionApi(sessionId, reason);
        clearPersistedSessionState();

        // Reset session state but keep worker
        const currentWorker = worker;
        reset();
        if (currentWorker) {
          setWorker(currentWorker);
        }
        // Navigate to station selection for a fresh start
        router.push("/station");
      } catch {
        setResumeError(t("station.resume.error"));
      } finally {
        setResumeActionLoading(false);
      }
    },
    [sessionId, worker, reset, setWorker, router, t]
  );

  // ===== Recovery Countdown =====
  // Track if countdown has expired to trigger discard outside the interval callback
  const [countdownExpired, setCountdownExpired] = useState(false);

  useEffect(() => {
    if (!backNavGraceExpiresAt) {
      setResumeCountdownMs(0);
      setCountdownExpired(false);
      return;
    }

    const updateCountdown = () => {
      const nextDiff = new Date(backNavGraceExpiresAt).getTime() - Date.now();
      setResumeCountdownMs(Math.max(0, nextDiff));

      // Mark as expired when timer reaches zero
      if (nextDiff <= 0) {
        setCountdownExpired(true);
      }
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1_000);
    return () => window.clearInterval(intervalId);
  }, [backNavGraceExpiresAt]);

  // Auto-discard when countdown expires
  useEffect(() => {
    if (countdownExpired) {
      void handleDiscardSession("expired");
    }
  }, [countdownExpired, handleDiscardSession]);

  const handleResumeSession = useCallback(() => {
    // Just navigate back to /work - context already has session data
    setResumeError(null);
    router.push("/work");
  }, [router]);

  // Guard: need worker and either active station or pending station
  // sessionId is NOT required in new flow (deferred session creation)
  if (!worker || !effectiveStation) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Spinner size="lg" label={t("common.loading")} />
      </div>
    );
  }

  const checklist = state.checklist;
  const totalItems = checklist?.items.length ?? 0;
  const requiredItems =
    checklist?.items.filter((item) => item.is_required).length ?? 0;

  const toggleItem = (itemId: string, value: boolean) => {
    setResponses((prev) => ({ ...prev, [itemId]: value }));
  };

  const getLabel = (item: StationChecklistItem) =>
    language === "he" ? item.label_he : item.label_ru;

  const isValid =
    checklist?.items.every(
      (item) => !item.is_required || responses[item.id],
    ) ?? false;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) {
      return;
    }
    setSubmitError(null);

    // In the new flow, session doesn't exist yet (created on work page).
    // We store the checklist responses locally and submit them when the session is created.
    // For now, just mark checklist as completed and navigate to work page.
    // The work page will create the session and handle the initial status event.

    // Store checklist responses in sessionStorage for submission after session creation
    const payload = Object.entries(responses).map(
      ([item_id, value_bool]) => ({
        item_id,
        value_bool,
      }),
    );
    try {
      sessionStorage.setItem(
        "pendingChecklistResponses",
        JSON.stringify(payload)
      );
    } catch {
      // Ignore storage errors - checklist is optional
    }

    completeChecklist("start");
    router.push("/work");
  };

  return (
    <>
      <BackButton href="/station" />
      <PageHeader
        eyebrow={effectiveStation.name}
        title={t("checklist.start.title")}
        subtitle={t("checklist.start.subtitle")}
      />
      <form
        onSubmit={handleSubmit}
        className={`max-w-3xl ${isBackNavigationRecovery ? "pointer-events-none opacity-50" : ""}`}
      >
        <FormSection
          title={t("checklist.start.title")}
          description={t("checklist.required")}
          footer={
            <Button
              type="submit"
              size="lg"
              className="min-w-48 bg-primary font-medium text-primary-foreground hover:bg-primary/90"
              disabled={!isValid || isBackNavigationRecovery}
            >
              {t("checklist.submit")}
            </Button>
          }
        >
          {state.loading ? (
            <div className="flex justify-center py-8">
              <Spinner size="md" label={t("checklist.loading")} />
            </div>
          ) : !checklist ? (
            <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-right text-sm text-muted-foreground">
              {t("checklist.empty")}
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap justify-end gap-3 text-xs text-muted-foreground">
                <Badge variant="secondary" className="border-border bg-secondary text-foreground/80">
                  {`${requiredItems}/${totalItems} ${t("checklist.item.required")}`}
                </Badge>
              </div>
              <ChecklistItemsList
                items={checklist.items}
                responses={responses}
                onToggle={toggleItem}
                getLabel={getLabel}
                requiredLabel={t("checklist.item.required")}
              />
            </>
          )}
        </FormSection>
        {submitError ? (
          <p className="mt-4 text-right text-sm text-rose-600 dark:text-rose-400">{submitError}</p>
        ) : null}
      </form>

      {/* Recovery Dialog for back-navigation - non-dismissable */}
      <SessionRecoveryDialog
        open={isBackNavigationRecovery}
        session={recoveryInfo}
        countdownMs={resumeCountdownMs}
        isLoading={resumeActionLoading}
        error={resumeError}
        onResume={handleResumeSession}
        onDiscard={() => handleDiscardSession()}
        preventDismiss
      />
    </>
  );
}

