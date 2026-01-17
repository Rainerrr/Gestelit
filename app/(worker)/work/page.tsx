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
  checkFirstProductQAApi,
  createReportApi,
  createStatusEventWithReportApi,
  endProductionStatusApi,
  fetchJobItemsAtStationApi,
  fetchReportReasonsApi,
  fetchSessionScrapReportsApi,
  startStatusEventApi,
  submitFirstProductQARequestApi,
  takeoverSessionApi,
  type FirstProductQAStatus,
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
  FirstProductQADialog,
  type FirstProductQADialogMode,
} from "@/components/work/first-product-qa-dialog";
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
  // Note: job is now optional - workers select job when entering production
  useEffect(() => {
    if (!worker) {
      router.replace("/login");
      return;
    }
    if (worker && !station) {
      router.replace("/station");
      return;
    }
    // Session must exist - job is now optional (selected when entering production)
    if (worker && station && !sessionId) {
      router.replace("/station");
    }
  }, [worker, station, sessionId, router]);

  // Guard render - don't render content until session is ready
  // Note: job is optional now - it gets bound when entering production
  if (!worker || !station || !sessionId) {
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

  // First Product QA dialog state
  const [isQADialogOpen, setQADialogOpen] = useState(false);
  const [qaDialogMode, setQADialogMode] = useState<FirstProductQADialogMode>("request");
  const [qaStatus, setQAStatus] = useState<FirstProductQAStatus | null>(null);
  const [isQASubmitting, setIsQASubmitting] = useState(false);
  // Pending job selection result - stored while waiting for QA approval
  const [pendingQAJobSelection, setPendingQAJobSelection] = useState<JobSelectionResult | null>(null);

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
      // Check if station requires first product QA
      if (station.requires_first_product_qa) {
        // Check QA approval status
        const qaCheckResult = await checkFirstProductQAApi(
          result.jobItem.id,
          station.id,
        );
        setQAStatus(qaCheckResult);

        if (!qaCheckResult.approved) {
          // QA not approved - show QA dialog
          setPendingQAJobSelection(result);
          setJobSelectionDialogOpen(false);

          if (qaCheckResult.pendingReport) {
            // There's already a pending QA request - show waiting mode
            setQADialogMode("waiting");
          } else {
            // No pending request - show request mode
            setQADialogMode("request");
          }
          setQADialogOpen(true);
          setIsJobSelectionSubmitting(false);
          return;
        }
        // QA is approved - continue with production
      }

      // Proceed with starting production (QA approved or not required)
      await proceedWithProduction(result);
    } catch (error) {
      console.error("[work] Failed to complete job selection:", error);
      const message = error instanceof Error ? error.message : String(error);

      // Provide specific error messages based on error type
      if (message.includes("QA") || message.includes("qa")) {
        setStatusError("שגיאה בבדיקת אישור QA. נסה שנית.");
      } else if (message.includes("bind") || message.includes("session")) {
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

      // 4. Now switch to production status and capture the event ID
      setCurrentStatus(pendingProductionStatusId);
      const statusEvent = await startStatusEventApi({
        sessionId,
        statusDefinitionId: pendingProductionStatusId,
      });

      // 5. Store the status event ID for quantity reporting later
      if (statusEvent?.id) {
        setCurrentStatusEventId(statusEvent.id);
      }

      // 6. Reset session totals for the new job item
      // This is critical - totals are per-job-item, not per-session
      updateTotals({ good: 0, scrap: 0 });

      // 7. Close dialog and reset state
      setJobSelectionDialogOpen(false);
      setPendingProductionStatusId(null);
      setIsForceJobSelection(false);
      setPendingQAJobSelection(null);
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
    // Quantity reporting is required when leaving production
    // But allow cancel if it was a job switch (user can stay with current job)
    if (!isPendingJobSwitch) {
      // Can't cancel when leaving production - keep dialog open
      return;
    }
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
      } else {
        // User chose stoppage - they're already in a stoppage status
        // (created by endProductionStatusApi when they exited production)
        // Just close the dialog without creating another status event
        // This prevents creating duplicate/orphan status events

        // Note: completionExitStatusId contains the status they transitioned to
        // when leaving production. We don't need to do anything else here.
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

  // Handler for QA dialog submission
  const handleQADialogSubmit = async (data: { description?: string; image?: File | null }) => {
    if (!station || !pendingQAJobSelection) return;

    setIsQASubmitting(true);
    setStatusError(null);

    try {
      // Submit the QA request
      await submitFirstProductQARequestApi({
        jobItemId: pendingQAJobSelection.jobItem.id,
        stationId: station.id,
        sessionId,
        workerId: worker?.id,
        description: data.description,
        image: data.image,
      });

      // Switch to waiting mode
      setQADialogMode("waiting");

      // Re-check QA status to get the pending report
      const newStatus = await checkFirstProductQAApi(
        pendingQAJobSelection.jobItem.id,
        station.id,
      );
      setQAStatus(newStatus);
    } catch (error) {
      console.error("[work] Failed to submit QA request:", error);
      setStatusError("שגיאה בשליחת בקשת QA");
    } finally {
      setIsQASubmitting(false);
    }
  };

  // Handler for QA dialog cancel
  const handleQADialogCancel = () => {
    // If in waiting mode or request mode, allow closing (but don't proceed to production)
    setQADialogOpen(false);
    setPendingQAJobSelection(null);
    setPendingProductionStatusId(null);
    setIsForceJobSelection(false);
  };

  // Periodic check for QA approval (when in waiting mode)
  useEffect(() => {
    if (!isQADialogOpen || qaDialogMode !== "waiting" || !pendingQAJobSelection || !station) {
      return;
    }

    // Poll every 5 seconds for approval
    const interval = setInterval(async () => {
      try {
        const newStatus = await checkFirstProductQAApi(
          pendingQAJobSelection.jobItem.id,
          station.id,
        );
        setQAStatus(newStatus);

        if (newStatus.approved) {
          // QA approved! Show approved mode briefly, then proceed
          setQADialogMode("approved");
          // After brief delay, proceed to production
          setTimeout(() => {
            setQADialogOpen(false);
            void proceedWithProduction(pendingQAJobSelection);
          }, 1500);
        }
      } catch (error) {
        console.error("[work] Failed to check QA status:", error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isQADialogOpen, qaDialogMode, pendingQAJobSelection, station]);

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
      if (pendingReportForCurrentStatus?.reportType === "general") {
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
            {/* Hide cancel button when report is required for current status */}
            {!pendingReportForCurrentStatus && (
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
                  if (pendingReportForCurrentStatus?.reportType === "malfunction") {
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
            {/* Hide cancel button when report is required for current status */}
            {!pendingReportForCurrentStatus && (
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
        required={!isPendingJobSwitch}
        jobItemName={activeJobItem?.name}
      />

      {/* First Product QA Dialog - shown when station requires QA approval */}
      <FirstProductQADialog
        open={isQADialogOpen}
        mode={qaDialogMode}
        jobItemName={pendingQAJobSelection?.jobItem.name}
        jobNumber={pendingQAJobSelection?.job.jobNumber}
        pendingReport={qaStatus?.pendingReport}
        onSubmit={handleQADialogSubmit}
        onCancel={handleQADialogCancel}
        isSubmitting={isQASubmitting}
        required={false}
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
