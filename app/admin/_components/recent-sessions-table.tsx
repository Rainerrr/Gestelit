"use client";

import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { CompletedSession } from "@/lib/data/admin-dashboard";
import type { StatusDictionary } from "@/lib/status";
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

type SortKey =
  | "stationName"
  | "workerName"
  | "endedAt"
  | "totalProduction"
  | "jobItemCount"
  | "productsPerHour"
  | "durationSeconds";

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

const formatDurationLong = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) {
    return `${hours} שע׳ ${minutes} דק׳`;
  }
  if (hours > 0) {
    return `${hours} שע׳`;
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
  { key: "stationName", label: "תחנה" },
  { key: "workerName", label: "עובד" },
  { key: "endedAt", label: "סיום", hideOnMobile: true },
  { key: "totalProduction", label: "ייצור", align: "center" },
  { key: "jobItemCount", label: "פריטים", align: "center" },
  { key: "productsPerHour", label: "מוצרים/שעה", align: "center" },
  { key: "durationSeconds", label: "משך", align: "center" },
  { key: "flags", label: "חריגים", align: "center", sortable: false },
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

const TimeDistributionBar = ({ session }: { session: CompletedSession }) => {
  const productionTime = session.productionTimeSeconds ?? 0;
  const setupTime = session.setupTimeSeconds ?? 0;
  const stoppageTime = session.stoppageTimeSeconds ?? 0;
  const total = productionTime + setupTime + stoppageTime;

  if (total === 0) {
    return null;
  }

  const productionPct = (productionTime / total) * 100;
  const setupPct = (setupTime / total) * 100;
  const stoppagePct = (stoppageTime / total) * 100;

  const tooltipContent = (
    <div className="space-y-1 text-xs">
      {productionTime > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span>ייצור: {formatDurationLong(productionTime)} ({productionPct.toFixed(0)}%)</span>
        </div>
      )}
      {setupTime > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
          <span>הכנה: {formatDurationLong(setupTime)} ({setupPct.toFixed(0)}%)</span>
        </div>
      )}
      {stoppageTime > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
          <span>עצירה: {formatDurationLong(stoppageTime)} ({stoppagePct.toFixed(0)}%)</span>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex h-1.5 w-full min-w-[60px] rounded-full overflow-hidden bg-muted mt-1 cursor-default">
            {productionPct > 0 && (
              <div
                className="bg-emerald-500 h-full"
                style={{ width: `${productionPct}%` }}
              />
            )}
            {setupPct > 0 && (
              <div
                className="bg-amber-500 h-full"
                style={{ width: `${setupPct}%` }}
              />
            )}
            {stoppagePct > 0 && (
              <div
                className="bg-orange-500 h-full"
                style={{ width: `${stoppagePct}%` }}
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-2">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const JobItemsBadge = ({ session }: { session: CompletedSession }) => {
  const count = session.jobItemCount ?? 0;
  const names = session.jobItemNames ?? [];

  if (count === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const badge = (
    <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded bg-blue-500/10 font-mono text-xs font-semibold text-blue-400">
      {count}
    </span>
  );

  if (names.length === 0) {
    return badge;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          <div className="space-y-0.5">
            {names.map((name, i) => (
              <div key={i} className="truncate">{name}</div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const ProductionCell = ({ session }: { session: CompletedSession }) => {
  const good = session.totalGood ?? 0;
  const scrap = session.totalScrap ?? 0;

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="font-mono text-sm font-semibold text-emerald-400">
        {good}
      </span>
      {scrap > 0 && (
        <>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-mono text-sm font-semibold text-red-400">
            {scrap}
          </span>
        </>
      )}
    </div>
  );
};

const ProductsPerHourCell = ({ session }: { session: CompletedSession }) => {
  const productionTime = session.productionTimeSeconds ?? 0;
  const good = session.totalGood ?? 0;

  if (productionTime === 0 || good === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const perHour = Math.round(good / (productionTime / 3600));

  return (
    <span className="font-mono text-sm text-foreground/80">
      {perHour}
    </span>
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

  // Suppress unused variable warnings - dictionary kept for potential future status display needs
  void dictionary;

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
                  aria-label={`פרטי עבודה בתחנה ${session.stationName}`}
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
                  {/* Station */}
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">
                      {session.stationName}
                    </span>
                  </td>
                  {/* Worker */}
                  <td className="px-4 py-3 text-muted-foreground">
                    {session.workerName}
                  </td>
                  {/* End Time */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start">
                      <span className="text-foreground/80 font-medium">{time}</span>
                      <span className="text-xs text-muted-foreground">{date}</span>
                    </div>
                  </td>
                  {/* Total Production */}
                  <td className="px-4 py-3 text-center">
                    <ProductionCell session={session} />
                  </td>
                  {/* Job Items */}
                  <td className="px-4 py-3 text-center">
                    <JobItemsBadge session={session} />
                  </td>
                  {/* Products/Hour */}
                  <td className="px-4 py-3 text-center">
                    <ProductsPerHourCell session={session} />
                  </td>
                  {/* Duration + Time Bar */}
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex flex-col items-center gap-0.5 min-w-[80px]">
                      <div className="inline-flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 opacity-50" />
                        <span className="font-mono text-xs">
                          {formatDuration(session.durationSeconds)}
                        </span>
                      </div>
                      <TimeDistributionBar session={session} />
                    </div>
                  </td>
                  {/* Flags */}
                  <td className="px-4 py-3 text-center">
                    <SessionFlagIcons session={session} showPlaceholder />
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
                aria-label={`פרטי עבודה בתחנה ${session.stationName}`}
                onClick={() => handleNavigate(session.id)}
                onKeyDown={(event) => handleRowKeyOpen(session.id, event)}
              >
                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Top row: Station + Worker */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <span className="font-medium text-foreground">
                        {session.stationName}
                      </span>
                      <p className="text-sm text-muted-foreground">{session.workerName}</p>
                    </div>
                    <ProductionCell session={session} />
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
                    {(session.jobItemCount ?? 0) > 0 && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <span className="font-mono text-blue-400">{session.jobItemCount}</span>
                        <span>פריטים</span>
                      </div>
                    )}
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
