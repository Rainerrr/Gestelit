"use client";

import { useCallback, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Eye, RefreshCw, CheckCircle2, Wrench, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchMalfunctionReportsAdminApi,
  updateReportStatusAdminApi,
} from "@/lib/api/admin-management";
import type { StationWithReports, StationWithArchivedReports } from "@/lib/data/reports";
import type { MalfunctionReportStatus, ReportWithDetails } from "@/lib/types";
import { ViewToggle } from "@/app/admin/reports/_components/view-toggle";
import { FeedView } from "@/app/admin/reports/_components/feed-view";
import { PerStationView } from "@/app/admin/reports/_components/per-station-view";
import { cn } from "@/lib/utils";
import { useRealtimeReports } from "@/lib/hooks/useRealtimeReports";
import { useViewToggle } from "@/lib/hooks/useViewToggle";
import { flattenStationReports, filterOngoingReports } from "@/lib/data/reports";

const MalfunctionsDashboardInner = () => {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [isUpdating, setIsUpdating] = useState(false);
  const [view, setView] = useViewToggle("station");

  // Real-time reports subscription
  const fetchReportsData = useCallback(async () => {
    const data = await fetchMalfunctionReportsAdminApi();
    return data.stations;
  }, []);

  const {
    data: stations,
    isLoading,
    isRefreshing,
    error,
    refresh: refreshReports,
  } = useRealtimeReports<StationWithReports[]>({
    reportType: "malfunction",
    fetchData: fetchReportsData,
  });

  // Archive state (not real-time - loaded on demand)
  const [archivedStations, setArchivedStations] = useState<StationWithArchivedReports[]>([]);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveFetched, setArchiveFetched] = useState(false);

  const fetchArchivedData = useCallback(async () => {
    if (archiveFetched) return;
    setIsArchiveLoading(true);
    setArchiveError(null);

    try {
      const data = await fetchMalfunctionReportsAdminApi({ includeArchived: true });
      setArchivedStations(data.archived ?? []);
      setArchiveFetched(true);
    } catch (err) {
      console.error("[malfunctions] Failed to fetch archived:", err);
      setArchiveError(err instanceof Error ? err.message : "ARCHIVE_FETCH_FAILED");
    } finally {
      setIsArchiveLoading(false);
    }
  }, [archiveFetched]);

  const allStations = stations ?? [];

  // Flatten all reports for feed view
  const allReports = useMemo(() => {
    return flattenStationReports(allStations);
  }, [allStations]);

  // Flatten archived reports
  const archivedReports = useMemo(() => {
    return flattenStationReports(archivedStations);
  }, [archivedStations]);

  const handleStatusChange = async (id: string, status: MalfunctionReportStatus) => {
    setIsUpdating(true);
    try {
      await updateReportStatusAdminApi(id, status);
      setArchiveFetched(false);
      // Real-time will pick up the change, but refresh for immediate feedback
      await refreshReports();
      // Refetch archive if it was expanded
      if (view === "station") {
        const data = await fetchMalfunctionReportsAdminApi({ includeArchived: true });
        setArchivedStations(data.archived ?? []);
        setArchiveFetched(true);
      }
    } catch (err) {
      console.error("[malfunctions] Failed to update status:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRefresh = () => {
    setArchiveFetched(false);
    void refreshReports();
  };

  const totalOpen = allStations.reduce((sum, s) => sum + s.openCount, 0);
  const totalKnown = allStations.reduce((sum, s) => sum + s.knownCount, 0);
  const ongoingCount = filterOngoingReports(allReports).length;

  return (
    <div className="space-y-6 pb-mobile-nav">
      {/* Header with refresh button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">
            תקלות תחנות
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            ניהול ומעקב אחר תקלות
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing}
          size="sm"
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          רענון
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Open */}
        <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card/30 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                חדשות
              </p>
              <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">
                {totalOpen}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
          </div>
          {totalOpen > 0 && (
            <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-red-500/40" />
          )}
        </div>

        {/* Known */}
        <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card/30 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                בטיפול
              </p>
              <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">
                {totalKnown}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Eye className="h-5 w-5 text-amber-400" />
            </div>
          </div>
          {totalKnown > 0 && (
            <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-amber-500/40" />
          )}
        </div>

        {/* Stations count */}
        <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card/30 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                תחנות
              </p>
              <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">
                {allStations.length}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>

        {/* Live/Ongoing */}
        <div
          className={cn(
            "relative overflow-hidden rounded-xl border p-4",
            ongoingCount > 0
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-border/60 bg-card/30"
          )}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                פעילים כעת
              </p>
              <p
                className={cn(
                  "text-3xl font-bold mt-1 tabular-nums",
                  ongoingCount > 0 ? "text-emerald-400" : "text-foreground"
                )}
              >
                {ongoingCount}
              </p>
            </div>
            <div
              className={cn(
                "relative flex h-10 w-10 items-center justify-center rounded-lg",
                ongoingCount > 0
                  ? "bg-emerald-500/20 border border-emerald-500/30"
                  : "bg-muted/50 border border-border"
              )}
            >
              {ongoingCount > 0 && (
                <span className="absolute inset-0 rounded-lg bg-emerald-500/20 animate-ping" />
              )}
              <Activity
                className={cn(
                  "h-5 w-5 relative",
                  ongoingCount > 0 ? "text-emerald-400" : "text-muted-foreground"
                )}
              />
            </div>
          </div>
        </div>
      </div>

      {/* View Toggle */}
      <ViewToggle value={view} onChange={setView} />

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">טוען תקלות...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground">שגיאה בטעינת הנתונים</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={handleRefresh} size="sm">
            נסה שנית
          </Button>
        </div>
      ) : allReports.length === 0 && view === "feed" ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground">אין תקלות פתוחות</p>
            <p className="text-sm text-muted-foreground">כל התקלות טופלו בהצלחה!</p>
          </div>
        </div>
      ) : view === "feed" ? (
        <FeedView
          reports={allReports}
          reportType="malfunction"
          onStatusChange={handleStatusChange}
          isUpdating={isUpdating}
        />
      ) : (
        <PerStationView
          reports={allReports}
          reportType="malfunction"
          onStatusChange={handleStatusChange}
          isUpdating={isUpdating}
          showArchive
          archivedReports={archivedReports}
          onFetchArchive={fetchArchivedData}
          isArchiveLoading={isArchiveLoading}
          archiveError={archiveError}
          highlightReportId={highlightId}
        />
      )}
    </div>
  );
};

// Wrap with Suspense for useSearchParams
export const MalfunctionsDashboard = () => {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">טוען תקלות...</p>
        </div>
      }
    >
      <MalfunctionsDashboardInner />
    </Suspense>
  );
};
