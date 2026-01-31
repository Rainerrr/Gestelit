"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Eye,
  Cpu,
  CheckCircle2,
  FileText,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  Station,
  ReportWithDetails,
  ReportType,
  MalfunctionReportStatus,
} from "@/lib/types";
import { UnifiedReportCard } from "./unified-report-card";

type StationAccordionCardProps = {
  station: Station;
  reports: ReportWithDetails[];
  reportType: ReportType;
  onStatusChange?: (id: string, status: MalfunctionReportStatus) => Promise<void>;
  onApprove?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  isUpdating: boolean;
  defaultExpanded?: boolean;
  highlightReportId?: string | null;
  isArchive?: boolean;
};

export const StationAccordionCard = ({
  station,
  reports,
  reportType,
  onStatusChange,
  onApprove,
  onDelete,
  isUpdating,
  defaultExpanded = false,
  highlightReportId,
  isArchive = false,
}: StationAccordionCardProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Calculate counts based on report type and archive state
  const counts = {
    open: reports.filter((r) => r.status === "open").length,
    known: reports.filter((r) => r.status === "known").length,
    solved: reports.filter((r) => r.status === "solved").length,
    new: reports.filter((r) => r.status === "new").length,
    approved: reports.filter((r) => r.status === "approved").length,
  };

  // Get empty state message based on type and archive
  const getEmptyMessage = () => {
    if (isArchive) {
      return reportType === "malfunction"
        ? "אין תקלות בארכיון בתחנה זו."
        : "אין דיווחים בארכיון בתחנה זו.";
    }
    switch (reportType) {
      case "malfunction":
        return "אין תקלות פתוחות בתחנה זו.";
      case "scrap":
        return "אין דיווחי פסולים בתחנה זו.";
      default:
        return "אין דיווחים בתחנה זו.";
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-all duration-300",
        expanded
          ? "border-primary/40 bg-card/60 shadow-lg shadow-primary/5"
          : "border-border bg-card/40 hover:border-border/80"
      )}
    >
      {/* Station header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 px-4 sm:px-5 py-4 text-right transition-colors",
          expanded ? "bg-primary/5" : "hover:bg-accent/30"
        )}
      >
        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
          <div
            className={cn(
              "flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg border transition-colors",
              expanded ? "bg-primary/10 border-primary/30" : "bg-secondary border-border"
            )}
          >
            <Cpu
              className={cn(
                "h-5 w-5 transition-colors",
                expanded ? "text-primary" : "text-muted-foreground"
              )}
            />
          </div>

          <div className="flex flex-col items-start min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground truncate max-w-full">
              {station.name}
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{station.code}</span>
              <span className="text-border">•</span>
              <span>{station.station_type}</span>
            </div>
          </div>

          {/* Expand/collapse icon - visible on mobile in same row as station name */}
          <div
            className={cn(
              "flex sm:hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
              expanded ? "bg-primary/10" : "bg-secondary"
            )}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-primary" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
          {/* Badges based on report type */}
          {isArchive ? (
            // Archive mode: show solved/approved count
            <Badge className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 gap-1.5 font-medium">
              <CheckCircle2 className="h-3 w-3" />
              {reportType === "malfunction" ? counts.solved : counts.approved}{" "}
              {reportType === "malfunction" ? "נפתרו" : "אושרו"}
            </Badge>
          ) : reportType === "malfunction" ? (
            // Malfunction: open and known counts
            <>
              {counts.open > 0 && (
                <Badge className="bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 gap-1.5 font-medium">
                  <AlertTriangle className="h-3 w-3" />
                  {counts.open} חדשות
                </Badge>
              )}
              {counts.known > 0 && (
                <Badge className="bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 gap-1.5 font-medium">
                  <Eye className="h-3 w-3" />
                  {counts.known} בטיפול
                </Badge>
              )}
            </>
          ) : reportType === "scrap" ? (
            // Scrap: new and approved counts
            <>
              {counts.new > 0 && (
                <Badge className="bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 gap-1.5 font-medium">
                  <Trash2 className="h-3 w-3" />
                  {counts.new} ממתינים
                </Badge>
              )}
              {counts.approved > 0 && (
                <Badge className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 gap-1.5 font-medium">
                  <CheckCircle2 className="h-3 w-3" />
                  {counts.approved} אושרו
                </Badge>
              )}
            </>
          ) : (
            // General: new and approved counts
            <>
              {counts.new > 0 && (
                <Badge className="bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 gap-1.5 font-medium">
                  <FileText className="h-3 w-3" />
                  {counts.new} חדשים
                </Badge>
              )}
              {counts.approved > 0 && (
                <Badge className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 gap-1.5 font-medium">
                  <CheckCircle2 className="h-3 w-3" />
                  {counts.approved} אושרו
                </Badge>
              )}
            </>
          )}

          {/* Expand/collapse icon - desktop only (mobile version is inline with station name) */}
          <div
            className={cn(
              "hidden sm:flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              expanded ? "bg-primary/10" : "bg-secondary"
            )}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-primary" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border/60 p-4 space-y-3 bg-card/20">
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {getEmptyMessage()}
            </p>
          ) : (
            reports.map((report) => (
              <UnifiedReportCard
                key={report.id}
                report={report}
                reportType={reportType}
                stationReasons={station.station_reasons}
                hideStationBadge
                onStatusChange={onStatusChange}
                onApprove={onApprove}
                onDelete={onDelete}
                isUpdating={isUpdating}
                isHighlighted={report.id === highlightReportId}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};
