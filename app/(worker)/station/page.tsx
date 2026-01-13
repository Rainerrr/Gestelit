"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useSessionClaimListener } from "@/hooks/useSessionBroadcast";
import { getOrCreateInstanceId } from "@/lib/utils/instance-id";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkerSession } from "@/contexts/WorkerSessionContext";
import {
  abandonSessionApi,
  createSessionApi,
  fetchStationsWithOccupancyApi,
} from "@/lib/api/client";
import { persistSessionState, clearPersistedSessionState } from "@/lib/utils/session-storage";
import type { SessionAbandonReason, StationSelectionJobItem } from "@/lib/types";
import { BackButton } from "@/components/navigation/back-button";
import { JobItemCard } from "@/components/worker/job-item-card";

const formatDuration = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((safeSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

export default function StationPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    worker,
    job,
    station,
    setStation,
    setSessionId,
    setSessionStartedAt,
    setCurrentStatus,
    pendingRecovery,
    setPendingRecovery,
    hydrateFromSnapshot,
  } = useWorkerSession();

  type JobItemsState = {
    loading: boolean;
    items: StationSelectionJobItem[];
    error: string | null;
    errorCode: string | null;
    // Legacy mode for session recovery (flat station list)
    legacyMode: boolean;
  };

  const [state, dispatch] = useReducer(
    (
      prev: JobItemsState,
      action:
        | { type: "start" }
        | { type: "success"; payload: StationSelectionJobItem[]; legacyMode?: boolean }
        | { type: "error"; errorCode?: string },
    ) => {
      switch (action.type) {
        case "start":
          return { ...prev, loading: true, error: null, errorCode: null };
        case "success":
          return {
            loading: false,
            items: action.payload,
            error: null,
            errorCode: null,
            legacyMode: action.legacyMode ?? false,
          };
        case "error":
          return { ...prev, loading: false, error: "error", errorCode: action.errorCode ?? null };
        default:
          return prev;
      }
    },
    { loading: true, items: [], error: null, errorCode: null, legacyMode: false },
  );

  // Track both station ID and job item station ID for session creation
  type Selection = {
    stationId: string;
    jobItemStationId: string;
    stationName: string;
    stationCode: string;
  } | null;

  const [selection, setSelection] = useState<Selection>(
    station
      ? {
          stationId: station.id,
          jobItemStationId: "", // Will be set on actual selection
          stationName: station.name,
          stationCode: station.code,
        }
      : null,
  );
  const [resumeCountdownMs, setResumeCountdownMs] = useState(0);
  const [resumeActionLoading, setResumeActionLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const expirationHandledRef = useRef(false);

  const isRecoveryBlocking = Boolean(pendingRecovery);
  const instanceId = useMemo(() => getOrCreateInstanceId(), []);

  // Handle when another tab claims the session we're showing in recovery dialog
  const handleSessionClaimed = useCallback(() => {
    setPendingRecovery(null);
    router.replace("/session-transferred");
  }, [setPendingRecovery, router]);

  // Listen for session takeover from other tabs
  useSessionClaimListener(
    pendingRecovery?.session.id,
    instanceId,
    handleSessionClaimed,
  );

  const handleDiscardSession = useCallback(
    async (reason: SessionAbandonReason = "worker_choice") => {
      if (!pendingRecovery) {
        return;
      }
      setResumeActionLoading(true);
      setResumeError(null);
      try {
        await abandonSessionApi(pendingRecovery.session.id, reason);
        // Clear any persisted state since the session is being discarded
        clearPersistedSessionState();
        setPendingRecovery(null);
      } catch {
        setResumeError(t("station.resume.error"));
      } finally {
        setResumeActionLoading(false);
      }
    },
    [pendingRecovery, setPendingRecovery, t],
  );

  useEffect(() => {
    if (!worker) {
      router.replace("/login");
      return;
    }
    // Job is no longer required before station selection
    // Job/job item selection happens when entering production status

    let active = true;
    dispatch({ type: "start" });

    // Fetch stations - always use legacy mode (flat station list)
    // Job item binding happens when entering production status
    const fetchStations = async () => {
      try {
        const result = await fetchStationsWithOccupancyApi(worker.id);
        if (!active) return;
        // Convert flat stations to job items format for display
        const legacyJobItems: StationSelectionJobItem[] = result.map((s) => ({
          id: s.id,
          kind: "station" as const,
          name: s.name,
          plannedQuantity: 0,
          pipelineStations: [
            {
              id: s.id,
              name: s.name,
              code: s.code,
              position: 1,
              isTerminal: true,
              isWorkerAssigned: true,
              occupancy: s.occupancy,
              jobItemStationId: "", // Not applicable - job item binding deferred
            },
          ],
        }));
        dispatch({ type: "success", payload: legacyJobItems, legacyMode: true });
      } catch {
        if (!active) return;
        dispatch({ type: "error" });
      }
    };

    void fetchStations();

    return () => {
      active = false;
    };
  }, [worker, pendingRecovery, router]);

  useEffect(() => {
    if (!pendingRecovery?.graceExpiresAt) {
      setResumeCountdownMs(0);
      return;
    }

    const updateCountdown = () => {
      const nextDiff =
        new Date(pendingRecovery.graceExpiresAt).getTime() - Date.now();
      setResumeCountdownMs(Math.max(0, nextDiff));
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [pendingRecovery?.graceExpiresAt]);

  useEffect(() => {
    if (!pendingRecovery?.graceExpiresAt) {
      expirationHandledRef.current = false;
      return;
    }
    if (expirationHandledRef.current) {
      return;
    }

    const graceExpiryTime = new Date(pendingRecovery.graceExpiresAt).getTime();
    const now = Date.now();

    if (now < graceExpiryTime) {
      return;
    }

    expirationHandledRef.current = true;
    void handleDiscardSession("expired");
  }, [pendingRecovery, resumeCountdownMs, handleDiscardSession]);

  const handleStationSelect = (stationId: string, jobItemStationId: string) => {
    // Find the station details from job items
    for (const item of state.items) {
      const pipelineStation = item.pipelineStations.find((s) => s.id === stationId);
      if (pipelineStation) {
        setSelection({
          stationId,
          jobItemStationId,
          stationName: pipelineStation.name,
          stationCode: pipelineStation.code,
        });
        break;
      }
    }
  };

  const handleContinue = async () => {
    if (!selection || !worker || pendingRecovery) {
      return;
    }

    setIsCreatingSession(true);
    setSessionError(null);

    try {
      // Create the session with worker and station (job binding deferred)
      // jobId is now optional - will be bound when entering production status
      const session = await createSessionApi(
        worker.id,
        selection.stationId,
        job?.id ?? null, // Optional job ID
        instanceId,
      );

      // Create a minimal station object for context
      const stationForContext = {
        id: selection.stationId,
        name: selection.stationName,
        code: selection.stationCode,
        station_type: "other" as const,
        is_active: true,
      };

      setStation(stationForContext);
      setSessionId(session.id);
      setSessionStartedAt(session.started_at ?? null);
      setCurrentStatus(undefined);

      // Persist session state to sessionStorage for recovery on page refresh
      persistSessionState({
        sessionId: session.id,
        workerId: worker.id,
        workerCode: worker.worker_code,
        workerFullName: worker.full_name,
        stationId: selection.stationId,
        stationName: selection.stationName,
        stationCode: selection.stationCode,
        jobId: job?.id ?? null,
        jobNumber: job?.job_number ?? null,
        startedAt: session.started_at ?? new Date().toISOString(),
        totals: { good: 0, scrap: 0 },
      });

      router.push("/checklist/start");
    } catch (error) {
      const message = error instanceof Error ? error.message : "SESSION_FAILED";
      if (message === "STATION_OCCUPIED") {
        setSessionError(t("station.error.occupied"));
      } else {
        setSessionError(t("station.error.sessionFailed"));
      }
    } finally {
      setIsCreatingSession(false);
    }
  };

  const countdownLabel = useMemo(
    () => formatDuration(Math.ceil(Math.max(resumeCountdownMs, 0) / 1000)),
    [resumeCountdownMs],
  );

  const elapsedLabel = useMemo(() => {
    if (!pendingRecovery) {
      return "00:00:00";
    }
    const expiryTimestamp = new Date(
      pendingRecovery.graceExpiresAt,
    ).getTime();
    const currentTimestamp = expiryTimestamp - resumeCountdownMs;
    const elapsedSeconds =
      (currentTimestamp -
        new Date(pendingRecovery.session.started_at).getTime()) /
      1000;
    return formatDuration(Math.max(0, Math.floor(elapsedSeconds)));
  }, [pendingRecovery, resumeCountdownMs]);

  const handleResumeSession = () => {
    if (!pendingRecovery) {
      return;
    }
    // Station is required, job is now optional
    if (!pendingRecovery.station) {
      setResumeError(t("station.resume.missing"));
      return;
    }
    hydrateFromSnapshot(pendingRecovery);
    setResumeError(null);

    // Persist session state for future refreshes
    if (worker) {
      persistSessionState({
        sessionId: pendingRecovery.session.id,
        workerId: worker.id,
        workerCode: worker.worker_code,
        workerFullName: worker.full_name,
        stationId: pendingRecovery.station.id,
        stationName: pendingRecovery.station.name,
        stationCode: pendingRecovery.station.code,
        jobId: pendingRecovery.job?.id ?? null,
        jobNumber: pendingRecovery.job?.job_number ?? null,
        startedAt: pendingRecovery.session.started_at,
        totals: {
          good: pendingRecovery.session.total_good ?? 0,
          scrap: pendingRecovery.session.total_scrap ?? 0,
        },
      });
    }

    router.push("/work");
  };

  const handleDialogClose = (open: boolean) => {
    if (!open && pendingRecovery) {
      setPendingRecovery(null);
      router.push("/login");
    }
  };

  // Check if worker has any assigned stations in any job item
  const hasAnyAssignedStations = useMemo(() => {
    return state.items.some((item) =>
      item.pipelineStations.some((s) => s.isWorkerAssigned)
    );
  }, [state.items]);

  if (!worker) {
    return null;
  }

  return (
    <>
      <BackButton href="/login" />
      <PageHeader
        eyebrow={worker.full_name}
        title={t("station.title")}
        subtitle={t("station.subtitle")}
        actions={
          job ? (
            <Badge variant="secondary" className="border-border bg-secondary text-foreground/80">
              {`${t("common.job")}: ${job.job_number}`}
            </Badge>
          ) : null
        }
      />

      {pendingRecovery ? (
        <Alert
          variant="default"
          className="max-w-3xl border border-primary/30 bg-primary/10 text-right"
        >
          <AlertTitle className="text-primary">{t("station.resume.bannerTitle")}</AlertTitle>
          <AlertDescription className="text-primary/80">
            {t("station.resume.bannerSubtitle")}
          </AlertDescription>
        </Alert>
      ) : null}

      {state.loading ? (
        <div className="space-y-4 max-w-3xl">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="h-40 rounded-xl border border-dashed border-border bg-card/50"
            >
              <div className="h-full w-full animate-pulse rounded-xl bg-muted" />
            </div>
          ))}
        </div>
      ) : state.errorCode === "JOB_NOT_CONFIGURED" ? (
        <Card className="max-w-3xl border border-amber-500/30 bg-amber-50/10 text-right dark:border-amber-500/20 dark:bg-amber-500/5">
          <CardHeader className="space-y-3">
            <CardTitle className="text-lg text-amber-700 dark:text-amber-400">
              {t("station.error.jobNotConfigured")}
            </CardTitle>
            <p className="text-sm text-amber-600/80 dark:text-amber-500/80">
              {t("station.error.jobNotConfiguredDesc")}
            </p>
            <Button
              variant="outline"
              className="w-fit border-amber-500/30 text-amber-700 hover:bg-amber-50 dark:border-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/10"
              onClick={() => router.push("/job")}
            >
              {t("station.error.selectAnotherJob")}
            </Button>
          </CardHeader>
        </Card>
      ) : state.items.length === 0 ? (
        <Card className="max-w-3xl border border-dashed border-border bg-card/50 text-right">
          <CardHeader>
            <CardTitle className="text-lg text-muted-foreground">
              {state.error ? t("station.error.load") : t("station.noJobItems")}
            </CardTitle>
          </CardHeader>
        </Card>
      ) : !hasAnyAssignedStations ? (
        <Card className="max-w-3xl border border-amber-500/30 bg-amber-50/10 text-right dark:border-amber-500/20 dark:bg-amber-500/5">
          <CardHeader className="space-y-3">
            <CardTitle className="text-lg text-amber-700 dark:text-amber-400">
              {t("station.noAssignedStations")}
            </CardTitle>
            <Button
              variant="outline"
              className="w-fit border-amber-500/30 text-amber-700 hover:bg-amber-50 dark:border-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/10"
              onClick={() => router.push("/job")}
            >
              {t("station.error.selectAnotherJob")}
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <section className="space-y-6 max-w-4xl">
          {/* Job Item Cards */}
          <div className="space-y-4">
            {state.items.map((jobItem) => (
              <JobItemCard
                key={jobItem.id}
                jobItem={jobItem}
                selectedStationId={selection?.stationId ?? null}
                onStationSelect={handleStationSelect}
                disabled={isRecoveryBlocking}
              />
            ))}
          </div>

          {/* Selection Summary & Continue Button */}
          <div className="rounded-xl border border-border bg-card/50 p-4 backdrop-blur-sm">
            <div className="flex flex-col gap-3 text-right md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm text-foreground/80">
                  {selection
                    ? `${t("station.selected")} · ${selection.stationName}`
                    : t("station.subtitle")}
                </p>
                {sessionError ? (
                  <p className="text-xs text-rose-600 dark:text-rose-400">{sessionError}</p>
                ) : null}
              </div>
              <Button
                size="lg"
                className="w-full justify-center bg-primary font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto sm:min-w-48"
                disabled={!selection || isRecoveryBlocking || isCreatingSession}
                onClick={handleContinue}
              >
                {isCreatingSession ? t("station.creating") : t("station.continue")}
              </Button>
            </div>
          </div>
        </section>
      )}

      <Dialog open={isRecoveryBlocking} onOpenChange={handleDialogClose}>
        <DialogContent dir="rtl" className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("station.resume.title")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("station.resume.subtitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-right">
            <Badge variant="secondary" className="w-full justify-center border-primary/30 bg-primary/10 py-2 text-primary">
              {t("station.resume.countdown", { time: countdownLabel })}
            </Badge>

            <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("station.resume.station")}
                </p>
                <p className="text-base font-semibold text-foreground">
                  {pendingRecovery?.station?.name ??
                    t("station.resume.stationFallback")}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("station.resume.job")}
                </p>
                <p className="text-base font-semibold text-foreground">
                  {pendingRecovery?.job?.job_number ??
                    t("station.resume.jobFallback")}
                </p>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-input bg-secondary px-4 py-3 text-sm text-muted-foreground">
                <span>{t("station.resume.elapsed")}</span>
                <span className="font-semibold text-foreground">
                  {elapsedLabel}
                </span>
              </div>
            </div>
          </div>

          {resumeError ? (
            <p className="text-right text-sm text-rose-600 dark:text-rose-400">{resumeError}</p>
          ) : null}

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDiscardSession()}
              disabled={resumeActionLoading}
              className="w-full justify-center border-input bg-secondary text-foreground/80 hover:bg-accent hover:text-foreground sm:w-auto"
            >
              {resumeActionLoading
                ? t("station.resume.discarding")
                : t("station.resume.discard")}
            </Button>
            <Button
              type="button"
              onClick={handleResumeSession}
              className="w-full justify-center bg-primary font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
              disabled={resumeActionLoading}
            >
              {t("station.resume.resume")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
