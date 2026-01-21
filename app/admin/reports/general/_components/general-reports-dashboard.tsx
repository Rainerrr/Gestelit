"use client";

import { useCallback, useEffect, useState, useMemo, Suspense } from "react";
import {
  FileText,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Inbox,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchGeneralReportsAdminApi,
  fetchReportReasonsAdminApi,
  updateReportStatusAdminApi,
} from "@/lib/api/admin-management";
import type { ReportWithDetails, ReportReason } from "@/lib/types";
import { ReasonsManager } from "./reasons-manager";
import { ViewToggle } from "@/app/admin/reports/_components/view-toggle";
import { FeedView } from "@/app/admin/reports/_components/feed-view";
import { PerStationView } from "@/app/admin/reports/_components/per-station-view";
import { cn } from "@/lib/utils";
import { useRealtimeReports } from "@/lib/hooks/useRealtimeReports";
import { useViewToggle } from "@/lib/hooks/useViewToggle";
import { filterOngoingReports } from "@/lib/data/reports";

type StatusFilter = "all" | "new" | "approved" | "first_product";

const GeneralReportsDashboardInner = () => {
  const [reasons, setReasons] = useState<ReportReason[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [view, setView] = useViewToggle("feed");

  // Real-time reports subscription
  const fetchReportsData = useCallback(async () => {
    const data = await fetchGeneralReportsAdminApi();
    return data.reports;
  }, []);

  const {
    data: reports,
    isLoading,
    isRefreshing,
    error,
    refresh: handleRefresh,
  } = useRealtimeReports<ReportWithDetails[]>({
    reportType: "general",
    fetchData: fetchReportsData,
  });

  // Fetch reasons separately (not real-time)
  useEffect(() => {
    void fetchReportReasonsAdminApi().then((data) => setReasons(data.reasons));
  }, []);

  const handleApprove = async (id: string) => {
    setIsUpdating(true);
    try {
      await updateReportStatusAdminApi(id, "approved");
      // Real-time will pick up the change, but refresh for immediate feedback
      await handleRefresh();
    } catch (err) {
      console.error("[general-reports] Failed to approve:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReasonsUpdate = () => {
    void fetchReportReasonsAdminApi().then((data) => setReasons(data.reasons));
  };

  // Filter reports by status
  const filteredReports = useMemo(() => {
    if (!reports) return [];
    return reports.filter((r) => {
      if (statusFilter === "all") return true;
      // First product tab: only show unapproved (new) QA reports
      if (statusFilter === "first_product") {
        return r.is_first_product_qa === true && r.status === "new";
      }
      // Approved tab: includes all approved reports (regular + first product QA)
      return r.status === statusFilter;
    });
  }, [reports, statusFilter]);

  const allReports = reports ?? [];
  const newCount = allReports.filter((r) => r.status === "new").length;
  const approvedCount = allReports.filter((r) => r.status === "approved").length;
  const ongoingCount = filterOngoingReports(allReports).length;
  // Only count unapproved (new) first product QA reports for the badge
  const firstProductCount = allReports.filter(
    (r) => r.is_first_product_qa === true && r.status === "new"
  ).length;

  return (
    <div className="space-y-6 pb-mobile-nav">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">
            דיווחים כלליים
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            ניהול ואישור דיווחים מהמפעל
          </p>
        </div>
        <div className="flex gap-2">
          <ReasonsManager reasons={reasons} onUpdate={handleReasonsUpdate} />
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            size="sm"
            className="gap-2"
          >
            <RefreshCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            />
            רענון
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* New reports */}
        <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card/30 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                חדשים
              </p>
              <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">
                {newCount}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <FileText className="h-5 w-5 text-primary" />
            </div>
          </div>
          {newCount > 0 && (
            <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-primary/40" />
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
                {approvedCount}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
        </div>

        {/* Live/Ongoing */}
        <div
          className={cn(
            "relative overflow-hidden rounded-xl border p-4 col-span-2 sm:col-span-1",
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

      {/* View Toggle + Filter tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
        {/* View Toggle */}
        <ViewToggle value={view} onChange={setView} />

        {/* Filter tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg border border-border/60 bg-card/20 w-fit">
          <Button
            variant={statusFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            className="h-8 gap-2"
          >
            הכל
            <Badge variant="outline" className="h-5 px-1.5 font-mono text-xs">
              {allReports.length}
            </Badge>
          </Button>
          <Button
            variant={statusFilter === "new" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("new")}
            className="h-8 gap-2"
          >
            חדשים
            {newCount > 0 && (
              <Badge className="h-5 px-1.5 bg-primary/20 text-primary border-0 font-mono text-xs">
                {newCount}
              </Badge>
            )}
          </Button>
          <Button
            variant={statusFilter === "approved" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("approved")}
            className="h-8"
          >
            אושרו
          </Button>
          <Button
            variant={statusFilter === "first_product" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("first_product")}
            className="h-8 gap-2"
          >
            מוצר ראשון
            {firstProductCount > 0 && (
              <Badge className="h-5 px-1.5 bg-amber-500/20 text-amber-500 border-0 font-mono text-xs">
                {firstProductCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">טוען דיווחים...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground">
              שגיאה בטעינת הנתונים
            </p>
            <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
          </div>
          <Button variant="outline" onClick={handleRefresh} size="sm">
            נסה שנית
          </Button>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30 border border-border">
            <Inbox className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground">
              {statusFilter === "all"
                ? "אין דיווחים"
                : statusFilter === "new"
                  ? "אין דיווחים חדשים"
                  : statusFilter === "first_product"
                    ? "אין דיווחי מוצר ראשון ממתינים לאישור"
                    : "אין דיווחים שאושרו"}
            </p>
            <p className="text-sm text-muted-foreground">
              {statusFilter === "new"
                ? "כל הדיווחים טופלו"
                : statusFilter === "first_product"
                  ? "דיווחים שאושרו נמצאים בלשונית 'אושרו'"
                  : ""}
            </p>
          </div>
        </div>
      ) : view === "feed" ? (
        <FeedView
          reports={filteredReports}
          reportType="general"
          onApprove={handleApprove}
          isUpdating={isUpdating}
        />
      ) : (
        <PerStationView
          reports={filteredReports}
          reportType="general"
          onApprove={handleApprove}
          isUpdating={isUpdating}
        />
      )}
    </div>
  );
};

// Wrap with Suspense for useSearchParams
export const GeneralReportsDashboard = () => {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
        </div>
        <p className="text-sm text-muted-foreground">טוען דיווחים...</p>
      </div>
    }>
      <GeneralReportsDashboardInner />
    </Suspense>
  );
};
