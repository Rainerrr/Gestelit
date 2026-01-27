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
  bindJobItemToSessionApi,
  checkFirstProductApprovalApi,
  createReportApi,
  createSessionApi,
  createStatusEventWithReportApi,
  endProductionStatusApi,
  fetchJobItemsAtStationApi,
  fetchReportReasonsApi,
  fetchSessionScrapReportsApi,
  fetchSessionTotalsApi,
  startStatusEventApi,
  submitChecklistResponsesApi,
  submitFirstProductApprovalApi,
  takeoverSessionApi,
  type FirstProductApprovalStatus,
} from "@/lib/api/client";
import {
  JobSelectionSheet,
  type JobSelectionResult,
} from "@/components/work/job-selection-sheet";
import { JobProgressPanel } from "@/components/work/job-progress-panel";
import { ScrapSection, type SessionScrapReport } from "@/components/work/scrap-section";
import {
  QuantityReportDialog,
  type QuantityReportResult,
} from "@/components/work/quantity-report-dialog";
import {
  FirstProductApprovalBanner,
  type FirstProductApprovalBannerStatus,
  type FirstProductApprovalSubmitData,
} from "@/components/work/first-product-approval-banner";
import {
  JobCompletionDialog,
  type AvailableJobItemForCompletion,
  type JobCompletionResult,
} from "@/components/work/job-completion-dialog";
import { getActiveStationReasons } from "@/lib/data/station-reasons";
import {
  buildStatusDictionary,
  getStatusHex,
  getStatusLabel,
  sortStatusDefinitions,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { getOrCreateInstanceId } from "@/lib/utils/instance-id";
import type { ReportReason, StationReason, StatusDefinition } from "@/lib/types";
import { useSessionHeartbeat } from "@/hooks/useSessionHeartbeat";
import { useSessionBroadcast } from "@/hooks/useSessionBroadcast";
import { fetchStationStatusesApi } from "@/lib/api/client";
import { persistSessionState } from "@/lib/utils/session-storage";
import { Spinner, FullPageSpinner } from "@/components/ui/spinner";

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
  const {
    worker,
    station,
    pendingStation,
    sessionId,
    setStation,
    setSessionId,
    setSessionStartedAt,
    setCurrentStatus,
    setPendingStation,
    completeChecklist,
    checklist: checklistState,
  } = useWorkerSession();
  const router = useRouter();
  const { t } = useTranslation();

  // State for deferred session creation
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const sessionCreationAttempted = useRef(false);

  // Use effective station (either from active session or pending)
  const effectiveStation = station ?? pendingStation;

  // Memoize instanceId to avoid recreating on each render
  const instanceId = useMemo(() => getOrCreateInstanceId(), []);

  // Route guards - redirect if missing required context
  useEffect(() => {
    if (!worker) {
      router.replace("/login");
      return;
    }
    // Need either station (existing session) or pendingStation (new flow)
    if (worker && !effectiveStation) {
      router.replace("/station");
    }
  }, [worker, effectiveStation, router]);

  // Deferred session creation: create session when page loads with pendingStation but no sessionId
  useEffect(() => {
    // Skip if already have session, not have pending station, or already attempted
    if (sessionId || !pendingStation || !worker || sessionCreationAttempted.current) {
      return;
    }

    sessionCreationAttempted.current = true;

    const createSessionAndSetup = async () => {
      setIsCreatingSession(true);
      setSessionError(null);

      try {
        // 1. Create the session
        const session = await createSessionApi(
          worker.id,
          pendingStation.id,
          null, // No job at session creation time
          instanceId
        );

        // 2. Submit pending checklist responses if any
        try {
          const pendingResponses = sessionStorage.getItem("pendingChecklistResponses");
          if (pendingResponses) {
            const responses = JSON.parse(pendingResponses);
            await submitChecklistResponsesApi(
              session.id,
              pendingStation.id,
              "start",
              responses
            );
            sessionStorage.removeItem("pendingChecklistResponses");
          }
        } catch {
          // Checklist submission is optional - don't fail session creation
          console.warn("[WorkPage] Failed to submit checklist responses");
        }

        // 3. Fetch statuses and set initial stoppage status
        const statuses = await fetchStationStatusesApi(pendingStation.id);
        const stoppedStatus =
          statuses.find((item) => item.machine_state === "stoppage") ??
          statuses.find((item) => item.scope === "global") ??
          statuses[0];

        if (stoppedStatus?.id) {
          await startStatusEventApi({
            sessionId: session.id,
            statusDefinitionId: stoppedStatus.id,
          });
          setCurrentStatus(stoppedStatus.id);
        }

        // 4. Update context with new session
        setStation(pendingStation);
        setSessionId(session.id);
        setSessionStartedAt(session.started_at ?? null);
        setPendingStation(null);

        // 5. Mark checklist as completed (it was completed before navigation)
        if (!checklistState.startCompleted) {
          completeChecklist("start");
        }

        // 6. Persist session state
        persistSessionState({
          sessionId: session.id,
          workerId: worker.id,
          workerCode: worker.worker_code,
          workerFullName: worker.full_name,
          stationId: pendingStation.id,
          stationName: pendingStation.name,
          stationCode: pendingStation.code,
          jobId: null,
          jobNumber: null,
          startedAt: session.started_at ?? new Date().toISOString(),
          totals: { good: 0, scrap: 0 },
        });
      } catch (error) {
        console.error("[WorkPage] Failed to create session:", error);
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

    void createSessionAndSetup();
  }, [
    sessionId,
    pendingStation,
    worker,
    instanceId,
    setStation,
    setSessionId,
    setSessionStartedAt,
    setCurrentStatus,
    setPendingStation,
    completeChecklist,
    checklistState.startCompleted,
    t,
  ]);

  // Loading state while creating session
  if (isCreatingSession) {
    return <FullPageSpinner label={t("work.creatingSession")} />;
  }

  // Error state if session creation failed
  if (sessionError) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 p-4">
        <div className="rounded-xl border-2 border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-lg font-semibold text-red-400">{sessionError}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.replace("/station")}
          >
            {t("station.tryAgain")}
          </Button>
        </div>
      </div>
    );
  }

  // Guard render - wait for session to be ready
  if (!worker || !effectiveStation || !sessionId) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Spinner size="lg" label={t("common.loading")} />
      </div>
    );
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
    activeJobItem,
    setActiveJobItem,
    setJob,
    currentStatusEventId,
    setCurrentStatusEventId,
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

  // Job selection dialog state (for entering production without job)
  const [isJobSelectionDialogOpen, setJobSelectionDialogOpen] = useState(false);
  const [pendingProductionStatusId, setPendingProductionStatusId] = useState<string | null>(null);
  const [isJobSelectionSubmitting, setIsJobSelectionSubmitting] = useState(false);
  // Track if force job selection mode is active (cannot dismiss dialog without selection)
  const [isForceJobSelection, setIsForceJobSelection] = useState(false);

  // Quantity report dialog state (for leaving production)
  const [isQuantityReportDialogOpen, setQuantityReportDialogOpen] = useState(false);
  const [pendingExitStatusId, setPendingExitStatusId] = useState<string | null>(null);
  const [isQuantityReportSubmitting, setIsQuantityReportSubmitting] = useState(false);
  // Track if this is a job switch (need to open job selection after quantity report)
  const [isPendingJobSwitch, setIsPendingJobSwitch] = useState(false);
  // Track the job item being switched FROM (to exclude from selection list)
  const [excludeJobItemId, setExcludeJobItemId] = useState<string | null>(null);
  // Track pending report info when leaving production to a status that requires a report
  const [pendingReportAfterQuantity, setPendingReportAfterQuantity] = useState<{
    statusId: string;
    reportType: "malfunction" | "general";
  } | null>(null);
  // Track when a report is required for an ALREADY-CREATED status event
  // This prevents creating duplicate status events when submitting the report
  const [pendingReportForCurrentStatus, setPendingReportForCurrentStatus] = useState<{
    statusEventId: string;
    reportType: "malfunction" | "general";
  } | null>(null);
  // Track pending production exit data when leaving to report-requiring status
  // This defers the API call until the report is actually submitted
  const [pendingProductionExit, setPendingProductionExit] = useState<{
    productionStatusEventId: string;
    targetStatusId: string;
    reportType: "malfunction" | "general";
    quantities: {
      good: number;
      scrap: number;
      scrapNote?: string;
      scrapImage?: File | null;
    };
    shouldCloseJobItem: boolean;
  } | null>(null);

  // First Product Approval state (per-step, per-session)
  const [approvalStatus, setApprovalStatus] = useState<FirstProductApprovalStatus | null>(null);
  const [isApprovalSubmitting, setIsApprovalSubmitting] = useState(false);
  const [isApprovalPolling, setIsApprovalPolling] = useState(false);

  // Job completion dialog state
  const [isCompletionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completedJobItemName, setCompletedJobItemName] = useState("");
  const [completedJobItemId, setCompletedJobItemId] = useState<string | null>(null);
  const [availableJobItemsForCompletion, setAvailableJobItemsForCompletion] = useState<AvailableJobItemForCompletion[]>([]);
  const [isCompletionLoading, setCompletionLoading] = useState(false);
  const [isCompletionSubmitting, setCompletionSubmitting] = useState(false);
  // Store the exit status ID when job item is completed
  const [completionExitStatusId, setCompletionExitStatusId] = useState<string | null>(null);
  // Track if completion dialog should open after report dialog is submitted
  const [pendingCompletionAfterReport, setPendingCompletionAfterReport] = useState(false);

  // Scrap reports state
  const [scrapReports, setScrapReports] = useState<SessionScrapReport[]>([]);
  const [isEditingScrapReport, setIsEditingScrapReport] = useState(false);
  const [editingScrapReport, setEditingScrapReport] = useState<SessionScrapReport | null>(null);

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

  // Fetch scrap reports when session has scrap or when scrap count changes
  useEffect(() => {
    if (!sessionId || totals.scrap === 0) {
      setScrapReports([]);
      return;
    }

    fetchSessionScrapReportsApi(sessionId)
      .then((reports) => {
        // Map API response to component type (they should match but ensure safety)
        setScrapReports(reports as SessionScrapReport[]);
      })
      .catch((err) => {
        console.error("[work] Failed to fetch scrap reports:", err);
        setScrapReports([]);
      });
  }, [sessionId, totals.scrap]);

  // Check first product approval status when session or job item changes
  useEffect(() => {
    if (!sessionId) {
      setApprovalStatus(null);
      return;
    }

    const checkApproval = async () => {
      try {
        const status = await checkFirstProductApprovalApi(sessionId);
        setApprovalStatus(status);
      } catch (err) {
        console.error("[work] Failed to check first product approval:", err);
        setApprovalStatus(null);
      }
    };

    void checkApproval();
  }, [sessionId, activeJobItem?.id]); // Re-check when job item changes

  // Poll for approval when status is pending
  useEffect(() => {
    if (!sessionId || approvalStatus?.status !== "pending") {
      setIsApprovalPolling(false);
      return;
    }

    setIsApprovalPolling(true);
    const intervalId = setInterval(async () => {
      try {
        const status = await checkFirstProductApprovalApi(sessionId);
        setApprovalStatus(status);
        if (status.status === "approved") {
          setIsApprovalPolling(false);
        }
      } catch (err) {
        console.error("[work] Approval poll error:", err);
      }
    }, 5000); // Poll every 5 seconds

    return () => {
      clearInterval(intervalId);
      setIsApprovalPolling(false);
    };
  }, [sessionId, approvalStatus?.status]);

  // Track if we've already synced totals for this session to avoid redundant API calls
  const hasSyncedTotalsRef = useRef<string | null>(null);

  // Sync session totals from database when work page loads
  // This is a critical fix for the quantity mismatch bug:
  // - When a session is resumed, the context might have totals = {good: 0, scrap: 0}
  // - This effect fetches the actual totals from the database (single source of truth)
  // - We only sync once per session to avoid overwriting user's in-progress work
  useEffect(() => {
    // Skip if no session or if we've already synced for this session
    if (!sessionId || hasSyncedTotalsRef.current === sessionId) {
      return;
    }

    // Mark as synced immediately to prevent duplicate calls
    hasSyncedTotalsRef.current = sessionId;

    // Fetch totals from database
    fetchSessionTotalsApi(sessionId)
      .then((dbTotals) => {
        // Only update if we have actual data
        if (dbTotals) {
          console.log("[work] Syncing totals from DB:", dbTotals);
          updateTotals({
            good: dbTotals.good,
            scrap: dbTotals.scrap,
          });
        }
      })
      .catch((err) => {
        // Log but don't fail - user can still work, totals will accumulate from 0
        console.warn("[work] Failed to sync session totals:", err);
      });
  }, [sessionId, updateTotals]);

  // Force job selection when in production without an active job item
  // This can happen if:
  // 1. Session was recovered while in production status but job binding was lost
  // 2. Status was changed externally (admin, API) to production
  const stationId = station?.id;
  const activeJobItemId = activeJobItem?.id;
  useEffect(() => {
    // Don't force job selection if completion dialog is already handling the transition
    if (isCompletionDialogOpen) {
      return;
    }

    // Build status dictionary to check machine state
    const dict = buildStatusDictionary(statuses);
    const statusDef = currentStatus
      ? (dict.global.get(currentStatus) ??
         (stationId ? dict.station.get(stationId)?.get(currentStatus) : undefined))
      : undefined;

    const isProductionStatus = statusDef?.machine_state === "production";

    // If in production without job item, force job selection dialog
    if (isProductionStatus && !activeJobItemId && stationId && !isJobSelectionDialogOpen) {
      console.log("[WorkPageContent] In production without job item, forcing job selection");
      setPendingProductionStatusId(currentStatus ?? null);
      setIsForceJobSelection(true);
      setJobSelectionDialogOpen(true);
    }
  }, [currentStatus, activeJobItemId, statuses, stationId, isJobSelectionDialogOpen, isCompletionDialogOpen]);

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
  // Note: job is now optional - it's selected when entering production
  if (!worker || !station || !sessionId) {
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

  // Check if current status is a production status
  const currentStatusDef = currentStatusSafe ? getStatusDefinition(currentStatusSafe) : undefined;
  const isInProduction = currentStatusDef?.machine_state === "production";

  // Handlers for scrap section
  const handleAddScrap = () => {
    // Open quantity report dialog with scrap mode active
    // For now, just open fault dialog as a way to add scrap
    setFaultDialogOpen(true);
  };

  const handleEditScrapReport = (report: SessionScrapReport) => {
    setEditingScrapReport(report);
    setIsEditingScrapReport(true);
    // TODO: Implement scrap report edit dialog
    // For now, this is a placeholder - we'd need to create an edit dialog
    console.log("[work] Edit scrap report:", report.id);
  };

  // Handle "Switch Job" action - behavior depends on current status
  const handleSwitchJob = () => {
    if (isInProduction) {
      // In production: need to report quantities first, then switch job immediately
      if (activeJobItem && currentStatusEventId) {
        // Store the job item ID to exclude from selection list
        setExcludeJobItemId(activeJobItem.id);
        // Need to report quantities first
        setPendingExitStatusId(currentStatus ?? null); // Stay in production after reporting
        setIsPendingJobSwitch(true);
        setQuantityReportDialogOpen(true);
      } else {
        // No active job item or no status event ID - just open job selection
        setPendingProductionStatusId(currentStatus ?? null);
        setJobSelectionDialogOpen(true);
      }
    } else {
      // Not in production (stoppage/setup): deferred job selection
      // Just open job selection - binding happens when entering production
      setExcludeJobItemId(activeJobItem?.id ?? null);
      setJobSelectionDialogOpen(true);
    }
  };

  // Handle immediate job binding (for non-production status)
  const handleImmediateJobBinding = async (result: JobSelectionResult) => {
    if (!sessionId) return;

    setIsJobSelectionSubmitting(true);
    setStatusError(null);

    try {
      // Immediately bind the new job item to the session
      await bindJobItemToSessionApi(
        sessionId,
        result.job.id,
        result.jobItem.id,
        result.jobItem.jobItemStepId,
      );

      // Update context with new active job item
      setActiveJobItem({
        id: result.jobItem.id,
        jobId: result.job.id,
        name: result.jobItem.name,
        plannedQuantity: result.jobItem.plannedQuantity,
        completedGood: result.jobItem.completedGood,
        jobItemStepId: result.jobItem.jobItemStepId,
      });

      // Update job context
      setJob({
        id: result.job.id,
        job_number: result.job.jobNumber,
        customer_name: result.job.clientName,
        description: result.job.description,
        created_at: new Date().toISOString(),
      });

      // Check if first product approval is required for the new job item's step
      const newApprovalStatus = await checkFirstProductApprovalApi(sessionId);
      setApprovalStatus(newApprovalStatus);

      // Reset session totals for the new job item
      updateTotals({ good: 0, scrap: 0 });

      // Close dialog
      setJobSelectionDialogOpen(false);
      setExcludeJobItemId(null);
    } catch (error) {
      console.error("[work] Failed to bind job item:", error);
      setStatusError("שגיאה בקישור עבודה לתפק\"ע");
    } finally {
      setIsJobSelectionSubmitting(false);
    }
  };

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

    // Check if entering production status without an active job item
    // If so, open job selection dialog first
    const isTargetProductionStatus = statusDef?.machine_state === "production";
    if (isTargetProductionStatus && !activeJobItem && station) {
      setPendingProductionStatusId(statusId);
      setJobSelectionDialogOpen(true);
      return;
    }

    // Check if LEAVING production status (current is production, target is not)
    // If so, show quantity report dialog first
    const isLeavingProduction =
      isInProduction &&
      !isTargetProductionStatus &&
      activeJobItem &&
      currentStatusEventId;

    if (isLeavingProduction) {
      setPendingExitStatusId(statusId);
      setIsPendingJobSwitch(false);
      // If target status requires a report, store it to show after quantity dialog
      if (reportType === "malfunction" || reportType === "general") {
        setPendingReportAfterQuantity({ statusId, reportType });
      } else {
        setPendingReportAfterQuantity(null);
      }
      setQuantityReportDialogOpen(true);
      return;
    }

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
      const statusEvent = await startStatusEventApi({
        sessionId,
        statusDefinitionId: statusId,
        reportId: reportId,
      });

      // Store the status event ID for quantity reporting later
      if (statusEvent?.id) {
        setCurrentStatusEventId(statusEvent.id);
      }
    } catch {
      setStatusError(t("work.error.status"));
    }
  };

  // Handler for job selection dialog completion
  const handleJobSelectionComplete = async (result: JobSelectionResult) => {
    if (!sessionId || !pendingProductionStatusId || !station) return;

    setIsJobSelectionSubmitting(true);
    setStatusError(null);

    try {
      // Proceed with starting production
      await proceedWithProduction(result);
    } catch (error) {
      console.error("[work] Failed to complete job selection:", error);
      const message = error instanceof Error ? error.message : String(error);

      // Provide specific error messages based on error type
      if (message.includes("bind") || message.includes("session")) {
        setStatusError("שגיאה בקישור עבודה לתפק\"ע. נסה שנית.");
      } else if (message.includes("network") || message.includes("fetch")) {
        setStatusError("שגיאת רשת. בדוק את החיבור ונסה שנית.");
      } else {
        setStatusError("שגיאה בבחירת עבודה. נסה שנית.");
      }
      setIsJobSelectionSubmitting(false);
    }
  };

  // Helper function to proceed with production after job selection (and QA if required)
  const proceedWithProduction = async (result: JobSelectionResult) => {
    if (!sessionId || !pendingProductionStatusId) return;

    try {
      // 1. Bind job item to session
      await bindJobItemToSessionApi(
        sessionId,
        result.job.id,
        result.jobItem.id,
        result.jobItem.jobItemStepId,
      );

      // 2. Update context with active job item (including completedGood for progress tracking)
      setActiveJobItem({
        id: result.jobItem.id,
        jobId: result.job.id,
        name: result.jobItem.name,
        plannedQuantity: result.jobItem.plannedQuantity,
        completedGood: result.jobItem.completedGood,
        jobItemStepId: result.jobItem.jobItemStepId,
      });

      // 3. Also set the job in context for display
      setJob({
        id: result.job.id,
        job_number: result.job.jobNumber,
        customer_name: result.job.clientName,
        description: result.job.description,
        created_at: new Date().toISOString(),
      });

      // 4. Check if first product approval is required for this step
      // This must be checked AFTER binding the job item, as the API uses session's bound step
      const newApprovalStatus = await checkFirstProductApprovalApi(sessionId);
      setApprovalStatus(newApprovalStatus);

      // 5. If first product approval is required and not yet approved, switch to setup status
      // Don't switch to production - the worker must submit and get approval first
      const isApprovalBlocking = newApprovalStatus.required && newApprovalStatus.status !== "approved";

      if (isApprovalBlocking) {
        // Find a setup status (כיוונים) to switch to instead of production
        const setupStatus = orderedStatuses.find(s => s.machine_state === "setup");
        if (setupStatus) {
          setCurrentStatus(setupStatus.id);
          const statusEvent = await startStatusEventApi({
            sessionId,
            statusDefinitionId: setupStatus.id,
          });
          if (statusEvent?.id) {
            setCurrentStatusEventId(statusEvent.id);
          }
        }
        // The banner will show prompting for first product approval
      } else {
        // 6. Switch to production status and capture the event ID
        setCurrentStatus(pendingProductionStatusId);
        const statusEvent = await startStatusEventApi({
          sessionId,
          statusDefinitionId: pendingProductionStatusId,
        });

        // 7. Store the status event ID for quantity reporting later
        if (statusEvent?.id) {
          setCurrentStatusEventId(statusEvent.id);
        }
      }

      // 8. Reset session totals for the new job item
      // This is critical - totals are per-job-item, not per-session
      updateTotals({ good: 0, scrap: 0 });

      // 9. Close dialog and reset state
      setJobSelectionDialogOpen(false);
      setPendingProductionStatusId(null);
      setIsForceJobSelection(false);
      setExcludeJobItemId(null);
    } catch (error) {
      console.error("[work] Failed to bind job and start production:", error);
      const message = error instanceof Error ? error.message : String(error);

      // Provide specific error messages based on failure point
      if (message.includes("bind") || message.includes("job_item")) {
        setStatusError("שגיאה בקישור עבודה לתפק\"ע. נסה שנית.");
      } else if (message.includes("status") || message.includes("event")) {
        setStatusError("שגיאה במעבר לסטטוס ייצור. נסה שנית.");
      } else {
        setStatusError("שגיאה בתחילת ייצור. נסה שנית.");
      }
      throw error;
    } finally {
      setIsJobSelectionSubmitting(false);
    }
  };

  const handleJobSelectionCancel = () => {
    // If force mode is active, don't allow canceling
    if (isForceJobSelection) {
      return;
    }
    setJobSelectionDialogOpen(false);
    setPendingProductionStatusId(null);
    setExcludeJobItemId(null);
  };

  // Handler for quantity report dialog submission
  const handleQuantityReportSubmit = async (result: QuantityReportResult) => {
    if (!sessionId || !currentStatusEventId || !pendingExitStatusId) {
      console.error("[work] Missing required data for quantity report");
      return;
    }

    // Check if we're leaving production to a status that requires a report
    // If so, DEFER the API call until the report is submitted
    if (pendingReportAfterQuantity) {
      const { statusId: targetStatusId, reportType } = pendingReportAfterQuantity;

      // Store all data for deferred API call - DO NOT call API yet
      setPendingProductionExit({
        productionStatusEventId: currentStatusEventId,
        targetStatusId,
        reportType,
        quantities: {
          good: result.additionalGood,
          scrap: result.additionalScrap,
          scrapNote: result.scrapNote,
          scrapImage: result.scrapImage,
        },
        shouldCloseJobItem: result.shouldCloseJobItem ?? false,
      });

      // Close quantity dialog
      setQuantityReportDialogOpen(false);
      setPendingReportAfterQuantity(null);
      setPendingExitStatusId(null);

      // Open appropriate report dialog
      if (reportType === "malfunction") {
        setFaultDialogOpen(true);
      } else if (reportType === "general") {
        if (generalReportReasons.length === 0) {
          fetchReportReasonsApi().then(setGeneralReportReasons).catch(console.error);
        }
        setGeneralReportDialogOpen(true);
      }
      return; // Exit early - don't call API
    }

    setIsQuantityReportSubmitting(true);
    setStatusError(null);

    // Store production event ID before the API call (scrap was produced during this event)
    const productionStatusEventId = currentStatusEventId;

    try {
      // Call the atomic API to end production and transition to next status
      const response = await endProductionStatusApi({
        sessionId,
        statusEventId: currentStatusEventId,
        quantityGood: result.additionalGood,
        quantityScrap: result.additionalScrap,
        nextStatusId: pendingExitStatusId,
      });

      // Create scrap report if scrap was reported with note
      // Link to the PRODUCTION status event (where scrap was produced)
      if (result.additionalScrap > 0 && result.scrapNote && station) {
        try {
          await createReportApi({
            type: "scrap",
            sessionId,
            stationId: station.id,
            workerId: worker?.id,
            description: result.scrapNote,
            image: result.scrapImage ?? undefined,
            statusEventId: productionStatusEventId,
          });
        } catch (reportError) {
          // Log but don't fail the whole operation
          console.error("[work] Failed to create scrap report:", reportError);
        }
      }

      // Update local totals to reflect the new values
      updateTotals({
        good: totals.good + result.additionalGood,
        scrap: totals.scrap + result.additionalScrap,
      });

      // Update activeJobItem.completedGood to keep in sync with DB
      // The progress panel uses completedGood directly (not adding sessionTotals)
      if (activeJobItem) {
        setActiveJobItem({
          ...activeJobItem,
          completedGood: (activeJobItem.completedGood ?? 0) + result.additionalGood,
        });
      }

      // Update current status
      setCurrentStatus(pendingExitStatusId);

      // Update current status event ID to the new event
      if (response.newStatusEvent?.id) {
        setCurrentStatusEventId(response.newStatusEvent.id);
      }

      // Close quantity report dialog
      setQuantityReportDialogOpen(false);

      // Helper to open completion dialog and fetch available jobs
      // Takes excludeJobItemId as param since setState is async
      const openCompletionDialog = async (excludeJobItemId: string | null) => {
        if (!station) return;
        setCompletionLoading(true);
        setCompletionDialogOpen(true);

        try {
          const items = await fetchJobItemsAtStationApi(station.id);
          // Filter out completed items AND the just-completed job item
          // (in case DB hasn't updated yet or item is at 100%)
          const available: AvailableJobItemForCompletion[] = items
            .filter((item) =>
              item.completedGood < item.plannedQuantity &&
              item.id !== excludeJobItemId
            )
            .map((item) => ({
              id: item.id,
              jobId: item.jobId,
              jobNumber: item.jobNumber,
              customerName: item.customerName,
              name: item.name,
              plannedQuantity: item.plannedQuantity,
              completedGood: item.completedGood,
              jobItemStepId: item.jobItemStepId,
            }));
          setAvailableJobItemsForCompletion(available);
        } catch (err) {
          console.error("[work] Failed to fetch available job items:", err);
          setAvailableJobItemsForCompletion([]);
        } finally {
          setCompletionLoading(false);
        }
      };

      // If job item is completed (shouldCloseJobItem), handle completion flow
      if (result.shouldCloseJobItem && station) {
        // Store completed job item info BEFORE clearing
        const jobItemIdToExclude = activeJobItem?.id ?? null;
        setCompletedJobItemName(activeJobItem?.name ?? "");
        setCompletedJobItemId(jobItemIdToExclude);
        setCompletionExitStatusId(pendingExitStatusId);
        setPendingExitStatusId(null);
        setIsPendingJobSwitch(false);

        // Clear active job item - it's completed
        setActiveJobItem(null);

        // Check if target status requires a report BEFORE opening completion dialog
        if (pendingReportAfterQuantity && response.newStatusEvent?.id) {
          const { reportType } = pendingReportAfterQuantity;
          setPendingReportAfterQuantity(null);

          // Store the new status event ID - report will be linked to this event
          setPendingReportForCurrentStatus({
            statusEventId: response.newStatusEvent.id,
            reportType,
          });

          // Mark that completion dialog should open after report is submitted
          setPendingCompletionAfterReport(true);

          // Open report dialog first
          if (reportType === "malfunction") {
            setFaultDialogOpen(true);
          } else if (reportType === "general") {
            if (generalReportReasons.length === 0) {
              fetchReportReasonsApi().then((reasons) => {
                setGeneralReportReasons(reasons);
              }).catch(console.error);
            }
            setGeneralReportDialogOpen(true);
          }
          return;
        }

        // No pending report - open completion dialog directly
        await openCompletionDialog(jobItemIdToExclude);
        return;
      }

      // Reset state
      setPendingExitStatusId(null);

      // If this was a job switch, open job selection dialog
      if (isPendingJobSwitch) {
        setIsPendingJobSwitch(false);
        // Clear active job item since we're switching
        setActiveJobItem(null);
        // Open job selection for the production status we were in
        setPendingProductionStatusId(currentStatus ?? null);
        setJobSelectionDialogOpen(true);
        setPendingReportAfterQuantity(null);
        return;
      }

      // If target status requires a report, open the appropriate dialog now
      // Use pendingReportForCurrentStatus (NOT pendingStatusId) to avoid creating duplicate status events
      if (pendingReportAfterQuantity && response.newStatusEvent?.id) {
        const { reportType } = pendingReportAfterQuantity;
        setPendingReportAfterQuantity(null);

        // Store the new status event ID - report will be linked to this event
        // DON'T set pendingStatusId - we're already in this status
        setPendingReportForCurrentStatus({
          statusEventId: response.newStatusEvent.id,
          reportType,
        });

        if (reportType === "malfunction") {
          setFaultDialogOpen(true);
        } else if (reportType === "general") {
          // Fetch report reasons if not already loaded
          if (generalReportReasons.length === 0) {
            fetchReportReasonsApi().then((reasons) => {
              setGeneralReportReasons(reasons);
            }).catch(console.error);
          }
          setGeneralReportDialogOpen(true);
        }
      }
    } catch (error) {
      console.error("[work] Failed to submit quantity report:", error);
      setStatusError("שגיאה בשמירת הכמויות");
    } finally {
      setIsQuantityReportSubmitting(false);
    }
  };

  const handleQuantityReportCancel = () => {
    // Allow cancel for both job switches and status switches
    // Worker can stay in current production state
    setQuantityReportDialogOpen(false);
    setPendingExitStatusId(null);
    setIsPendingJobSwitch(false);
    setPendingReportAfterQuantity(null);
  };

  // Handler for job completion dialog
  const handleJobCompletionComplete = async (result: JobCompletionResult) => {
    if (!sessionId || !station) return;

    setCompletionSubmitting(true);
    setStatusError(null);

    try {
      if (result.action === "select") {
        // User selected a new job item - bind it and enter production
        const { jobItem } = result;

        // 1. Bind new job item to session
        await bindJobItemToSessionApi(
          sessionId,
          jobItem.jobId,
          jobItem.id,
          jobItem.jobItemStepId,
        );

        // 2. Update context with new active job item
        setActiveJobItem({
          id: jobItem.id,
          jobId: jobItem.jobId,
          name: jobItem.name,
          plannedQuantity: jobItem.plannedQuantity,
          completedGood: jobItem.completedGood,
          jobItemStepId: jobItem.jobItemStepId,
        });

        // 3. Update job context
        setJob({
          id: jobItem.jobId,
          job_number: jobItem.jobNumber,
          customer_name: jobItem.customerName,
          description: null,
          created_at: new Date().toISOString(),
        });

        // 4. Find production status and start it
        const productionStatus = statuses.find(
          (s) => s.machine_state === "production" && s.is_protected
        );
        if (productionStatus) {
          const statusEvent = await startStatusEventApi({
            sessionId,
            statusDefinitionId: productionStatus.id,
          });
          setCurrentStatus(productionStatus.id);
          if (statusEvent?.id) {
            setCurrentStatusEventId(statusEvent.id);
          }
        }

        // 5. Reset session totals for new job item
        updateTotals({ good: 0, scrap: 0 });
      } else if (result.action === "setup") {
        // User chose setup - transition to the designated setup status
        const SETUP_STATUS_ID = "aba59ce0-d35a-4a2a-a95f-5e0339f4942e";

        const statusEvent = await startStatusEventApi({
          sessionId,
          statusDefinitionId: SETUP_STATUS_ID,
        });
        setCurrentStatus(SETUP_STATUS_ID);
        if (statusEvent?.id) {
          setCurrentStatusEventId(statusEvent.id);
        }

        // Clear active job item and job since we're in setup
        setActiveJobItem(null);
        setJob(undefined);
        updateTotals({ good: 0, scrap: 0 });
      }

      // Close completion dialog and clean up state
      setCompletionDialogOpen(false);
      setCompletionExitStatusId(null);
      setCompletedJobItemId(null);
    } catch (error) {
      console.error("[work] Failed to complete job transition:", error);
      setStatusError("שגיאה במעבר לעבודה הבאה");
    } finally {
      setCompletionSubmitting(false);
    }
  };

  // Handler for step-level first product approval submission
  const handleApprovalSubmit = async (data: FirstProductApprovalSubmitData) => {
    if (!sessionId) return;

    setIsApprovalSubmitting(true);
    try {
      const result = await submitFirstProductApprovalApi({
        sessionId,
        description: data.description,
        image: data.image,
      });
      if (result.success) {
        // Update status to pending
        setApprovalStatus({
          required: true,
          status: "pending",
          pendingReport: result.report,
          approvedReport: null,
        });
      }
    } catch (error) {
      console.error("[work] Failed to submit first product approval:", error);
    } finally {
      setIsApprovalSubmitting(false);
    }
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
      // NEW: Handle deferred production exit (report enforcement)
      if (pendingProductionExit?.reportType === "general") {
        const { productionStatusEventId, targetStatusId, quantities, shouldCloseJobItem } = pendingProductionExit;

        // 1. Call endProductionStatusApi with stored quantities
        const response = await endProductionStatusApi({
          sessionId,
          statusEventId: productionStatusEventId,
          quantityGood: quantities.good,
          quantityScrap: quantities.scrap,
          nextStatusId: targetStatusId,
        });

        // 2. Create scrap report if needed (linked to PRODUCTION event)
        if (quantities.scrap > 0 && quantities.scrapNote) {
          try {
            await createReportApi({
              type: "scrap",
              sessionId,
              stationId: station.id,
              workerId: worker?.id,
              description: quantities.scrapNote,
              image: quantities.scrapImage ?? undefined,
              statusEventId: productionStatusEventId,
            });
          } catch (err) {
            console.error("[work] Failed to create scrap report:", err);
          }
        }

        // 3. Create general report linked to NEW status event
        if (response.newStatusEvent?.id) {
          await createReportApi({
            type: "general",
            sessionId,
            stationId: station.id,
            reportReasonId: generalReportReason,
            description: generalReportNote,
            image: generalReportImage,
            workerId: worker?.id,
            statusEventId: response.newStatusEvent.id,
          });
        }

        // 4. Update UI state
        updateTotals({
          good: totals.good + quantities.good,
          scrap: totals.scrap + quantities.scrap,
        });
        setCurrentStatus(targetStatusId);
        if (response.newStatusEvent?.id) {
          setCurrentStatusEventId(response.newStatusEvent.id);
        }

        // Update activeJobItem.completedGood to keep in sync
        if (activeJobItem) {
          setActiveJobItem({
            ...activeJobItem,
            completedGood: (activeJobItem.completedGood ?? 0) + quantities.good,
          });
        }

        // 5. Handle job completion if needed
        if (shouldCloseJobItem) {
          // Store completed job item info
          const jobItemIdToExclude = activeJobItem?.id ?? null;
          setCompletedJobItemName(activeJobItem?.name ?? "");
          setCompletedJobItemId(jobItemIdToExclude);

          // Clear active job item - it's completed
          setActiveJobItem(null);

          // Open completion dialog
          setCompletionLoading(true);
          setCompletionDialogOpen(true);
          try {
            const items = await fetchJobItemsAtStationApi(station.id);
            const available: AvailableJobItemForCompletion[] = items
              .filter((item) =>
                item.completedGood < item.plannedQuantity &&
                item.id !== jobItemIdToExclude
              )
              .map((item) => ({
                id: item.id,
                jobId: item.jobId,
                jobNumber: item.jobNumber,
                customerName: item.customerName,
                name: item.name,
                plannedQuantity: item.plannedQuantity,
                completedGood: item.completedGood,
                jobItemStepId: item.jobItemStepId,
              }));
            setAvailableJobItemsForCompletion(available);
          } catch (err) {
            console.error("[work] Failed to fetch available job items:", err);
            setAvailableJobItemsForCompletion([]);
          } finally {
            setCompletionLoading(false);
          }
        }

        // 6. Clean up
        setPendingProductionExit(null);

      } else if (pendingReportForCurrentStatus?.reportType === "general") {
        // Report for already-created status event (after quantity submission)
        // Just link the report to the existing status event - no new status change
        await createReportApi({
          type: "general",
          sessionId,
          stationId: station.id,
          reportReasonId: generalReportReason,
          description: generalReportNote,
          image: generalReportImage,
          workerId: worker?.id,
          statusEventId: pendingReportForCurrentStatus.statusEventId,
        });
        setPendingReportForCurrentStatus(null);

        // If completion dialog should open after report, fetch and show it
        if (pendingCompletionAfterReport) {
          setPendingCompletionAfterReport(false);
          setCompletionLoading(true);
          setCompletionDialogOpen(true);
          try {
            const items = await fetchJobItemsAtStationApi(station.id);
            const available: AvailableJobItemForCompletion[] = items
              .filter((item) =>
                item.completedGood < item.plannedQuantity &&
                item.id !== completedJobItemId
              )
              .map((item) => ({
                id: item.id,
                jobId: item.jobId,
                jobNumber: item.jobNumber,
                customerName: item.customerName,
                name: item.name,
                plannedQuantity: item.plannedQuantity,
                completedGood: item.completedGood,
                jobItemStepId: item.jobItemStepId,
              }));
            setAvailableJobItemsForCompletion(available);
          } catch (err) {
            console.error("[work] Failed to fetch available job items:", err);
            setAvailableJobItemsForCompletion([]);
          } finally {
            setCompletionLoading(false);
          }
        }
      } else if (pendingGeneralStatusId) {
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
        subtitle={
          job
            ? `${t("common.job")} ${job.job_number}`
            : "לא נבחרה עבודה"
        }
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

          {/* Job Progress Panel - always visible, shows empty state when no job */}
          {/* Pipeline visualization is now integrated into the panel */}
          <JobProgressPanel
            job={job}
            activeJobItem={activeJobItem}
            sessionTotals={totals}
            isInProduction={isInProduction}
            onSwitchJob={handleSwitchJob}
            switchJobDisabled={isJobSelectionSubmitting}
            currentStationName={station.name}
            pipelineContext={activeJobItem ? {
              upstreamWip: pipelineContext.upstreamWip,
              waitingOutput: pipelineContext.waitingOutput,
              prevStation: pipelineContext.prevStation,
              nextStation: pipelineContext.nextStation,
              isTerminal: pipelineContext.isTerminal,
              isProductionLine: pipelineContext.isProductionLine,
              isSingleStation: pipelineContext.isSingleStation,
              // For color gradient calculation (currentPosition is 1-indexed, convert to 0-indexed)
              totalStages: pipelineContext.totalSteps,
              currentStageIndex: pipelineContext.currentPosition - 1,
            } : undefined}
          />

          {/* First Product Approval Banner - shows when step requires approval */}
          {activeJobItem && approvalStatus?.required && (
            <FirstProductApprovalBanner
              status={approvalStatus.status as FirstProductApprovalBannerStatus}
              onSubmit={handleApprovalSubmit}
              jobItemName={activeJobItem.name}
              stationName={station.name}
              isSubmitting={isApprovalSubmitting}
            />
          )}

          {/* Scrap Section - only when scrap > 0 */}
          <ScrapSection
            sessionScrapCount={totals.scrap}
            scrapReports={scrapReports}
            onAddScrap={handleAddScrap}
            onEditReport={handleEditScrapReport}
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
                  // Check if this is a production status and approval is pending
                  const isProductionStatusButton = status.machine_state === "production";
                  const isApprovalPending = approvalStatus?.required && approvalStatus?.status !== "approved";
                  const isProductionBlocked = isProductionStatusButton && isApprovalPending && !isActive;
                  return (
                    <Button
                      key={status.id}
                      type="button"
                      variant="outline"
                      disabled={isProductionBlocked}
                      className={cn(
                        "h-auto w-full justify-between rounded-xl border p-4 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                        isActive
                          ? "shadow"
                          : "border-border bg-white text-foreground hover:border-primary/40 hover:bg-primary/5 dark:bg-secondary dark:text-foreground/80 dark:hover:bg-accent",
                        isProductionBlocked && "opacity-50 cursor-not-allowed",
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
        // Block close if report required for deferred production exit
        if (!open && pendingProductionExit?.reportType === "malfunction") {
          return; // Block close
        }
        // Don't allow closing if report is required for current status (after quantity submission)
        if (!open && pendingReportForCurrentStatus?.reportType === "malfunction") {
          return; // Block close
        }
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
            {/* Hide cancel button when report is required */}
            {!pendingReportForCurrentStatus && !pendingProductionExit && (
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
            )}
            <Button
              type="button"
              className="bg-primary font-medium text-primary-foreground hover:bg-primary/90"
              disabled={isFaultSubmitting || !faultReason}
              onClick={async () => {
                if (!station || !faultReason) return;
                setFaultError(null);
                setIsFaultSubmitting(true);
                try {
                  // NEW: Handle deferred production exit (report enforcement)
                  if (pendingProductionExit?.reportType === "malfunction") {
                    const { productionStatusEventId, targetStatusId, quantities, shouldCloseJobItem } = pendingProductionExit;

                    // 1. Call endProductionStatusApi with stored quantities
                    const response = await endProductionStatusApi({
                      sessionId,
                      statusEventId: productionStatusEventId,
                      quantityGood: quantities.good,
                      quantityScrap: quantities.scrap,
                      nextStatusId: targetStatusId,
                    });

                    // 2. Create scrap report if needed (linked to PRODUCTION event)
                    if (quantities.scrap > 0 && quantities.scrapNote) {
                      try {
                        await createReportApi({
                          type: "scrap",
                          sessionId,
                          stationId: station.id,
                          workerId: worker?.id,
                          description: quantities.scrapNote,
                          image: quantities.scrapImage ?? undefined,
                          statusEventId: productionStatusEventId,
                        });
                      } catch (err) {
                        console.error("[work] Failed to create scrap report:", err);
                      }
                    }

                    // 3. Create malfunction report linked to NEW status event
                    if (response.newStatusEvent?.id) {
                      await createReportApi({
                        type: "malfunction",
                        stationId: station.id,
                        stationReasonId: faultReason,
                        description: faultNote,
                        image: faultImage,
                        workerId: worker?.id,
                        sessionId,
                        statusEventId: response.newStatusEvent.id,
                      });
                    }

                    // 4. Update UI state
                    updateTotals({
                      good: totals.good + quantities.good,
                      scrap: totals.scrap + quantities.scrap,
                    });
                    setCurrentStatus(targetStatusId);
                    if (response.newStatusEvent?.id) {
                      setCurrentStatusEventId(response.newStatusEvent.id);
                    }

                    // Update activeJobItem.completedGood to keep in sync
                    if (activeJobItem) {
                      setActiveJobItem({
                        ...activeJobItem,
                        completedGood: (activeJobItem.completedGood ?? 0) + quantities.good,
                      });
                    }

                    // 5. Handle job completion if needed
                    if (shouldCloseJobItem) {
                      // Store completed job item info
                      const jobItemIdToExclude = activeJobItem?.id ?? null;
                      setCompletedJobItemName(activeJobItem?.name ?? "");
                      setCompletedJobItemId(jobItemIdToExclude);

                      // Clear active job item - it's completed
                      setActiveJobItem(null);

                      // Open completion dialog
                      setCompletionLoading(true);
                      setCompletionDialogOpen(true);
                      try {
                        const items = await fetchJobItemsAtStationApi(station.id);
                        const available: AvailableJobItemForCompletion[] = items
                          .filter((item) =>
                            item.completedGood < item.plannedQuantity &&
                            item.id !== jobItemIdToExclude
                          )
                          .map((item) => ({
                            id: item.id,
                            jobId: item.jobId,
                            jobNumber: item.jobNumber,
                            customerName: item.customerName,
                            name: item.name,
                            plannedQuantity: item.plannedQuantity,
                            completedGood: item.completedGood,
                            jobItemStepId: item.jobItemStepId,
                          }));
                        setAvailableJobItemsForCompletion(available);
                      } catch (err) {
                        console.error("[work] Failed to fetch available job items:", err);
                        setAvailableJobItemsForCompletion([]);
                      } finally {
                        setCompletionLoading(false);
                      }
                    }

                    // 6. Clean up
                    setPendingProductionExit(null);

                  } else if (pendingReportForCurrentStatus?.reportType === "malfunction") {
                    // Report for already-created status event (after quantity submission)
                    // Just link the report to the existing status event - no new status change
                    await createReportApi({
                      type: "malfunction",
                      stationId: station.id,
                      stationReasonId: faultReason,
                      description: faultNote,
                      image: faultImage,
                      workerId: worker?.id,
                      sessionId: sessionId,
                      statusEventId: pendingReportForCurrentStatus.statusEventId,
                    });
                    setPendingReportForCurrentStatus(null);

                    // If completion dialog should open after report, fetch and show it
                    if (pendingCompletionAfterReport) {
                      setPendingCompletionAfterReport(false);
                      setCompletionLoading(true);
                      setCompletionDialogOpen(true);
                      try {
                        const items = await fetchJobItemsAtStationApi(station.id);
                        const available: AvailableJobItemForCompletion[] = items
                          .filter((item) =>
                            item.completedGood < item.plannedQuantity &&
                            item.id !== completedJobItemId
                          )
                          .map((item) => ({
                            id: item.id,
                            jobId: item.jobId,
                            jobNumber: item.jobNumber,
                            customerName: item.customerName,
                            name: item.name,
                            plannedQuantity: item.plannedQuantity,
                            completedGood: item.completedGood,
                            jobItemStepId: item.jobItemStepId,
                          }));
                        setAvailableJobItemsForCompletion(available);
                      } catch (err) {
                        console.error("[work] Failed to fetch available job items:", err);
                        setAvailableJobItemsForCompletion([]);
                      } finally {
                        setCompletionLoading(false);
                      }
                    }
                  } else if (pendingStatusId) {
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
        // Block close if report required for deferred production exit
        if (!open && pendingProductionExit?.reportType === "general") {
          return; // Block close
        }
        // Don't allow closing if report is required for current status (after quantity submission)
        if (!open && pendingReportForCurrentStatus?.reportType === "general") {
          return; // Block close
        }
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
            {/* Hide cancel button when report is required */}
            {!pendingReportForCurrentStatus && !pendingProductionExit && (
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
            )}
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

      {/* Job Selection Sheet - shown when entering production or switching jobs */}
      <JobSelectionSheet
        open={isJobSelectionDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleJobSelectionCancel();
        }}
        stationId={station.id}
        stationName={station.name}
        stationCode={station.code}
        onSelectJobItem={
          // Use different handler based on context:
          // - If entering production (pendingProductionStatusId set) or job switch, use production handler
          // - If in non-production and just switching jobs, use immediate binding handler
          pendingProductionStatusId || isPendingJobSwitch
            ? handleJobSelectionComplete
            : handleImmediateJobBinding
        }
        isSubmitting={isJobSelectionSubmitting}
        required={isForceJobSelection}
        title={
          isPendingJobSwitch
            ? "החלף עבודה"
            : !isInProduction && !pendingProductionStatusId
              ? "בחר עבודה"
              : "בחר עבודה לייצור"
        }
        excludeJobItemId={excludeJobItemId ?? undefined}
      />

      {/* Quantity Report Dialog - shown when leaving production */}
      {/* totalCompletedBefore: activeJobItem.completedGood includes this session's contributions
          (updated locally after each report), so subtract totals.good to get the value
          BEFORE this session started reporting */}
      <QuantityReportDialog
        open={isQuantityReportDialogOpen}
        sessionTotals={totals}
        plannedQuantity={activeJobItem?.plannedQuantity}
        totalCompletedBefore={Math.max(0, (activeJobItem?.completedGood ?? 0) - totals.good)}
        onSubmit={handleQuantityReportSubmit}
        onCancel={handleQuantityReportCancel}
        isSubmitting={isQuantityReportSubmitting}
        required={false}
        jobItemName={activeJobItem?.name}
      />

      {/* Job Completion Dialog - shown when job item is completed */}
      <JobCompletionDialog
        open={isCompletionDialogOpen}
        completedJobItemName={completedJobItemName}
        availableJobItems={availableJobItemsForCompletion}
        isLoading={isCompletionLoading}
        onComplete={handleJobCompletionComplete}
        isSubmitting={isCompletionSubmitting}
      />
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
