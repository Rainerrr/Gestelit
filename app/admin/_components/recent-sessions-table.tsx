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
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Clock,
  Package,
  ExternalLink,
  AlertTriangle,
  Trash2,
  TrendingDown,
  AlertOctagon,
  Settings,
} from "lucide-react";
import {
  calculateSessionFlags,
  hasAnyFlag,
} from "@/lib/utils/session-flags";
import { SESSION_FLAG_LABELS } from "@/lib/config/session-flags";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

const columns: { key: SortKey | "flags"; label: string; hideOnMobile?: boolean; align?: "center"; sortable?: boolean }[] = [
  { key: "jobNumber", label: 'פק"ע' },
  { key: "stationName", label: "תחנה" },
  { key: "workerName", label: "עובד", hideOnMobile: true },
  { key: "endedAt", label: "סיום", hideOnMobile: true },
  { key: "durationSeconds", label: "משך", align: "center" },
  { key: "totalGood", label: "תקין", align: "center" },
  { key: "totalScrap", label: "פסול", align: "center" },
  { key: "flags", label: "חריגים", align: "center", sortable: false },
  { key: "status", label: "סטטוס" },
];

const SortIcon = ({ active, direction }: { active: boolean; direction?: "asc" | "desc" }) => {
  if (!active) {
    return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
  }
  return direction === "asc" ? (
    <ChevronUp className="h-3.5 w-3.5 text-primary" />
  ) : (
    <ChevronDown className="h-3.5 w-3.5 text-primary" />
  );
};

const SessionFlagIcons = ({ session, showPlaceholder = false }: { session: CompletedSession; showPlaceholder?: boolean }) => {
  const flags = calculateSessionFlags(session, session.stoppageTimeSeconds, session.setupTimeSeconds);
  const hasMalfunctions = session.malfunctionCount > 0;

  if (!hasAnyFlag(flags) && !hasMalfunctions) {
    return showPlaceholder ? <span className="text-muted-foreground/30">—</span> : null;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="inline-flex items-center justify-center gap-1.5 flex-wrap">
        {hasMalfunctions && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">
                <AlertOctagon className="h-3.5 w-3.5 text-red-500" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {session.malfunctionCount} דיווחי תקלה
            </TooltipContent>
          </Tooltip>
        )}
        {flags.highStoppage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {SESSION_FLAG_LABELS.high_stoppage}
            </TooltipContent>
          </Tooltip>
        )}
        {flags.highSetup && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">
                <Settings className="h-3.5 w-3.5 text-blue-500" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {SESSION_FLAG_LABELS.high_setup}
            </TooltipContent>
          </Tooltip>
        )}
        {flags.highScrap && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {SESSION_FLAG_LABELS.high_scrap}
            </TooltipContent>
          </Tooltip>
        )}
        {flags.lowProduction && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">
                <TrendingDown className="h-3.5 w-3.5 text-amber-500" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {SESSION_FLAG_LABELS.low_production}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
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
      <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">טוען נתונים...</p>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Package className="h-10 w-10 opacity-30" />
          <p className="text-sm">אין עבודות שהושלמו</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card/80">
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
                    className="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                </th>
              )}
              {columns.map((column) => {
                const isSortable = column.sortable !== false && column.key !== "flags";
                const isSorted = sortKey === column.key;
                return (
                  <th
                    key={column.key}
                    className={cn(
                      "px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap",
                      column.align === "center" ? "text-center" : "text-right"
                    )}
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={() => onSort?.(column.key as SortKey)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 -mx-2 transition-colors",
                          "hover:bg-accent hover:text-foreground",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                          isSorted && "text-primary"
                        )}
                      >
                        <span>{column.label}</span>
                        <SortIcon active={isSorted} direction={sortDirection} />
                      </button>
                    ) : (
                      <span>{column.label}</span>
                    )}
                  </th>
                );
              })}
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
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
                      ? "bg-primary/10 hover:bg-primary/15"
                      : "hover:bg-accent"
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
                        className="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-primary">
                      {session.jobNumber}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">
                      {session.stationName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {session.workerName}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start">
                      <span className="text-foreground/80 font-medium">{time}</span>
                      <span className="text-xs text-muted-foreground">{date}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-1 text-muted-foreground">
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
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <SessionFlagIcons session={session} showPlaceholder />
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
                    <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden divide-y divide-border">
        {/* Mobile header with select all */}
        {selectionEnabled && (
          <div className="flex items-center gap-3 px-4 py-3 bg-card/80 border-b border-border">
            <Checkbox
              checked={allSelected}
              ref={(el) => {
                if (el) {
                  (el as unknown as HTMLInputElement).indeterminate = someSelected;
                }
              }}
              onCheckedChange={(checked) => onToggleAll?.(checked === true)}
              aria-label="בחירת כל העבודות"
              className="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            <span className="text-xs text-muted-foreground">בחר הכל</span>
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
                "flex transition-colors",
                isSelected ? "bg-primary/10" : "hover:bg-accent"
              )}
            >
              {/* Checkbox zone - separate from clickable content */}
              {selectionEnabled && (
                <div
                  className="flex items-center justify-center w-16 shrink-0 border-l border-border/50 cursor-pointer active:bg-accent/50"
                  onClick={() => onToggleRow?.(session.id)}
                  role="button"
                  tabIndex={0}
                  aria-label="בחירת עבודה"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleRow?.(session.id);
                    }
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleRow?.(session.id)}
                    aria-label="בחירת עבודה"
                    className="h-6 w-6 border-2 border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary pointer-events-none"
                  />
                </div>
              )}

              {/* Clickable content area */}
              <div
                className="flex-1 p-4 cursor-pointer active:bg-accent"
                role="button"
                tabIndex={0}
                aria-label={`ציר זמן לפק\"ע ${session.jobNumber}`}
                onClick={() => handleNavigate(session.id)}
                onKeyDown={(event) => handleRowKeyOpen(session.id, event)}
              >
                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Top row: Job + Station + Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-primary">
                          {session.jobNumber}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="font-medium text-foreground truncate">
                          {session.stationName}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{session.workerName}</p>
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

                  {/* Bottom row: Metrics + Flags */}
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{time}</span>
                      <span className="text-muted-foreground">{date}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="text-muted-foreground">משך:</span>
                      <span className="font-mono">{formatDuration(session.durationSeconds)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/15 font-mono text-xs font-semibold text-emerald-400">
                        {session.totalGood}
                      </span>
                      {session.totalScrap > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-500/15 font-mono text-xs font-semibold text-red-400">
                          {session.totalScrap}
                        </span>
                      )}
                    </div>
                    {/* Flags at the end */}
                    <div className="mr-auto">
                      <SessionFlagIcons session={session} />
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

