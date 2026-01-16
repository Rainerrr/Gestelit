"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Clock,
  User,
  AlertTriangle,
  Eye,
  CheckCircle2,
  X,
  ZoomIn,
  ExternalLink,
  MapPin,
  FileText,
  Package,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  ReportWithDetails,
  ReportType,
  MalfunctionReportStatus,
  SimpleReportStatus,
  StationReason,
  StatusEventForReport,
} from "@/lib/types";
import { getReasonLabel } from "@/lib/data/reports";
import { useLiveDuration, formatDurationHMS } from "@/lib/hooks/useLiveDuration";

// =============================================================================
// Helper: Format relative time in Hebrew
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
// Malfunction status configuration
// =============================================================================
const malfunctionStatusConfig: Record<
  MalfunctionReportStatus,
  { label: string; colorHex: string; icon: typeof AlertTriangle }
> = {
  open: {
    label: "חדש",
    colorHex: "#ef4444",
    icon: AlertTriangle,
  },
  known: {
    label: "בטיפול",
    colorHex: "#f59e0b",
    icon: Eye,
  },
  solved: {
    label: "נפתר",
    colorHex: "#22c55e",
    icon: CheckCircle2,
  },
};

// =============================================================================
// StatusDurationBadge: Shows live status with ticking duration
// =============================================================================
type StatusDurationBadgeProps = {
  statusEvent: StatusEventForReport;
};

const StatusDurationBadge = ({ statusEvent }: StatusDurationBadgeProps) => {
  const colorHex = statusEvent.status_definition?.color_hex ?? "#64748b";
  const label = statusEvent.status_definition?.label_he ?? "ללא סטטוס";
  const { seconds, isLive } = useLiveDuration(
    statusEvent.started_at,
    statusEvent.ended_at
  );

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-1.5 border"
      style={{
        backgroundColor: `${colorHex}15`,
        borderColor: `${colorHex}40`,
      }}
    >
      {/* Status indicator dot */}
      <span
        className={cn("w-2 h-2 rounded-full shrink-0", isLive && "animate-pulse")}
        style={{ backgroundColor: colorHex }}
      />

      {/* Status label */}
      <span className="text-sm font-medium" style={{ color: colorHex }}>
        {label}
      </span>

      {/* Separator */}
      <span
        className="w-px h-4"
        style={{ backgroundColor: `${colorHex}40` }}
      />

      {/* Duration */}
      <span
        className={cn(
          "font-mono text-sm tabular-nums tracking-tight",
          isLive && "font-semibold"
        )}
        style={{ color: colorHex }}
      >
        {formatDurationHMS(seconds)}
      </span>
    </div>
  );
};

// =============================================================================
// UnifiedReportCard Props
// =============================================================================
type UnifiedReportCardProps = {
  report: ReportWithDetails;
  reportType: ReportType;
  stationReasons?: StationReason[] | null;
  hideStationBadge?: boolean;
  onStatusChange?: (id: string, status: MalfunctionReportStatus) => Promise<void>;
  onApprove?: (id: string) => Promise<void>;
  isUpdating: boolean;
  isHighlighted?: boolean;
};

// =============================================================================
// UnifiedReportCard Component
// =============================================================================
export const UnifiedReportCard = ({
  report,
  reportType,
  stationReasons,
  hideStationBadge = false,
  onStatusChange,
  onApprove,
  isUpdating,
  isHighlighted = false,
}: UnifiedReportCardProps) => {
  const [expanded, setExpanded] = useState(isHighlighted);
  const [imageOpen, setImageOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to highlighted card
  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      const timer = setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isHighlighted]);

  // Derived state
  const statusEvent = report.status_event;
  const isOngoing = statusEvent?.ended_at === null;
  const hasExpandableContent = report.description || report.image_url;

  // Get reason label based on report type
  const reasonLabel =
    reportType === "malfunction"
      ? getReasonLabel(stationReasons, report.station_reason_id)
      : report.report_reason?.label_he ?? "";

  // Malfunction status
  const malfunctionStatus = report.status as MalfunctionReportStatus;
  const malfunctionConfig = malfunctionStatusConfig[malfunctionStatus];
  const MalfunctionStatusIcon = malfunctionConfig?.icon;

  // General/Scrap status
  const simpleStatus = report.status as SimpleReportStatus;
  const isNew = simpleStatus === "new";

  // Scrap count - session totals now derived from status_events
  // TODO: Query from status_events if needed for scrap reports
  const scrapCount: number | null = null;

  // Handle malfunction status change
  const handleStatusChange = async (newStatus: MalfunctionReportStatus) => {
    if (onStatusChange) {
      await onStatusChange(report.id, newStatus);
    }
  };

  // Handle approve for general/scrap
  const handleApprove = () => {
    if (onApprove) {
      void onApprove(report.id);
    }
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        "rounded-xl border overflow-hidden transition-all duration-200",
        isOngoing ? "bg-card/50 border-r-[3px]" : "bg-card/30 border-border/40",
        isHighlighted && "ring-2 ring-primary/30",
        !isOngoing && "opacity-80"
      )}
      style={
        isOngoing && statusEvent?.status_definition?.color_hex
          ? { borderRightColor: statusEvent.status_definition.color_hex }
          : undefined
      }
    >
      {/* Header - always visible */}
      <div className="w-full text-right">
        {/* Row 1: Status + Duration | Reason | Spacer | Time | Chevron - clickable for expand */}
        <div
          onClick={() => hasExpandableContent && setExpanded(!expanded)}
          className={cn(
            "px-4 py-3 flex items-center gap-3 transition-colors",
            hasExpandableContent && "hover:bg-accent/20 cursor-pointer"
          )}
        >
          {/* Status + Duration badge */}
          {statusEvent ? (
            <StatusDurationBadge statusEvent={statusEvent} />
          ) : reportType === "malfunction" && malfunctionConfig ? (
            // Fallback for malfunction without status event
            <div
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 border"
              style={{
                backgroundColor: `${malfunctionConfig.colorHex}15`,
                borderColor: `${malfunctionConfig.colorHex}40`,
              }}
            >
              {MalfunctionStatusIcon && (
                <MalfunctionStatusIcon
                  className="h-3.5 w-3.5"
                  style={{ color: malfunctionConfig.colorHex }}
                />
              )}
              <span
                className="text-sm font-medium"
                style={{ color: malfunctionConfig.colorHex }}
              >
                {malfunctionConfig.label}
              </span>
            </div>
          ) : null}

          {/* Reason label */}
          {reasonLabel && (
            <span className="text-sm font-medium text-foreground truncate">
              {reasonLabel}
            </span>
          )}

          {/* Scrap count for scrap reports */}
          {scrapCount !== null && (
            <div className="flex items-center gap-1.5 text-sm">
              <Package className="h-3.5 w-3.5 text-red-400" />
              <span className="font-bold text-red-400">{scrapCount}</span>
              <span className="text-muted-foreground">פסולים</span>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Time reported */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {report.created_at ? formatRelativeTime(report.created_at) : "—"}
            </span>
          </div>

          {/* Expand indicator */}
          {hasExpandableContent && (
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0",
                expanded && "rotate-180"
              )}
            />
          )}
        </div>

        {/* Row 2: Worker | Station | Spacer | Status + Actions | Session link */}
        <div className="px-4 pb-3 flex items-center gap-4 text-sm flex-wrap">
          {/* Worker */}
          {report.reporter && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              <span className="text-foreground/80">{report.reporter.full_name}</span>
              <span className="text-xs font-mono opacity-60">
                {report.reporter.worker_code}
              </span>
            </div>
          )}

          {/* Station - hidden in per-station view */}
          {!hideStationBadge && report.station && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span>{report.station.name}</span>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Status badge + Actions (type-specific) */}
          <div className="flex items-center gap-2">
            {reportType === "malfunction" && malfunctionConfig ? (
              // Malfunction: colored status badge + quick action buttons
              <>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border"
                  style={{
                    backgroundColor: `${malfunctionConfig.colorHex}15`,
                    borderColor: `${malfunctionConfig.colorHex}30`,
                    color: malfunctionConfig.colorHex,
                  }}
                >
                  {MalfunctionStatusIcon && (
                    <MalfunctionStatusIcon className="h-3 w-3" />
                  )}
                  {malfunctionConfig.label}
                </span>

                {/* Quick status actions */}
                {malfunctionStatus !== "known" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleStatusChange("known")}
                    disabled={isUpdating}
                    className="h-6 px-2 gap-1 text-xs opacity-60 hover:opacity-100"
                    style={{ color: malfunctionStatusConfig.known.colorHex }}
                  >
                    <Eye className="h-3 w-3" />
                    בטיפול
                  </Button>
                )}
                {malfunctionStatus !== "solved" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleStatusChange("solved")}
                    disabled={isUpdating}
                    className="h-6 px-2 gap-1 text-xs opacity-60 hover:opacity-100"
                    style={{ color: malfunctionStatusConfig.solved.colorHex }}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    נפתר
                  </Button>
                )}
              </>
            ) : reportType === "scrap" ? (
              // Scrap: new/approved badge + approve button
              <>
                {isNew ? (
                  <>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      <Trash2 className="h-3 w-3" />
                      ממתין
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleApprove}
                      disabled={isUpdating}
                      className="h-7 gap-1 text-xs border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      אשר
                    </Button>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3" />
                    אושר
                  </span>
                )}
              </>
            ) : (
              // General: new/approved badge + approve button
              <>
                {isNew ? (
                  <>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                      <FileText className="h-3 w-3" />
                      חדש
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleApprove}
                      disabled={isUpdating}
                      className="h-7 gap-1 text-xs border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      אשר
                    </Button>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3" />
                    אושר
                  </span>
                )}
              </>
            )}
          </div>

          {/* Session link */}
          {report.session_id && (
            <Link
              href={`/admin/session/${report.session_id}`}
              className="flex items-center gap-1 text-primary/70 hover:text-primary transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              <span className="text-xs">סשן</span>
            </Link>
          )}
        </div>
      </div>

      {/* Expandable content: Description + Image */}
      {expanded && hasExpandableContent && (
        <div className="border-t border-border/30 bg-muted/5 px-4 py-4 space-y-4">
          {/* Description */}
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

          {/* Image */}
          {report.image_url && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                תמונה מצורפת
              </p>
              <button
                type="button"
                onClick={() => setImageOpen(true)}
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
