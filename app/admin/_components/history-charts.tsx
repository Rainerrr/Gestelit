"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronLeft, ChevronRight, PieChart as PieIcon, BarChart3 } from "lucide-react";
import type { StatusDictionary } from "@/lib/status";
import {
  getStatusColorFromDictionary,
  getStatusLabelFromDictionary,
} from "./status-dictionary";

export type StatusSummary = {
  key: string;
  label: string;
  value: number;
};

export type ThroughputSummary = {
  name: string;
  label: string;
  good: number;
  scrap: number;
  planned: number;
};

type HistoryChartsProps = {
  statusData: StatusSummary[];
  throughputData: ThroughputSummary[];
  isLoading: boolean;
  monthLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canPrevPage: boolean;
  canNextPage: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  pageLabel: string;
  dictionary: StatusDictionary;
};

const darkTooltipStyle = {
  backgroundColor: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: "0.5rem",
  padding: "0.625rem 0.875rem",
  textAlign: "right" as const,
  color: "#fafafa",
  fontSize: "0.8125rem",
  boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
};

const getStatusColor = (
  statusKey: string,
  dictionary: StatusDictionary,
): string => getStatusColorFromDictionary(statusKey, dictionary);

const formatDuration = (valueMs: number): string => {
  const totalMinutes = Math.max(0, Math.round(valueMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}ש׳ ${minutes}דק׳`;
  }
  return `${minutes} דק׳`;
};

const throughputColors = {
  good: "#10b981",
  scrap: "#ef4444",
  planned: "#f59e0b",
};

export const HistoryCharts = ({
  statusData,
  throughputData,
  isLoading,
  monthLabel,
  onPrevMonth,
  onNextMonth,
  canPrevPage,
  canNextPage,
  onPrevPage,
  onNextPage,
  pageLabel,
  dictionary,
}: HistoryChartsProps) => {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const renderStatusPie = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-[260px]">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-500" />
            </div>
            <p className="text-sm text-zinc-500">טוען נתונים...</p>
          </div>
        </div>
      );
    }

    const normalized = statusData
      .map((item) => ({
        ...item,
        label:
          item.label ??
          getStatusLabelFromDictionary(item.key, dictionary) ??
          item.key,
      }))
      .filter((item) => item.value > 0);

    if (normalized.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-[260px] text-zinc-500">
          <PieIcon className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">אין נתונים להצגה</p>
        </div>
      );
    }

    const total = normalized.reduce((sum, item) => sum + item.value, 0);

    return (
      <div className="w-full">
        <div dir="ltr" className="w-full [direction:ltr]">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={normalized}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(undefined)}
                animationBegin={0}
                animationDuration={500}
                animationEasing="ease-out"
                stroke="transparent"
              >
                {normalized.map((entry, index) => (
                  <Cell
                    key={entry.key ?? entry.label ?? index}
                    fill={getStatusColor(entry.key, dictionary)}
                    style={{
                      filter:
                        activeIndex === index
                          ? "brightness(1.15)"
                          : activeIndex !== undefined
                            ? "opacity(0.4)"
                            : "none",
                      transition: "filter 0.2s ease",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={darkTooltipStyle}
                formatter={(value: number) => {
                  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
                  return [`${formatDuration(value)} (${percent}%)`, ""];
                }}
                labelFormatter={(label) => label}
                cursor={false}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div
          className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs"
          dir="rtl"
        >
          {normalized.map((entry, index) => (
            <div
              key={entry.key ?? entry.label ?? index}
              className="flex items-center gap-2 cursor-pointer transition-all duration-200"
              style={{
                opacity: activeIndex !== undefined && activeIndex !== index ? 0.4 : 1,
              }}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(undefined)}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: getStatusColor(entry.key, dictionary),
                }}
              />
              <span className="text-zinc-400">{entry.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderThroughputBars = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-[280px]">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-500" />
            </div>
            <p className="text-sm text-zinc-500">טוען נתונים...</p>
          </div>
        </div>
      );
    }

    if (throughputData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-[280px] text-zinc-500">
          <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">אין נתוני פק״ע בחודש זה</p>
        </div>
      );
    }

    const normalized = throughputData.map((item) => ({
      ...item,
      label: item.label ?? item.name,
      good: item.good ?? 0,
      scrap: item.scrap ?? 0,
      planned: item.planned ?? 0,
    }));

    return (
      <div className="w-full">
        <div dir="ltr" className="w-full overflow-visible [direction:ltr]">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart
              data={normalized}
              margin={{ top: 8, right: 8, bottom: 20, left: 8 }}
              barCategoryGap={16}
            >
              <CartesianGrid
                strokeDasharray="0"
                stroke="#27272a"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={{ stroke: "#3f3f46" }}
                tickLine={false}
                interval={0}
              />
              <YAxis
                type="number"
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(245, 158, 11, 0.05)" }}
                contentStyle={darkTooltipStyle}
                formatter={(value, _name, entry) => {
                  const dataKey = (entry && "dataKey" in entry ? entry.dataKey : undefined) as
                    | string
                    | undefined;
                  if (dataKey === "planned") {
                    return [value as number, "מתוכנן"];
                  }
                  if (dataKey === "good") {
                    return [value as number, "תקין"];
                  }
                  if (dataKey === "scrap") {
                    return [value as number, "פסול"];
                  }
                  return [value as number, ""];
                }}
                labelFormatter={(label) => `פק״ע: ${label}`}
              />
              <Bar
                dataKey="good"
                name="תקין"
                radius={[4, 4, 0, 0]}
                fill={throughputColors.good}
                maxBarSize={40}
              />
              <Bar
                dataKey="scrap"
                name="פסול"
                radius={[4, 4, 0, 0]}
                fill={throughputColors.scrap}
                maxBarSize={40}
              />
              <Line
                type="monotone"
                dataKey="planned"
                name="מתוכנן"
                stroke={throughputColors.planned}
                strokeWidth={2}
                dot={{ r: 3, fill: "#18181b", strokeWidth: 2, stroke: throughputColors.planned }}
                activeDot={{ r: 5, fill: throughputColors.planned }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div
          className="mt-2 flex flex-wrap items-center justify-center gap-5 text-xs"
          dir="rtl"
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded shrink-0"
              style={{ backgroundColor: throughputColors.good }}
            />
            <span className="text-zinc-400">תקין</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded shrink-0"
              style={{ backgroundColor: throughputColors.scrap }}
            />
            <span className="text-zinc-400">פסול</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-0.5 w-4 rounded shrink-0"
              style={{ backgroundColor: throughputColors.planned }}
            />
            <span className="text-zinc-400">מתוכנן</span>
          </div>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrevPage}
            disabled={!canPrevPage}
            aria-label="סט הקודם"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs text-zinc-500 min-w-[50px] text-center font-mono">
            {pageLabel}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNextPage}
            disabled={!canNextPage}
            aria-label="סט הבא"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {/* Status Distribution Card */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800">
              <PieIcon className="h-4 w-4 text-zinc-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">התפלגות סטטוסים</h3>
              <p className="text-xs text-zinc-500">זמן בכל סטטוס</p>
            </div>
          </div>
        </div>
        <div className="p-5">
          {renderStatusPie()}
        </div>
      </div>

      {/* Throughput Card */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800">
              <BarChart3 className="h-4 w-4 text-zinc-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">תפוקה לפי פק״ע</h3>
              <p className="text-xs text-zinc-500">כמויות בחודש הנבחר</p>
            </div>
          </div>
          {/* Month Navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              aria-label="חודש הבא"
              onClick={onNextMonth}
              className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-xs text-zinc-300 min-w-[80px] text-center font-medium">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="חודש קודם"
              onClick={onPrevMonth}
              className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="p-5">
          {renderThroughputBars()}
        </div>
      </div>
    </div>
  );
};
