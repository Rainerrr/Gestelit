"use client";

import { useEffect, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkerSession } from "@/contexts/WorkerSessionContext";
import {
  fetchReasonsApi,
  startStatusEventApi,
  updateSessionTotalsApi,
} from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Reason, StatusEventState } from "@/lib/types";
import { useSessionHeartbeat } from "@/hooks/useSessionHeartbeat";

const statusButtons = [
  { id: "setup", labelKey: "work.status.setup" },
  { id: "production", labelKey: "work.status.production" },
  { id: "stopped", labelKey: "work.status.stopped" },
  { id: "fault", labelKey: "work.status.fault" },
  { id: "waiting_client", labelKey: "work.status.waiting" },
  { id: "plate_change", labelKey: "work.status.plateChange" },
] satisfies { id: StatusEventState; labelKey: TranslationKey }[];

type StatusVisual = {
  dot: string;
  selectedBorder: string;
  selectedBg: string;
  selectedText: string;
  selectedShadow: string;
  selectedRing: string;
  timerBorder: string;
  timerShadow: string;
};

const neutralVisual: StatusVisual = {
  dot: "bg-slate-400",
  selectedBorder: "border-slate-300",
  selectedBg: "bg-slate-50",
  selectedText: "text-slate-800",
  selectedShadow: "shadow-md",
  selectedRing: "ring-slate-200",
  timerBorder: "border-slate-200",
  timerShadow: "shadow-sm",
};

const statusVisuals: Record<StatusEventState, StatusVisual> = {
  production: {
    dot: "bg-emerald-500",
    selectedBorder: "border-emerald-500",
    selectedBg: "bg-emerald-50",
    selectedText: "text-emerald-900",
    selectedShadow: "shadow-[0_10px_25px_rgba(16,185,129,0.25)]",
    selectedRing: "ring-emerald-200",
    timerBorder: "border-emerald-200",
    timerShadow: "shadow-[0_0_35px_rgba(16,185,129,0.25)]",
  },
  setup: {
    dot: "bg-amber-400",
    selectedBorder: "border-amber-400",
    selectedBg: "bg-amber-50",
    selectedText: "text-amber-900",
    selectedShadow: "shadow-[0_10px_25px_rgba(251,191,36,0.3)]",
    selectedRing: "ring-amber-200",
    timerBorder: "border-amber-200",
    timerShadow: "shadow-[0_0_35px_rgba(251,191,36,0.3)]",
  },
  waiting_client: {
    dot: "bg-amber-400",
    selectedBorder: "border-amber-400",
    selectedBg: "bg-amber-50",
    selectedText: "text-amber-900",
    selectedShadow: "shadow-[0_10px_25px_rgba(251,191,36,0.3)]",
    selectedRing: "ring-amber-200",
    timerBorder: "border-amber-200",
    timerShadow: "shadow-[0_0_35px_rgba(251,191,36,0.3)]",
  },
  plate_change: {
    dot: "bg-amber-400",
    selectedBorder: "border-amber-400",
    selectedBg: "bg-amber-50",
    selectedText: "text-amber-900",
    selectedShadow: "shadow-[0_10px_25px_rgba(251,191,36,0.3)]",
    selectedRing: "ring-amber-200",
    timerBorder: "border-amber-200",
    timerShadow: "shadow-[0_0_35px_rgba(251,191,36,0.3)]",
  },
  stopped: {
    dot: "bg-rose-500",
    selectedBorder: "border-rose-500",
    selectedBg: "bg-rose-50",
    selectedText: "text-rose-900",
    selectedShadow: "shadow-[0_10px_25px_rgba(244,63,94,0.25)]",
    selectedRing: "ring-rose-200",
    timerBorder: "border-rose-200",
    timerShadow: "shadow-[0_0_35px_rgba(244,63,94,0.25)]",
  },
  fault: {
    dot: "bg-rose-500",
    selectedBorder: "border-rose-500",
    selectedBg: "bg-rose-50",
    selectedText: "text-rose-900",
    selectedShadow: "shadow-[0_10px_25px_rgba(244,63,94,0.25)]",
    selectedRing: "ring-rose-200",
    timerBorder: "border-rose-200",
    timerShadow: "shadow-[0_0_35px_rgba(244,63,94,0.25)]",
  },
};

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
    setCurrentStatus,
    totals,
    updateTotals,
  } = useWorkerSession();
  const [faultReason, setFaultReason] = useState<string>();
  const [faultNote, setFaultNote] = useState("");
  const [isFaultDialogOpen, setFaultDialogOpen] = useState(false);
  const [isEndSessionDialogOpen, setEndSessionDialogOpen] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [productionError, setProductionError] = useState<string | null>(null);
  const [faultError, setFaultError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [reasonsLoading, setReasonsLoading] = useState(true);

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

  const formatReason = (reason: Reason) =>
    language === "he" ? reason.label_he : reason.label_ru;

  useEffect(() => {
    fetchReasonsApi("stop")
      .then((items) => setReasons(items))
      .catch(() => setReasons([]))
      .finally(() => setReasonsLoading(false));
  }, []);

  if (!worker || !station || !job || !sessionId) {
    return null;
  }

  const currentStatusSafe = currentStatus ?? "stopped";
  const statusLabel =
    statusButtons.find((entry) => entry.id === currentStatusSafe)?.labelKey ??
    "work.status.stopped";
  const activeVisual = statusVisuals[currentStatusSafe] ?? neutralVisual;

  const handleStatusChange = async (status: StatusEventState) => {
    if (!sessionId || currentStatus === status) {
      return;
    }
    setStatusError(null);
    setCurrentStatus(status);
    try {
      await startStatusEventApi({
        sessionId,
        status,
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
            statusLabel={t(statusLabel)}
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
                {statusButtons.map((status) => {
                  const isActive = currentStatus === status.id;
                  const visual = statusVisuals[status.id] ?? neutralVisual;
                  return (
                    <Button
                      key={status.id}
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-auto w-full justify-between rounded-2xl border bg-white p-4 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2",
                        isActive
                          ? cn(
                              visual.selectedBorder,
                              visual.selectedBg,
                              visual.selectedText,
                              visual.selectedShadow,
                              visual.selectedRing,
                            )
                          : "border-slate-200 text-slate-600 hover:border-primary/40 hover:shadow",
                      )}
                      aria-pressed={isActive}
                      onClick={() => handleStatusChange(status.id)}
                    >
                      <div className="flex w-full items-center justify-between gap-3 text-right">
                        <span>{t(status.labelKey)}</span>
                        <span
                          aria-hidden
                          className={cn(
                            "inline-flex h-2.5 w-2.5 rounded-full",
                            isActive ? visual.dot : "bg-slate-300",
                          )}
                        />
                      </div>
                    </Button>
                  );
                })}
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
                  {reasonsLoading ? (
                    <SelectItem value="loading" disabled>
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
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-right text-sm text-slate-500">
                {t("work.dialog.fault.imagePlaceholder")}
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
              onClick={async () => {
                if (!sessionId) return;
                try {
                  setFaultError(null);
                  await startStatusEventApi({
                    sessionId,
                    status: "fault",
                    reasonId: faultReason,
                    note: faultNote,
                  });
                  setCurrentStatus("fault");
                  setFaultDialogOpen(false);
                  setFaultReason(undefined);
                  setFaultNote("");
                } catch {
                  setFaultError(t("work.error.fault"));
                }
              }}
            >
              {t("work.dialog.fault.submit")}
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
        "border-2",
        visual?.timerBorder ?? neutralVisual.timerBorder,
        visual?.timerShadow ?? neutralVisual.timerShadow,
      )}
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
                visual?.dot ?? neutralVisual.dot,
              )}
            />
            <Badge
              variant="outline"
              className={cn(
                "border-none bg-transparent px-2 py-1 text-xs font-semibold",
                visual?.selectedText ?? neutralVisual.selectedText,
              )}
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

