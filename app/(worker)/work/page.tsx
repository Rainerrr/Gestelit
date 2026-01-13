"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { PageHeader } from "@/components/layout/page-header";
import { BackButton } from "@/components/navigation/back-button";
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
  PipelineProvider,
  usePipelineContext,
} from "@/contexts/PipelineContext";
import {
  createReportApi,
  createStatusEventWithReportApi,
  fetchReportReasonsApi,
  startStatusEventApi,
  takeoverSessionApi,
  updateSessionTotalsApi,
} from "@/lib/api/client";
import { getActiveStationReasons } from "@/lib/data/station-reasons";
import { ProductionPipeline, type PipelineStation } from "@/components/work/production-pipeline";
import {
  buildStatusDictionary,
  getStatusHex,
  getStatusLabel,
  sortStatusDefinitions,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { getOrCreateInstanceId } from "@/lib/utils/instance-id";
import { updatePersistedTotals } from "@/lib/utils/session-storage";
import type { ReportReason, StationReason, StatusDefinition } from "@/lib/types";
import { useSessionHeartbeat } from "@/hooks/useSessionHeartbeat";
import { useSessionBroadcast } from "@/hooks/useSessionBroadcast";
import { fetchStationStatusesApi } from "@/lib/api/client";

type StatusVisual = {
  dotColor: string;
  highlightBg: string;
  highlightBorder: string;
  textColor: string;
  timerBorder: string;
  shadow: string;
};

const neutralVisual: StatusVisual = {
  dotColor: "#94a3b8",
  highlightBg: "rgba(148, 163, 184, 0.1)",
  highlightBorder: "#94a3b8",
  textColor: "#64748b",
  timerBorder: "#cbd5e1",
  shadow: "0 4px 12px rgba(0,0,0,0.08)",
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
  const { worker, station, job, sessionId } = useWorkerSession();
  const router = useRouter();

  // Route guards - must come before any conditional returns that use hooks
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

  // Guard render - don't render content until session is ready
  if (!worker || !station || !job || !sessionId) {
    return null;
  }

  // Wrap with PipelineProvider so inner content can use usePipelineContext()
  return (
    <PipelineProvider sessionId={sessionId}>
      <WorkPageContent />
    </PipelineProvider>
  );
}

/**
 * Inner component that uses the pipeline context.
 * Must be rendered inside PipelineProvider.
 */
function WorkPageContent() {
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
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [isEndSessionDialogOpen, setEndSessionDialogOpen] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [productionError, setProductionError] = useState<string | null>(null);
  const [faultError, setFaultError] = useState<string | null>(null);
  const lastStatusesFetchRef = useRef<string | null>(null);

  // General report dialog state
  const [isGeneralReportDialogOpen, setGeneralReportDialogOpen] = useState(false);
  const [generalReportReasons, setGeneralReportReasons] = useState<ReportReason[]>([]);
  const [generalReportReason, setGeneralReportReason] = useState<string>();
  const [generalReportNote, setGeneralReportNote] = useState("");
  const [generalReportImage, setGeneralReportImage] = useState<File | null>(null);
  const [generalReportImagePreview, setGeneralReportImagePreview] = useState<string | null>(null);
  const [isGeneralReportSubmitting, setIsGeneralReportSubmitting] = useState(false);
  const [generalReportError, setGeneralReportError] = useState<string | null>(null);
  const [pendingGeneralStatusId, setPendingGeneralStatusId] = useState<string | null>(null);

  // Pipeline context from real-time SSE provider (now inside PipelineProvider)
  const pipelineContext = usePipelineContext();

  // DEBUG: Log pipeline context to trace the issue
  useEffect(() => {
    console.log("[WorkPageContent] Pipeline context:", {
      jobItem: pipelineContext.jobItem,
      isProductionLine: pipelineContext.isProductionLine,
      isSingleStation: pipelineContext.isSingleStation,
      connectionState: pipelineContext.connectionState,
      currentPosition: pipelineContext.currentPosition,
      prevStation: pipelineContext.prevStation,
      nextStation: pipelineContext.nextStation,
    });
  }, [pipelineContext]);

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
  // NOTE: We intentionally do NOT auto-select the first reason
  // to force workers to explicitly pick a reason for reports

  // Generate instance ID for this tab
  const instanceId = useMemo(() => getOrCreateInstanceId(), []);

  // Track whether this tab has successfully claimed the session
  const [isTakeoverComplete, setIsTakeoverComplete] = useState(false);

  // Handle session takeover (another tab/device took over)
  const handleSessionTakeover = useCallback(() => {
    router.replace("/session-transferred");
  }, [router]);

  // Claim session on mount (takeover from any previous instance)
  // MUST complete before heartbeat starts to avoid race condition
  useEffect(() => {
    if (!sessionId || !instanceId) return;

    let cancelled = false;

    const claimSession = async () => {
      try {
        await takeoverSessionApi(sessionId, instanceId);
        if (!cancelled) {
          setIsTakeoverComplete(true);
        }
      } catch (err) {
        console.warn("[work] Failed to claim session:", err);
        // Still mark as complete to allow heartbeat to run
        // The heartbeat will handle the mismatch if takeover truly failed
        if (!cancelled) {
          setIsTakeoverComplete(true);
        }
      }
    };

    void claimSession();

    return () => {
      cancelled = true;
    };
  }, [sessionId, instanceId]);

  // Heartbeat with instance validation
  // Only start AFTER takeover is complete to avoid race condition
  useSessionHeartbeat({
    sessionId: isTakeoverComplete ? sessionId : undefined,
    instanceId,
    onInstanceMismatch: handleSessionTakeover,
  });

  // Cross-tab coordination via BroadcastChannel
  useSessionBroadcast(sessionId, instanceId, handleSessionTakeover);

  const formatReason = (reason: StationReason) =>
    language === "he" ? reason.label_he : reason.label_ru;

  const orderedStatuses = useMemo(() => {
    const globals = Array.from(dictionary.global.values());
    const stationSpecific = station?.id
      ? Array.from(dictionary.station.get(station.id)?.values() ?? [])
      : [];
    // Sort: stoppage → production → malfunction → global → station → other
    return sortStatusDefinitions([...globals, ...stationSpecific]);
  }, [dictionary, station?.id]);

  const getStatusDefinition = (statusId: string): StatusDefinition | undefined => {
    const global = dictionary.global.get(statusId);
    if (global) return global;
    if (station?.id) {
      return dictionary.station.get(station.id)?.get(statusId);
    }
    return undefined;
  };

  // These are guaranteed to exist by the guard in WorkPage
  // but TypeScript needs help knowing that
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

  const handleStatusChange = async (statusId: string, reportId?: string) => {
    if (!sessionId || currentStatus === statusId) {
      return;
    }

    // Check the target status's report_type to determine if a report dialog is needed
    // Handle empty strings and null/undefined - only valid values are "malfunction", "general", or "none"
    const statusDef = getStatusDefinition(statusId);
    const rawReportType = statusDef?.report_type;
    const reportType = (rawReportType === "malfunction" || rawReportType === "general")
      ? rawReportType
      : "none";

    // If target status requires a report and none provided, open the appropriate dialog
    if (reportType === "malfunction" && !reportId) {
      setPendingStatusId(statusId);
      setFaultDialogOpen(true);
      return;
    }

    if (reportType === "general" && !reportId) {
      setPendingGeneralStatusId(statusId);
      // Fetch report reasons if not already loaded
      if (generalReportReasons.length === 0) {
        fetchReportReasonsApi().then((reasons) => {
          setGeneralReportReasons(reasons);
          // NOTE: We intentionally do NOT auto-select the first reason
          // to force workers to explicitly pick a reason
        }).catch(console.error);
      }
      setGeneralReportDialogOpen(true);
      return;
    }

    setStatusError(null);
    setCurrentStatus(statusId);
    try {
      await startStatusEventApi({
        sessionId,
        statusDefinitionId: statusId,
        reportId: reportId,
      });
    } catch {
      setStatusError(t("work.error.status"));
    }
  };

  const syncTotals = (key: "good" | "scrap", next: number, previous: number) => {
    if (!sessionId) {
      return;
    }
    setProductionError(null);
    // IMPORTANT: Always send BOTH totals to the API.
    // The RPC function calculates deltas, so sending only one value
    // would cause the other to be interpreted as 0 (massive reversal).
    const newTotals = {
      total_good: key === "good" ? next : totals.good,
      total_scrap: key === "scrap" ? next : totals.scrap,
    };
    updateSessionTotalsApi(sessionId, newTotals).catch((error) => {
      const errorMsg = error instanceof Error ? error.message : "";
      if (errorMsg === "WIP_DOWNSTREAM_CONSUMED") {
        // Revert local state when downstream has already consumed the WIP
        setLocalTotal(key, previous);
        setProductionError(t("work.error.wipDownstreamConsumed"));
      } else {
        setProductionError(t("work.error.production"));
      }
    });
  };

  const setLocalTotal = (key: "good" | "scrap", value: number) => {
    if (key === "good") {
      updateTotals({ good: value });
      // Persist updated totals to sessionStorage for refresh recovery
      updatePersistedTotals({ good: value, scrap: totals.scrap });
    } else {
      updateTotals({ scrap: value });
      // Persist updated totals to sessionStorage for refresh recovery
      updatePersistedTotals({ good: totals.good, scrap: value });
    }
  };

  const handleCountDelta = (key: "good" | "scrap", delta: number) => {
    const current = totals[key];
    const next = Math.max(0, current + delta);
    if (next === current) {
      return;
    }
    setLocalTotal(key, next);
    syncTotals(key, next, current);
  };

  const handleManualCountChange = (key: "good" | "scrap", rawValue: string) => {
    const parsed = Number(rawValue);
    if (Number.isNaN(parsed)) {
      return;
    }
    const current = totals[key];
    const next = Math.max(0, Math.floor(parsed));
    if (next === current) {
      return;
    }
    setLocalTotal(key, next);
    syncTotals(key, next, current);
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

  const handleGeneralReportImageChange = (file: File | null) => {
    setGeneralReportImage(file);
    if (generalReportImagePreview) {
      URL.revokeObjectURL(generalReportImagePreview);
    }
    if (file) {
      setGeneralReportImagePreview(URL.createObjectURL(file));
    } else {
      setGeneralReportImagePreview(null);
    }
  };

  const handleGeneralReportSubmit = async () => {
    if (!sessionId || !station || !generalReportReason) return;
    setGeneralReportError(null);
    setIsGeneralReportSubmitting(true);
    try {
      if (pendingGeneralStatusId) {
        // Use atomic endpoint - status change + report in one transaction
        // If report fails, status change is rolled back
        await createStatusEventWithReportApi({
          sessionId,
          statusDefinitionId: pendingGeneralStatusId,
          reportType: "general",
          stationId: station.id,
          reportReasonId: generalReportReason,
          description: generalReportNote,
          image: generalReportImage,
          workerId: worker?.id,
        });
        // Only update UI status after successful atomic operation
        setCurrentStatus(pendingGeneralStatusId);
      } else {
        // No status change - just create the report
        await createReportApi({
          type: "general",
          sessionId,
          stationId: station.id,
          reportReasonId: generalReportReason,
          description: generalReportNote,
          image: generalReportImage,
          workerId: worker?.id,
        });
      }

      setGeneralReportDialogOpen(false);
      setGeneralReportReason(undefined);
      setGeneralReportNote("");
      handleGeneralReportImageChange(null);
      setPendingGeneralStatusId(null);
    } catch {
      setGeneralReportError(t("work.error.report"));
    } finally {
      setIsGeneralReportSubmitting(false);
    }
  };

  return (
    <>
      <BackButton href="/checklist/start" />
      <PageHeader
        eyebrow={worker.full_name}
        title={t("work.title")}
        subtitle={`${t("common.job")} ${job.job_number}`}
        actions={
          <Badge variant="secondary" className="border-border bg-secondary text-base text-foreground/80">
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

          <Card className="rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-right text-foreground">
                {t("work.section.status")}
              </CardTitle>
              <CardDescription className="text-right text-muted-foreground">
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
                        "h-auto w-full justify-between rounded-xl border p-4 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                        isActive
                          ? "shadow"
                          : "border-border bg-white text-foreground hover:border-primary/40 hover:bg-primary/5 dark:bg-secondary dark:text-foreground/80 dark:hover:bg-accent",
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
                  <p className="text-sm text-muted-foreground">טוען סטטוסים...</p>
                ) : null}
              </div>
              {statusError ? (
                <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{statusError}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3 text-right">
              <CardTitle className="text-foreground">{t("work.section.production")}</CardTitle>
            </CardHeader>
            <CardContent>
              {station && (
                <ProductionPipeline
                  currentStation={station}
                  currentPosition={pipelineContext.currentPosition}
                  isTerminal={pipelineContext.isTerminal}
                  prevStation={pipelineContext.prevStation as PipelineStation | null}
                  nextStation={pipelineContext.nextStation as PipelineStation | null}
                  upstreamWip={pipelineContext.upstreamWip}
                  waitingOutput={pipelineContext.waitingOutput}
                  goodCount={totals.good}
                  scrapCount={totals.scrap}
                  onGoodChange={(delta) => handleCountDelta("good", delta)}
                  onGoodSet={(value) => handleManualCountChange("good", String(value))}
                  onScrapChange={(delta) => handleCountDelta("scrap", delta)}
                  onScrapSet={(value) => handleManualCountChange("scrap", String(value))}
                  error={productionError}
                  isSingleStation={pipelineContext.isSingleStation}
                  isLegacy={!pipelineContext.jobItem}
                  lastUpdated={pipelineContext.lastUpdated}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-xl border border-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="text-right">
              <CardTitle className="text-right text-foreground">
                {t("work.section.actions")}
              </CardTitle>
              <CardDescription className="text-right text-muted-foreground">
                {t("work.actions.instructions")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center border-dashed border-input bg-secondary/30 text-foreground/80 hover:bg-accent"
                onClick={() => setFaultDialogOpen(true)}
              >
                {t("work.actions.reportFault")}
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-rose-600/30 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10">
            <CardHeader className="text-right">
              <CardTitle className="text-rose-600 dark:text-rose-400">
                {t("work.actions.finish")}
              </CardTitle>
              <CardDescription className="text-rose-500 dark:text-rose-300">
                {t("work.actions.finishWarning")}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-right">
              <Button
                type="button"
                variant="destructive"
                className="w-full justify-center border-0 bg-rose-600 hover:bg-rose-700"
                onClick={() => setEndSessionDialogOpen(true)}
              >
                {t("work.actions.finish")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <Dialog open={isFaultDialogOpen} onOpenChange={(open) => {
        setFaultDialogOpen(open);
        if (!open) setPendingStatusId(null);
      }}>
        <DialogContent dir="rtl" className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("work.dialog.fault.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-right">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {t("work.dialog.fault.reason")}
              </label>
              <Select value={faultReason} onValueChange={setFaultReason}>
                <SelectTrigger className="justify-between border-input bg-secondary text-right text-foreground">
                  <SelectValue placeholder={t("work.dialog.fault.reason")} />
                </SelectTrigger>
                <SelectContent align="end" className="border-input bg-popover">
                  {reasons.length === 0 ? (
                    <SelectItem value="empty" disabled className="text-muted-foreground">
                      {t("checklist.loading")}
                    </SelectItem>
                  ) : (
                    reasons.map((reason) => (
                      <SelectItem key={reason.id} value={reason.id} className="text-foreground focus:bg-accent focus:text-accent-foreground">
                        {formatReason(reason)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {t("work.dialog.fault.note")}
              </label>
              <Textarea
                placeholder={t("work.dialog.fault.note")}
                value={faultNote}
                onChange={(event) => setFaultNote(event.target.value)}
                className="border-input bg-secondary text-right text-foreground placeholder:text-muted-foreground"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {t("work.dialog.fault.image")}
              </label>
              <div className="space-y-3">
                <Input
                  type="file"
                  accept="image/*"
                  aria-label={t("work.dialog.fault.image")}
                  className="border-input bg-secondary text-foreground file:bg-muted file:text-muted-foreground"
                  onChange={(event) =>
                    handleFaultImageChange(event.target.files?.[0] ?? null)
                  }
                />
                {faultImagePreview ? (
                  <div className="overflow-hidden rounded-xl border border-input">
                    <Image
                      src={faultImagePreview}
                      alt={t("work.dialog.fault.image")}
                      width={800}
                      height={400}
                      className="h-48 w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-input p-4 text-right text-sm text-muted-foreground">
                    {t("work.dialog.fault.imagePlaceholder")}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            {faultError ? (
              <p className="w-full text-right text-sm text-rose-600 dark:text-rose-400">
                {faultError}
              </p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="border-input text-foreground/80 hover:bg-accent hover:text-foreground"
              onClick={() => {
                setFaultDialogOpen(false);
                setPendingStatusId(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-primary font-medium text-primary-foreground hover:bg-primary/90"
              disabled={isFaultSubmitting || !faultReason}
              onClick={async () => {
                if (!station || !faultReason) return;
                setFaultError(null);
                setIsFaultSubmitting(true);
                try {
                  if (pendingStatusId) {
                    // Use atomic endpoint - status change + report in one transaction
                    // If report fails, status change is rolled back
                    await createStatusEventWithReportApi({
                      sessionId,
                      statusDefinitionId: pendingStatusId,
                      reportType: "malfunction",
                      stationId: station.id,
                      stationReasonId: faultReason,
                      description: faultNote,
                      image: faultImage,
                      workerId: worker?.id,
                    });
                    // Only update UI status after successful atomic operation
                    setCurrentStatus(pendingStatusId);
                  } else {
                    // No status change - just create the report
                    await createReportApi({
                      type: "malfunction",
                      stationId: station.id,
                      stationReasonId: faultReason,
                      description: faultNote,
                      image: faultImage,
                      workerId: worker?.id,
                      sessionId: sessionId,
                    });
                  }

                  setFaultDialogOpen(false);
                  setFaultReason(undefined);
                  setFaultNote("");
                  handleFaultImageChange(null);
                  setPendingStatusId(null);
                } catch {
                  setFaultError(t("work.error.fault"));
                } finally {
                  setIsFaultSubmitting(false);
                }
              }}
            >
              {isFaultSubmitting
                ? `${t("work.dialog.fault.submit")}...`
                : pendingStatusId
                  ? t("work.dialog.fault.submitAndChangeStatus")
                  : t("work.dialog.fault.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isGeneralReportDialogOpen} onOpenChange={(open) => {
        setGeneralReportDialogOpen(open);
        if (!open) setPendingGeneralStatusId(null);
      }}>
        <DialogContent dir="rtl" className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("work.dialog.report.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-right">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {t("work.dialog.report.reason")}
              </label>
              <Select value={generalReportReason} onValueChange={setGeneralReportReason}>
                <SelectTrigger className="justify-between border-input bg-secondary text-right text-foreground">
                  <SelectValue placeholder={t("work.dialog.report.reason")} />
                </SelectTrigger>
                <SelectContent align="end" className="border-input bg-popover">
                  {generalReportReasons.length === 0 ? (
                    <SelectItem value="empty" disabled className="text-muted-foreground">
                      {t("checklist.loading")}
                    </SelectItem>
                  ) : (
                    generalReportReasons.map((reason) => (
                      <SelectItem key={reason.id} value={reason.id} className="text-foreground focus:bg-accent focus:text-accent-foreground">
                        {language === "he" ? reason.label_he : (reason.label_ru ?? reason.label_he)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {t("work.dialog.report.note")}
              </label>
              <Textarea
                placeholder={t("work.dialog.report.note")}
                value={generalReportNote}
                onChange={(event) => setGeneralReportNote(event.target.value)}
                className="border-input bg-secondary text-right text-foreground placeholder:text-muted-foreground"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {t("work.dialog.report.image")}
              </label>
              <div className="space-y-3">
                <Input
                  type="file"
                  accept="image/*"
                  aria-label={t("work.dialog.report.image")}
                  className="border-input bg-secondary text-foreground file:bg-muted file:text-muted-foreground"
                  onChange={(event) =>
                    handleGeneralReportImageChange(event.target.files?.[0] ?? null)
                  }
                />
                {generalReportImagePreview ? (
                  <div className="overflow-hidden rounded-xl border border-input">
                    <Image
                      src={generalReportImagePreview}
                      alt={t("work.dialog.report.image")}
                      width={800}
                      height={400}
                      className="h-48 w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-input p-4 text-right text-sm text-muted-foreground">
                    {t("work.dialog.report.imagePlaceholder")}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            {generalReportError ? (
              <p className="w-full text-right text-sm text-rose-600 dark:text-rose-400">
                {generalReportError}
              </p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="border-input text-foreground/80 hover:bg-accent hover:text-foreground"
              onClick={() => {
                setGeneralReportDialogOpen(false);
                setPendingGeneralStatusId(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-primary font-medium text-primary-foreground hover:bg-primary/90"
              disabled={isGeneralReportSubmitting || !generalReportReason}
              onClick={() => void handleGeneralReportSubmit()}
            >
              {isGeneralReportSubmitting
                ? `${t("work.dialog.report.submit")}...`
                : pendingGeneralStatusId
                  ? t("work.dialog.report.submitAndChangeStatus")
                  : t("work.dialog.report.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEndSessionDialogOpen} onOpenChange={setEndSessionDialogOpen}>
        <DialogContent dir="rtl" className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("work.dialog.finish.title")}</DialogTitle>
            <CardDescription className="text-muted-foreground">{t("work.dialog.finish.description")}</CardDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="border-input text-foreground/80 hover:bg-accent hover:text-foreground"
              onClick={() => setEndSessionDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="border-0 bg-rose-600 hover:bg-rose-700"
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
        "rounded-xl border-2 bg-card/50 backdrop-blur-sm",
      )}
      style={{
        borderColor: visual?.timerBorder ?? neutralVisual.timerBorder,
        boxShadow: visual?.shadow ?? neutralVisual.shadow,
      }}
    >
      <CardHeader className="space-y-2 text-right">
        <CardTitle className="text-foreground">{title}</CardTitle>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <CardDescription className="text-xs text-muted-foreground">
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
        <p className="text-sm text-muted-foreground">{badgeLabel}</p>
        <p className="text-5xl font-semibold text-foreground">
          {formatDuration(elapsed)}
        </p>
      </CardContent>
    </Card>
  );
}
