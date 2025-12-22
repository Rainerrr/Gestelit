"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, User, AlertTriangle, Eye, CheckCircle2, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { MalfunctionWithDetails, MalfunctionStatus, StationReason } from "@/lib/types";
import { getReasonLabel } from "@/lib/data/malfunctions";

const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "עכשיו";
  if (diffMinutes < 60) return `לפני ${diffMinutes} דקות`;
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffDays === 1) return "אתמול";
  if (diffDays < 7) return `לפני ${diffDays} ימים`;

  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
};

type MalfunctionCardProps = {
  malfunction: MalfunctionWithDetails;
  stationReasons: StationReason[] | null | undefined;
  onStatusChange: (id: string, status: MalfunctionStatus) => Promise<void>;
  isUpdating: boolean;
};

export const MalfunctionCard = ({
  malfunction,
  stationReasons,
  onStatusChange,
  isUpdating,
}: MalfunctionCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const reasonLabel = getReasonLabel(stationReasons, malfunction.station_reason_id);

  const statusConfig: Record<MalfunctionStatus, { label: string; color: string; icon: typeof AlertTriangle }> = {
    open: {
      label: "חדש",
      color: "bg-red-500/10 border-red-500/30 text-red-400",
      icon: AlertTriangle,
    },
    known: {
      label: "בטיפול",
      color: "bg-amber-500/10 border-amber-500/30 text-amber-400",
      icon: Eye,
    },
    solved: {
      label: "נפתר",
      color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
      icon: CheckCircle2,
    },
  };

  const config = statusConfig[malfunction.status];
  const StatusIcon = config.icon;

  const handleStatusChange = async (newStatus: MalfunctionStatus) => {
    await onStatusChange(malfunction.id, newStatus);
  };

  return (
    <div className="border border-border/60 rounded-lg bg-card/30 overflow-hidden transition-all duration-200 hover:border-border">
      {/* Header row - always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border shrink-0",
            config.color
          )}>
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </span>

          {reasonLabel ? (
            <span className="text-sm text-foreground font-medium truncate">
              {reasonLabel}
            </span>
          ) : null}

          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
            <Clock className="h-3 w-3" />
            {malfunction.created_at
              ? formatRelativeTime(malfunction.created_at)
              : "—"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {malfunction.image_url ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
              תמונה
            </Badge>
          ) : null}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expandable content */}
      {expanded ? (
        <div className="border-t border-border/40 px-4 py-4 space-y-4 bg-card/20">
          {/* Description */}
          {malfunction.description ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">תיאור</p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {malfunction.description}
              </p>
            </div>
          ) : null}

          {/* Reporter info */}
          {malfunction.reporter ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              <span>דווח על ידי:</span>
              <span className="text-foreground font-medium">
                {malfunction.reporter.full_name}
              </span>
              <span className="text-xs font-mono text-muted-foreground/70">
                ({malfunction.reporter.worker_code})
              </span>
            </div>
          ) : null}

          {/* Image */}
          {malfunction.image_url ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">תמונה מצורפת</p>
              <button
                type="button"
                onClick={() => setImageOpen(true)}
                className="relative group rounded-lg overflow-hidden border border-border/60 hover:border-primary/50 transition-all"
              >
                <img
                  src={malfunction.image_url}
                  alt="תמונת תקלה"
                  className="max-h-48 w-auto object-contain bg-black/20"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                  <ZoomIn className="h-8 w-8 text-white drop-shadow-lg" />
                </div>
              </button>
            </div>
          ) : null}

          {/* Status actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/40">
            <span className="text-xs text-muted-foreground ml-2">שנה סטטוס:</span>
            {malfunction.status !== "open" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleStatusChange("open")}
                disabled={isUpdating}
                className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                <AlertTriangle className="h-3 w-3 ml-1" />
                חדש
              </Button>
            ) : null}
            {malfunction.status !== "known" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleStatusChange("known")}
                disabled={isUpdating}
                className="h-7 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
              >
                <Eye className="h-3 w-3 ml-1" />
                בטיפול
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleStatusChange("solved")}
              disabled={isUpdating}
              className="h-7 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
            >
              <CheckCircle2 className="h-3 w-3 ml-1" />
              נפתר
            </Button>
          </div>
        </div>
      ) : null}

      {/* Image lightbox dialog */}
      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="max-w-4xl w-auto p-0 bg-black/95 border-border overflow-hidden">
          <DialogTitle className="sr-only">תמונת תקלה</DialogTitle>
          <button
            type="button"
            onClick={() => setImageOpen(false)}
            className="absolute top-3 left-3 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          {malfunction.image_url ? (
            <img
              src={malfunction.image_url}
              alt="תמונת תקלה"
              className="max-h-[85vh] max-w-full w-auto h-auto object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
