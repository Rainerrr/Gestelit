"use client";

import { memo, useMemo, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Package,
  PackageX,
  CirclePause,
  AlertOctagon,
  AlertTriangle,
  TrendingDown,
  Settings,
  User,
  Timer,
  XCircle,
} from "lucide-react";
import type { StatusDictionary } from "@/lib/status";
import type { CurrentJobItemInfo } from "@/lib/data/admin-dashboard";
import {
  useAdminSession,
  useAdminSessionIds,
  useAdminSessionsLoading,
  useAdminSessionsRefresh,
} from "@/contexts/AdminSessionsContext";
import {
  getStatusColorFromDictionary,
  getStatusLabelFromDictionary,
} from "./status-dictionary";
import { calculateSessionFlags, hasAnyFlag } from "@/lib/utils/session-flags";
import { SESSION_FLAG_LABELS } from "@/lib/config/session-flags";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { JobProgressBar } from "@/components/work/job-progress-bar";

type ActiveSessionsTableProps = {
  dictionary: StatusDictionary;
  isDictionaryLoading?: boolean;
};

const getDurationLabel = (startedAt: string, now: number): string => {
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) {
    return "-";
  }

  const diffSeconds = Math.max(0, Math.floor((now - start) / 1000));
  const hours = Math.floor(diffSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((diffSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(diffSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
};

let nowInterval: number | null = null;
let nowValue = Date.now();
const nowListeners = new Set<() => void>();

const getNow = () => nowValue;
const subscribeNow = (callback: () => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  nowListeners.add(callback);
  if (nowInterval === null) {
    nowInterval = window.setInterval(() => {
      nowValue = Date.now();
      nowListeners.forEach((listener) => listener());
    }, 1000);
  }

  return () => {
    nowListeners.delete(callback);
    if (nowListeners.size === 0 && nowInterval !== null) {
      window.clearInterval(nowInterval);
      nowInterval = null;
    }
  };
};

const useNow = () =>
  useSyncExternalStore(subscribeNow, getNow, () => Date.now());

const getJobItemDurationLabel = (
  accumulatedSeconds: number,
  segmentStart: string | null,
  now: number,
): string => {
  let totalSeconds = accumulatedSeconds;
  if (segmentStart) {
    const segmentStartMs = new Date(segmentStart).getTime();
    if (!Number.isNaN(segmentStartMs)) {
      totalSeconds += Math.max(0, Math.floor((now - segmentStartMs) / 1000));
    }
  }

  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

// Idle threshold: 2 minutes (sessions auto-close at 5 min, so show idle indicator early)
const IDLE_THRESHOLD_MS = 2 * 60 * 1000;

const isSessionIdle = (lastSeenAt: string | null, now: number): boolean => {
  if (!lastSeenAt) return false;
  const lastSeen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(lastSeen)) return false;
  return now - lastSeen > IDLE_THRESHOLD_MS;
};

const formatLastSeenTime = (lastSeenAt: string | null): string => {
  if (!lastSeenAt) return "";
  const date = new Date(lastSeenAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

type RowProps = {
  sessionId: string;
  dictionary: StatusDictionary;
  onNavigate: (sessionId: string) => void;
};

const getStatusStyle = (hex: string) => {
  // Create dark-theme friendly status styles with the status color
  return {
    bg: `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, 0.15)`,
    border: `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, 0.4)`,
    text: hex,
    dot: hex,
  };
};


/**
 * Job info cell — פק״ע, מוצר name, and job item timer
 */
function JobInfoCell({ jobItem, jobNumber, jobItemDuration }: {
  jobItem: CurrentJobItemInfo | null;
  jobNumber: string;
  jobItemDuration: string | null;
}) {
  if (!jobItem) {
    return (
      <div className="flex items-center justify-center min-w-[130px]">
        <span className="text-sm text-muted-foreground/50">לא נבחרה עבודה</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 shrink-0 min-w-[130px]">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">פק״ע:</span>
        <span className="font-mono text-sm text-primary font-semibold">{jobNumber}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">מוצר:</span>
        <span
          className="text-sm text-foreground/90 font-medium truncate max-w-[100px]"
          title={jobItem.jobItemName}
        >
          {jobItem.jobItemName}
        </span>
      </div>
      {jobItemDuration && (
        <div className="flex items-center gap-1.5 text-muted-foreground/70">
          <Timer className="h-3.5 w-3.5" />
          <span className="font-mono text-xs tabular-nums">{jobItemDuration}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Progress cell — totals label above bar, session contribution beside bar
 */
function ProgressCell({ jobItem }: { jobItem: CurrentJobItemInfo | null }) {
  if (!jobItem) {
    return null;
  }

  const totalGood = jobItem.totalCompletedGood;
  const totalScrap = jobItem.totalCompletedScrap ?? 0;
  const planned = jobItem.plannedQuantity;
  const hasSessionContribution = jobItem.sessionGood > 0 || (jobItem.sessionScrap ?? 0) > 0;

  return (
    <div className="flex items-center gap-3 min-w-[260px]">
      {/* Bar + totals label */}
      <div className="flex flex-col gap-0.5 flex-1 min-w-[150px]">
        {/* Totals above bar: good + scrap / required */}
        <div className="flex items-center gap-1.5 justify-center text-sm tabular-nums" dir="ltr">
          <span className="font-bold text-emerald-400">{totalGood.toLocaleString()}</span>
          {totalScrap > 0 && (
            <>
              <span className="text-muted-foreground">+</span>
              <span className="font-bold text-rose-400">{totalScrap.toLocaleString()}</span>
            </>
          )}
          <span className="text-muted-foreground/60">/</span>
          <span className="text-muted-foreground">{planned.toLocaleString()}</span>
        </div>

        <JobProgressBar
          plannedQuantity={planned}
          totalGood={totalGood}
          totalScrap={totalScrap}
          sessionGood={jobItem.sessionGood}
          sessionScrap={jobItem.sessionScrap ?? 0}
          size="sm"
          showOverlay={false}
        />
      </div>

      {/* Session contribution — with "במשמרת זו" label */}
      {hasSessionContribution && (
        <div className="flex flex-col items-center gap-0.5 shrink-0 border-r border-border/50 pr-2.5">
          <span className="text-[10px] text-muted-foreground/60">במשמרת זו</span>
          {jobItem.sessionGood > 0 && (
            <div className="flex items-center gap-1" dir="ltr">
              <Package className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-400 tabular-nums">
                +{jobItem.sessionGood.toLocaleString()}
              </span>
            </div>
          )}
          {(jobItem.sessionScrap ?? 0) > 0 && (
            <div className="flex items-center gap-1" dir="ltr">
              <PackageX className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-sm font-semibold text-rose-400 tabular-nums">
                +{(jobItem.sessionScrap ?? 0).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SessionRow = memo(
  ({ sessionId, dictionary, onNavigate }: RowProps) => {
    const session = useAdminSession(sessionId);
    const now = useNow();

    const duration = useMemo(
      () => (session ? getDurationLabel(session.startedAt, now) : "-"),
      [session, now],
    );
    const durationSeconds = useMemo(() => {
      if (!session) return 0;
      const start = new Date(session.startedAt).getTime();
      if (Number.isNaN(start)) return 0;
      return Math.max(0, Math.floor((now - start) / 1000));
    }, [session, now]);
    const jobItemDuration = useMemo(() => {
      if (!session?.currentJobItem) return null;
      return getJobItemDurationLabel(
        session.jobItemTimerAccumulatedSeconds,
        session.currentJobItemStartedAt,
        now,
      );
    }, [session, now]);
    const isIdle = useMemo(
      () => (session ? isSessionIdle(session.lastSeenAt, now) : false),
      [session, now],
    );
    const lastSeenFormatted = useMemo(
      () => (session ? formatLastSeenTime(session.lastSeenAt) : ""),
      [session],
    );
    const flags = useMemo(() => {
      if (!session) return null;
      return calculateSessionFlags(
        { totalGood: session.totalGood, totalScrap: session.totalScrap, durationSeconds },
        session.stoppageTimeSeconds ?? 0,
        session.setupTimeSeconds ?? 0,
      );
    }, [session, durationSeconds]);

    if (!session) {
      return null;
    }

    const handleKeyOpen = (sessionId: string, event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onNavigate(sessionId);
      }
    };

    const statusHex = session.currentStatus
      ? getStatusColorFromDictionary(session.currentStatus, dictionary, session.stationId)
      : "#64748b";
    const statusLabel = session.currentStatus
      ? getStatusLabelFromDictionary(session.currentStatus, dictionary, session.stationId)
      : "ללא סטטוס";
    const statusStyle = getStatusStyle(statusHex);

    const hasMalfunctions = session.malfunctionCount > 0;
    const hasPerformanceFlags = flags && hasAnyFlag(flags);
    const hasAnyFlags = hasMalfunctions || isIdle || hasPerformanceFlags;

    return (
      <div
        role="button"
        tabIndex={0}
        className="group flex items-center px-4 py-3 border-b border-border cursor-pointer transition-all duration-150 hover:bg-accent"
        aria-label={`תחנה פעילה עבור עבודה ${session.jobNumber}`}
        onClick={() => onNavigate(session.id)}
        onKeyDown={(event) => handleKeyOpen(session.id, event)}
      >
        {/* RIGHT GROUP: Station, Worker, Flags */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Station + Status */}
          <div className="flex flex-col items-center gap-1 min-w-[100px]">
            <span className="text-sm font-bold text-foreground">{session.stationName}</span>
            <div
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold"
              style={{
                backgroundColor: statusStyle.bg,
                borderWidth: '1px',
                borderColor: statusStyle.border,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: statusStyle.dot }}
              />
              <span style={{ color: statusStyle.text }}>{statusLabel}</span>
            </div>
          </div>

          <div className="w-px h-10 bg-border" />

          {/* Worker + Session Duration */}
          <div className="flex flex-col items-center gap-0.5 min-w-[100px]">
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm text-foreground/80">{session.workerName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Timer className="h-3.5 w-3.5" />
              <span className="font-mono text-sm tabular-nums">{duration}</span>
            </div>
          </div>

          <div className="w-px h-10 bg-border" />

          {/* Flags */}
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center justify-center gap-1.5 min-w-[40px] flex-wrap">
              {hasMalfunctions && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <AlertOctagon className="h-3.5 w-3.5 text-red-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">{session.malfunctionCount} דיווחי תקלה</TooltipContent>
                </Tooltip>
              )}
              {isIdle && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <CirclePause className="h-3.5 w-3.5 text-amber-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">נראה לאחרונה: {lastSeenFormatted}</TooltipContent>
                </Tooltip>
              )}
              {flags?.highStoppage && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">{SESSION_FLAG_LABELS.high_stoppage}</TooltipContent>
                </Tooltip>
              )}
              {flags?.highSetup && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Settings className="h-3.5 w-3.5 text-blue-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">{SESSION_FLAG_LABELS.high_setup}</TooltipContent>
                </Tooltip>
              )}
              {flags?.lowProduction && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <TrendingDown className="h-3.5 w-3.5 text-amber-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">{SESSION_FLAG_LABELS.low_production}</TooltipContent>
                </Tooltip>
              )}
              {!hasAnyFlags && <span className="text-muted-foreground/30">—</span>}
            </div>
          </TooltipProvider>
        </div>

        {/* Spacer pushes left group to the left */}
        <div className="flex-1" />

        {/* LEFT GROUP: Job info, Progress, Session contribution, Arrow */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Job info */}
          <JobInfoCell jobItem={session.currentJobItem} jobNumber={session.jobNumber} jobItemDuration={jobItemDuration} />

          <div className="w-px h-10 bg-border" />

          {/* Progress bar + session contribution */}
          <ProgressCell jobItem={session.currentJobItem} />

          {/* Navigation arrow */}
          <ChevronLeft className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.sessionId === next.sessionId && prev.dictionary === next.dictionary,
);

SessionRow.displayName = "SessionRow";

const MobileSessionCard = memo(
  ({ sessionId, dictionary, onNavigate }: RowProps) => {
    const session = useAdminSession(sessionId);
    const now = useNow();

    const duration = useMemo(
      () => (session ? getDurationLabel(session.startedAt, now) : "-"),
      [session, now],
    );
    const durationSeconds = useMemo(() => {
      if (!session) return 0;
      const start = new Date(session.startedAt).getTime();
      if (Number.isNaN(start)) return 0;
      return Math.max(0, Math.floor((now - start) / 1000));
    }, [session, now]);
    const jobItemDuration = useMemo(() => {
      if (!session?.currentJobItem) return null;
      return getJobItemDurationLabel(
        session.jobItemTimerAccumulatedSeconds,
        session.currentJobItemStartedAt,
        now,
      );
    }, [session, now]);
    const isIdle = useMemo(
      () => (session ? isSessionIdle(session.lastSeenAt, now) : false),
      [session, now],
    );
    const lastSeenFormatted = useMemo(
      () => (session ? formatLastSeenTime(session.lastSeenAt) : ""),
      [session],
    );
    const flags = useMemo(() => {
      if (!session) return null;
      return calculateSessionFlags(
        { totalGood: session.totalGood, totalScrap: session.totalScrap, durationSeconds },
        session.stoppageTimeSeconds ?? 0,
        session.setupTimeSeconds ?? 0,
      );
    }, [session, durationSeconds]);

    if (!session) {
      return null;
    }

    const statusHex = session.currentStatus
      ? getStatusColorFromDictionary(session.currentStatus, dictionary, session.stationId)
      : "#64748b";
    const statusLabel = session.currentStatus
      ? getStatusLabelFromDictionary(session.currentStatus, dictionary, session.stationId)
      : "ללא סטטוס";
    const statusStyle = getStatusStyle(statusHex);

    const hasMalfunctions = session.malfunctionCount > 0;

    const hasPerformanceFlags = flags && hasAnyFlag(flags);
    const hasAnyFlags = hasMalfunctions || isIdle || hasPerformanceFlags;

    return (
      <div
        role="button"
        tabIndex={0}
        className="group p-3 border border-border rounded-lg bg-card/50 transition-all duration-200 hover:bg-accent active:bg-accent cursor-pointer"
        aria-label={`תחנה פעילה עבור עבודה ${session.jobNumber}`}
        onClick={() => onNavigate(session.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onNavigate(session.id);
          }
        }}
      >
        {/* TOP: Station, Worker, Status, Flags */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-foreground">{session.stationName}</span>
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold"
              style={{
                backgroundColor: statusStyle.bg,
                borderWidth: '1px',
                borderColor: statusStyle.border,
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusStyle.dot }} />
              <span style={{ color: statusStyle.text }}>{statusLabel}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm text-foreground/80">{session.workerName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Timer className="h-3.5 w-3.5" />
              <span className="font-mono text-sm tabular-nums">{duration}</span>
            </div>
          </div>
        </div>

        {/* Flags row — only when flags exist */}
        {hasAnyFlags && (
          <div className="flex items-center gap-2 mb-2">
            <TooltipProvider delayDuration={200}>
              {hasMalfunctions && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <AlertOctagon className="h-4 w-4 text-red-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">{session.malfunctionCount} דיווחי תקלה</TooltipContent>
                </Tooltip>
              )}
              {isIdle && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <CirclePause className="h-4 w-4 text-amber-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">נראה לאחרונה: {lastSeenFormatted}</TooltipContent>
                </Tooltip>
              )}
              {flags?.highStoppage && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">{SESSION_FLAG_LABELS.high_stoppage}</TooltipContent>
                </Tooltip>
              )}
              {flags?.highSetup && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Settings className="h-4 w-4 text-blue-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">{SESSION_FLAG_LABELS.high_setup}</TooltipContent>
                </Tooltip>
              )}
              {flags?.lowProduction && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <TrendingDown className="h-4 w-4 text-amber-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">{SESSION_FLAG_LABELS.low_production}</TooltipContent>
                </Tooltip>
              )}
            </TooltipProvider>
          </div>
        )}

        {/* BOTTOM: Job info + Progress */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
          {session.currentJobItem ? (
            <>
              {/* Job info row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">פק״ע:</span>
                    <span className="font-mono text-sm text-primary font-semibold">{session.jobNumber}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">מוצר:</span>
                    <span className="text-sm text-foreground/90 font-medium truncate max-w-[120px]" title={session.currentJobItem.jobItemName}>
                      {session.currentJobItem.jobItemName}
                    </span>
                  </div>
                </div>
                {jobItemDuration && (
                  <div className="flex items-center gap-1.5 text-muted-foreground/70">
                    <Timer className="h-3.5 w-3.5" />
                    <span className="font-mono text-xs tabular-nums">{jobItemDuration}</span>
                  </div>
                )}
              </div>

              {/* Progress + session contribution */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-0.5 flex-1">
                  <div className="flex items-center gap-1.5 justify-center text-sm tabular-nums" dir="ltr">
                    <span className="font-bold text-emerald-400">{session.currentJobItem.totalCompletedGood.toLocaleString()}</span>
                    {(session.currentJobItem.totalCompletedScrap ?? 0) > 0 && (
                      <>
                        <span className="text-muted-foreground">+</span>
                        <span className="font-bold text-rose-400">{(session.currentJobItem.totalCompletedScrap ?? 0).toLocaleString()}</span>
                      </>
                    )}
                    <span className="text-muted-foreground/60">/</span>
                    <span className="text-muted-foreground">{session.currentJobItem.plannedQuantity.toLocaleString()}</span>
                  </div>
                  <JobProgressBar
                    plannedQuantity={session.currentJobItem.plannedQuantity}
                    totalGood={session.currentJobItem.totalCompletedGood}
                    totalScrap={session.currentJobItem.totalCompletedScrap ?? 0}
                    sessionGood={session.currentJobItem.sessionGood}
                    sessionScrap={session.currentJobItem.sessionScrap ?? 0}
                    size="sm"
                    showOverlay={false}
                  />
                </div>
                {(session.currentJobItem.sessionGood > 0 || (session.currentJobItem.sessionScrap ?? 0) > 0) && (
                  <div className="flex flex-col items-center gap-0.5 shrink-0 border-r border-border/50 pr-2.5">
                    <span className="text-[10px] text-muted-foreground/60">במשמרת זו</span>
                    {session.currentJobItem.sessionGood > 0 && (
                      <div className="flex items-center gap-1" dir="ltr">
                        <Package className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-sm font-semibold text-emerald-400 tabular-nums">+{session.currentJobItem.sessionGood.toLocaleString()}</span>
                      </div>
                    )}
                    {(session.currentJobItem.sessionScrap ?? 0) > 0 && (
                      <div className="flex items-center gap-1" dir="ltr">
                        <PackageX className="h-3.5 w-3.5 text-rose-400" />
                        <span className="text-sm font-semibold text-rose-400 tabular-nums">+{(session.currentJobItem.sessionScrap ?? 0).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-2">
              <span className="text-sm text-muted-foreground/50">לא נבחרה עבודה</span>
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.sessionId === next.sessionId && prev.dictionary === next.dictionary,
);

MobileSessionCard.displayName = "MobileSessionCard";

const ActiveSessionsTableComponent = ({
  dictionary,
  isDictionaryLoading = false,
}: ActiveSessionsTableProps) => {
  const router = useRouter();
  const sessionIds = useAdminSessionIds();
  const isLoading = useAdminSessionsLoading() || isDictionaryLoading;
  const refresh = useAdminSessionsRefresh();

  // Close all sessions state
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  const sortedSessions = useMemo(() => [...sessionIds], [sessionIds]);

  const handleNavigate = (sessionId: string) => {
    router.push(`/admin/session/${sessionId}`);
  };

  const handleForceCloseSessions = async () => {
    setResetting(true);
    setResetResult(null);
    try {
      const response = await fetch("/api/admin/sessions/close-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": window.localStorage.getItem("adminPassword") || "",
        },
      });
      if (!response.ok) {
        throw new Error("close_failed");
      }
      const result = (await response.json()) as { closed: number };
      setResetResult(
        result.closed === 0
          ? "לא נמצאו תחנות פעילות לסגירה."
          : `נסגרו ${result.closed} תחנות פעילות.`,
      );
      await refresh();
      setResetDialogOpen(false);
    } catch (error) {
      setResetResult("הסגירה נכשלה.");
      console.error(error);
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-visible">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">תחנות פעילות</h3>
              <p className="text-xs text-muted-foreground">{sortedSessions.length} תחנות</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {resetResult && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <p className="text-xs font-medium text-primary">{resetResult}</p>
              </div>
            )}
            {sortedSessions.length > 0 && (
              <Button
                variant="destructive"
                onClick={() => setResetDialogOpen(true)}
                className="bg-red-600 hover:bg-red-700 border-0 font-medium"
                size="sm"
              >
                <XCircle className="h-4 w-4 ml-1" />
                <span className="hidden sm:inline">סגירת הכל</span>
                <span className="sm:hidden">סגירה</span>
              </Button>
            )}
          </div>
        </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
            </div>
            <p className="text-sm text-muted-foreground">טוען תחנות פעילות...</p>
          </div>
        </div>
      ) : sortedSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-4">
            <Activity className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground text-center">אין תחנות פעילות כרגע</p>
          <p className="text-xs text-muted-foreground mt-1">תחנות חדשות יופיעו כאן בזמן אמת</p>
        </div>
      ) : (
        <>
          {/* Desktop Sessions List */}
          <div className="hidden lg:block">
            <div className="max-h-[480px] overflow-y-auto">
              {sortedSessions.map((sessionId) => (
                <SessionRow
                  key={sessionId}
                  sessionId={sessionId}
                  dictionary={dictionary}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden p-4 space-y-3">
            {sortedSessions.map((sessionId) => (
              <MobileSessionCard
                key={sessionId}
                sessionId={sessionId}
                dictionary={dictionary}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        </>
      )}
      </div>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="border-border bg-card text-right sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">לסגור את כל התחנות הפעילות?</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              פעולה זו תסגור את כל הסשנים הפעילים ותעדכן את הדשבורד.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse justify-start gap-2 sm:flex-row-reverse">
            <Button
              variant="destructive"
              onClick={() => void handleForceCloseSessions()}
              disabled={resetting}
              className="bg-red-600 hover:bg-red-700 border-0 font-medium"
            >
              {resetting ? "סוגר..." : "כן, סגור הכל"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setResetDialogOpen(false)}
              className="border-input bg-secondary text-foreground/80 hover:bg-accent hover:text-foreground"
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const areEqual = (
  prev: ActiveSessionsTableProps,
  next: ActiveSessionsTableProps,
) => {
  return (
    prev.dictionary === next.dictionary &&
    prev.isDictionaryLoading === next.isDictionaryLoading
  );
};

export const ActiveSessionsTable = memo(ActiveSessionsTableComponent, areEqual);

// Icon component for the header
const Activity = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);
