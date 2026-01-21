"use client";

import { useCallback, useState, useMemo } from "react";
import Link from "next/link";
import {
  FileText,
  AlertTriangle,
  RefreshCw,
  Inbox,
  ClipboardCheck,
  ChevronDown,
  Package,
  MapPin,
  User,
  Clock,
  CheckCircle2,
  ZoomIn,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
// Helper: Format relative time
// =============================================================================
const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "עכשיו";
  if (diffMinutes < 60) return `לפני ${diffMinutes} דק׳`;
  if (diffHours < 24) return `לפני ${diffHours} שע׳`;
  if (diffDays === 1) return "אתמול";
  if (diffDays < 7) return `לפני ${diffDays} ימים`;

  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
};

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
// QA Report Card Component (for First Product Approval)
// =============================================================================
const QaReportCard = ({
  report,
  onApprove,
  isUpdating,
}: {
  report: ReportWithDetails;
  onApprove?: (id: string) => Promise<void>;
  isUpdating: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const hasExpandableContent = report.description || report.image_url;

  const handleApprove = () => {
    if (onApprove) {
      void onApprove(report.id);
    }
  };

  return (
    <div
      className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden transition-all duration-200"
    >
      {/* Header */}
      <div
        onClick={() => hasExpandableContent && setExpanded(!expanded)}
        className={cn(
          "px-4 py-3 flex items-center gap-3 transition-colors flex-wrap",
          hasExpandableContent && "hover:bg-amber-500/10 cursor-pointer"
        )}
      >
        {/* QA Icon Badge */}
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 border border-amber-500/30 shrink-0">
          <ClipboardCheck className="h-4 w-4 text-amber-500" />
        </div>

        {/* Job Item name */}
        {report.job_item?.name && (
          <div className="flex items-center gap-1.5 text-sm">
            <Package className="h-3.5 w-3.5 text-amber-500/70" />
            <span className="font-medium text-foreground">{report.job_item.name}</span>
          </div>
        )}

        {/* Station */}
        {report.station?.name && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>{report.station.name}</span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Time */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <Clock className="h-3.5 w-3.5" />
          <span>{report.created_at ? formatRelativeTime(report.created_at) : "—"}</span>
        </div>

        {/* Expand chevron */}
        {hasExpandableContent && (
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0",
              expanded && "rotate-180"
            )}
          />
        )}
      </div>

      {/* Row 2: Worker + Actions */}
      <div className="px-4 pb-3 flex items-center gap-4 text-sm">
        {report.reporter && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span className="text-foreground/80">{report.reporter.full_name}</span>
            <span className="text-xs font-mono opacity-60">
              {report.reporter.worker_code}
            </span>
          </div>
        )}

        <div className="flex-1" />

        {/* Approve button */}
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleApprove();
          }}
          disabled={isUpdating}
          className="h-7 gap-1 text-xs border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
        >
          <CheckCircle2 className="h-3 w-3" />
          אשר
        </Button>

        {/* Link to reports */}
        <Link
          href={`/admin/reports/general?highlight=${report.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-primary/70 hover:text-primary transition-colors"
        >
          <span className="text-xs">הצג</span>
        </Link>
      </div>

      {/* Expandable content */}
      {expanded && hasExpandableContent && (
        <div className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-4 space-y-4">
          {report.description && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                תיאור
              </p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {report.description}
              </p>
            </div>
          )}

          {report.image_url && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                תמונה מצורפת
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setImageOpen(true);
                }}
                className="relative group rounded-lg overflow-hidden border border-border/50 hover:border-primary/40 transition-all"
              >
                <img
                  src={report.image_url}
                  alt="תמונת דיווח"
                  className="max-h-48 w-auto object-contain bg-black/10"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 text-black text-sm font-medium">
                    <ZoomIn className="h-4 w-4" />
                    הגדלה
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Image lightbox */}
      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="max-w-4xl w-auto p-0 bg-black/95 border-border/50 overflow-hidden">
          <DialogTitle className="sr-only">תמונת דיווח</DialogTitle>
          <button
            type="button"
            onClick={() => setImageOpen(false)}
            className="absolute top-4 left-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm"
          >
            <X className="h-5 w-5" />
          </button>
          {report.image_url && (
            <img
              src={report.image_url}
              alt="תמונת דיווח"
              className="max-h-[85vh] max-w-full w-auto h-auto object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// =============================================================================
// QA Reports Section (Collapsible)
// =============================================================================
const QaReportsSection = ({
  reports,
  onApprove,
  isUpdating,
}: {
  reports: ReportWithDetails[];
  onApprove?: (id: string) => Promise<void>;
  isUpdating: boolean;
}) => {
  const [collapsed, setCollapsed] = useState(false);

  if (reports.length === 0) return null;

  return (
    <section className="relative mb-4">
      {/* Amber accent line */}
      <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-amber-500/40" />

      <div className="pr-4">
        {/* Collapsible header */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between mb-3 group"
        >
          <div className="flex items-center gap-2">
            {/* Pulsing indicator */}
            <div className="relative flex items-center justify-center">
              <div className="absolute h-6 w-6 rounded-full bg-amber-500/10 animate-ping" />
              <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/30">
                <ClipboardCheck className="h-3 w-3 text-amber-500" />
              </div>
            </div>

            <span className="text-sm font-medium text-foreground">
              מוצרים ראשונים (ממתינים לאישור)
            </span>
            <span className="font-mono text-sm font-bold text-amber-500 tabular-nums">
              {reports.length}
            </span>
          </div>

          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              collapsed && "-rotate-90"
            )}
          />
        </button>

        {/* Reports list */}
        {!collapsed && (
          <div className="space-y-3">
            {reports.map((report, index) => (
              <div
                key={report.id}
                className="animate-in fade-in slide-in-from-right-2 duration-300"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <QaReportCard
                  report={report}
                  onApprove={onApprove}
                  isUpdating={isUpdating}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

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

  // Filter pending QA reports (first product approval with status "new")
  const pendingQaReports = useMemo(() => {
    return (generalReports ?? []).filter(
      (r) => r.is_first_product_qa === true && r.status === "new"
    );
  }, [generalReports]);

  // Filter non-QA general reports for regular display
  const nonQaGeneralReports = useMemo(() => {
    return ongoingGeneralReports.filter(
      (r) => r.is_first_product_qa !== true
    );
  }, [ongoingGeneralReports]);

  // Current data based on toggle
  const currentReports = reportType === "general" ? nonQaGeneralReports : ongoingMalfunctionReports;
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
        ) : reportType === "general" ? (
          // General tab: Show QA reports section + regular general reports
          <div className="space-y-3">
            {/* QA Reports Section */}
            <QaReportsSection
              reports={pendingQaReports}
              onApprove={handleApprove}
              isUpdating={isUpdating}
            />

            {/* Regular general reports */}
            {currentReports.length === 0 && pendingQaReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[200px] gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <Inbox className="h-6 w-6 text-emerald-400" />
                </div>
                <p className="text-sm text-muted-foreground">אין דיווחים פעילים כרגע</p>
              </div>
            ) : (
              <>
                {currentReports.slice(0, 5).map((report) => (
                  <UnifiedReportCard
                    key={report.id}
                    report={report}
                    reportType="general"
                    onApprove={handleApprove}
                    isUpdating={isUpdating}
                  />
                ))}
                {currentReports.length > 5 && (
                  <a
                    href="/admin/reports/general"
                    className="block text-center text-sm text-primary hover:underline py-2"
                  >
                    +{currentReports.length - 5} דיווחים נוספים
                  </a>
                )}
              </>
            )}
          </div>
        ) : currentReports.length === 0 ? (
          // Malfunction tab: Empty state
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Inbox className="h-6 w-6 text-emerald-400" />
            </div>
            <p className="text-sm text-muted-foreground">אין תקלות פעילות כרגע</p>
          </div>
        ) : (
          // Malfunction tab: Reports list
          <div className="space-y-3">
            {currentReports.slice(0, 5).map((report) => (
              <UnifiedReportCard
                key={report.id}
                report={report}
                reportType="malfunction"
                stationReasons={stationReasons}
                onStatusChange={handleStatusChange}
                isUpdating={isUpdating}
              />
            ))}
            {currentReports.length > 5 && (
              <a
                href="/admin/reports/malfunctions"
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
