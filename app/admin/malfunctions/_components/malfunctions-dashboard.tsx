"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Eye, RefreshCw, CheckCircle2, Wrench, Archive, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { fetchMalfunctionsAdminApi, updateMalfunctionStatusAdminApi } from "@/lib/api/admin-management";
import type { StationWithMalfunctions, StationWithArchivedMalfunctions } from "@/lib/data/malfunctions";
import type { MalfunctionStatus } from "@/lib/types";
import { StationMalfunctionsCard } from "./station-malfunctions-card";
import { cn } from "@/lib/utils";

export const MalfunctionsDashboard = () => {
  const { hasAccess } = useAdminGuard();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [stations, setStations] = useState<StationWithMalfunctions[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Archive state
  const [archivedStations, setArchivedStations] = useState<StationWithArchivedMalfunctions[]>([]);
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveFetched, setArchiveFetched] = useState(false);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    setError(null);

    try {
      const data = await fetchMalfunctionsAdminApi();
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
      const data = await fetchMalfunctionsAdminApi({ includeArchived: true });
      setArchivedStations(data.archived ?? []);
      setArchiveFetched(true);
    } catch (err) {
      console.error("[malfunctions] Failed to fetch archived:", err);
      setArchiveError(err instanceof Error ? err.message : "ARCHIVE_FETCH_FAILED");
    } finally {
      setIsArchiveLoading(false);
    }
  }, [archiveFetched]);

  // Check if highlighted malfunction is in active stations
  const isHighlightInActive = highlightId
    ? stations.some((s) => s.malfunctions.some((m) => m.id === highlightId))
    : false;

  // If highlight exists but not in active, it must be in archive
  const isHighlightInArchive = highlightId && !isHighlightInActive && !isLoading;

  useEffect(() => {
    if (hasAccess) {
      void fetchData();
    }
  }, [hasAccess, fetchData]);

  // Auto-expand archive if highlighting an archived malfunction
  useEffect(() => {
    if (isHighlightInArchive && !isArchiveExpanded) {
      setIsArchiveExpanded(true);
      void fetchArchivedData();
    }
  }, [isHighlightInArchive, isArchiveExpanded, fetchArchivedData]);

  const handleStatusChange = async (id: string, status: MalfunctionStatus) => {
    setIsUpdating(true);
    try {
      await updateMalfunctionStatusAdminApi(id, status);
      // Refetch both active and archived data after status change
      setArchiveFetched(false);
      await fetchData();
      if (isArchiveExpanded) {
        const data = await fetchMalfunctionsAdminApi({ includeArchived: true });
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

    // Lazy load on first expand
    if (newExpanded && !archiveFetched && !isArchiveLoading) {
      void fetchArchivedData();
    }
  };

  // Calculate totals
  const totalOpen = stations.reduce((sum, s) => sum + s.openCount, 0);
  const totalKnown = stations.reduce((sum, s) => sum + s.knownCount, 0);
  const totalArchived = archivedStations.reduce((sum, s) => sum + s.solvedCount, 0);

  if (hasAccess === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="font-mono text-sm text-muted-foreground tracking-wider">טוען נתונים...</p>
        </div>
      </div>
    );
  }

  if (hasAccess === false) {
    return null;
  }

  return (
    <AdminLayout
      header={
        <div className="flex flex-col gap-4 text-right">
          {/* Mobile simplified title */}
          <div className="flex items-center gap-3 lg:hidden">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">תקלות</h1>
          </div>
          {/* Desktop full header */}
          <div className="hidden lg:flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Wrench className="h-5 w-5 text-primary" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
                  ניהול תקלות
                </span>
              </div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight lg:text-3xl">
                תקלות תחנות
              </h1>
              <p className="text-sm text-muted-foreground max-w-xl">
                צפייה וניהול תקלות שדווחו על ידי העובדים. תקלות שטופלו יועברו לארכיון.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="w-full sm:w-auto border-input bg-secondary text-foreground/80 hover:bg-accent hover:text-foreground"
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 ml-2 ${isRefreshing ? "animate-spin" : ""}`} />
                רענון
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
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
              // Auto-expand station if it contains the highlighted malfunction
              const containsHighlight = highlightId
                ? stationData.malfunctions.some((m) => m.id === highlightId)
                : false;
              return (
                <StationMalfunctionsCard
                  key={stationData.station.id}
                  data={stationData}
                  onStatusChange={handleStatusChange}
                  isUpdating={isUpdating}
                  defaultExpanded={index === 0 || containsHighlight}
                  highlightMalfunctionId={highlightId}
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
                    ? stationData.malfunctions.some((m) => m.id === highlightId)
                    : false;
                  return (
                    <StationMalfunctionsCard
                      key={stationData.station.id}
                      data={stationData}
                      onStatusChange={handleStatusChange}
                      isUpdating={isUpdating}
                      defaultExpanded={containsHighlight}
                      highlightMalfunctionId={highlightId}
                      isArchive
                    />
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      </div>
    </AdminLayout>
  );
};
