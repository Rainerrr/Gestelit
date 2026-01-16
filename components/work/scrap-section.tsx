"use client";

import { useState } from "react";
import { ChevronDown, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export type SessionScrapReport = {
  id: string;
  description: string;
  image_url?: string | null;
  created_at: string;
  status: "new" | "approved";
};

export type ScrapSectionProps = {
  /** Total scrap count for this session */
  sessionScrapCount: number;
  /** List of scrap reports made during this session */
  scrapReports: SessionScrapReport[];
  /** Callback when "Add scrap" is clicked */
  onAddScrap: () => void;
  /** Callback when edit button is clicked on a report */
  onEditReport: (report: SessionScrapReport) => void;
  /** Additional class names */
  className?: string;
};

// ============================================
// COMPONENT
// ============================================

/**
 * Collapsible scrap reporting section for the work page.
 *
 * Shows:
 * - Collapsed header with scrap count badge
 * - Expandable content with large scrap count + reports list
 * - Edit functionality for each report
 *
 * Design: Rose/red color theme, industrial HMI aesthetic
 *
 * Note: Only renders when sessionScrapCount > 0
 */
export function ScrapSection({
  sessionScrapCount,
  scrapReports,
  onAddScrap,
  onEditReport,
  className,
}: ScrapSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Don't render if no scrap
  if (sessionScrapCount === 0) {
    return null;
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      className={cn(
        "rounded-xl border-2 border-rose-500/40 bg-gradient-to-b from-rose-500/5 to-slate-900/50 overflow-hidden",
        className
      )}
    >
      {/* Collapsible Header - Always Visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center justify-between p-4",
          "hover:bg-rose-500/10 transition-colors"
        )}
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            className={cn(
              "h-5 w-5 text-rose-400 transition-transform duration-300",
              isExpanded && "rotate-180"
            )}
          />
          <span className="text-sm font-bold text-rose-400">פסול במשמרת זו</span>
        </div>

        {/* Scrap Count Badge - always visible in header */}
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xl font-bold tabular-nums text-rose-400 border border-rose-500/40">
            {sessionScrapCount.toLocaleString()}
          </span>
        </div>
      </button>

      {/* Collapsible Content */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="p-4 pt-0 space-y-4">
            {/* Large Scrap Count Display */}
            <div className="flex items-center justify-between rounded-lg bg-rose-500/10 border border-rose-500/30 p-4">
              <div className="text-center flex-1">
                <div className="text-5xl font-bold tabular-nums text-rose-400">
                  {sessionScrapCount.toLocaleString()}
                </div>
                <div className="text-sm font-medium text-rose-400/70 mt-1">
                  יחידות פסול
                </div>
              </div>

              {/* Add Report Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddScrap();
                }}
                className="shrink-0 h-10 px-4 border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/60"
              >
                <Plus className="h-4 w-4 ml-1" />
                דווח פסול
              </Button>
            </div>

            {/* Reports List */}
            {scrapReports.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-500">
                  דיווחים ({scrapReports.length}):
                </div>

                {scrapReports.map((report) => (
                  <ScrapReportCard
                    key={report.id}
                    report={report}
                    onEdit={() => onEditReport(report)}
                    formatTime={formatTime}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

type ScrapReportCardProps = {
  report: SessionScrapReport;
  onEdit: () => void;
  formatTime: (dateString: string) => string;
};

function ScrapReportCard({ report, onEdit, formatTime }: ScrapReportCardProps) {
  const isApproved = report.status === "approved";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isApproved
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-rose-500/30 bg-rose-500/5"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Status + Description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* Status indicator */}
            <span
              className={cn(
                "text-xs font-bold px-2 py-0.5 rounded",
                isApproved
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-rose-500/20 text-rose-400"
              )}
            >
              {isApproved ? "✓ אושר" : "● חדש"}
            </span>

            {/* Time */}
            <span className="text-xs text-slate-500 tabular-nums">
              {formatTime(report.created_at)}
            </span>
          </div>

          {/* Description */}
          <p className="text-sm text-slate-300 line-clamp-2">
            {report.description || "(ללא תיאור)"}
          </p>

          {/* Image indicator */}
          {report.image_url && (
            <span className="text-xs text-slate-500 mt-1 inline-block">
              📷 תמונה מצורפת
            </span>
          )}
        </div>

        {/* Edit button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className={cn(
            "h-8 w-8 p-0 shrink-0",
            isApproved
              ? "text-emerald-400 hover:bg-emerald-500/20"
              : "text-rose-400 hover:bg-rose-500/20"
          )}
        >
          <Pencil className="h-4 w-4" />
          <span className="sr-only">ערוך</span>
        </Button>
      </div>
    </div>
  );
}
