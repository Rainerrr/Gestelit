"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  FileText,
  AlertTriangle,
  Clock,
  User,
  ChevronDown,
  ZoomIn,
  X,
  ExternalLink,
  Eye,
  CheckCircle2,
  AlertOctagon,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SessionMalfunctionReport, SessionGeneralReport } from "@/app/api/admin/dashboard/session/[id]/route";
import type { StationReason } from "@/lib/types";
import { getReasonLabel } from "@/lib/data/reports";
import { useLiveDuration, formatDurationHMS } from "@/lib/hooks/useLiveDuration";

type ReportTypeToggle = "general" | "malfunction";

// =============================================================================
// StatusDurationBadge: Shows status with ticking duration
// =============================================================================
type StatusDurationBadgeProps = {
  startedAt: string;
  endedAt: string | null;
  labelHe: string | null;
  colorHex: string | null;
};

const StatusDurationBadge = ({ startedAt, endedAt, labelHe, colorHex }: StatusDurationBadgeProps) => {
  const color = colorHex ?? "#64748b";
  const label = labelHe ?? "ללא סטטוס";
  const { seconds, isLive } = useLiveDuration(startedAt, endedAt);

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-1.5 border shrink-0"
      style={{
        backgroundColor: `${color}15`,
        borderColor: `${color}40`,
      }}
    >
      {/* Status indicator dot */}
      <span
        className={cn("w-2 h-2 rounded-full shrink-0", isLive && "animate-pulse")}
        style={{ backgroundColor: color }}
      />

      {/* Status label */}
      <span className="text-sm font-medium" style={{ color }}>
        {label}
      </span>

      {/* Separator */}
      <span
        className="w-px h-4"
        style={{ backgroundColor: `${color}40` }}
      />

      {/* Duration */}
      <span
        className={cn(
          "font-mono text-sm tabular-nums tracking-tight",
          isLive && "font-semibold"
        )}
        style={{ color }}
      >
        {formatDurationHMS(seconds)}
      </span>
    </div>
  );
};

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
const ReportTypeToggleComponent = ({
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
// Malfunction Status Config
// =============================================================================
const malfunctionStatusConfig = {
  open: {
    label: "חדש",
    colorHex: "#ef4444",
    icon: AlertOctagon,
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
// Malfunction Report Card (Read-only)
// =============================================================================
const MalfunctionReportCard = ({
  report,
  stationReasons,
}: {
  report: SessionMalfunctionReport;
  stationReasons: StationReason[] | null | undefined;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const reasonLabel = getReasonLabel(stationReasons, report.stationReasonId);
  const config = malfunctionStatusConfig[report.status];
  const StatusIcon = config.icon;
  const hasExpandableContent = report.description || report.imageUrl;
  const hasStatusEvent = report.statusEventId && report.statusEventStartedAt;
  const isOngoing = hasStatusEvent && !report.statusEventEndedAt;

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-all duration-200",
        isOngoing ? "bg-card/50 border-r-[3px]" : "bg-card/30 border-border/60"
      )}
      style={
        isOngoing && report.statusDefinitionColorHex
          ? { borderRightColor: report.statusDefinitionColorHex }
          : undefined
      }
    >
      {/* Header */}
      <div
        onClick={() => hasExpandableContent && setExpanded(!expanded)}
        className={cn(
          "px-4 py-3 flex items-center gap-3 transition-colors flex-wrap",
          hasExpandableContent && "hover:bg-accent/20 cursor-pointer"
        )}
      >
        {/* Status Duration badge (if has status event) or simple status badge */}
        {hasStatusEvent ? (
          <StatusDurationBadge
            startedAt={report.statusEventStartedAt!}
            endedAt={report.statusEventEndedAt}
            labelHe={report.statusDefinitionLabelHe}
            colorHex={report.statusDefinitionColorHex}
          />
        ) : (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border shrink-0"
            style={{
              backgroundColor: `${config.colorHex}15`,
              borderColor: `${config.colorHex}40`,
              color: config.colorHex,
            }}
          >
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </span>
        )}

        {/* Reason label */}
        {reasonLabel && (
          <span className="text-sm font-medium text-foreground truncate">
            {reasonLabel}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Malfunction status badge (open/known/solved) */}
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border shrink-0"
          style={{
            backgroundColor: `${config.colorHex}15`,
            borderColor: `${config.colorHex}30`,
            color: config.colorHex,
          }}
        >
          <StatusIcon className="h-3 w-3" />
          {config.label}
        </span>

        {/* Time */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <Clock className="h-3.5 w-3.5" />
          <span>{report.createdAt ? formatRelativeTime(report.createdAt) : "—"}</span>
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

      {/* Row 2: Reporter + Link */}
      <div className="px-4 pb-3 flex items-center gap-4 text-sm">
        {report.reporterName && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span className="text-foreground/80">{report.reporterName}</span>
            {report.reporterCode && (
              <span className="text-xs font-mono opacity-60">
                {report.reporterCode}
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Link to reports management */}
        <Link
          href={`/admin/reports/malfunctions?highlight=${report.id}`}
          className="flex items-center gap-1.5 text-primary/70 hover:text-primary transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="text-xs">הצג בניהול</span>
        </Link>
      </div>

      {/* Expandable content */}
      {expanded && hasExpandableContent && (
        <div className="border-t border-border/30 bg-muted/5 px-4 py-4 space-y-4">
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

          {report.imageUrl && (
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
                  src={report.imageUrl}
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
          {report.imageUrl && (
            <img
              src={report.imageUrl}
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
// General Report Card (Read-only)
// =============================================================================
const GeneralReportCard = ({
  report,
}: {
  report: SessionGeneralReport;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const hasStatusEvent = report.statusEventId && report.statusEventStartedAt;
  const isOngoing = hasStatusEvent && !report.statusEventEndedAt;
  const isNew = report.status === "new";
  const hasExpandableContent = report.description || report.imageUrl;

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-all duration-200",
        isOngoing ? "bg-card/50 border-r-[3px]" : "bg-card/30 border-border/40"
      )}
      style={
        isOngoing && report.statusDefinitionColorHex
          ? { borderRightColor: report.statusDefinitionColorHex }
          : isOngoing
          ? { borderRightColor: "hsl(var(--primary))" }
          : undefined
      }
    >
      {/* Header */}
      <div
        onClick={() => hasExpandableContent && setExpanded(!expanded)}
        className={cn(
          "px-4 py-3 flex items-center gap-3 transition-colors flex-wrap",
          hasExpandableContent && "hover:bg-accent/20 cursor-pointer"
        )}
      >
        {/* Status Duration badge (if has status event) */}
        {hasStatusEvent ? (
          <StatusDurationBadge
            startedAt={report.statusEventStartedAt!}
            endedAt={report.statusEventEndedAt}
            labelHe={report.statusDefinitionLabelHe}
            colorHex={report.statusDefinitionColorHex}
          />
        ) : null}

        {/* Reason label */}
        {report.reportReasonLabel && (
          <span className="text-sm font-medium text-foreground truncate">
            {report.reportReasonLabel}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Report status badge (new/approved) */}
        {isNew ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20 shrink-0">
            <FileText className="h-3 w-3" />
            חדש
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
            <CheckCircle2 className="h-3 w-3" />
            אושר
          </span>
        )}

        {/* Time */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <Clock className="h-3.5 w-3.5" />
          <span>{report.createdAt ? formatRelativeTime(report.createdAt) : "—"}</span>
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

      {/* Row 2: Reporter + Link */}
      <div className="px-4 pb-3 flex items-center gap-4 text-sm">
        {report.reporterName && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span className="text-foreground/80">{report.reporterName}</span>
            {report.reporterCode && (
              <span className="text-xs font-mono opacity-60">
                {report.reporterCode}
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Link to reports management */}
        <Link
          href={`/admin/reports/general?highlight=${report.id}`}
          className="flex items-center gap-1.5 text-primary/70 hover:text-primary transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="text-xs">הצג בניהול</span>
        </Link>
      </div>

      {/* Expandable content */}
      {expanded && hasExpandableContent && (
        <div className="border-t border-border/30 bg-muted/5 px-4 py-4 space-y-4">
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

          {report.imageUrl && (
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
                  src={report.imageUrl}
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
          {report.imageUrl && (
            <img
              src={report.imageUrl}
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
// Main Widget Component
// =============================================================================
type SessionReportsWidgetProps = {
  malfunctions: SessionMalfunctionReport[];
  generalReports: SessionGeneralReport[];
  stationReasons: StationReason[] | null | undefined;
};

export const SessionReportsWidget = ({
  malfunctions,
  generalReports,
  stationReasons,
}: SessionReportsWidgetProps) => {
  const [reportType, setReportType] = useState<ReportTypeToggle>(
    // Default to whichever has more reports, or general if equal
    malfunctions.length > generalReports.length ? "malfunction" : "general"
  );

  // Sort reports: ongoing first, then by date
  const sortedGeneralReports = useMemo(() => {
    return [...generalReports].sort((a, b) => {
      const aOngoing = a.statusEventId && !a.statusEventEndedAt;
      const bOngoing = b.statusEventId && !b.statusEventEndedAt;
      if (aOngoing && !bOngoing) return -1;
      if (!aOngoing && bOngoing) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [generalReports]);

  const sortedMalfunctions = useMemo(() => {
    // Sort by status priority (open > known > solved), then by date
    const statusOrder = { open: 0, known: 1, solved: 2 };
    return [...malfunctions].sort((a, b) => {
      const aOrder = statusOrder[a.status] ?? 3;
      const bOrder = statusOrder[b.status] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [malfunctions]);

  const currentReports = reportType === "general" ? sortedGeneralReports : sortedMalfunctions;
  const hasAnyReports = malfunctions.length > 0 || generalReports.length > 0;

  // Don't render if no reports at all
  if (!hasAnyReports) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-base font-semibold text-foreground">דיווחים</h3>
          <Badge variant="secondary" className="text-xs">
            {malfunctions.length + generalReports.length}
          </Badge>
        </div>
        <ReportTypeToggleComponent
          value={reportType}
          onChange={setReportType}
          generalCount={generalReports.length}
          malfunctionCount={malfunctions.length}
        />
      </div>

      {/* Content */}
      <div className="p-4">
        {currentReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 border border-border/50">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {reportType === "general" ? "אין דיווחים כלליים בסשן זה" : "אין דיווחי תקלות בסשן זה"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reportType === "general"
              ? sortedGeneralReports.map((report) => (
                  <GeneralReportCard key={report.id} report={report} />
                ))
              : sortedMalfunctions.map((report) => (
                  <MalfunctionReportCard
                    key={report.id}
                    report={report}
                    stationReasons={stationReasons}
                  />
                ))}
          </div>
        )}
      </div>
    </div>
  );
};
