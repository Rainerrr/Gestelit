"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useSessionClaimListener } from "@/hooks/useSessionBroadcast";
import { getOrCreateInstanceId } from "@/lib/utils/instance-id";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  fetchStationJobItemCountsApi,
} from "@/lib/api/client";
import { persistSessionState, clearPersistedSessionState } from "@/lib/utils/session-storage";
import type { SessionAbandonReason } from "@/lib/types";
import type { StationWithOccupancy } from "@/lib/data/stations";
import { BackButton } from "@/components/navigation/back-button";
import { StationTypeGroup } from "@/components/worker/station-selection/station-type-group";
import type { StationTileData } from "@/components/worker/station-selection/station-tile";
import { cn } from "@/lib/utils";

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

/**
 * Group stations by station_type for department display.
 * Only includes stations with available jobs (jobItemCount > 0).
 */
function groupStationsByType(
  stations: StationWithOccupancy[],
  jobItemCounts: Record<string, number>,
): Map<string, StationTileData[]> {
  const groups = new Map<string, StationTileData[]>();

  for (const station of stations) {
    const jobCount = jobItemCounts[station.id] ?? 0;

    // Skip stations with no available jobs
    if (jobCount === 0) continue;

    const type = station.station_type || "אחר";
    const tileData: StationTileData = {
      ...station,
      jobItemCount: jobCount,
    };

    const existing = groups.get(type);
    if (existing) {
      existing.push(tileData);
    } else {
      groups.set(type, [tileData]);
    }
  }

  // Sort groups by type name
  const sortedGroups = new Map(
    [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "he"))
  );

  return sortedGroups;
}

// ============================================
// COMPONENT
// ============================================

export default function StationPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    worker,
    job,
    setStation,
    setSessionId,
    setSessionStartedAt,
    setCurrentStatus,
    pendingRecovery,
    setPendingRecovery,
    hydrateFromSnapshot,
  } = useWorkerSession();

  // ===== State =====
  const [stations, setStations] = useState<StationWithOccupancy[]>([]);
  const [jobItemCounts, setJobItemCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Selection state
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  // Session creation state
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Recovery dialog state
  const [resumeCountdownMs, setResumeCountdownMs] = useState(0);
  const [resumeActionLoading, setResumeActionLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const isRecoveryBlocking = Boolean(pendingRecovery);
  const instanceId = useMemo(() => getOrCreateInstanceId(), []);

  // ===== Computed =====
  // Filter stations by search query
  const filteredStations = useMemo(() => {
    if (!searchQuery.trim()) return stations;

    const query = searchQuery.toLowerCase();
    return stations.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.code.toLowerCase().includes(query)
    );
  }, [stations, searchQuery]);

  const stationGroups = useMemo(
    () => groupStationsByType(filteredStations, jobItemCounts),
    [filteredStations, jobItemCounts]
  );

  const hasAnyStations = stations.length > 0;
  const hasAnyJobItems = Object.values(jobItemCounts).some((c) => c > 0);
  const hasSearchResults = stationGroups.size > 0;

  // ===== Session Claim Listener =====
  const handleSessionClaimed = useCallback(() => {
    setPendingRecovery(null);
    router.replace("/session-transferred");
  }, [setPendingRecovery, router]);

  useSessionClaimListener(
    pendingRecovery?.session.id,
    instanceId,
    handleSessionClaimed
  );

  // ===== Data Fetching =====
  useEffect(() => {
    if (!worker) {
      router.replace("/login");
      return;
    }

    let active = true;
    setIsLoading(true);
    setLoadError(null);

    const fetchData = async () => {
      try {
        // Fetch stations and job item counts in parallel
        const [stationsResult, countsResult] = await Promise.all([
          fetchStationsWithOccupancyApi(worker.id),
          fetchStationJobItemCountsApi(worker.id),
        ]);

        if (!active) return;

        setStations(stationsResult);
        setJobItemCounts(countsResult);
      } catch (err) {
        if (!active) return;
        console.error("[StationPage] Failed to load data:", err);
        setLoadError(err instanceof Error ? err.message : "LOAD_FAILED");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void fetchData();

    return () => {
      active = false;
    };
  }, [worker, router]);

  // ===== Recovery Countdown =====
  useEffect(() => {
    if (!pendingRecovery?.graceExpiresAt) {
      setResumeCountdownMs(0);
      return;
    }

    const updateCountdown = () => {
      const nextDiff = new Date(pendingRecovery.graceExpiresAt).getTime() - Date.now();
      setResumeCountdownMs(Math.max(0, nextDiff));

      // Auto-discard when expired
      if (nextDiff <= 0) {
        void handleDiscardSession("expired");
      }
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1_000);
    return () => window.clearInterval(intervalId);
  }, [pendingRecovery?.graceExpiresAt]);

  // ===== Handlers =====
  const handleDiscardSession = useCallback(
    async (reason: SessionAbandonReason = "worker_choice") => {
      if (!pendingRecovery) return;

      setResumeActionLoading(true);
      setResumeError(null);

      try {
        await abandonSessionApi(pendingRecovery.session.id, reason);
        clearPersistedSessionState();
        setPendingRecovery(null);
      } catch {
        setResumeError(t("station.resume.error"));
      } finally {
        setResumeActionLoading(false);
      }
    },
    [pendingRecovery, setPendingRecovery, t]
  );

  const handleStationSelect = useCallback(
    async (stationId: string) => {
      if (isRecoveryBlocking || !worker) return;

      const station = stations.find((s) => s.id === stationId);
      if (!station) return;

      setSelectedStationId(stationId);
      setSessionError(null);
      setIsCreatingSession(true);

      try {
        // Create session with station only (no job yet - job is selected when entering production)
        const session = await createSessionApi(
          worker.id,
          station.id,
          null, // No job at station selection time
          instanceId
        );

        // Create station object for context
        const stationForContext = {
          id: station.id,
          name: station.name,
          code: station.code,
          station_type: station.station_type,
          is_active: station.is_active,
        };

        setStation(stationForContext);
        setSessionId(session.id);
        setSessionStartedAt(session.started_at ?? null);
        setCurrentStatus(undefined);

        // Persist session state (no job yet)
        persistSessionState({
          sessionId: session.id,
          workerId: worker.id,
          workerCode: worker.worker_code,
          workerFullName: worker.full_name,
          stationId: station.id,
          stationName: station.name,
          stationCode: station.code,
          jobId: null,
          jobNumber: null,
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
    },
    [isRecoveryBlocking, worker, stations, instanceId, setStation, setSessionId, setSessionStartedAt, setCurrentStatus, router, t]
  );

  const handleResumeSession = useCallback(() => {
    if (!pendingRecovery?.station) {
      setResumeError(t("station.resume.missing"));
      return;
    }

    hydrateFromSnapshot(pendingRecovery);
    setResumeError(null);

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
        totals: { good: 0, scrap: 0 },
      });
    }

    router.push("/work");
  }, [pendingRecovery, worker, hydrateFromSnapshot, router, t]);

  const handleDialogClose = (open: boolean) => {
    if (!open && pendingRecovery) {
      setPendingRecovery(null);
      router.push("/login");
    }
  };

  // ===== Computed Labels =====
  const countdownLabel = useMemo(
    () => formatDuration(Math.ceil(Math.max(resumeCountdownMs, 0) / 1000)),
    [resumeCountdownMs]
  );

  const elapsedLabel = useMemo(() => {
    if (!pendingRecovery) return "00:00:00";
    const expiryTimestamp = new Date(pendingRecovery.graceExpiresAt).getTime();
    const currentTimestamp = expiryTimestamp - resumeCountdownMs;
    const elapsedSeconds =
      (currentTimestamp - new Date(pendingRecovery.session.started_at).getTime()) / 1000;
    return formatDuration(Math.max(0, Math.floor(elapsedSeconds)));
  }, [pendingRecovery, resumeCountdownMs]);

  // ===== Guard =====
  if (!worker) {
    return null;
  }

  // ===== Render =====
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

      {/* Recovery Banner */}
      {pendingRecovery ? (
        <Alert
          variant="default"
          className="max-w-4xl border border-primary/30 bg-primary/10 text-right"
        >
          <AlertTitle className="text-primary">{t("station.resume.bannerTitle")}</AlertTitle>
          <AlertDescription className="text-primary/80">
            {t("station.resume.bannerSubtitle")}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Main Content */}
      <div className={cn("max-w-6xl", (isRecoveryBlocking || isCreatingSession) && "pointer-events-none opacity-50")}>
        {isLoading ? (
          // Loading skeleton
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-48 rounded-2xl border border-dashed border-slate-700/50 bg-slate-800/30 animate-pulse"
              />
            ))}
          </div>
        ) : loadError ? (
          // Error state
          <div className="rounded-2xl border-2 border-red-500/30 bg-red-500/10 p-8 text-center">
            <p className="text-lg font-semibold text-red-400">{t("station.error.load")}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              נסה שוב
            </Button>
          </div>
        ) : !hasAnyStations ? (
          // No stations assigned
          <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-500/10 p-8 text-center">
            <p className="text-lg font-semibold text-amber-400">
              {t("station.noAssignedStations")}
            </p>
            <p className="mt-2 text-sm text-amber-400/70">
              פנה למנהל כדי לקבל הרשאות לעמדות
            </p>
          </div>
        ) : !hasAnyJobItems ? (
          // No job items available
          <div className="rounded-2xl border-2 border-slate-600/30 bg-slate-800/30 p-8 text-center">
            <p className="text-lg font-semibold text-slate-400">
              אין עבודות זמינות
            </p>
            <p className="mt-2 text-sm text-slate-500">
              כל העמדות שלך פנויות אך אין עבודות פעילות
            </p>
          </div>
        ) : (
          // Station groups with search
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 pointer-events-none" />
              <Input
                type="text"
                placeholder="חיפוש עמדה..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "pr-11 h-12 text-base",
                  "bg-slate-800/50 border-slate-700",
                  "placeholder:text-slate-500",
                  "focus:border-cyan-500 focus:ring-cyan-500/20"
                )}
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchQuery("")}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 text-slate-400 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* No search results */}
            {!hasSearchResults && searchQuery && (
              <div className="rounded-2xl border-2 border-slate-600/30 bg-slate-800/30 p-8 text-center">
                <p className="text-lg font-semibold text-slate-400">
                  לא נמצאו עמדות
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  נסה לחפש עם מילות מפתח אחרות
                </p>
              </div>
            )}

            {/* Station groups */}
            {Array.from(stationGroups.entries()).map(([stationType, stationTiles], groupIndex) => (
              <StationTypeGroup
                key={stationType}
                stationType={stationType}
                stations={stationTiles}
                selectedStationId={selectedStationId}
                onStationSelect={handleStationSelect}
                baseAnimationDelay={groupIndex * 100}
                defaultExpanded={true}
              />
            ))}
          </div>
        )}

        {/* Session error display */}
        {sessionError && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
            <p className="text-sm font-medium text-red-400">{sessionError}</p>
          </div>
        )}
      </div>


      {/* Recovery Dialog */}
      <Dialog open={isRecoveryBlocking} onOpenChange={handleDialogClose}>
        <DialogContent dir="rtl" className="border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t("station.resume.title")}</DialogTitle>
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
                <p className="text-xs text-muted-foreground">{t("station.resume.station")}</p>
                <p className="text-base font-semibold text-foreground">
                  {pendingRecovery?.station?.name ?? t("station.resume.stationFallback")}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("station.resume.job")}</p>
                <p className="text-base font-semibold text-foreground">
                  {pendingRecovery?.job?.job_number ?? t("station.resume.jobFallback")}
                </p>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-input bg-secondary px-4 py-3 text-sm text-muted-foreground">
                <span>{t("station.resume.elapsed")}</span>
                <span className="font-semibold text-foreground">{elapsedLabel}</span>
              </div>
            </div>
          </div>

          {resumeError && (
            <p className="text-right text-sm text-rose-600 dark:text-rose-400">{resumeError}</p>
          )}

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDiscardSession()}
              disabled={resumeActionLoading}
              className="w-full justify-center border-input bg-secondary text-foreground/80 hover:bg-accent hover:text-foreground sm:w-auto"
            >
              {resumeActionLoading ? t("station.resume.discarding") : t("station.resume.discard")}
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
