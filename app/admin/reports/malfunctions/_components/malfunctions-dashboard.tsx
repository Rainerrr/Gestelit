"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Eye, RefreshCw, CheckCircle2, Wrench, Archive, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchMalfunctionReportsAdminApi,
  updateReportStatusAdminApi,
} from "@/lib/api/admin-management";
import type { StationWithReports, StationWithArchivedReports } from "@/lib/data/reports";
import type { MalfunctionReportStatus } from "@/lib/types";
import { StationReportsCard } from "./station-reports-card";
import { cn } from "@/lib/utils";

export const MalfunctionsDashboard = () => {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [stations, setStations] = useState<StationWithReports[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Archive state
  const [archivedStations, setArchivedStations] = useState<StationWithArchivedReports[]>([]);
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveFetched, setArchiveFetched] = useState(false);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    setError(null);

    try {
      const data = await fetchMalfunctionReportsAdminApi();
      setStations(data.stations);
    } catch (err) {
      console.error("[malfunctions] Failed to fetch:", err);
      setError(err instanceof Error ? err.message : "FETCH_FAILED");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

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

  const isHighlightInActive = highlightId
    ? stations.some((s) => s.reports.some((r) => r.id === highlightId))
    : false;

  const isHighlightInArchive = highlightId && !isHighlightInActive && !isLoading;

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (isHighlightInArchive && !isArchiveExpanded) {
      setIsArchiveExpanded(true);
      void fetchArchivedData();
    }
  }, [isHighlightInArchive, isArchiveExpanded, fetchArchivedData]);

  const handleStatusChange = async (id: string, status: MalfunctionReportStatus) => {
    setIsUpdating(true);
    try {
      await updateReportStatusAdminApi(id, status);
      setArchiveFetched(false);
      await fetchData();
      if (isArchiveExpanded) {
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
    void fetchData(true);
    if (isArchiveExpanded) {
      void fetchArchivedData();
    }
  };

  const handleArchiveToggle = () => {
    const newExpanded = !isArchiveExpanded;
    setIsArchiveExpanded(newExpanded);

    if (newExpanded && !archiveFetched && !isArchiveLoading) {
      void fetchArchivedData();
    }
  };

  const totalOpen = stations.reduce((sum, s) => sum + s.openCount, 0);
  const totalKnown = stations.reduce((sum, s) => sum + s.knownCount, 0);
  const totalArchived = archivedStations.reduce((sum, s) => sum + s.solvedCount, 0);

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-foreground">תקלות תחנות</h2>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="w-full sm:w-auto"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 ml-2 ${isRefreshing ? "animate-spin" : ""}`} />
          רענון
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/50 px-5 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{totalOpen}</p>
            <p className="text-xs text-muted-foreground">תקלות חדשות</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/50 px-5 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Eye className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{totalKnown}</p>
            <p className="text-xs text-muted-foreground">בטיפול</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/50 px-5 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <Wrench className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stations.length}</p>
            <p className="text-xs text-muted-foreground">תחנות עם תקלות</p>
          </div>
        </div>
      </div>

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
      ) : stations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground">אין תקלות פתוחות</p>
            <p className="text-sm text-muted-foreground">כל התקלות טופלו בהצלחה!</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {stations.map((stationData, index) => {
            const containsHighlight = highlightId
              ? stationData.reports.some((r) => r.id === highlightId)
              : false;
            return (
              <StationReportsCard
                key={stationData.station.id}
                data={stationData}
                onStatusChange={handleStatusChange}
                isUpdating={isUpdating}
                defaultExpanded={index === 0 || containsHighlight}
                highlightReportId={highlightId}
              />
            );
          })}
        </div>
      )}

      {/* Archive Section */}
      <div className="mt-8 border-t border-border pt-6">
        <button
          type="button"
          onClick={handleArchiveToggle}
          className={cn(
            "w-full flex items-center justify-between gap-4 px-5 py-4 rounded-xl border transition-colors",
            isArchiveExpanded
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-border bg-card/40 hover:bg-accent/30 hover:border-border/80"
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg border transition-colors",
              isArchiveExpanded
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-secondary border-border"
            )}>
              <Archive className={cn(
                "h-5 w-5 transition-colors",
                isArchiveExpanded ? "text-emerald-400" : "text-muted-foreground"
              )} />
            </div>
            <div className="text-right">
              <span className="font-medium text-foreground">ארכיון תקלות</span>
              <p className="text-xs text-muted-foreground">תקלות שנפתרו</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {archiveFetched && totalArchived > 0 ? (
              <Badge className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium">
                {totalArchived}
              </Badge>
            ) : null}
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              isArchiveExpanded ? "bg-emerald-500/10" : "bg-secondary"
            )}>
              {isArchiveExpanded ? (
                <ChevronUp className="h-4 w-4 text-emerald-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </button>

        {isArchiveExpanded ? (
          <div className="mt-4 space-y-4">
            {isArchiveLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="relative h-8 w-8">
                  <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
                  <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-emerald-500" />
                </div>
                <p className="text-sm text-muted-foreground">טוען ארכיון...</p>
              </div>
            ) : archiveError ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="h-6 w-6 text-red-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-medium text-foreground">שגיאה בטעינת הארכיון</p>
                  <p className="text-sm text-muted-foreground">{archiveError}</p>
                </div>
              </div>
            ) : archivedStations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/30 border border-border">
                  <Archive className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">אין תקלות בארכיון</p>
              </div>
            ) : (
              archivedStations.map((stationData) => {
                const containsHighlight = highlightId
                  ? stationData.reports.some((r) => r.id === highlightId)
                  : false;
                return (
                  <StationReportsCard
                    key={stationData.station.id}
                    data={stationData}
                    onStatusChange={handleStatusChange}
                    isUpdating={isUpdating}
                    defaultExpanded={containsHighlight}
                    highlightReportId={highlightId}
                    isArchive
                  />
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
