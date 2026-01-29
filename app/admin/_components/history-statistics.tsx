"use client";

import { useMemo } from "react";
import {
  Clock,
  Package,
  TrendingUp,
  AlertTriangle,
  Wrench,
  Play,
  Timer,
  LayoutList,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { CompletedSession, SessionStatusEvent } from "@/lib/data/admin-dashboard";
import type { StatusDictionary } from "@/lib/status";
import { HistoryCharts, type StatusSummary } from "./history-charts";

export type ComputedStats = {
  totalRuntimeMs: number;
  sessionCount: number;
  totalProducts: number;
  productsPerHour: number;
  scrapPercentage: number;
  setupTimeMs: number;
  productionTimeMs: number;
  stoppageTimeMs: number;
};

export type StatsMode = "total" | "average";

type HistoryStatisticsProps = {
  sessions: CompletedSession[];
  statusEvents: SessionStatusEvent[];
  dictionary: StatusDictionary;
  isLoading: boolean;
  statusData: StatusSummary[];
  comparisonStats?: ComputedStats | null;
  mode?: StatsMode;
};

type StatCardTheme = {
  gradient: string;
  iconBg: string;
  iconColor: string;
  accentBorder: string;
};

type StatItem = {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  theme: StatCardTheme;
  numericValue?: number;
  statKey?: string;
};

type StatGroup = {
  label: string;
  cols: number;
  items: StatItem[];
};

const formatDuration = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes} דק׳`;
  }
  if (minutes === 0) {
    return `${hours} שע׳`;
  }
  return `${hours} שע׳ ${minutes} דק׳`;
};

const formatNumber = (num: number): string => {
  return num.toLocaleString("he-IL");
};

const formatPercentage = (num: number): string => {
  return `${num.toFixed(1)}%`;
};

/** Compute statistics from sessions and status events. Reusable for both sides of compare mode. */
export const computeStats = (
  sessions: CompletedSession[],
  statusEvents: SessionStatusEvent[],
  dictionary: StatusDictionary,
): ComputedStats | null => {
  if (sessions.length === 0) return null;

  const totalRuntimeMs = sessions.reduce(
    (acc, session) => acc + (session.durationSeconds ?? 0) * 1000,
    0,
  );
  const sessionCount = sessions.length;
  const totalProducts = sessions.reduce(
    (acc, session) => acc + (session.totalGood ?? 0),
    0,
  );
  const totalScrap = sessions.reduce(
    (acc, session) => acc + (session.totalScrap ?? 0),
    0,
  );
  const totalProduced = totalProducts + totalScrap;
  const scrapPercentage = totalProduced > 0 ? (totalScrap / totalProduced) * 100 : 0;

  const nowTs = Date.now();
  const sessionEndTimes = new Map<string, number>();
  sessions.forEach((session) => {
    const endedAt = session.endedAt ?? session.startedAt;
    sessionEndTimes.set(session.id, new Date(endedAt).getTime());
  });

  const sessionIds = new Set(sessions.map((s) => s.id));
  const filteredEvents = statusEvents.filter((event) => sessionIds.has(event.sessionId));

  let productionTimeMs = 0;
  let setupTimeMs = 0;
  let stoppageTimeMs = 0;

  filteredEvents.forEach((event) => {
    const startTs = new Date(event.startedAt).getTime();
    const fallbackEndTs = sessionEndTimes.get(event.sessionId) ?? nowTs;
    const explicitEndTs = event.endedAt
      ? new Date(event.endedAt).getTime()
      : fallbackEndTs;
    const endTs = Math.min(explicitEndTs, fallbackEndTs, nowTs);
    const durationMs = endTs - startTs;

    if (Number.isNaN(durationMs) || durationMs <= 0) return;

    const statusDef = dictionary.global.get(event.status);
    if (!statusDef) {
      for (const bucket of dictionary.station.values()) {
        const stationDef = bucket.get(event.status);
        if (stationDef) {
          switch (stationDef.machine_state) {
            case "production": productionTimeMs += durationMs; break;
            case "setup": setupTimeMs += durationMs; break;
            case "stoppage": stoppageTimeMs += durationMs; break;
          }
          return;
        }
      }
      return;
    }

    switch (statusDef.machine_state) {
      case "production": productionTimeMs += durationMs; break;
      case "setup": setupTimeMs += durationMs; break;
      case "stoppage": stoppageTimeMs += durationMs; break;
    }
  });

  const productionHours = productionTimeMs / (1000 * 60 * 60);
  const productsPerHour = productionHours > 0 ? totalProducts / productionHours : 0;

  return {
    totalRuntimeMs,
    sessionCount,
    totalProducts,
    productsPerHour,
    scrapPercentage,
    setupTimeMs,
    productionTimeMs,
    stoppageTimeMs,
  };
};

// Semantic color themes for each stat type
const themes: Record<string, StatCardTheme> = {
  totalTime: {
    gradient: "from-slate-500/10 to-slate-600/5",
    iconBg: "bg-slate-500/15",
    iconColor: "text-slate-600 dark:text-slate-400",
    accentBorder: "border-r-slate-500",
  },
  sessions: {
    gradient: "from-blue-500/10 to-blue-600/5",
    iconBg: "bg-blue-500/15",
    iconColor: "text-blue-600 dark:text-blue-400",
    accentBorder: "border-r-blue-500",
  },
  products: {
    gradient: "from-emerald-500/10 to-emerald-600/5",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    accentBorder: "border-r-emerald-500",
  },
  throughput: {
    gradient: "from-cyan-500/10 to-cyan-600/5",
    iconBg: "bg-cyan-500/15",
    iconColor: "text-cyan-600 dark:text-cyan-400",
    accentBorder: "border-r-cyan-500",
  },
  scrap: {
    gradient: "from-rose-500/10 to-rose-600/5",
    iconBg: "bg-rose-500/15",
    iconColor: "text-rose-600 dark:text-rose-400",
    accentBorder: "border-r-rose-500",
  },
  setup: {
    gradient: "from-amber-500/10 to-amber-600/5",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-600 dark:text-amber-400",
    accentBorder: "border-r-amber-500",
  },
  production: {
    gradient: "from-green-500/10 to-green-600/5",
    iconBg: "bg-green-500/15",
    iconColor: "text-green-600 dark:text-green-400",
    accentBorder: "border-r-green-500",
  },
  stoppage: {
    gradient: "from-orange-500/10 to-orange-600/5",
    iconBg: "bg-orange-500/15",
    iconColor: "text-orange-600 dark:text-orange-400",
    accentBorder: "border-r-orange-500",
  },
};

const applyMode = (stats: ComputedStats, mode: StatsMode): ComputedStats => {
  if (mode === "total" || stats.sessionCount <= 1) return stats;
  const n = stats.sessionCount;
  return {
    totalRuntimeMs: stats.totalRuntimeMs / n,
    sessionCount: stats.sessionCount,
    totalProducts: stats.totalProducts / n,
    productsPerHour: stats.productsPerHour, // already a rate, no division needed
    scrapPercentage: stats.scrapPercentage, // already a percentage, no division needed
    setupTimeMs: stats.setupTimeMs / n,
    productionTimeMs: stats.productionTimeMs / n,
    stoppageTimeMs: stats.stoppageTimeMs / n,
  };
};

export const HistoryStatistics = ({
  sessions,
  statusEvents,
  dictionary,
  isLoading,
  statusData,
  comparisonStats,
  mode = "total",
}: HistoryStatisticsProps) => {
  const rawStats = useMemo(
    () => computeStats(sessions, statusEvents, dictionary),
    [sessions, statusEvents, dictionary],
  );

  const stats = useMemo(
    () => rawStats ? applyMode(rawStats, mode) : null,
    [rawStats, mode],
  );

  const adjustedComparisonStats = useMemo(
    () => comparisonStats ? applyMode(comparisonStats, mode) : null,
    [comparisonStats, mode],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, gi) => (
          <div key={gi}>
            <div className="h-3 w-12 bg-muted rounded mb-2" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: gi === 2 ? 1 : gi === 1 ? 3 : 4 }).map((_, i) => (
                <div
                  key={i}
                  className="relative overflow-hidden rounded-xl border border-border bg-card p-4 animate-pulse"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-8 w-8 rounded-lg bg-muted" />
                    <div className="h-3 w-14 bg-muted rounded" />
                  </div>
                  <div className="h-7 w-16 bg-muted rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-6 text-center text-muted-foreground">
        אין נתונים להצגה
      </div>
    );
  }

  const groups: StatGroup[] = [
    {
      label: "זמנים",
      cols: 4,
      items: [
        {
          label: "סה״כ זמן",
          value: formatDuration(stats.totalRuntimeMs),
          icon: <Clock className="h-4 w-4" />,
          theme: themes.totalTime,
          numericValue: stats.totalRuntimeMs,
          statKey: "totalRuntimeMs",
        },
        {
          label: "זמן ייצור",
          value: formatDuration(stats.productionTimeMs),
          icon: <Play className="h-4 w-4" />,
          theme: themes.production,
          numericValue: stats.productionTimeMs,
          statKey: "productionTimeMs",
        },
        {
          label: "זמן הכנה",
          value: formatDuration(stats.setupTimeMs),
          icon: <Wrench className="h-4 w-4" />,
          theme: themes.setup,
          numericValue: stats.setupTimeMs,
          statKey: "setupTimeMs",
        },
        {
          label: "זמן עצירה",
          value: formatDuration(stats.stoppageTimeMs),
          icon: <Timer className="h-4 w-4" />,
          theme: themes.stoppage,
          numericValue: stats.stoppageTimeMs,
          statKey: "stoppageTimeMs",
        },
      ],
    },
    {
      label: "ייצור",
      cols: 3,
      items: [
        {
          label: "מס׳ מוצרים",
          value: formatNumber(stats.totalProducts),
          icon: <Package className="h-4 w-4" />,
          theme: themes.products,
          numericValue: stats.totalProducts,
          statKey: "totalProducts",
        },
        {
          label: "מוצרים/שעה",
          value: formatNumber(Math.round(stats.productsPerHour)),
          subValue: "בזמן ייצור",
          icon: <TrendingUp className="h-4 w-4" />,
          theme: themes.throughput,
          numericValue: stats.productsPerHour,
          statKey: "productsPerHour",
        },
        {
          label: "אחוז פסילה",
          value: formatPercentage(stats.scrapPercentage),
          icon: <AlertTriangle className="h-4 w-4" />,
          theme: themes.scrap,
          numericValue: stats.scrapPercentage,
          statKey: "scrapPercentage",
        },
      ],
    },
    {
      label: "עבודות",
      cols: 1,
      items: [
        {
          label: "מס׳ עבודות",
          value: formatNumber(stats.sessionCount),
          icon: <LayoutList className="h-4 w-4" />,
          theme: themes.sessions,
          numericValue: stats.sessionCount,
          statKey: "sessionCount",
        },
      ],
    },
  ];

  const getComparisonIndicator = (item: StatItem) => {
    if (!adjustedComparisonStats || item.numericValue === undefined || !item.statKey) return null;
    const otherValue = adjustedComparisonStats[item.statKey as keyof ComputedStats] as number;
    if (otherValue === undefined) return null;

    const thisValue = item.numericValue;
    if (thisValue === otherValue) return null;
    if (thisValue === 0 && otherValue === 0) return null;

    const isHigher = thisValue > otherValue;
    return { isHigher };
  };

  const isCompareMode = Boolean(adjustedComparisonStats);

  const getCardClassName = (item: StatItem) => {
    const base = `relative overflow-hidden rounded-xl border border-border p-2 sm:p-3 transition-all duration-200 hover:shadow-md hover:border-border/80 border-r-[3px]`;

    if (!isCompareMode) {
      return `${base} bg-gradient-to-bl ${item.theme.gradient} ${item.theme.accentBorder}`;
    }

    const indicator = getComparisonIndicator(item);
    if (!indicator) {
      return `${base} bg-muted/30 border-r-muted-foreground/30`;
    }

    if (indicator.isHigher) {
      return `${base} bg-gradient-to-bl from-emerald-500/10 to-emerald-600/5 border-r-emerald-500`;
    }
    return `${base} bg-gradient-to-bl from-red-500/10 to-red-600/5 border-r-red-500`;
  };

  return (
    <div className={isCompareMode ? "space-y-4" : "grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start"}>
      {/* Stats cards */}
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">{group.label}</p>
            <div
              className={`grid grid-cols-2 gap-2.5 ${
                group.cols === 4
                  ? "sm:grid-cols-4"
                  : group.cols === 3
                    ? "sm:grid-cols-3"
                    : "sm:grid-cols-1 max-w-xs"
              }`}
            >
              {group.items.map((item) => {
                const indicator = isCompareMode ? getComparisonIndicator(item) : null;
                return (
                  <div
                    key={item.label}
                    className={getCardClassName(item)}
                  >
                    <div className="flex items-center gap-2 mb-1 sm:mb-1.5">
                      <div className={`p-0.5 sm:p-1 rounded-lg ${isCompareMode && indicator ? (indicator.isHigher ? "bg-emerald-500/15" : "bg-red-500/15") : item.theme.iconBg}`}>
                        <span className={isCompareMode && indicator ? (indicator.isHigher ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400") : item.theme.iconColor}>
                          {item.icon}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground tracking-wide">
                        {item.label}
                      </span>
                      {isCompareMode && indicator && (
                        <span className={`mr-auto ${indicator.isHigher ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {indicator.isHigher
                            ? <ArrowUp className="h-3.5 w-3.5" />
                            : <ArrowDown className="h-3.5 w-3.5" />
                          }
                        </span>
                      )}
                    </div>
                    <div className="text-base sm:text-lg font-bold text-foreground tracking-tight leading-none">
                      {item.value}
                    </div>
                    {item.subValue && (
                      <div className="text-[10px] text-muted-foreground mt-1 opacity-80">
                        {item.subValue}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Pie chart */}
      <HistoryCharts
        statusData={statusData}
        isLoading={isLoading}
        dictionary={dictionary}
      />
    </div>
  );
};
