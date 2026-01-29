"use client";

import { useCallback, useState, useMemo, Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Trash2, RefreshCw, CheckCircle2, AlertTriangle, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  fetchScrapReportsAdminApi,
  updateReportStatusAdminApi,
  deleteReportAdminApi,
  deleteAllReportsAdminApi,
} from "@/lib/api/admin-management";
import type { StationWithScrapReports } from "@/lib/data/reports";
import { ViewToggle } from "@/app/admin/reports/_components/view-toggle";
import { FeedView } from "@/app/admin/reports/_components/feed-view";
import { PerStationView } from "@/app/admin/reports/_components/per-station-view";
import { cn } from "@/lib/utils";
import { useRealtimeReports } from "@/lib/hooks/useRealtimeReports";
import { useViewToggle } from "@/lib/hooks/useViewToggle";
import { flattenStationReports } from "@/lib/data/reports";

const ScrapReportsDashboardInner = () => {
  const searchParams = useSearchParams();
  const sessionIdFilter = searchParams.get("sessionId");
  const [isUpdating, setIsUpdating] = useState(false);
  const [view, setView] = useViewToggle("station");

  // Real-time reports subscription
  const fetchReportsData = useCallback(async () => {
    const data = await fetchScrapReportsAdminApi();
    return data.stations;
  }, []);

  const {
    data: stations,
    isLoading,
    isRefreshing,
    error,
    refresh: handleRefresh,
  } = useRealtimeReports<StationWithScrapReports[]>({
    reportType: "scrap",
    fetchData: fetchReportsData,
  });

  const handleApprove = async (id: string) => {
    setIsUpdating(true);
    try {
      await updateReportStatusAdminApi(id, "approved");
      // Real-time will pick up the change, but refresh for immediate feedback
      await handleRefresh();
    } catch (err) {
      console.error("[scrap-reports] Failed to approve:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsUpdating(true);
    try {
      await deleteReportAdminApi(id);
      await handleRefresh();
    } catch (err) {
      console.error("[scrap-reports] Failed to delete:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAll = async () => {
    setIsUpdating(true);
    try {
      await deleteAllReportsAdminApi("scrap");
      await handleRefresh();
    } catch (err) {
      console.error("[scrap-reports] Failed to delete all:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const allStations = stations ?? [];

  // Flatten all reports for feed view
  const allReports = useMemo(() => {
    return flattenStationReports(allStations);
  }, [allStations]);

  // Filter reports by sessionId if provided
  const filteredReports = useMemo(() => {
    if (!sessionIdFilter) return allReports;
    return allReports.filter((r) => r.session_id === sessionIdFilter);
  }, [allReports, sessionIdFilter]);

  // Get highlighted report IDs for visual indication
  const highlightedReportIds = useMemo(() => {
    if (!sessionIdFilter) return new Set<string>();
    return new Set(filteredReports.map((r) => r.id));
  }, [sessionIdFilter, filteredReports]);

  const totalNew = allStations.reduce((sum, s) => sum + s.newCount, 0);
  const totalApproved = allStations.reduce((sum, s) => sum + s.approvedCount, 0);

  // Clear session filter
  const clearSessionFilter = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("sessionId");
    window.history.replaceState({}, "", url.toString());
    // Force re-render by using router would be cleaner but this works
    window.location.href = url.toString();
  };

  return (
    <div className="space-y-6 pb-mobile-nav">
      {/* Header with refresh button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">
            דיווחי פסולים
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            ניהול ואישור דיווחי פסולים
          </p>
        </div>
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                disabled={allReports.length === 0 || isUpdating}
              >
                <Trash2 className="h-4 w-4" />
                מחק הכל
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>מחיקת כל דיווחי הפסולים</AlertDialogTitle>
                <AlertDialogDescription>
                  פעולה זו תמחק את כל {allReports.length} דיווחי הפסולים. פעולה זו אינה ניתנת לביטול.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ביטול</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void handleDeleteAll()}
                  className="bg-red-500 hover:bg-red-600"
                >
                  מחק הכל
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {/* New */}
        <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card/30 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                ממתינים
              </p>
              <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">
                {totalNew}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Trash2 className="h-5 w-5 text-amber-400" />
            </div>
          </div>
          {totalNew > 0 && (
            <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-amber-500/40" />
          )}
        </div>

        {/* Approved */}
        <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card/30 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                אושרו
              </p>
              <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">
                {totalApproved}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
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
              <Package className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>
      </div>

      {/* Session filter banner */}
      {sessionIdFilter && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-medium text-foreground">
              מציג דיווחים מסשן ספציפי
            </span>
            <span className="text-xs text-muted-foreground">
              ({filteredReports.length} דיווחים)
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSessionFilter}
            className="h-7 px-2 text-xs gap-1"
          >
            <X className="h-3 w-3" />
            הצג הכל
          </Button>
        </div>
      )}

      {/* View Toggle */}
      <ViewToggle value={view} onChange={setView} />

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">טוען דיווחים...</p>
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
      ) : filteredReports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground">
              {sessionIdFilter ? "אין דיווחי פסולים לסשן זה" : "אין דיווחי פסולים"}
            </p>
            <p className="text-sm text-muted-foreground">
              {sessionIdFilter ? "לא נמצאו דיווחים לסשן המבוקש" : "לא נמצאו דיווחים על פסולים"}
            </p>
          </div>
          {sessionIdFilter && (
            <Button variant="outline" onClick={clearSessionFilter} size="sm">
              הצג את כל הדיווחים
            </Button>
          )}
        </div>
      ) : view === "feed" ? (
        <FeedView
          reports={filteredReports}
          reportType="scrap"
          onApprove={handleApprove}
          onDelete={handleDelete}
          isUpdating={isUpdating}
        />
      ) : (
        <PerStationView
          reports={filteredReports}
          reportType="scrap"
          onApprove={handleApprove}
          onDelete={handleDelete}
          isUpdating={isUpdating}
        />
      )}
    </div>
  );
};

// Wrap with Suspense for useSearchParams
export const ScrapReportsDashboard = () => {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">טוען דיווחים...</p>
        </div>
      }
    >
      <ScrapReportsDashboardInner />
    </Suspense>
  );
};
