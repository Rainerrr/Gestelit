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
  Trash2,
  ClipboardCheck,
  Package,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SessionMalfunctionReport, SessionGeneralReport, SessionScrapReport } from "@/app/api/admin/dashboard/session/[id]/route";
import type { StationReason } from "@/lib/types";
import { getReasonLabel } from "@/lib/data/reports";
import { useLiveDuration, formatDurationHMS } from "@/lib/hooks/useLiveDuration";

type ReportTypeToggle = "general" | "malfunction" | "scrap";

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
  scrapCount,
}: {
  value: ReportTypeToggle;
  onChange: (v: ReportTypeToggle) => void;
  generalCount: number;
  malfunctionCount: number;
  scrapCount: number;
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
    <Button
      variant={value === "scrap" ? "secondary" : "ghost"}
      size="sm"
      onClick={() => onChange("scrap")}
      className="h-7 gap-1.5 px-2.5 text-xs"
    >
      <Trash2 className="h-3.5 w-3.5" />
      <span>פסולים</span>
      {scrapCount > 0 && (
        <span className="font-mono text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
          {scrapCount}
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
  sessionStatus = "active",
}: {
  report: SessionMalfunctionReport;
  stationReasons: StationReason[] | null | undefined;
  sessionStatus?: "active" | "completed" | "aborted";
}) => {
  const [expanded, setExpanded] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const reasonLabel = getReasonLabel(stationReasons, report.stationReasonId);
  const config = malfunctionStatusConfig[report.status];
  const StatusIcon = config.icon;
  const hasExpandableContent = report.description || report.imageUrl;
  const hasStatusEvent = report.statusEventId && report.statusEventStartedAt;
  // Report is only ongoing if status event is open AND session is still active
  const isOngoing = hasStatusEvent && !report.statusEventEndedAt && sessionStatus === "active";

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
          <DialogDescription className="sr-only">תצוגה מוגדלת של תמונת דיווח</DialogDescription>
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
  sessionStatus = "active",
}: {
  report: SessionGeneralReport;
  sessionStatus?: "active" | "completed" | "aborted";
}) => {
  const [expanded, setExpanded] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const hasStatusEvent = report.statusEventId && report.statusEventStartedAt;
  // Report is only ongoing if status event is open AND session is still active
  const isOngoing = hasStatusEvent && !report.statusEventEndedAt && sessionStatus === "active";
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
          <DialogDescription className="sr-only">תצוגה מוגדלת של תמונת דיווח</DialogDescription>
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
// Scrap Report Card (Read-only)
// =============================================================================
const ScrapReportCard = ({
  report,
}: {
  report: SessionScrapReport;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const isNew = report.status === "new";
  const hasExpandableContent = report.description || report.imageUrl;

  return (
    <div className="rounded-xl border border-border/60 bg-card/30 overflow-hidden">
      {/* Header */}
      <div
        onClick={() => hasExpandableContent && setExpanded(!expanded)}
        className={cn(
          "px-4 py-3 flex items-center gap-3 transition-colors flex-wrap",
          hasExpandableContent && "hover:bg-accent/20 cursor-pointer"
        )}
      >
        {/* Icon */}
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20 shrink-0">
          <Trash2 className="h-4 w-4 text-red-400" />
        </div>

        {/* Job item name */}
        {report.jobItemName && (
          <span className="text-sm font-medium text-foreground truncate">
            {report.jobItemName}
          </span>
        )}

        <div className="flex-1" />

        {/* Status badge */}
        {isNew ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            <Trash2 className="h-3 w-3" />
            ממתין
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
          <span>{formatRelativeTime(report.createdAt)}</span>
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

      {/* Reporter row */}
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
          href={`/admin/reports/scrap?highlight=${report.id}`}
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
          <DialogDescription className="sr-only">תצוגה מוגדלת של תמונת דיווח</DialogDescription>
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
// QA Report Card (Read-only, First Product Approval)
// =============================================================================
const QaReportCard = ({
  report,
}: {
  report: SessionGeneralReport;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const hasExpandableContent = report.description || report.imageUrl;
  const isPending = report.status === "new";

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-all duration-200",
        isPending
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-emerald-500/30 bg-emerald-500/5"
      )}
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
        <div className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
          isPending
            ? "bg-amber-500/20 border border-amber-500/30"
            : "bg-emerald-500/20 border border-emerald-500/30"
        )}>
          <ClipboardCheck className={cn(
            "h-4 w-4",
            isPending ? "text-amber-500" : "text-emerald-500"
          )} />
        </div>

        {/* Job Item name */}
        {report.jobItemName && (
          <div className="flex items-center gap-1.5 text-sm">
            <Package className={cn(
              "h-3.5 w-3.5",
              isPending ? "text-amber-500/70" : "text-emerald-500/70"
            )} />
            <span className="font-medium text-foreground">{report.jobItemName}</span>
          </div>
        )}

        {/* Station */}
        {report.stationName && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>{report.stationName}</span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Status badge */}
        {isPending ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 shrink-0">
            <ClipboardCheck className="h-3 w-3" />
            ממתין
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
        <div className={cn(
          "border-t px-4 py-4 space-y-4",
          isPending ? "border-amber-500/20 bg-amber-500/5" : "border-emerald-500/20 bg-emerald-500/5"
        )}>
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
          <DialogDescription className="sr-only">תצוגה מוגדלת של תמונת דיווח</DialogDescription>
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
// QA Reports Section (Collapsible)
// =============================================================================
const QaReportsSection = ({
  reports,
}: {
  reports: SessionGeneralReport[];
}) => {
  const [collapsed, setCollapsed] = useState(false);

  if (reports.length === 0) return null;

  const pendingCount = reports.filter(r => r.status === "new").length;

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
            {/* Pulsing indicator (only when pending) */}
            <div className="relative flex items-center justify-center">
              {pendingCount > 0 && (
                <div className="absolute h-6 w-6 rounded-full bg-amber-500/10 animate-ping" />
              )}
              <div className={cn(
                "relative flex h-6 w-6 items-center justify-center rounded-full border",
                pendingCount > 0
                  ? "bg-amber-500/20 border-amber-500/30"
                  : "bg-emerald-500/20 border-emerald-500/30"
              )}>
                <ClipboardCheck className={cn(
                  "h-3 w-3",
                  pendingCount > 0 ? "text-amber-500" : "text-emerald-500"
                )} />
              </div>
            </div>

            <span className="text-sm font-medium text-foreground">
              מוצרים ראשונים {pendingCount > 0 ? "(ממתינים לאישור)" : "(אושרו)"}
            </span>
            <span className={cn(
              "font-mono text-sm font-bold tabular-nums",
              pendingCount > 0 ? "text-amber-500" : "text-emerald-500"
            )}>
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
                <QaReportCard report={report} />
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
type SessionReportsWidgetProps = {
  malfunctions: SessionMalfunctionReport[];
  generalReports: SessionGeneralReport[];
  scrapReports: SessionScrapReport[];
  stationReasons: StationReason[] | null | undefined;
  /** Session status - when not "active", all reports are considered finished */
  sessionStatus?: "active" | "completed" | "aborted";
};

export const SessionReportsWidget = ({
  malfunctions,
  generalReports,
  scrapReports,
  stationReasons,
  sessionStatus = "active",
}: SessionReportsWidgetProps) => {
  // Determine default tab: show tab with most reports, preference order: malfunction > scrap > general
  const getDefaultTab = (): ReportTypeToggle => {
    const counts = [
      { type: "malfunction" as const, count: malfunctions.length },
      { type: "scrap" as const, count: scrapReports.length },
      { type: "general" as const, count: generalReports.length },
    ];
    // Return type with highest count, or first with any count, or "general" as fallback
    const highest = counts.reduce((a, b) => (b.count > a.count ? b : a));
    return highest.count > 0 ? highest.type : "general";
  };

  const [reportType, setReportType] = useState<ReportTypeToggle>(getDefaultTab);

  // Filter QA reports (first product approval)
  const qaReports = useMemo(() => {
    return generalReports.filter((r) => r.isFirstProductQa === true);
  }, [generalReports]);

  // Filter non-QA general reports
  const nonQaGeneralReports = useMemo(() => {
    return generalReports.filter((r) => r.isFirstProductQa !== true);
  }, [generalReports]);

  // Sort non-QA reports: ongoing first, then by date
  // Report is only "ongoing" if status event is open AND session is still active
  const sortedGeneralReports = useMemo(() => {
    const isSessionActive = sessionStatus === "active";
    return [...nonQaGeneralReports].sort((a, b) => {
      const aOngoing = isSessionActive && a.statusEventId && !a.statusEventEndedAt;
      const bOngoing = isSessionActive && b.statusEventId && !b.statusEventEndedAt;
      if (aOngoing && !bOngoing) return -1;
      if (!aOngoing && bOngoing) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [nonQaGeneralReports, sessionStatus]);

  // Sort QA reports: pending first, then by date
  const sortedQaReports = useMemo(() => {
    return [...qaReports].sort((a, b) => {
      if (a.status === "new" && b.status !== "new") return -1;
      if (a.status !== "new" && b.status === "new") return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [qaReports]);

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

  const sortedScrapReports = useMemo(() => {
    // Sort by status (new first), then by date
    return [...scrapReports].sort((a, b) => {
      if (a.status === "new" && b.status !== "new") return -1;
      if (a.status !== "new" && b.status === "new") return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [scrapReports]);

  const hasAnyReports =
    malfunctions.length > 0 || generalReports.length > 0 || scrapReports.length > 0;
  const totalCount = malfunctions.length + generalReports.length + scrapReports.length;

  // Get current reports based on selected tab
  const getCurrentReports = () => {
    switch (reportType) {
      case "general":
        return sortedGeneralReports;
      case "malfunction":
        return sortedMalfunctions;
      case "scrap":
        return sortedScrapReports;
    }
  };

  const getEmptyMessage = () => {
    switch (reportType) {
      case "general":
        return "אין דיווחים כלליים בסשן זה";
      case "malfunction":
        return "אין דיווחי תקלות בסשן זה";
      case "scrap":
        return "אין דיווחי פסולים בסשן זה";
    }
  };

  // Don't render if no reports at all
  if (!hasAnyReports) {
    return null;
  }

  const currentReports = getCurrentReports();

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
            {totalCount}
          </Badge>
        </div>
        <ReportTypeToggleComponent
          value={reportType}
          onChange={setReportType}
          generalCount={generalReports.length}
          malfunctionCount={malfunctions.length}
          scrapCount={scrapReports.length}
        />
      </div>

      {/* Content */}
      <div className="p-4">
        {reportType === "general" ? (
          // General tab: Show QA reports section + regular general reports
          <div className="space-y-3">
            {/* QA Reports Section */}
            <QaReportsSection reports={sortedQaReports} />

            {/* Regular general reports */}
            {sortedGeneralReports.length === 0 && sortedQaReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 border border-border/50">
                  <Inbox className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">אין דיווחים כלליים בסשן זה</p>
              </div>
            ) : (
              sortedGeneralReports.map((report) => (
                <GeneralReportCard key={report.id} report={report} sessionStatus={sessionStatus} />
              ))
            )}
          </div>
        ) : currentReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 border border-border/50">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{getEmptyMessage()}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reportType === "malfunction" &&
              sortedMalfunctions.map((report) => (
                <MalfunctionReportCard
                  key={report.id}
                  report={report}
                  stationReasons={stationReasons}
                  sessionStatus={sessionStatus}
                />
              ))}
            {reportType === "scrap" &&
              sortedScrapReports.map((report) => (
                <ScrapReportCard key={report.id} report={report} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
};
