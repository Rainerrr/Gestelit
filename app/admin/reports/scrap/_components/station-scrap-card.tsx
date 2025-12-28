"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2, CheckCircle2, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StationWithScrapReports } from "@/lib/data/reports";
import type { SimpleReportStatus } from "@/lib/types";
import { ScrapReportCard } from "./scrap-report-card";

type StationScrapCardProps = {
  data: StationWithScrapReports;
  onApprove: (id: string) => Promise<void>;
  isUpdating: boolean;
  defaultExpanded?: boolean;
};

export const StationScrapCard = ({
  data,
  onApprove,
  isUpdating,
  defaultExpanded = false,
}: StationScrapCardProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { station, reports, newCount, approvedCount } = data;

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all duration-300",
      expanded
        ? "border-amber-500/40 bg-card/60 shadow-lg shadow-amber-500/5"
        : "border-border bg-card/40 hover:border-border/80"
    )}>
      {/* Station header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center justify-between gap-4 px-5 py-4 text-right transition-colors",
          expanded ? "bg-amber-500/5" : "hover:bg-accent/30"
        )}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors",
            expanded
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-secondary border-border"
          )}>
            <Cpu className={cn(
              "h-5 w-5 transition-colors",
              expanded ? "text-amber-400" : "text-muted-foreground"
            )} />
          </div>

          <div className="flex flex-col items-start min-w-0">
            <h3 className="text-base font-semibold text-foreground truncate">
              {station.name}
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{station.code}</span>
              <span className="text-border">•</span>
              <span>{station.station_type}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {newCount > 0 ? (
            <Badge className="bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 gap-1.5 font-medium">
              <Trash2 className="h-3 w-3" />
              {newCount} ממתינים
            </Badge>
          ) : null}
          {approvedCount > 0 ? (
            <Badge className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 gap-1.5 font-medium">
              <CheckCircle2 className="h-3 w-3" />
              {approvedCount} אושרו
            </Badge>
          ) : null}

          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
            expanded ? "bg-amber-500/10" : "bg-secondary"
          )}>
            {expanded ? (
              <ChevronUp className={cn(
                "h-4 w-4 transition-colors",
                expanded ? "text-amber-400" : "text-muted-foreground"
              )} />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded ? (
        <div className="border-t border-border/60 p-4 space-y-3 bg-card/20">
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              אין דיווחי פסולים בתחנה זו.
            </p>
          ) : (
            reports.map((report) => (
              <ScrapReportCard
                key={report.id}
                report={report}
                onApprove={onApprove}
                isUpdating={isUpdating}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};
