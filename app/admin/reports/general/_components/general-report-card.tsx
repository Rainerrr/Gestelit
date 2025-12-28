"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, User, FileText, CheckCircle2, X, ZoomIn, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ReportWithDetails, SimpleReportStatus } from "@/lib/types";

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

type GeneralReportCardProps = {
  report: ReportWithDetails;
  onApprove: (id: string) => Promise<void>;
  isUpdating: boolean;
};

export const GeneralReportCard = ({
  report,
  onApprove,
  isUpdating,
}: GeneralReportCardProps) => {
  const [imageOpen, setImageOpen] = useState(false);
  const status = report.status as SimpleReportStatus;
  const isNew = status === "new";

  const reasonLabel = report.report_reason?.label_he ?? "";

  return (
    <div className={cn(
      "border rounded-xl bg-card/50 overflow-hidden transition-all duration-200",
      isNew
        ? "border-primary/40 bg-primary/5"
        : "border-border/60 hover:border-border"
    )}>
      <div className="px-5 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Badge className={cn(
              "gap-1.5 font-medium",
              isNew
                ? "bg-primary/10 border border-primary/30 text-primary"
                : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
            )}>
              {isNew ? (
                <>
                  <FileText className="h-3 w-3" />
                  חדש
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  אושר
                </>
              )}
            </Badge>

            {reasonLabel ? (
              <span className="text-sm font-medium text-foreground">
                {reasonLabel}
              </span>
            ) : null}
          </div>

          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
            <Clock className="h-3 w-3" />
            {report.created_at ? formatRelativeTime(report.created_at) : "—"}
          </span>
        </div>

        {/* Description */}
        {report.description ? (
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {report.description}
          </p>
        ) : null}

        {/* Image */}
        {report.image_url ? (
          <button
            type="button"
            onClick={() => setImageOpen(true)}
            className="relative group rounded-lg overflow-hidden border border-border/60 hover:border-primary/50 transition-all"
          >
            <img
              src={report.image_url}
              alt="תמונת דיווח"
              className="max-h-48 w-auto object-contain bg-black/20"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
              <ZoomIn className="h-8 w-8 text-white drop-shadow-lg" />
            </div>
          </button>
        ) : null}

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 pt-3 border-t border-border/40">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {report.reporter ? (
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                <span className="text-foreground font-medium">
                  {report.reporter.full_name}
                </span>
                <span className="text-xs font-mono">
                  ({report.reporter.worker_code})
                </span>
              </div>
            ) : null}

            {report.session_id ? (
              <Link
                href={`/admin/dashboard/session/${report.session_id}`}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <span>צפייה בסשן</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
          </div>

          {isNew ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onApprove(report.id)}
              disabled={isUpdating}
              className="h-8 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
            >
              <CheckCircle2 className="h-4 w-4 ml-1.5" />
              אשר דיווח
            </Button>
          ) : null}
        </div>
      </div>

      {/* Image lightbox */}
      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="max-w-4xl w-auto p-0 bg-black/95 border-border overflow-hidden">
          <DialogTitle className="sr-only">תמונת דיווח</DialogTitle>
          <button
            type="button"
            onClick={() => setImageOpen(false)}
            className="absolute top-3 left-3 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          {report.image_url ? (
            <img
              src={report.image_url}
              alt="תמונת דיווח"
              className="max-h-[85vh] max-w-full w-auto h-auto object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
