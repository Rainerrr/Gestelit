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
} from "lucide-react";
import type { CompletedSession, SessionStatusEvent } from "@/lib/data/admin-dashboard";
import type { StatusDictionary } from "@/lib/status";

type HistoryStatisticsProps = {
  sessions: CompletedSession[];
  statusEvents: SessionStatusEvent[];
  dictionary: StatusDictionary;
  isLoading: boolean;
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

export const HistoryStatistics = ({
  sessions,
  statusEvents,
  dictionary,
  isLoading,
}: HistoryStatisticsProps) => {
  const stats = useMemo(() => {
    if (sessions.length === 0) {
      return null;
    }

    // Total runtime (sum of all session durations)
    const totalRuntimeMs = sessions.reduce((acc, session) => {
      const durationMs = (session.durationSeconds ?? 0) * 1000;
      return acc + durationMs;
    }, 0);

    // Number of sessions
    const sessionCount = sessions.length;

    // Number of products (good_count only)
    const totalProducts = sessions.reduce(
      (acc, session) => acc + (session.totalGood ?? 0),
      0
    );

    // Total scrap
    const totalScrap = sessions.reduce(
      (acc, session) => acc + (session.totalScrap ?? 0),
      0
    );

    // Scrap percentage
    const totalProduced = totalProducts + totalScrap;
    const scrapPercentage = totalProduced > 0 ? (totalScrap / totalProduced) * 100 : 0;

    // Calculate time by machine state from status events
    const nowTs = Date.now();
    const sessionEndTimes = new Map<string, number>();
    sessions.forEach((session) => {
      const endedAt = session.endedAt ?? session.startedAt;
      sessionEndTimes.set(session.id, new Date(endedAt).getTime());
    });

    // Filter status events to only those belonging to filtered sessions
    const sessionIds = new Set(sessions.map((s) => s.id));
    const filteredEvents = statusEvents.filter((event) =>
      sessionIds.has(event.sessionId)
    );

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

      if (Number.isNaN(durationMs) || durationMs <= 0) {
        return;
      }

      // Get machine state from status definition
      const statusDef = dictionary.global.get(event.status);
      if (!statusDef) {
        // Check station-scoped statuses
        for (const bucket of dictionary.station.values()) {
          const stationDef = bucket.get(event.status);
          if (stationDef) {
            switch (stationDef.machine_state) {
              case "production":
                productionTimeMs += durationMs;
                break;
              case "setup":
                setupTimeMs += durationMs;
                break;
              case "stoppage":
                stoppageTimeMs += durationMs;
                break;
            }
            return;
          }
        }
        return;
      }

      switch (statusDef.machine_state) {
        case "production":
          productionTimeMs += durationMs;
          break;
        case "setup":
          setupTimeMs += durationMs;
          break;
        case "stoppage":
          stoppageTimeMs += durationMs;
          break;
      }
    });

    // Products per hour (based on production time only)
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
  }, [sessions, statusEvents, dictionary]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
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
    );
  }

  if (!stats) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-6 text-center text-muted-foreground">
        אין נתונים להצגה
      </div>
    );
  }

  const statItems: StatItem[] = [
    {
      label: "סה״כ זמן",
      value: formatDuration(stats.totalRuntimeMs),
      icon: <Clock className="h-4 w-4" />,
      theme: themes.totalTime,
    },
    {
      label: "מס׳ עבודות",
      value: formatNumber(stats.sessionCount),
      icon: <LayoutList className="h-4 w-4" />,
      theme: themes.sessions,
    },
    {
      label: "מס׳ מוצרים",
      value: formatNumber(stats.totalProducts),
      icon: <Package className="h-4 w-4" />,
      theme: themes.products,
    },
    {
      label: "מוצרים/שעה",
      value: formatNumber(Math.round(stats.productsPerHour)),
      subValue: "בזמן ייצור",
      icon: <TrendingUp className="h-4 w-4" />,
      theme: themes.throughput,
    },
    {
      label: "אחוז פסילה",
      value: formatPercentage(stats.scrapPercentage),
      icon: <AlertTriangle className="h-4 w-4" />,
      theme: themes.scrap,
    },
    {
      label: "זמן הכנה",
      value: formatDuration(stats.setupTimeMs),
      icon: <Wrench className="h-4 w-4" />,
      theme: themes.setup,
    },
    {
      label: "זמן ייצור",
      value: formatDuration(stats.productionTimeMs),
      icon: <Play className="h-4 w-4" />,
      theme: themes.production,
    },
    {
      label: "זמן עצירה",
      value: formatDuration(stats.stoppageTimeMs),
      icon: <Timer className="h-4 w-4" />,
      theme: themes.stoppage,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {statItems.map((item) => (
        <div
          key={item.label}
          className={`
            relative overflow-hidden rounded-xl border border-border
            bg-gradient-to-bl ${item.theme.gradient}
            p-4 transition-all duration-200
            hover:shadow-md hover:border-border/80
            border-r-[3px] ${item.theme.accentBorder}
          `}
        >
          {/* Header with icon and label */}
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-1.5 rounded-lg ${item.theme.iconBg}`}>
              <span className={item.theme.iconColor}>{item.icon}</span>
            </div>
            <span className="text-xs font-medium text-muted-foreground tracking-wide">
              {item.label}
            </span>
          </div>

          {/* Value */}
          <div className="text-xl font-bold text-foreground tracking-tight leading-none">
            {item.value}
          </div>

          {/* Sub-value if exists */}
          {item.subValue && (
            <div className="text-[10px] text-muted-foreground mt-1 opacity-80">
              {item.subValue}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
