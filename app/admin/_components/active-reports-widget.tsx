"use client";

import { useCallback, useState, useMemo } from "react";
import { FileText, AlertTriangle, RefreshCw, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchGeneralReportsAdminApi,
  fetchMalfunctionReportsAdminApi,
  updateReportStatusAdminApi,
} from "@/lib/api/admin-management";
import type { ReportWithDetails, MalfunctionReportStatus, StationReason } from "@/lib/types";
import type { StationWithReports } from "@/lib/data/reports";
import { useRealtimeReports } from "@/lib/hooks/useRealtimeReports";
import { flattenStationReports, filterOngoingReports } from "@/lib/data/reports";
import { UnifiedReportCard } from "@/app/admin/reports/_components/unified-report-card";

type ReportTypeToggle = "general" | "malfunction";

// =============================================================================
// Toggle Component
// =============================================================================
const ReportTypeToggle = ({
  value,
  onChange,
  generalCount,
  malfunctionCount,
}: {
  value: ReportTypeToggle;
  onChange: (v: ReportTypeToggle) => void;
  generalCount: number;
  malfunctionCount: number;
}) => (
  <div className="flex items-center gap-1 p-1 rounded-lg border border-border/60 bg-card/30">
    <Button
      variant={value === "general" ? "secondary" : "ghost"}
      size="sm"
      onClick={() => onChange("general")}
      className="h-7 gap-1.5 px-2.5 text-xs"
    >
      <FileText className="h-3.5 w-3.5" />
      <span>כללי</span>
      {generalCount > 0 && (
        <span className="font-mono text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
          {generalCount}
        </span>
      )}
    </Button>
    <Button
      variant={value === "malfunction" ? "secondary" : "ghost"}
      size="sm"
      onClick={() => onChange("malfunction")}
      className="h-7 gap-1.5 px-2.5 text-xs"
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      <span>תקלות</span>
      {malfunctionCount > 0 && (
        <span className="font-mono text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
          {malfunctionCount}
        </span>
      )}
    </Button>
  </div>
);

// =============================================================================
// Main Widget Component
// =============================================================================
export const ActiveReportsWidget = () => {
  const [reportType, setReportType] = useState<ReportTypeToggle>("general");
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch general reports
  const fetchGeneralData = useCallback(async () => {
    const data = await fetchGeneralReportsAdminApi();
    return data.reports;
  }, []);

  const {
    data: generalReports,
    isLoading: isGeneralLoading,
    isRefreshing: isGeneralRefreshing,
    error: generalError,
    refresh: refreshGeneral,
  } = useRealtimeReports<ReportWithDetails[]>({
    reportType: "general",
    fetchData: fetchGeneralData,
  });

  // Fetch malfunction reports
  const fetchMalfunctionData = useCallback(async () => {
    const data = await fetchMalfunctionReportsAdminApi();
    return data.stations;
  }, []);

  const {
    data: malfunctionStations,
    isLoading: isMalfunctionLoading,
    isRefreshing: isMalfunctionRefreshing,
    error: malfunctionError,
    refresh: refreshMalfunction,
  } = useRealtimeReports<StationWithReports[]>({
    reportType: "malfunction",
    fetchData: fetchMalfunctionData,
  });

  // Flatten malfunction reports
  const malfunctionReports = useMemo(() => {
    return flattenStationReports(malfunctionStations ?? []);
  }, [malfunctionStations]);

  // Get station reasons from malfunction data
  const stationReasons = useMemo((): StationReason[] => {
    const reasons: StationReason[] = [];
    const seenIds = new Set<string>();

    for (const report of malfunctionReports) {
      if (report.station?.station_reasons) {
        for (const reason of report.station.station_reasons) {
          if (!seenIds.has(reason.id)) {
            seenIds.add(reason.id);
            reasons.push(reason);
          }
        }
      }
    }
    return reasons;
  }, [malfunctionReports]);

  // Filter to only ongoing (live) reports - those with active status events
  const ongoingGeneralReports = useMemo(() => {
    return filterOngoingReports(generalReports ?? []);
  }, [generalReports]);

  const ongoingMalfunctionReports = useMemo(() => {
    return filterOngoingReports(malfunctionReports);
  }, [malfunctionReports]);

  // Current data based on toggle
  const currentReports = reportType === "general" ? ongoingGeneralReports : ongoingMalfunctionReports;
  const isLoading = reportType === "general" ? isGeneralLoading : isMalfunctionLoading;
  const isRefreshing = reportType === "general" ? isGeneralRefreshing : isMalfunctionRefreshing;
  const error = reportType === "general" ? generalError : malfunctionError;
  const refresh = reportType === "general" ? refreshGeneral : refreshMalfunction;

  // Handlers
  const handleApprove = async (id: string) => {
    setIsUpdating(true);
    try {
      await updateReportStatusAdminApi(id, "approved");
      await refreshGeneral();
    } catch (err) {
      console.error("[active-reports-widget] Failed to approve:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStatusChange = async (id: string, status: MalfunctionReportStatus) => {
    setIsUpdating(true);
    try {
      await updateReportStatusAdminApi(id, status);
      await refreshMalfunction();
    } catch (err) {
      console.error("[active-reports-widget] Failed to update status:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-base font-semibold text-foreground">דיווחים פעילים</h3>
        </div>
        <div className="flex items-center gap-2">
          <ReportTypeToggle
            value={reportType}
            onChange={setReportType}
            generalCount={ongoingGeneralReports.length}
            malfunctionCount={ongoingMalfunctionReports.length}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            disabled={isRefreshing}
            className="h-7 w-7"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
            </div>
            <p className="text-sm text-muted-foreground">טוען דיווחים...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={refresh} size="sm">
              נסה שנית
            </Button>
          </div>
        ) : currentReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Inbox className="h-6 w-6 text-emerald-400" />
            </div>
            <p className="text-sm text-muted-foreground">
              {reportType === "general" ? "אין דיווחים פעילים כרגע" : "אין תקלות פעילות כרגע"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentReports.slice(0, 5).map((report) => (
              <UnifiedReportCard
                key={report.id}
                report={report}
                reportType={reportType}
                stationReasons={reportType === "malfunction" ? stationReasons : undefined}
                onApprove={reportType === "general" ? handleApprove : undefined}
                onStatusChange={reportType === "malfunction" ? handleStatusChange : undefined}
                isUpdating={isUpdating}
              />
            ))}
            {currentReports.length > 5 && (
              <a
                href={`/admin/reports/${reportType === "general" ? "general" : "malfunctions"}`}
                className="block text-center text-sm text-primary hover:underline py-2"
              >
                +{currentReports.length - 5} דיווחים נוספים
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
