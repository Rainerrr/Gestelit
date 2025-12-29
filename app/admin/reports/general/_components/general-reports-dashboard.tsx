"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchGeneralReportsAdminApi,
  fetchReportReasonsAdminApi,
  updateReportStatusAdminApi,
} from "@/lib/api/admin-management";
import type { ReportWithDetails, ReportReason } from "@/lib/types";
import { GeneralReportCard } from "./general-report-card";
import { ReasonsManager } from "./reasons-manager";

type StatusFilter = "all" | "new" | "approved";

export const GeneralReportsDashboard = () => {
  const [reports, setReports] = useState<ReportWithDetails[]>([]);
  const [reasons, setReasons] = useState<ReportReason[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    setError(null);

    try {
      const [reportsData, reasonsData] = await Promise.all([
        fetchGeneralReportsAdminApi(),
        fetchReportReasonsAdminApi(),
      ]);
      setReports(reportsData.reports);
      setReasons(reasonsData.reasons);
    } catch (err) {
      console.error("[general-reports] Failed to fetch:", err);
      setError(err instanceof Error ? err.message : "FETCH_FAILED");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleApprove = async (id: string) => {
    setIsUpdating(true);
    try {
      await updateReportStatusAdminApi(id, "approved");
      await fetchData();
    } catch (err) {
      console.error("[general-reports] Failed to approve:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRefresh = () => {
    void fetchData(true);
  };

  const handleReasonsUpdate = () => {
    void fetchReportReasonsAdminApi().then((data) => setReasons(data.reasons));
  };

  // Filter reports
  const filteredReports = reports.filter((r) => {
    if (statusFilter === "all") return true;
    return r.status === statusFilter;
  });

  const newCount = reports.filter((r) => r.status === "new").length;
  const approvedCount = reports.filter((r) => r.status === "approved").length;

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-foreground">דיווחים כלליים</h2>
        <div className="flex gap-2">
          <ReasonsManager reasons={reasons} onUpdate={handleReasonsUpdate} />
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 ml-2 ${isRefreshing ? "animate-spin" : ""}`} />
            רענון
          </Button>
        </div>
      </div>

      {/* Summary + Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-4 py-2">
            <FileText className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold text-foreground">{newCount}</span>
            <span className="text-sm text-muted-foreground">חדשים</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-4 py-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <span className="text-lg font-bold text-foreground">{approvedCount}</span>
            <span className="text-sm text-muted-foreground">אושרו</span>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card/30 p-1">
          <Button
            variant={statusFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            className="h-8"
          >
            הכל
            <Badge variant="outline" className="mr-2 h-5 px-1.5">
              {reports.length}
            </Badge>
          </Button>
          <Button
            variant={statusFilter === "new" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("new")}
            className="h-8"
          >
            חדשים
            {newCount > 0 ? (
              <Badge className="mr-2 h-5 px-1.5 bg-primary/20 text-primary">
                {newCount}
              </Badge>
            ) : null}
          </Button>
          <Button
            variant={statusFilter === "approved" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("approved")}
            className="h-8"
          >
            אושרו
          </Button>
        </div>
      </div>

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
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/30 border border-border">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground">
              {statusFilter === "all" ? "אין דיווחים" : statusFilter === "new" ? "אין דיווחים חדשים" : "אין דיווחים שאושרו"}
            </p>
            <p className="text-sm text-muted-foreground">
              {statusFilter === "new" ? "כל הדיווחים טופלו" : ""}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((report) => (
            <GeneralReportCard
              key={report.id}
              report={report}
              onApprove={handleApprove}
              isUpdating={isUpdating}
            />
          ))}
        </div>
      )}
    </div>
  );
};
