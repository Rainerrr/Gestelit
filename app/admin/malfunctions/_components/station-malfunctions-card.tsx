"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, Eye, Cpu, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StationWithMalfunctions, StationWithArchivedMalfunctions } from "@/lib/data/malfunctions";
import type { MalfunctionStatus } from "@/lib/types";
import { MalfunctionCard } from "./malfunction-card";

type StationMalfunctionsCardProps = {
  data: StationWithMalfunctions | StationWithArchivedMalfunctions;
  onStatusChange: (id: string, status: MalfunctionStatus) => Promise<void>;
  isUpdating: boolean;
  defaultExpanded?: boolean;
  highlightMalfunctionId?: string | null;
  isArchive?: boolean;
};

export const StationMalfunctionsCard = ({
  data,
  onStatusChange,
  isUpdating,
  defaultExpanded = false,
  highlightMalfunctionId,
  isArchive = false,
}: StationMalfunctionsCardProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { station, malfunctions } = data;

  // Type-safe access to counts based on archive mode
  const openCount = isArchive ? 0 : (data as StationWithMalfunctions).openCount;
  const knownCount = isArchive ? 0 : (data as StationWithMalfunctions).knownCount;
  const solvedCount = isArchive ? (data as StationWithArchivedMalfunctions).solvedCount : 0;

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all duration-300",
      expanded
        ? "border-primary/40 bg-card/60 shadow-lg shadow-primary/5"
        : "border-border bg-card/40 hover:border-border/80"
    )}>
      {/* Station header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center justify-between gap-4 px-5 py-4 text-right transition-colors",
          expanded ? "bg-primary/5" : "hover:bg-accent/30"
        )}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Station icon */}
          <div className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors",
            expanded
              ? "bg-primary/10 border-primary/30"
              : "bg-secondary border-border"
          )}>
            <Cpu className={cn(
              "h-5 w-5 transition-colors",
              expanded ? "text-primary" : "text-muted-foreground"
            )} />
          </div>

          {/* Station info */}
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

        {/* Status badges and expand indicator */}
        <div className="flex items-center gap-3 shrink-0">
          {isArchive ? (
            <Badge className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 gap-1.5 font-medium">
              <CheckCircle2 className="h-3 w-3" />
              {solvedCount} נפתרו
            </Badge>
          ) : (
            <>
              {openCount > 0 ? (
                <Badge className="bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 gap-1.5 font-medium">
                  <AlertTriangle className="h-3 w-3" />
                  {openCount} חדשות
                </Badge>
              ) : null}
              {knownCount > 0 ? (
                <Badge className="bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 gap-1.5 font-medium">
                  <Eye className="h-3 w-3" />
                  {knownCount} בטיפול
                </Badge>
              ) : null}
            </>
          )}

          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
            expanded ? "bg-primary/10" : "bg-secondary"
          )}>
            {expanded ? (
              <ChevronUp className={cn(
                "h-4 w-4 transition-colors",
                expanded ? "text-primary" : "text-muted-foreground"
              )} />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded content - list of malfunctions */}
      {expanded ? (
        <div className="border-t border-border/60 p-4 space-y-3 bg-card/20">
          {malfunctions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {isArchive ? "אין תקלות בארכיון בתחנה זו." : "אין תקלות פתוחות בתחנה זו."}
            </p>
          ) : (
            malfunctions.map((malfunction) => (
              <MalfunctionCard
                key={malfunction.id}
                malfunction={malfunction}
                stationReasons={station.station_reasons}
                onStatusChange={onStatusChange}
                isUpdating={isUpdating}
                isHighlighted={malfunction.id === highlightMalfunctionId}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};
