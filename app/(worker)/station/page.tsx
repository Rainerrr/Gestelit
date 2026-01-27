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
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkerSession } from "@/contexts/WorkerSessionContext";
import {
  abandonSessionApi,
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
import {
  SessionRecoveryDialog,
  type SessionRecoveryInfo,
} from "@/components/dialogs/session-recovery-dialog";

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
    station,
    job,
    sessionId,
    sessionStartedAt,
    hasActiveSession,
    setStation,
    pendingRecovery,
    setPendingRecovery,
    setPendingStation,
    hydrateFromSnapshot,
    reset,
    setWorker,
  } = useWorkerSession();

  // ===== State =====
  const [stations, setStations] = useState<StationWithOccupancy[]>([]);
  const [jobItemCounts, setJobItemCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Selection state
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  // Navigation state (no longer creating sessions here)
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Recovery dialog state
  const [resumeCountdownMs, setResumeCountdownMs] = useState(0);
  const [resumeActionLoading, setResumeActionLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  // Detect back-navigation: user has sessionId in context but navigated to station page
  // This happens when user presses browser back button or uses UI back from /work
  const isBackNavigationRecovery = hasActiveSession && !pendingRecovery;
  const isRecoveryBlocking = Boolean(pendingRecovery) || isBackNavigationRecovery;
  const instanceId = useMemo(() => getOrCreateInstanceId(), []);

  // Compute grace expiry for back-navigation scenario (5 minutes from now as default)
  const backNavGraceExpiresAt = useMemo(() => {
    if (!isBackNavigationRecovery) return null;
    // Use 5 minutes from now as the grace period
    return new Date(Date.now() + 5 * 60 * 1000).toISOString();
  }, [isBackNavigationRecovery]);

  // Create synthetic recovery info for back-navigation scenario
  const backNavRecoveryInfo: SessionRecoveryInfo | null = useMemo(() => {
    if (!isBackNavigationRecovery || !sessionId) return null;
    return {
      sessionId,
      sessionStartedAt: sessionStartedAt ?? new Date().toISOString(),
      stationName: station?.name ?? null,
      jobNumber: job?.job_number ?? null,
    };
  }, [isBackNavigationRecovery, sessionId, sessionStartedAt, station?.name, job?.job_number]);

  // Create recovery info for login-flow recovery (from pendingRecovery)
  const loginFlowRecoveryInfo: SessionRecoveryInfo | null = useMemo(() => {
    if (!pendingRecovery) return null;
    return {
      sessionId: pendingRecovery.session.id,
      sessionStartedAt: pendingRecovery.session.started_at,
      stationName: pendingRecovery.station?.name ?? null,
      jobNumber: pendingRecovery.job?.job_number ?? null,
    };
  }, [pendingRecovery]);

  // Use the appropriate recovery info
  const activeRecoveryInfo = pendingRecovery ? loginFlowRecoveryInfo : backNavRecoveryInfo;
  const activeGraceExpiresAt = pendingRecovery?.graceExpiresAt ?? backNavGraceExpiresAt;

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

  // ===== Recovery Handlers =====
  // Define handlers before the countdown effect that uses them
  const handleDiscardSession = useCallback(
    async (reason: SessionAbandonReason = "worker_choice") => {
      // Handle both login-flow recovery (pendingRecovery) and back-navigation recovery (context sessionId)
      const targetSessionId = pendingRecovery?.session.id ?? sessionId;
      if (!targetSessionId) return;

      setResumeActionLoading(true);
      setResumeError(null);

      try {
        await abandonSessionApi(targetSessionId, reason);
        clearPersistedSessionState();

        if (pendingRecovery) {
          // Login-flow recovery: just clear pendingRecovery
          setPendingRecovery(null);
        } else {
          // Back-navigation recovery: reset session state but keep worker
          const currentWorker = worker;
          reset();
          if (currentWorker) {
            setWorker(currentWorker);
          }
        }
      } catch {
        setResumeError(t("station.resume.error"));
      } finally {
        setResumeActionLoading(false);
      }
    },
    [pendingRecovery, sessionId, worker, setPendingRecovery, reset, setWorker, t]
  );

  // ===== Recovery Countdown =====
  // Track if countdown has expired to trigger discard outside the interval callback
  const [countdownExpired, setCountdownExpired] = useState(false);

  useEffect(() => {
    if (!activeGraceExpiresAt) {
      setResumeCountdownMs(0);
      setCountdownExpired(false);
      return;
    }

    const updateCountdown = () => {
      const nextDiff = new Date(activeGraceExpiresAt).getTime() - Date.now();
      setResumeCountdownMs(Math.max(0, nextDiff));

      // Mark as expired when timer reaches zero
      if (nextDiff <= 0) {
        setCountdownExpired(true);
      }
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1_000);
    return () => window.clearInterval(intervalId);
  }, [activeGraceExpiresAt]);

  // Auto-discard when countdown expires
  useEffect(() => {
    if (countdownExpired) {
      void handleDiscardSession("expired");
    }
  }, [countdownExpired, handleDiscardSession]);

  const handleStationSelect = useCallback(
    (stationId: string) => {
      if (isRecoveryBlocking || !worker) return;

      const selectedStation = stations.find((s) => s.id === stationId);
      if (!selectedStation) return;

      // Check if station is occupied (another worker is using it)
      if (selectedStation.occupancy.isOccupied && !selectedStation.occupancy.isGracePeriod) {
        setNavigationError(t("station.error.occupied"));
        return;
      }

      setSelectedStationId(stationId);
      setNavigationError(null);
      setIsNavigating(true);

      // Store station in context for pending session creation
      // Session will be created on the work page after checklist completion
      const stationForContext = {
        id: selectedStation.id,
        name: selectedStation.name,
        code: selectedStation.code,
        station_type: selectedStation.station_type,
        is_active: selectedStation.is_active,
      };

      // Set both station (for display) and pendingStation (for deferred session creation)
      setStation(stationForContext);
      setPendingStation(stationForContext);

      // Navigate to checklist - session will be created on work page
      router.push("/checklist/start");
    },
    [isRecoveryBlocking, worker, stations, setStation, setPendingStation, router, t]
  );

  const handleResumeSession = useCallback(() => {
    // For back-navigation, just go back to /work - context already has session data
    if (isBackNavigationRecovery && sessionId) {
      setResumeError(null);
      router.push("/work");
      return;
    }

    // For login-flow recovery, hydrate from snapshot
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
  }, [isBackNavigationRecovery, sessionId, pendingRecovery, worker, hydrateFromSnapshot, router, t]);

  const handleDialogClose = () => {
    // For login-flow recovery, closing dialog should go back to login
    if (pendingRecovery) {
      setPendingRecovery(null);
      router.push("/login");
    }
    // For back-navigation, closing should navigate back to /work (user must make a choice)
    else if (isBackNavigationRecovery) {
      router.push("/work");
    }
  };


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
      <div className={cn("max-w-6xl", (isRecoveryBlocking || isNavigating) && "pointer-events-none opacity-50")}>
        {isLoading ? (
          // Loading skeleton
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-48 rounded-2xl border border-dashed border-border bg-muted/30 animate-pulse"
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
              {t("station.tryAgain")}
            </Button>
          </div>
        ) : !hasAnyStations ? (
          // No stations assigned
          <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-500/10 p-8 text-center">
            <p className="text-lg font-semibold text-amber-400">
              {t("station.noAssignedStations")}
            </p>
            <p className="mt-2 text-sm text-amber-400/70">
              {t("station.contactAdmin")}
            </p>
          </div>
        ) : !hasAnyJobItems ? (
          // No job items available
          <div className="rounded-2xl border-2 border-border bg-muted/30 p-8 text-center">
            <p className="text-lg font-semibold text-muted-foreground">
              {t("station.noJobsAvailable")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground/70">
              {t("station.allStationsEmpty")}
            </p>
          </div>
        ) : (
          // Station groups with search
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder={t("station.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "pr-11 h-12 text-base",
                  "bg-card/50 border-input",
                  "placeholder:text-muted-foreground",
                  "focus:border-cyan-500 focus:ring-cyan-500/20"
                )}
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchQuery("")}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* No search results */}
            {!hasSearchResults && searchQuery && (
              <div className="rounded-2xl border-2 border-border bg-muted/30 p-8 text-center">
                <p className="text-lg font-semibold text-muted-foreground">
                  {t("station.noStationsFound")}
                </p>
                <p className="mt-2 text-sm text-muted-foreground/70">
                  {t("station.tryDifferentSearch")}
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

        {/* Navigation error display */}
        {navigationError && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
            <p className="text-sm font-medium text-red-400">{navigationError}</p>
          </div>
        )}
      </div>


      {/* Recovery Dialog */}
      <SessionRecoveryDialog
        open={isRecoveryBlocking}
        session={activeRecoveryInfo}
        countdownMs={resumeCountdownMs}
        isLoading={resumeActionLoading}
        error={resumeError}
        onResume={handleResumeSession}
        onDiscard={() => handleDiscardSession()}
        onClose={handleDialogClose}
      />
    </>
  );
}
