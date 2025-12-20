"use client";

import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { CompletedSession } from "@/lib/data/admin-dashboard";
import type { StatusDictionary } from "@/lib/status";
import {
  getStatusColorFromDictionary,
  getStatusLabelFromDictionary,
} from "./status-dictionary";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown, Clock, Package, AlertTriangle, ExternalLink } from "lucide-react";

const getStatusStyle = (hex: string) => ({
  bg: `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, 0.12)`,
  border: `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, 0.35)`,
  text: hex,
  dot: hex,
});

const getSessionStatusInfo = (
  session: CompletedSession,
  dictionary: StatusDictionary,
): { label: string; hex: string } => {
  if (session.forcedClosedAt && session.lastEventNote === "grace-window-expired") {
    return { label: "נסגר עקב אי פעילות", hex: "#f59e0b" };
  }
  if (session.forcedClosedAt && session.lastEventNote === "worker-abandon") {
    return { label: "נסגר על ידי העובד", hex: "#f59e0b" };
  }
  if (session.currentStatus) {
    return {
      label: getStatusLabelFromDictionary(session.currentStatus, dictionary, session.stationId),
      hex: getStatusColorFromDictionary(session.currentStatus, dictionary, session.stationId),
    };
  }
  return { label: "לא ידוע", hex: "#64748b" };
};

type SortKey =
  | "jobNumber"
  | "stationName"
  | "workerName"
  | "endedAt"
  | "durationSeconds"
  | "status"
  | "totalGood"
  | "totalScrap";

type RecentSessionsTableProps = {
  sessions: CompletedSession[];
  isLoading: boolean;
  selectedIds?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
  sortKey?: SortKey;
  sortDirection?: "asc" | "desc";
  onSort?: (key: SortKey) => void;
  dictionary: StatusDictionary;
};

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}ש׳ ${minutes}דק׳`;
  }
  return `${minutes} דק׳`;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  const time = new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  const dateStr = new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  return { time, date: dateStr };
};

const columns: { key: SortKey; label: string; hideOnMobile?: boolean; align?: "center" }[] = [
  { key: "jobNumber", label: 'פק"ע' },
  { key: "stationName", label: "תחנה" },
  { key: "workerName", label: "עובד", hideOnMobile: true },
  { key: "endedAt", label: "סיום", hideOnMobile: true },
  { key: "durationSeconds", label: "משך", align: "center" },
  { key: "totalGood", label: "תקין", align: "center" },
  { key: "totalScrap", label: "פסול", align: "center" },
  { key: "status", label: "סטטוס" },
];

const SortIcon = ({ active, direction }: { active: boolean; direction?: "asc" | "desc" }) => {
  if (!active) {
    return <ChevronsUpDown className="h-3.5 w-3.5 text-zinc-600" />;
  }
  return direction === "asc" ? (
    <ChevronUp className="h-3.5 w-3.5 text-amber-500" />
  ) : (
    <ChevronDown className="h-3.5 w-3.5 text-amber-500" />
  );
};

export const RecentSessionsTable = ({
  sessions,
  isLoading,
  selectedIds,
  onToggleRow,
  onToggleAll,
  sortKey,
  sortDirection,
  onSort,
  dictionary,
}: RecentSessionsTableProps) => {
  const router = useRouter();
  const selectionEnabled = Boolean(selectedIds && onToggleRow && onToggleAll);
  const allSelected =
    selectionEnabled &&
    sessions.length > 0 &&
    selectedIds !== undefined &&
    sessions.every((session) => selectedIds.has(session.id));
  const someSelected =
    selectionEnabled &&
    selectedIds !== undefined &&
    selectedIds.size > 0 &&
    !allSelected;

  const handleNavigate = (sessionId: string) => {
    router.push(`/admin/session/${sessionId}`);
  };

  const handleRowKeyOpen = (sessionId: string, event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNavigate(sessionId);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-500" />
          </div>
          <p className="text-sm text-zinc-500">טוען נתונים...</p>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
          <Package className="h-10 w-10 opacity-30" />
          <p className="text-sm">אין עבודות שהושלמו</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm overflow-hidden">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800/60 bg-zinc-900/80">
              {selectionEnabled && (
                <th className="w-12 px-4 py-3 text-right">
                  <Checkbox
                    checked={allSelected}
                    ref={(el) => {
                      if (el) {
                        (el as unknown as HTMLInputElement).indeterminate = someSelected;
                      }
                    }}
                    onCheckedChange={(checked) => onToggleAll?.(checked === true)}
                    aria-label="בחירת כל העבודות"
                    className="border-zinc-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  />
                </th>
              )}
              {columns.map((column) => {
                const isSorted = sortKey === column.key;
                return (
                  <th
                    key={column.key}
                    className={cn(
                      "px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap",
                      column.align === "center" ? "text-center" : "text-right"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSort?.(column.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 -mx-2 transition-colors",
                        "hover:bg-zinc-800 hover:text-zinc-200",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50",
                        isSorted && "text-amber-400"
                      )}
                    >
                      <span>{column.label}</span>
                      <SortIcon active={isSorted} direction={sortDirection} />
                    </button>
                  </th>
                );
              })}
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/40">
            {sessions.map((session) => {
              const isSelected = selectedIds?.has(session.id);
              const statusInfo = getSessionStatusInfo(session, dictionary);
              const statusStyle = getStatusStyle(statusInfo.hex);
              const { time, date } = formatDateTime(session.endedAt);

              return (
                <tr
                  key={session.id}
                  className={cn(
                    "group cursor-pointer transition-colors",
                    isSelected
                      ? "bg-amber-500/10 hover:bg-amber-500/15"
                      : "hover:bg-zinc-800/50"
                  )}
                  role="button"
                  tabIndex={0}
                  aria-label={`ציר זמן לפק\"ע ${session.jobNumber}`}
                  onClick={() => handleNavigate(session.id)}
                  onKeyDown={(event) => handleRowKeyOpen(session.id, event)}
                >
                  {selectionEnabled && (
                    <td className="w-12 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleRow?.(session.id)}
                        aria-label="בחירת עבודה"
                        className="border-zinc-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-amber-400">
                      {session.jobNumber}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-zinc-100">
                      {session.stationName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {session.workerName}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start">
                      <span className="text-zinc-300 font-medium">{time}</span>
                      <span className="text-xs text-zinc-500">{date}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-1 text-zinc-400">
                      <Clock className="h-3.5 w-3.5 opacity-50" />
                      <span className="font-mono text-xs">
                        {formatDuration(session.durationSeconds)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-0.5 rounded bg-emerald-500/10 font-mono text-sm font-semibold text-emerald-400">
                      {session.totalGood}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {session.totalScrap > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-0.5 rounded bg-red-500/10 font-mono text-sm font-semibold text-red-400">
                        {session.totalScrap}
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap"
                      style={{
                        backgroundColor: statusStyle.bg,
                        borderWidth: "1px",
                        borderColor: statusStyle.border,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: statusStyle.dot }}
                      />
                      <span style={{ color: statusStyle.text }}>{statusInfo.label}</span>
                    </div>
                  </td>
                  <td className="w-10 px-4 py-3">
                    <ExternalLink className="h-4 w-4 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden divide-y divide-zinc-800/40">
        {/* Mobile header with select all */}
        {selectionEnabled && (
          <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900/80 border-b border-zinc-800/60">
            <Checkbox
              checked={allSelected}
              ref={(el) => {
                if (el) {
                  (el as unknown as HTMLInputElement).indeterminate = someSelected;
                }
              }}
              onCheckedChange={(checked) => onToggleAll?.(checked === true)}
              aria-label="בחירת כל העבודות"
              className="border-zinc-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
            />
            <span className="text-xs text-zinc-500">בחר הכל</span>
          </div>
        )}

        {sessions.map((session) => {
          const isSelected = selectedIds?.has(session.id);
          const statusInfo = getSessionStatusInfo(session, dictionary);
          const statusStyle = getStatusStyle(statusInfo.hex);
          const { time, date } = formatDateTime(session.endedAt);

          return (
            <div
              key={session.id}
              className={cn(
                "p-4 cursor-pointer transition-colors active:bg-zinc-800/60",
                isSelected ? "bg-amber-500/10" : "hover:bg-zinc-800/40"
              )}
              role="button"
              tabIndex={0}
              aria-label={`ציר זמן לפק\"ע ${session.jobNumber}`}
              onClick={() => handleNavigate(session.id)}
              onKeyDown={(event) => handleRowKeyOpen(session.id, event)}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                {selectionEnabled && (
                  <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleRow?.(session.id)}
                      aria-label="בחירת עבודה"
                      className="border-zinc-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Top row: Job + Station + Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400">
                          {session.jobNumber}
                        </span>
                        <span className="text-zinc-600">•</span>
                        <span className="font-medium text-zinc-100 truncate">
                          {session.stationName}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500">{session.workerName}</p>
                    </div>
                    <div
                      className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
                      style={{
                        backgroundColor: statusStyle.bg,
                        borderWidth: "1px",
                        borderColor: statusStyle.border,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: statusStyle.dot }}
                      />
                      <span style={{ color: statusStyle.text }}>{statusInfo.label}</span>
                    </div>
                  </div>

                  {/* Bottom row: Metrics */}
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5 text-zinc-500">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{time}</span>
                      <span className="text-zinc-600">{date}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-500">
                      <span className="text-zinc-600">משך:</span>
                      <span className="font-mono">{formatDuration(session.durationSeconds)}</span>
                    </div>
                    <div className="flex items-center gap-2 mr-auto">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/15 font-mono text-xs font-semibold text-emerald-400">
                        {session.totalGood}
                      </span>
                      {session.totalScrap > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-500/15 font-mono text-xs font-semibold text-red-400">
                          {session.totalScrap}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

