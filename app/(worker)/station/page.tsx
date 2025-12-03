"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
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
import { abandonSessionApi, fetchStationsApi } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { SessionAbandonReason, Station } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/translations";

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
    items: Station[];
    error: string | null;
  };

  const [state, dispatch] = useReducer(
    (
      prev: StationsState,
      action:
        | { type: "start" }
        | { type: "success"; payload: Station[] }
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
    fetchStationsApi(worker.id)
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
      <PageHeader
        eyebrow={worker.full_name}
        title={t("station.title")}
        subtitle={t("station.subtitle")}
      />

      {pendingRecovery ? (
        <Alert
          variant="default"
          className="max-w-3xl border border-amber-200 bg-amber-50 text-right"
        >
          <AlertTitle>{t("station.resume.bannerTitle")}</AlertTitle>
          <AlertDescription>
            {t("station.resume.bannerSubtitle")}
          </AlertDescription>
        </Alert>
      ) : null}

      {state.loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="h-32 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80"
            >
              <div className="h-full w-full animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ))}
        </div>
      ) : state.items.length === 0 ? (
        <Card className="max-w-3xl border border-dashed text-right">
          <CardHeader>
            <CardTitle className="text-lg text-slate-700">
              {state.error ? t("station.error.load") : t("station.empty")}
            </CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stations.map((stationOption) => {
              const isSelected = selectedStation === stationOption.id;
              return (
                <button
                  key={stationOption.id}
                  type="button"
                  onClick={() => {
                    if (isRecoveryBlocking) {
                      return;
                    }
                    setSelectedStation(stationOption.id);
                  }}
                  className={cn(
                    "rounded-2xl border bg-white p-4 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    isSelected
                      ? "border-primary/80 bg-primary/10 shadow-lg ring-2 ring-primary/20"
                      : "border-slate-200 hover:border-primary/40 hover:shadow",
                    isRecoveryBlocking ? "cursor-not-allowed opacity-60" : "",
                  )}
                  aria-pressed={isSelected}
                  disabled={isRecoveryBlocking}
                >
                  <div className="space-y-2">
                    <p className="text-xl font-semibold text-slate-900">
                      {stationOption.name}
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{typeLabel(stationOption.station_type)}</span>
                      <span
                        aria-hidden
                        className={cn(
                          "inline-flex h-2.5 w-2.5 rounded-full transition",
                          isSelected ? "bg-primary" : "bg-slate-300",
                        )}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 text-right md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm text-slate-600">
                  {selectedStationEntity
                    ? `${t("station.selected")} · ${selectedStationEntity.name}`
                    : t("station.subtitle")}
                </p>
                {selectedStationEntity ? (
                  <p className="text-xs text-slate-500">
                    {typeLabel(selectedStationEntity.station_type)}
                  </p>
                ) : null}
              </div>
              <Button
                size="lg"
                className="w-full justify-center sm:w-auto sm:min-w-48"
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
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{t("station.resume.title")}</DialogTitle>
            <DialogDescription>
              {t("station.resume.subtitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-right">
            <Badge variant="secondary" className="w-full justify-center py-2">
              {t("station.resume.countdown", { time: countdownLabel })}
            </Badge>

            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div>
                <p className="text-xs text-slate-500">
                  {t("station.resume.station")}
                </p>
                <p className="text-base font-semibold text-slate-900">
                  {pendingRecovery?.station?.name ??
                    t("station.resume.stationFallback")}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">
                  {t("station.resume.job")}
                </p>
                <p className="text-base font-semibold text-slate-900">
                  {pendingRecovery?.job?.job_number ??
                    t("station.resume.jobFallback")}
                </p>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                <span>{t("station.resume.elapsed")}</span>
                <span className="font-semibold text-slate-900">
                  {elapsedLabel}
                </span>
              </div>
            </div>
          </div>

          {resumeError ? (
            <p className="text-right text-sm text-rose-600">{resumeError}</p>
          ) : null}

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDiscardSession()}
              disabled={resumeActionLoading}
              className="w-full justify-center sm:w-auto"
            >
              {resumeActionLoading
                ? t("station.resume.discarding")
                : t("station.resume.discard")}
            </Button>
            <Button
              type="button"
              onClick={handleResumeSession}
              className="w-full justify-center sm:w-auto"
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

