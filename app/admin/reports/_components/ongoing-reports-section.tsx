"use client";

import { Radio, Activity } from "lucide-react";
import type {
  ReportWithDetails,
  ReportType,
  MalfunctionReportStatus,
  StationReason,
} from "@/lib/types";
import { UnifiedReportCard } from "./unified-report-card";

type OngoingReportsSectionProps = {
  reports: ReportWithDetails[];
  reportType: ReportType;
  stationReasons?: StationReason[] | null;
  hideStationBadge?: boolean;
  onStatusChange?: (id: string, status: MalfunctionReportStatus) => Promise<void>;
  onApprove?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  isUpdating: boolean;
};

export const OngoingReportsSection = ({
  reports,
  reportType,
  stationReasons,
  hideStationBadge = false,
  onStatusChange,
  onApprove,
  onDelete,
  isUpdating,
}: OngoingReportsSectionProps) => {
  if (reports.length === 0) return null;

  return (
    <section className="relative">
      {/* Live indicator accent line */}
      <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-emerald-500/40" />

      <div className="pr-6">
        {/* Section header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {/* Pulsing live indicator */}
            <div className="relative flex items-center justify-center">
              <div className="absolute h-8 w-8 rounded-full bg-emerald-500/10 animate-ping" />
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/30">
                <Activity className="h-4 w-4 text-emerald-400" />
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                דיווחים פעילים
              </h2>
              <span className="text-2xl font-bold text-emerald-400 tabular-nums">
                {reports.length}
              </span>
            </div>
          </div>

          {/* Live badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/5">
            <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
              Live
            </span>
          </div>
        </div>

        {/* Reports grid */}
        <div className="space-y-4">
          {reports.map((report, index) => (
            <div
              key={report.id}
              className="animate-in fade-in slide-in-from-right-2 duration-300"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <UnifiedReportCard
                report={report}
                reportType={reportType}
                stationReasons={stationReasons}
                hideStationBadge={hideStationBadge}
                onStatusChange={onStatusChange}
                onApprove={onApprove}
                onDelete={onDelete}
                isUpdating={isUpdating}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
