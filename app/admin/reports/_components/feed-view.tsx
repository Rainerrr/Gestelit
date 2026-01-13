"use client";

import { useMemo } from "react";
import { Calendar, Inbox } from "lucide-react";
import type {
  ReportWithDetails,
  ReportType,
  MalfunctionReportStatus,
  StationReason,
} from "@/lib/types";
import {
  filterOngoingReports,
  filterFinishedReports,
  groupReportsByDate,
  sortByMalfunctionPriority,
} from "@/lib/data/reports";
import { OngoingReportsSection } from "./ongoing-reports-section";
import { UnifiedReportCard } from "./unified-report-card";

// =============================================================================
// Date formatting helpers
// =============================================================================
const formatDateHeader = (isoDate: string): string => {
  const date = new Date(isoDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const reportDate = new Date(date);
  reportDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor(
    (today.getTime() - reportDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "היום";
  if (diffDays === 1) return "אתמול";

  return new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
};

const getShortDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
};

// =============================================================================
// DateSection: Renders a group of reports for a specific date
// =============================================================================
type DateSectionProps = {
  date: string;
  reports: ReportWithDetails[];
  reportType: ReportType;
  stationReasons?: StationReason[] | null;
  onStatusChange?: (id: string, status: MalfunctionReportStatus) => Promise<void>;
  onApprove?: (id: string) => Promise<void>;
  isUpdating: boolean;
};

const DateSection = ({
  date,
  reports,
  reportType,
  stationReasons,
  onStatusChange,
  onApprove,
  isUpdating,
}: DateSectionProps) => {
  if (reports.length === 0) return null;

  const dateLabel = formatDateHeader(date);
  const isToday = dateLabel === "היום";
  const isYesterday = dateLabel === "אתמול";

  return (
    <section className="relative">
      {/* Subtle left border for visual grouping */}
      <div className="absolute right-0 top-0 bottom-0 w-px bg-border/50" />

      <div className="pr-6">
        {/* Section header with date */}
        <div className="flex items-center gap-4 mb-4">
          {/* Date indicator */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card/50">
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-medium text-foreground">{dateLabel}</h2>
              {!isToday && !isYesterday && (
                <span className="text-xs font-mono text-muted-foreground">
                  {getShortDate(date)}
                </span>
              )}
            </div>
          </div>

          {/* Divider line */}
          <div className="flex-1 h-px bg-border/40" />

          {/* Count badge */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">{reports.length}</span>
            <span className="text-xs">דיווחים</span>
          </div>
        </div>

        {/* Reports list */}
        <div className="space-y-3">
          {reports.map((report) => (
            <UnifiedReportCard
              key={report.id}
              report={report}
              reportType={reportType}
              stationReasons={stationReasons}
              onStatusChange={onStatusChange}
              onApprove={onApprove}
              isUpdating={isUpdating}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

// =============================================================================
// FeedView Props
// =============================================================================
type FeedViewProps = {
  reports: ReportWithDetails[];
  reportType: ReportType;
  stationReasons?: StationReason[] | null;
  onStatusChange?: (id: string, status: MalfunctionReportStatus) => Promise<void>;
  onApprove?: (id: string) => Promise<void>;
  isUpdating: boolean;
};

// =============================================================================
// FeedView Component
// =============================================================================
export const FeedView = ({
  reports,
  reportType,
  stationReasons,
  onStatusChange,
  onApprove,
  isUpdating,
}: FeedViewProps) => {
  // Segment reports into ongoing and finished, then group finished by date
  const { ongoingReports, finishedByDate } = useMemo(() => {
    const ongoing = filterOngoingReports(reports);
    let finished = filterFinishedReports(reports);

    // For malfunctions, sort by priority (open > known > solved)
    if (reportType === "malfunction") {
      finished = sortByMalfunctionPriority(finished);
    }

    const byDate = groupReportsByDate(finished);

    return {
      ongoingReports: ongoing,
      finishedByDate: byDate,
    };
  }, [reports, reportType]);

  const hasContent = ongoingReports.length > 0 || finishedByDate.length > 0;

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 border border-border/50">
          <Inbox className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-lg font-medium text-muted-foreground">
          {reportType === "malfunction"
            ? "אין תקלות"
            : reportType === "scrap"
            ? "אין דיווחי פסולים"
            : "אין דיווחים"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Ongoing reports section */}
      <OngoingReportsSection
        reports={ongoingReports}
        reportType={reportType}
        stationReasons={stationReasons}
        onStatusChange={onStatusChange}
        onApprove={onApprove}
        isUpdating={isUpdating}
      />

      {/* Finished reports by date */}
      {finishedByDate.map(({ date, reports: dateReports }) => (
        <DateSection
          key={date}
          date={date}
          reports={dateReports}
          reportType={reportType}
          stationReasons={stationReasons}
          onStatusChange={onStatusChange}
          onApprove={onApprove}
          isUpdating={isUpdating}
        />
      ))}
    </div>
  );
};
