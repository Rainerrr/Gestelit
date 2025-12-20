"use client";

import { memo, useMemo, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Clock, Package, Trash2, Moon } from "lucide-react";
import type { StatusDictionary } from "@/lib/status";
import {
  useAdminSession,
  useAdminSessionIds,
  useAdminSessionsLoading,
} from "@/contexts/AdminSessionsContext";
import {
  getStatusColorFromDictionary,
  getStatusLabelFromDictionary,
} from "./status-dictionary";

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

const SessionRow = memo(
  ({ sessionId, dictionary, onNavigate }: RowProps) => {
    const session = useAdminSession(sessionId);
    const now = useNow();
    const duration = useMemo(
      () => (session ? getDurationLabel(session.startedAt, now) : "-"),
      [session, now],
    );
    const isIdle = useMemo(
      () => (session ? isSessionIdle(session.lastSeenAt, now) : false),
      [session, now],
    );

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

    return (
      <div
        role="button"
        tabIndex={0}
        className="group flex items-center gap-4 px-4 py-3 border-b border-zinc-800/40 cursor-pointer transition-all duration-150 hover:bg-zinc-800/40"
        aria-label={`תחנה פעילה עבור עבודה ${session.jobNumber}`}
        onClick={() => onNavigate(session.id)}
        onKeyDown={(event) => handleKeyOpen(session.id, event)}
      >
        {/* Station + Status + Idle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-zinc-100">{session.stationName}</span>
            {isIdle && (
              <Moon className="h-4 w-4 text-amber-400 shrink-0" aria-label="לא פעיל" />
            )}
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

        {/* Worker + Job */}
        <div className="flex flex-col items-end gap-0.5 min-w-[120px]">
          <span className="text-sm text-zinc-300">{session.workerName}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500">פק״ע:</span>
            <span className="font-mono text-xs text-amber-500">{session.jobNumber}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-zinc-700/50" />

        {/* Time + Quantities */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Clock className="h-3.5 w-3.5 text-zinc-500" />
            <span className="font-mono text-sm tabular-nums">{duration}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-emerald-500" />
            <span className="font-mono text-sm tabular-nums text-emerald-400">{session.totalGood}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
            <span className="font-mono text-sm tabular-nums text-red-400">{session.totalScrap}</span>
          </div>
        </div>

        {/* Navigation arrow */}
        <ChevronLeft className="h-4 w-4 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
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
    const isIdle = useMemo(
      () => (session ? isSessionIdle(session.lastSeenAt, now) : false),
      [session, now],
    );

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

    return (
      <div
        role="button"
        tabIndex={0}
        className="group flex items-center gap-3 p-3 border border-zinc-800/60 rounded-lg bg-zinc-900/40 transition-all duration-200 hover:bg-zinc-800/40 hover:border-zinc-700 cursor-pointer"
        aria-label={`תחנה פעילה עבור עבודה ${session.jobNumber}`}
        onClick={() => onNavigate(session.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onNavigate(session.id);
          }
        }}
      >
        {/* Station + Status + Idle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-zinc-100">{session.stationName}</span>
            {isIdle && (
              <Moon className="h-4 w-4 text-amber-400 shrink-0" aria-label="לא פעיל" />
            )}
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

        {/* Worker + Job */}
        <div className="flex flex-col items-end gap-0.5 min-w-[100px]">
          <span className="text-sm text-zinc-300">{session.workerName}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500">פק״ע:</span>
            <span className="font-mono text-xs text-amber-500">{session.jobNumber}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-zinc-700/50" />

        {/* Time + Quantities */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-zinc-400">
            <Clock className="h-3 w-3 text-zinc-500" />
            <span className="font-mono text-xs tabular-nums">{duration}</span>
          </div>
          <div className="flex items-center gap-1">
            <Package className="h-3 w-3 text-emerald-500" />
            <span className="font-mono text-xs tabular-nums text-emerald-400">{session.totalGood}</span>
          </div>
          <div className="flex items-center gap-1">
            <Trash2 className="h-3 w-3 text-red-500" />
            <span className="font-mono text-xs tabular-nums text-red-400">{session.totalScrap}</span>
          </div>
        </div>

        {/* Navigation arrow */}
        <ChevronLeft className="h-4 w-4 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
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
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
            <Activity className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">תחנות פעילות</h3>
            <p className="text-xs text-zinc-500">{sortedSessions.length} תחנות</p>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-500" />
            </div>
            <p className="text-sm text-zinc-500">טוען תחנות פעילות...</p>
          </div>
        </div>
      ) : sortedSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800/50 mb-4">
            <Activity className="h-6 w-6 text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-400 text-center">אין תחנות פעילות כרגע</p>
          <p className="text-xs text-zinc-600 mt-1">תחנות חדשות יופיעו כאן בזמן אמת</p>
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
