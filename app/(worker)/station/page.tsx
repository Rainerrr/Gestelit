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
import { abandonSessionApi, fetchStationsWithOccupancyApi } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { SessionAbandonReason, Station } from "@/lib/types";
import type { StationWithOccupancy } from "@/lib/data/stations";
import type { TranslationKey } from "@/lib/i18n/translations";
import { BackButton } from "@/components/navigation/back-button";

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
    station,
    setStation,
    pendingRecovery,
    setPendingRecovery,
    hydrateFromSnapshot,
  } = useWorkerSession();

  type StationsState = {
    loading: boolean;
    items: StationWithOccupancy[];
    error: string | null;
  };

  const [state, dispatch] = useReducer(
    (
      prev: StationsState,
      action:
        | { type: "start" }
        | { type: "success"; payload: StationWithOccupancy[] }
        | { type: "error" },
    ) => {
      switch (action.type) {
        case "start":
          return { ...prev, loading: true, error: null };
        case "success":
          return { loading: false, items: action.payload, error: null };
        case "error":
          return { ...prev, loading: false, error: "error" };
        default:
          return prev;
      }
    },
    { loading: true, items: [], error: null },
  );
  const [selectedStation, setSelectedStation] = useState<string | undefined>(
    station?.id,
  );
  const [resumeCountdownMs, setResumeCountdownMs] = useState(0);
  const [resumeActionLoading, setResumeActionLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
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

    let active = true;
    dispatch({ type: "start" });
    fetchStationsWithOccupancyApi(worker.id)
      .then((result) => {
        if (!active) return;
        dispatch({ type: "success", payload: result });
      })
      .catch(() => {
        if (!active) return;
        dispatch({ type: "error" });
      });

    return () => {
      active = false;
    };
  }, [worker, router]);

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

  const typeLabel = (stationType: Station["station_type"]) =>
    t(`station.type.${stationType}` as TranslationKey);

  const stations = state.items;
  const selectedStationEntity = stations.find(
    (entry) => entry.id === selectedStation,
  );

  const handleContinue = () => {
    if (!selectedStation || !worker || pendingRecovery) {
      return;
    }
    const stationEntity = stations.find(
      (entry) => entry.id === selectedStation,
    );
    if (!stationEntity) {
      return;
    }
    setStation(stationEntity);
    router.push("/job");
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
    if (!pendingRecovery.station || !pendingRecovery.job) {
      setResumeError(t("station.resume.missing"));
      return;
    }
    hydrateFromSnapshot(pendingRecovery);
    setResumeError(null);
    router.push("/work");
  };

  const handleDialogClose = (open: boolean) => {
    if (!open && pendingRecovery) {
      setPendingRecovery(null);
      router.push("/login");
    }
  };

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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="h-32 rounded-xl border border-dashed border-border bg-card/50"
            >
              <div className="h-full w-full animate-pulse rounded-xl bg-muted" />
            </div>
          ))}
        </div>
      ) : state.items.length === 0 ? (
        <Card className="max-w-3xl border border-dashed border-border bg-card/50 text-right">
          <CardHeader>
            <CardTitle className="text-lg text-muted-foreground">
              {state.error ? t("station.error.load") : t("station.empty")}
            </CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stations.map((stationOption) => {
              const isSelected = selectedStation === stationOption.id;
              const isOccupied = stationOption.occupancy?.isOccupied ?? false;
              const isDisabled = isRecoveryBlocking || isOccupied;
              return (
                <button
                  key={stationOption.id}
                  type="button"
                  onClick={() => {
                    if (isDisabled) {
                      return;
                    }
                    setSelectedStation(stationOption.id);
                  }}
                  className={cn(
                    "rounded-xl border border-border bg-card/50 p-4 text-right backdrop-blur-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    isSelected
                      ? "border-primary/50 bg-primary/10 ring-2 ring-primary/20"
                      : "hover:border-primary/40 hover:bg-accent",
                    isDisabled ? "cursor-not-allowed opacity-60" : "",
                    isOccupied ? "border-amber-500/30 bg-amber-50/5" : "",
                  )}
                  aria-pressed={isSelected}
                  disabled={isDisabled}
                >
                  <div className="space-y-2">
                    <p className="text-xl font-semibold text-foreground">
                      {stationOption.name}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{typeLabel(stationOption.station_type)}</span>
                      <span
                        aria-hidden
                        className={cn(
                          "inline-flex h-2.5 w-2.5 rounded-full transition",
                          isSelected ? "bg-primary" : "bg-muted-foreground/50",
                          isOccupied ? "bg-amber-500" : "",
                        )}
                      />
                    </div>
                    {isOccupied && stationOption.occupancy?.occupiedBy && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                        <svg
                          className="h-4 w-4 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                        <span className="truncate">
                          {t("station.occupied.by", {
                            name: stationOption.occupancy.occupiedBy.workerName,
                          })}
                          {stationOption.occupancy.isGracePeriod && (
                            <span className="mr-1 text-amber-600 dark:text-amber-500">
                              {" "}
                              ({t("station.occupied.gracePeriod")})
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="rounded-xl border border-border bg-card/50 p-4 backdrop-blur-sm">
            <div className="flex flex-col gap-3 text-right md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm text-foreground/80">
                  {selectedStationEntity
                    ? `${t("station.selected")} · ${selectedStationEntity.name}`
                    : t("station.subtitle")}
                </p>
                {selectedStationEntity ? (
                  <p className="text-xs text-muted-foreground">
                    {typeLabel(selectedStationEntity.station_type)}
                  </p>
                ) : null}
              </div>
              <Button
                size="lg"
                className="w-full justify-center bg-primary font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto sm:min-w-48"
                disabled={!selectedStation || isRecoveryBlocking}
                onClick={handleContinue}
              >
                {t("station.continue")}
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

