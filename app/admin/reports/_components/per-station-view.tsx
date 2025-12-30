"use client";

import { useMemo, useState, useCallback } from "react";
import { ChevronDown, Archive, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  ReportWithDetails,
  ReportType,
  MalfunctionReportStatus,
  Station,
} from "@/lib/types";
import { filterOngoingReports, filterFinishedReports } from "@/lib/data/reports";
import { OngoingReportsSection } from "./ongoing-reports-section";
import { StationAccordionCard } from "./station-accordion-card";

// =============================================================================
// Helper: Group reports by station
// =============================================================================
type StationGroup = {
  station: Station;
  reports: ReportWithDetails[];
};

const groupByStation = (reports: ReportWithDetails[]): StationGroup[] => {
  const stationMap = new Map<string, StationGroup>();

  for (const report of reports) {
    const stationId = report.station_id;
    if (!stationId || !report.station) continue;

    if (!stationMap.has(stationId)) {
      stationMap.set(stationId, {
        station: report.station,
        reports: [],
      });
    }

    stationMap.get(stationId)!.reports.push(report);
  }

  // Sort by total report count descending
  return Array.from(stationMap.values()).sort(
    (a, b) => b.reports.length - a.reports.length
  );
};

// =============================================================================
// PerStationView Props
// =============================================================================
type PerStationViewProps = {
  reports: ReportWithDetails[];
  reportType: ReportType;
  onStatusChange?: (id: string, status: MalfunctionReportStatus) => Promise<void>;
  onApprove?: (id: string) => Promise<void>;
  isUpdating: boolean;
  // Archive-related props (malfunction only)
  showArchive?: boolean;
  archivedReports?: ReportWithDetails[];
  onFetchArchive?: () => Promise<void>;
  isArchiveLoading?: boolean;
  archiveError?: string | null;
  highlightReportId?: string | null;
};

// =============================================================================
// PerStationView Component
// =============================================================================
export const PerStationView = ({
  reports,
  reportType,
  onStatusChange,
  onApprove,
  isUpdating,
  showArchive = false,
  archivedReports = [],
  onFetchArchive,
  isArchiveLoading = false,
  archiveError,
  highlightReportId,
}: PerStationViewProps) => {
  const [archiveExpanded, setArchiveExpanded] = useState(false);

  // Segment reports: ongoing vs finished, then group finished by station
  const { ongoingReports, stationGroups } = useMemo(() => {
    const ongoing = filterOngoingReports(reports);
    const finished = filterFinishedReports(reports);

    // Filter out archived (solved) for malfunction type
    const activeFinished =
      reportType === "malfunction"
        ? finished.filter((r) => r.status !== "solved")
        : finished;

    const grouped = groupByStation(activeFinished);

    return {
      ongoingReports: ongoing,
      stationGroups: grouped,
    };
  }, [reports, reportType]);

  // Group archived reports by station
  const archivedStationGroups = useMemo(() => {
    if (!showArchive || archivedReports.length === 0) return [];
    return groupByStation(archivedReports);
  }, [showArchive, archivedReports]);

  // Handle archive expand toggle
  const handleArchiveToggle = useCallback(async () => {
    if (!archiveExpanded && onFetchArchive && archivedReports.length === 0) {
      await onFetchArchive();
    }
    setArchiveExpanded(!archiveExpanded);
  }, [archiveExpanded, onFetchArchive, archivedReports.length]);

  // Check if highlighted report is in archive
  const highlightInArchive = useMemo(() => {
    if (!highlightReportId) return false;
    return archivedReports.some((r) => r.id === highlightReportId);
  }, [highlightReportId, archivedReports]);

  // Auto-expand archive if highlight is in it
  useMemo(() => {
    if (highlightInArchive && !archiveExpanded) {
      setArchiveExpanded(true);
    }
  }, [highlightInArchive, archiveExpanded]);

  const totalArchivedCount = archivedReports.length;
  const hasContent = ongoingReports.length > 0 || stationGroups.length > 0;

  if (!hasContent && !showArchive) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 border border-border/50">
          <Inbox className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-lg font-medium text-muted-foreground">
          {reportType === "malfunction"
            ? "אין תקלות פתוחות"
            : reportType === "scrap"
            ? "אין דיווחי פסולים"
            : "אין דיווחים"}
        </p>
      </div>
    );
  }

  // Show empty state message when no active content but archive is available
  const showEmptyActiveState = !hasContent && showArchive;

  return (
    <div className="space-y-6">
      {/* Empty state when no active content but archive available */}
      {showEmptyActiveState && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <Inbox className="h-7 w-7 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-medium text-foreground">אין תקלות פתוחות</p>
            <p className="text-sm text-muted-foreground">כל התקלות טופלו בהצלחה!</p>
          </div>
        </div>
      )}

      {/* Ongoing reports section - shown without station badge */}
      {!showEmptyActiveState && (
        <OngoingReportsSection
          reports={ongoingReports}
          reportType={reportType}
          hideStationBadge
          onStatusChange={onStatusChange}
          onApprove={onApprove}
          isUpdating={isUpdating}
        />
      )}

      {/* Station groups */}
      {!showEmptyActiveState && (
        <div className="space-y-4">
          {stationGroups.map((group) => (
            <StationAccordionCard
              key={group.station.id}
              station={group.station}
              reports={group.reports}
              reportType={reportType}
              onStatusChange={onStatusChange}
              onApprove={onApprove}
              isUpdating={isUpdating}
              highlightReportId={highlightReportId}
            />
          ))}
        </div>
      )}

      {/* Archive section (malfunction only) */}
      {showArchive && (
        <div className="mt-8">
          {/* Archive toggle header */}
          <Button
            variant="ghost"
            onClick={() => void handleArchiveToggle()}
            className={cn(
              "w-full flex items-center justify-between gap-4 px-5 py-4 h-auto rounded-xl border transition-all",
              archiveExpanded
                ? "bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10"
                : "bg-card/40 border-border hover:bg-card/60"
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg border transition-colors",
                  archiveExpanded
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-secondary border-border"
                )}
              >
                <Archive
                  className={cn(
                    "h-5 w-5 transition-colors",
                    archiveExpanded ? "text-emerald-400" : "text-muted-foreground"
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-base font-medium",
                  archiveExpanded ? "text-emerald-400" : "text-foreground"
                )}
              >
                ארכיון
              </span>
            </div>

            <div className="flex items-center gap-3">
              {totalArchivedCount > 0 && (
                <Badge
                  className={cn(
                    "font-medium",
                    archiveExpanded
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-muted border-border text-muted-foreground"
                  )}
                >
                  {totalArchivedCount} נפתרו
                </Badge>
              )}
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  archiveExpanded && "rotate-180",
                  archiveExpanded ? "text-emerald-400" : "text-muted-foreground"
                )}
              />
            </div>
          </Button>

          {/* Archive content */}
          {archiveExpanded && (
            <div className="mt-4 space-y-4">
              {isArchiveLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3 text-emerald-400">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    <span className="text-sm font-medium">טוען ארכיון...</span>
                  </div>
                </div>
              ) : archiveError ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <p className="text-sm text-red-400">{archiveError}</p>
                </div>
              ) : archivedStationGroups.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm text-muted-foreground">אין תקלות בארכיון</p>
                </div>
              ) : (
                archivedStationGroups.map((group) => (
                  <StationAccordionCard
                    key={group.station.id}
                    station={group.station}
                    reports={group.reports}
                    reportType={reportType}
                    onStatusChange={onStatusChange}
                    onApprove={onApprove}
                    isUpdating={isUpdating}
                    isArchive
                    highlightReportId={highlightReportId}
                    defaultExpanded={
                      !!highlightReportId &&
                      group.reports.some((r) => r.id === highlightReportId)
                    }
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
