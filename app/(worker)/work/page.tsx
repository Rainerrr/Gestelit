"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkerSession } from "@/contexts/WorkerSessionContext";
import {
  createMalfunctionApi,
  startStatusEventApi,
  updateSessionTotalsApi,
} from "@/lib/api/client";
import { getActiveStationReasons } from "@/lib/data/station-reasons";
import {
  buildStatusDictionary,
  getStatusHex,
  getStatusLabel,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import type { StationReason } from "@/lib/types";
import { useSessionHeartbeat } from "@/hooks/useSessionHeartbeat";
import { fetchStationStatusesApi } from "@/lib/api/client";
import { useRef } from "react";

type StatusVisual = {
  dotColor: string;
  highlightBg: string;
  highlightBorder: string;
  textColor: string;
  timerBorder: string;
  shadow: string;
};

const neutralVisual: StatusVisual = {
  dotColor: "#cbd5e1",
  highlightBg: "rgba(148, 163, 184, 0.1)",
  highlightBorder: "#cbd5e1",
  textColor: "#0f172a",
  timerBorder: "#e2e8f0",
  shadow: "0 10px 25px rgba(148,163,184,0.18)",
};

const hexToRgba = (hex: string, alpha = 1) => {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return `rgba(148,163,184,${alpha})`;
  const num = Number.parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const buildStatusVisual = (hex: string): StatusVisual => ({
  dotColor: hex,
  highlightBg: hexToRgba(hex, 0.12),
  highlightBorder: hex,
  textColor: hex,
  timerBorder: hex,
  shadow: `0 10px 25px ${hexToRgba(hex, 0.18)}`,
});

function formatDuration(elapsedSeconds: number) {
  const hours = Math.floor(elapsedSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(elapsedSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

export default function WorkPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const {
    worker,
    station,
    job,
    sessionId,
    sessionStartedAt,
    currentStatus,
    statuses,
    setStatuses,
    setCurrentStatus,
    totals,
    updateTotals,
  } = useWorkerSession();
  const [isStatusesLoading, setStatusesLoading] = useState(false);
  const dictionary = useMemo(
    () => buildStatusDictionary(statuses),
    [statuses],
  );
  const [faultReason, setFaultReason] = useState<string>();
  const [faultNote, setFaultNote] = useState("");
  const [faultImage, setFaultImage] = useState<File | null>(null);
  const [faultImagePreview, setFaultImagePreview] = useState<string | null>(null);
  const [isFaultSubmitting, setIsFaultSubmitting] = useState(false);
  const [isFaultDialogOpen, setFaultDialogOpen] = useState(false);
  const [isEndSessionDialogOpen, setEndSessionDialogOpen] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [productionError, setProductionError] = useState<string | null>(null);
  const [faultError, setFaultError] = useState<string | null>(null);
  const lastStatusesFetchRef = useRef<string | null>(null);
  const reasons = useMemo<StationReason[]>(
    () => getActiveStationReasons(station?.station_reasons ?? []),
    [station?.station_reasons],
  );
  useEffect(() => {
    if (!station?.id) {
      setStatuses([]);
      return;
    }
    if (
      lastStatusesFetchRef.current === station.id &&
      statuses.length > 0 &&
      !isStatusesLoading
    ) {
      return;
    }
    lastStatusesFetchRef.current = station.id;
    setStatusesLoading(true);
    fetchStationStatusesApi(station.id)
      .then((list) => {
        setStatuses(list);
      })
      .catch(() => {
        setStatuses([]);
      })
      .finally(() => setStatusesLoading(false));
  }, [station?.id, statuses.length, isStatusesLoading, setStatuses]);
  useEffect(() => {
    if (!faultReason && reasons.length > 0) {
      setFaultReason(reasons[0].id);
    }
  }, [faultReason, reasons]);

  useEffect(() => {
    if (!worker) {
      router.replace("/login");
      return;
    }
    if (worker && !station) {
      router.replace("/station");
      return;
    }
    if (worker && station && !job) {
      router.replace("/job");
      return;
    }
    if (worker && station && job && !sessionId) {
      router.replace("/job");
    }
  }, [worker, station, job, sessionId, router]);

  useSessionHeartbeat(sessionId);

  const formatReason = (reason: StationReason) =>
    language === "he" ? reason.label_he : reason.label_ru;

  const orderedStatuses = useMemo(() => {
    const globals = Array.from(dictionary.global.values()).sort(
      (a, b) =>
        new Date(a.created_at ?? 0).getTime() -
        new Date(b.created_at ?? 0).getTime(),
    );
    const stationSpecific = station?.id
      ? Array.from(dictionary.station.get(station.id)?.values() ?? []).sort(
          (a, b) =>
            new Date(a.created_at ?? 0).getTime() -
            new Date(b.created_at ?? 0).getTime(),
        )
      : [];
    return [...globals, ...stationSpecific];
  }, [dictionary, station?.id]);

  if (!worker || !station || !job || !sessionId) {
    return null;
  }

  const currentStatusSafe = currentStatus ?? "";
  const statusLabel =
    currentStatusSafe && station
      ? getStatusLabel(currentStatusSafe, dictionary, station.id)
      : "סטטוס";
  const activeVisual = buildStatusVisual(
    currentStatusSafe && station
      ? getStatusHex(currentStatusSafe, dictionary, station.id)
      : "#94a3b8",
  );

  const handleStatusChange = async (statusId: string) => {
    if (!sessionId || currentStatus === statusId) {
      return;
    }
    setStatusError(null);
    setCurrentStatus(statusId);
    try {
      await startStatusEventApi({
        sessionId,
        statusDefinitionId: statusId,
      });
    } catch {
      setStatusError(t("work.error.status"));
    }
  };

  const syncTotals = (key: "good" | "scrap", next: number) => {
    if (!sessionId) {
      return;
    }
    setProductionError(null);
    updateSessionTotalsApi(
      sessionId,
      key === "good" ? { total_good: next } : { total_scrap: next },
    ).catch(() => {
      setProductionError(t("work.error.production"));
    });
  };

  const setLocalTotal = (key: "good" | "scrap", value: number) => {
    if (key === "good") {
      updateTotals({ good: value });
    } else {
      updateTotals({ scrap: value });
    }
  };

  const handleCountDelta = (key: "good" | "scrap", delta: number) => {
    const current = totals[key];
    const next = Math.max(0, current + delta);
    if (next === current) {
      return;
    }
    setLocalTotal(key, next);
    syncTotals(key, next);
  };

  const handleManualCountChange = (key: "good" | "scrap", rawValue: string) => {
    const parsed = Number(rawValue);
    if (Number.isNaN(parsed)) {
      return;
    }
    const next = Math.max(0, Math.floor(parsed));
    if (next === totals[key]) {
      return;
    }
    setLocalTotal(key, next);
    syncTotals(key, next);
  };

  const handleFaultImageChange = (file: File | null) => {
    setFaultImage(file);
    if (faultImagePreview) {
      URL.revokeObjectURL(faultImagePreview);
    }
    if (file) {
      setFaultImagePreview(URL.createObjectURL(file));
    } else {
      setFaultImagePreview(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={worker.full_name}
        title={t("work.title")}
        subtitle={`${t("common.job")} ${job.job_number}`}
        actions={
          <Badge variant="secondary" className="text-base">
            {`${t("common.station")}: ${station.name}`}
          </Badge>
        }
      />

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <WorkTimer
            key={sessionId}
            title={t("work.timer")}
            sessionId={sessionId}
            badgeLabel={t("work.section.status")}
            statusLabel={statusLabel}
            visual={activeVisual}
            startedAt={sessionStartedAt}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-right">
                {t("work.section.status")}
              </CardTitle>
              <CardDescription className="text-right">
                {t("work.status.instructions")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                {orderedStatuses.map((status) => {
                  const isActive = currentStatus === status.id;
                  const colorHex = getStatusHex(status.id, dictionary, station.id);
                  const visual = buildStatusVisual(colorHex);
                  return (
                    <Button
                      key={status.id}
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-auto w-full justify-between rounded-2xl border bg-white p-4 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2",
                        isActive
                          ? "shadow"
                          : "border-slate-200 text-slate-600 hover:border-primary/40 hover:shadow",
                      )}
                      aria-pressed={isActive}
                      style={
                        isActive
                          ? {
                              borderColor: visual.highlightBorder,
                              backgroundColor: visual.highlightBg,
                              color: visual.textColor,
                              boxShadow: visual.shadow,
                            }
                          : undefined
                      }
                      onClick={() => handleStatusChange(status.id)}
                    >
                      <div className="flex w-full items-center justify-between gap-3 text-right">
                        <span>
                          {getStatusLabel(status.id, dictionary, station.id)}
                        </span>
                        <span
                          aria-hidden
                          className="inline-flex h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: isActive
                              ? visual.dotColor
                              : neutralVisual.dotColor,
                          }}
                        />
                      </div>
                    </Button>
                  );
                })}
                {isStatusesLoading ? (
                  <p className="text-sm text-slate-500">טוען סטטוסים...</p>
                ) : null}
              </div>
              {statusError ? (
                <p className="mt-3 text-sm text-rose-600">{statusError}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-right">
              <CardTitle>{t("work.section.production")}</CardTitle>
              <CardDescription>
                {t("work.counters.good")} / {t("work.counters.scrap")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm">
                <p className="text-sm text-slate-500">
                  {t("work.counters.good")}
                </p>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={totals.good}
                  onChange={(event) =>
                    handleManualCountChange("good", event.target.value)
                  }
                  className="mt-3 w-full appearance-none rounded-3xl border border-slate-100 bg-slate-50/80 py-6 text-center text-7xl font-semibold leading-tight text-emerald-600 outline-none transition focus:border-emerald-300 focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleCountDelta("good", -10)}
                    >
                      -10
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleCountDelta("good", -1)}
                    >
                      -1
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleCountDelta("good", 1)}
                    >
                      +1
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleCountDelta("good", 10)}
                    >
                      +10
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm">
                <p className="text-sm text-slate-500">
                  {t("work.counters.scrap")}
                </p>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={totals.scrap}
                  onChange={(event) =>
                    handleManualCountChange("scrap", event.target.value)
                  }
                  className="mt-3 w-full appearance-none rounded-3xl border border-slate-100 bg-slate-50/80 py-6 text-center text-7xl font-semibold leading-tight text-rose-600 outline-none transition focus:border-rose-300 focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleCountDelta("scrap", -10)}
                    >
                      -10
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleCountDelta("scrap", -1)}
                    >
                      -1
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleCountDelta("scrap", 1)}
                    >
                      +1
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleCountDelta("scrap", 10)}
                    >
                      +10
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
            {productionError ? (
              <p className="px-6 pb-4 text-right text-sm text-rose-600">
                {productionError}
              </p>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="text-right">
              <CardTitle className="text-right">
                {t("work.section.actions")}
              </CardTitle>
              <CardDescription className="text-right">
                {t("work.actions.instructions")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center border-dashed bg-white"
                onClick={() => setFaultDialogOpen(true)}
              >
                {t("work.actions.reportFault")}
              </Button>
            </CardContent>
          </Card>

          <Card className="border border-rose-200 bg-rose-50/60 shadow-sm">
            <CardHeader className="text-right">
              <CardTitle className="text-rose-900">
                {t("work.actions.finish")}
              </CardTitle>
              <CardDescription className="text-rose-700">
                {t("work.actions.finishWarning")}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-right">
              <Button
                type="button"
                variant="destructive"
                className="w-full justify-center"
                onClick={() => setEndSessionDialogOpen(true)}
              >
                {t("work.actions.finish")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <Dialog open={isFaultDialogOpen} onOpenChange={setFaultDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{t("work.dialog.fault.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-right">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                {t("work.dialog.fault.reason")}
              </label>
              <Select value={faultReason} onValueChange={setFaultReason}>
                <SelectTrigger className="justify-between text-right">
                  <SelectValue placeholder={t("work.dialog.fault.reason")} />
                </SelectTrigger>
                <SelectContent align="end">
                  {reasons.length === 0 ? (
                    <SelectItem value="empty" disabled>
                      {t("checklist.loading")}
                    </SelectItem>
                  ) : (
                    reasons.map((reason) => (
                      <SelectItem key={reason.id} value={reason.id}>
                        {formatReason(reason)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                {t("work.dialog.fault.note")}
              </label>
              <Textarea
                placeholder={t("work.dialog.fault.note")}
                value={faultNote}
                onChange={(event) => setFaultNote(event.target.value)}
                className="text-right"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                {t("work.dialog.fault.image")}
              </label>
              <div className="space-y-3">
                <Input
                  type="file"
                  accept="image/*"
                  aria-label={t("work.dialog.fault.image")}
                  onChange={(event) =>
                    handleFaultImageChange(event.target.files?.[0] ?? null)
                  }
                />
                {faultImagePreview ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <img
                      src={faultImagePreview}
                      alt={t("work.dialog.fault.image")}
                      className="h-48 w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-right text-sm text-slate-500">
                    {t("work.dialog.fault.imagePlaceholder")}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            {faultError ? (
              <p className="w-full text-right text-sm text-rose-600">
                {faultError}
              </p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFaultDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={isFaultSubmitting}
              onClick={async () => {
                if (!station) return;
                setFaultError(null);
                setIsFaultSubmitting(true);
                try {
                  await createMalfunctionApi({
                    stationId: station.id,
                    stationReasonId: faultReason,
                    description: faultNote,
                    image: faultImage,
                  });
                  setFaultDialogOpen(false);
                  setFaultReason(undefined);
                  setFaultNote("");
                  handleFaultImageChange(null);
                } catch {
                  setFaultError(t("work.error.fault"));
                } finally {
                  setIsFaultSubmitting(false);
                }
              }}
            >
              {isFaultSubmitting
                ? `${t("work.dialog.fault.submit")}...`
                : t("work.dialog.fault.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEndSessionDialogOpen} onOpenChange={setEndSessionDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{t("work.dialog.finish.title")}</DialogTitle>
            <CardDescription>{t("work.dialog.finish.description")}</CardDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEndSessionDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setEndSessionDialogOpen(false);
                router.push("/checklist/end");
              }}
            >
              {t("work.dialog.finish.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type WorkTimerProps = {
  title: string;
  sessionId: string;
  badgeLabel: string;
  statusLabel: string;
  visual: StatusVisual;
  startedAt?: string | null;
};

function WorkTimer({
  title,
  sessionId,
  badgeLabel,
  statusLabel,
  visual,
  startedAt,
}: WorkTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionId, startedAt]);

  const elapsed = startedAt
    ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
    : 0;

  return (
    <Card
      className={cn(
        "border-2 shadow-sm",
      )}
      style={{
        borderColor: visual?.timerBorder ?? neutralVisual.timerBorder,
        boxShadow: visual?.shadow ?? neutralVisual.shadow,
      }}
    >
      <CardHeader className="space-y-2 text-right">
        <CardTitle>{title}</CardTitle>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <CardDescription className="text-xs text-slate-500">
            {sessionId}
          </CardDescription>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-2.5 w-2.5 rounded-full",
              )}
              style={{ backgroundColor: visual?.dotColor ?? neutralVisual.dotColor }}
            />
            <Badge
              variant="outline"
              className={cn(
                "border-none bg-transparent px-2 py-1 text-xs font-semibold",
              )}
              style={{ color: visual?.textColor ?? neutralVisual.textColor }}
            >
              {statusLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-right">
        <p className="text-sm text-slate-500">{badgeLabel}</p>
        <p className="text-5xl font-semibold text-slate-900">
          {formatDuration(elapsed)}
        </p>
      </CardContent>
    </Card>
  );
}

