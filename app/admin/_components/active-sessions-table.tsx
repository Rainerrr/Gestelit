"use client";

import { memo, useMemo, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Clock,
  Package,
  Trash2,
  CirclePause,
  AlertOctagon,
  AlertTriangle,
  TrendingDown,
  Settings,
  User,
} from "lucide-react";
import type { StatusDictionary } from "@/lib/status";
import type { CurrentJobItemInfo } from "@/lib/data/admin-dashboard";
import {
  useAdminSession,
  useAdminSessionIds,
  useAdminSessionsLoading,
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
import { cn } from "@/lib/utils";

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
 * Dual-color progress bar matching the work page style.
 * Shows prior sessions (emerald) + this session (cyan).
 */
function DualProgressBar({
  totalCompleted,
  sessionContribution,
  plannedQuantity,
}: {
  totalCompleted: number;
  sessionContribution: number;
  plannedQuantity: number;
}) {
  const safePlanned = Math.max(1, plannedQuantity);
  const safeTotal = Math.min(totalCompleted, safePlanned);
  const safeSession = Math.min(sessionContribution, safeTotal);

  const prior = Math.max(0, safeTotal - safeSession);
  const priorPercent = (prior / safePlanned) * 100;
  const sessionPercent = (safeSession / safePlanned) * 100;

  const isComplete = totalCompleted >= plannedQuantity;

  return (
    <div
      className={cn(
        "relative w-full h-3 overflow-hidden rounded-full",
        "border border-border bg-muted/50"
      )}
    >
      {/* Prior Sessions Segment - emerald - RTL: anchored to right */}
      {priorPercent > 0 && (
        <div
          className="absolute inset-y-0 right-0 bg-gradient-to-l from-emerald-400 to-emerald-600 transition-all duration-500"
          style={{ width: `${priorPercent}%` }}
        />
      )}

      {/* This Session Segment - cyan with glow - RTL: positioned after prior from right */}
      {sessionPercent > 0 && (
        <div
          className={cn(
            "absolute inset-y-0 bg-gradient-to-l from-cyan-400 to-cyan-600",
            "shadow-[0_0_8px_rgba(6,182,212,0.5)] transition-all duration-500"
          )}
          style={{
            right: `${priorPercent}%`,
            width: `${sessionPercent}%`,
          }}
        />
      )}

      {/* Completion shimmer */}
      {isComplete && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
      )}
    </div>
  );
}

/**
 * Progress cell component for displaying job item progress with dual bar
 */
function ProgressCell({ jobItem, totalGood, jobNumber }: { jobItem: CurrentJobItemInfo | null; totalGood: number; jobNumber: string }) {
  if (!jobItem) {
    // No job selected - simplified display
    return (
      <div className="flex items-center justify-center min-w-[280px]">
        <span className="text-xs text-muted-foreground/50">לא נבחרה עבודה</span>
      </div>
    );
  }

  const isComplete = jobItem.totalCompletedGood >= jobItem.plannedQuantity;

  return (
    <div className="flex items-center gap-3 min-w-[280px]">
      {/* Job number + Job item name stacked */}
      <div className="flex flex-col items-start gap-0.5 shrink-0 min-w-[80px]">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">פק״ע:</span>
          <span className="font-mono text-xs text-primary">{jobNumber}</span>
        </div>
        <span
          className="text-xs text-muted-foreground truncate max-w-[80px]"
          title={jobItem.jobItemName}
        >
          {jobItem.jobItemName}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-border shrink-0" />

      {/* Progress section */}
      <div className="flex flex-col gap-1 flex-1 min-w-[130px]">
        {/* Text: total / planned with (+session) */}
        <div className="flex items-center gap-1 justify-center">
          <Package className="h-3.5 w-3.5 text-emerald-500" />
          <span
            className={cn(
              "text-sm font-bold tabular-nums",
              isComplete ? "text-emerald-400" : "text-foreground"
            )}
          >
            {jobItem.totalCompletedGood}
          </span>
          <span className="text-muted-foreground text-xs">/</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {jobItem.plannedQuantity}
          </span>
          {jobItem.sessionGood > 0 && (
            <span className="text-xs font-semibold text-cyan-400 tabular-nums">
              (+{jobItem.sessionGood})
            </span>
          )}
        </div>

        {/* Dual progress bar */}
        <DualProgressBar
          totalCompleted={jobItem.totalCompletedGood}
          sessionContribution={jobItem.sessionGood}
          plannedQuantity={jobItem.plannedQuantity}
        />
      </div>
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
        className="group flex items-center gap-4 px-4 py-3 border-b border-border cursor-pointer transition-all duration-150 hover:bg-accent"
        aria-label={`תחנה פעילה עבור עבודה ${session.jobNumber}`}
        onClick={() => onNavigate(session.id)}
        onKeyDown={(event) => handleKeyOpen(session.id, event)}
      >
        {/* Station + Status */}
        <div className="flex-1 min-w-0">
          <div className="mb-1">
            <span className="text-sm font-bold text-foreground">{session.stationName}</span>
          </div>
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

        {/* Worker + Duration */}
        <div className="flex flex-col items-end gap-0.5 min-w-[100px]">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-foreground/80">{session.workerName}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono text-sm tabular-nums">{duration}</span>
          </div>
        </div>

        {/* Divider before flags */}
        <div className="w-px h-8 bg-border" />

        {/* Flags section */}
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center justify-center gap-1.5 min-w-[80px] flex-wrap">
            {hasMalfunctions && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="cursor-default shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <AlertOctagon className="h-3.5 w-3.5 text-red-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {session.malfunctionCount} דיווחי תקלה
                </TooltipContent>
              </Tooltip>
            )}
            {isIdle && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="cursor-default shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <CirclePause className="h-3.5 w-3.5 text-amber-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  נראה לאחרונה: {lastSeenFormatted}
                </TooltipContent>
              </Tooltip>
            )}
            {flags?.highStoppage && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="cursor-default shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {SESSION_FLAG_LABELS.high_stoppage}
                </TooltipContent>
              </Tooltip>
            )}
            {flags?.highSetup && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="cursor-default shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Settings className="h-3.5 w-3.5 text-blue-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {SESSION_FLAG_LABELS.high_setup}
                </TooltipContent>
              </Tooltip>
            )}
            {flags?.lowProduction && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="cursor-default shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <TrendingDown className="h-3.5 w-3.5 text-amber-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {SESSION_FLAG_LABELS.low_production}
                </TooltipContent>
              </Tooltip>
            )}
            {!hasAnyFlags && <span className="text-muted-foreground/30">—</span>}
          </div>
        </TooltipProvider>

        {/* Divider after flags */}
        <div className="w-px h-8 bg-border" />

        {/* Progress: job number | job item name | progress bar with dual colors */}
        <ProgressCell jobItem={session.currentJobItem} totalGood={session.totalGood} jobNumber={session.jobNumber} />

        {/* Scrap - only show if there's scrap, with link to reports */}
        {session.totalScrap > 0 && (
          <Link
            href={`/admin/reports/scrap?sessionId=${session.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 hover:bg-red-500/10 px-1.5 py-0.5 rounded transition-colors shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
            <span className="font-mono text-sm tabular-nums text-red-400">{session.totalScrap.toLocaleString()}</span>
          </Link>
        )}

        {/* Navigation arrow */}
        <ChevronLeft className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
        {/* Top row: Station name + Worker section */}
        <div className="flex items-start justify-between mb-2">
          {/* Station */}
          <div className="flex flex-col gap-1">
            <span className="text-base font-bold text-foreground">{session.stationName}</span>
          </div>
          {/* Worker + Duration */}
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm text-foreground/80">{session.workerName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-mono text-sm tabular-nums">{duration}</span>
            </div>
          </div>
        </div>

        {/* Second row: Status badge + Flags */}
        <div className="flex items-center justify-between mb-3">
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold"
            style={{
              backgroundColor: statusStyle.bg,
              borderWidth: '1px',
              borderColor: statusStyle.border,
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: statusStyle.dot }}
            />
            <span style={{ color: statusStyle.text }}>{statusLabel}</span>
          </div>

          {/* Flags */}
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-2">
              {hasMalfunctions && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="cursor-default"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <AlertOctagon className="h-4 w-4 text-red-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {session.malfunctionCount} דיווחי תקלה
                  </TooltipContent>
                </Tooltip>
              )}
              {isIdle && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="cursor-default"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <CirclePause className="h-4 w-4 text-amber-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    נראה לאחרונה: {lastSeenFormatted}
                  </TooltipContent>
                </Tooltip>
              )}
              {flags?.highStoppage && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="cursor-default"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {SESSION_FLAG_LABELS.high_stoppage}
                  </TooltipContent>
                </Tooltip>
              )}
              {flags?.highSetup && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="cursor-default"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Settings className="h-4 w-4 text-blue-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {SESSION_FLAG_LABELS.high_setup}
                  </TooltipContent>
                </Tooltip>
              )}
              {flags?.lowProduction && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="cursor-default"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <TrendingDown className="h-4 w-4 text-amber-500" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {SESSION_FLAG_LABELS.low_production}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>

        {/* Bottom row: Job info + Progress */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
          {/* Job number + Scrap - only show when job is selected */}
          {session.currentJobItem && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">פק״ע:</span>
                <span className="font-mono text-xs text-primary font-medium">{session.jobNumber}</span>
              </div>

              {/* Scrap - only show if there's scrap, with link to reports */}
              {session.totalScrap > 0 && (
                <Link
                  href={`/admin/reports/scrap?sessionId=${session.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 hover:bg-red-500/10 px-2 py-1 rounded transition-colors"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                  <span className="font-mono text-sm tabular-nums text-red-400 font-medium">{session.totalScrap.toLocaleString()}</span>
                </Link>
              )}
            </div>
          )}

          {/* Progress bar: dual color design matching desktop */}
          {session.currentJobItem ? (
            <div className="flex flex-col gap-1.5 w-full">
              {/* Job item name */}
              <span
                className="text-xs text-muted-foreground truncate"
                title={session.currentJobItem.jobItemName}
              >
                {session.currentJobItem.jobItemName}
              </span>

              {/* Text: total / planned with (+session) */}
              <div className="flex items-center gap-1 justify-center">
                <Package className="h-4 w-4 text-emerald-500" />
                <span
                  className={cn(
                    "text-base font-bold tabular-nums",
                    session.currentJobItem.totalCompletedGood >= session.currentJobItem.plannedQuantity
                      ? "text-emerald-400"
                      : "text-foreground"
                  )}
                >
                  {session.currentJobItem.totalCompletedGood}
                </span>
                <span className="text-muted-foreground text-sm">/</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {session.currentJobItem.plannedQuantity}
                </span>
                {session.currentJobItem.sessionGood > 0 && (
                  <span className="text-sm font-semibold text-cyan-400 tabular-nums">
                    (+{session.currentJobItem.sessionGood})
                  </span>
                )}
              </div>

              {/* Dual progress bar */}
              <DualProgressBar
                totalCompleted={session.currentJobItem.totalCompletedGood}
                sessionContribution={session.currentJobItem.sessionGood}
                plannedQuantity={session.currentJobItem.plannedQuantity}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center py-2">
              <span className="text-xs text-muted-foreground/50">לא נבחרה עבודה</span>
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

  const sortedSessions = useMemo(() => [...sessionIds], [sessionIds]);

  const handleNavigate = (sessionId: string) => {
    router.push(`/admin/session/${sessionId}`);
  };

  return (
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
