"use client";

import { useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { PieChart as PieIcon } from "lucide-react";
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
  isLoading: boolean;
  dictionary: StatusDictionary;
};

const tooltipStyle = {
  backgroundColor: "hsl(var(--tooltip-bg))",
  border: "1px solid hsl(var(--tooltip-border))",
  borderRadius: "0.5rem",
  padding: "0.625rem 0.875rem",
  textAlign: "right" as const,
  color: "hsl(var(--tooltip-text))",
  fontSize: "0.8125rem",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
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

export const HistoryCharts = ({
  statusData,
  isLoading,
  dictionary,
}: HistoryChartsProps) => {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const renderStatusPie = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-[260px]">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
            </div>
            <p className="text-sm text-muted-foreground">טוען נתונים...</p>
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
        <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground">
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
                contentStyle={tooltipStyle}
                itemStyle={{ color: "hsl(var(--tooltip-text))" }}
                labelStyle={{ color: "hsl(var(--tooltip-text-muted))" }}
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
              <span className="text-muted-foreground">{entry.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            <PieIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">התפלגות סטטוסים</h3>
            <p className="text-xs text-muted-foreground">זמן בכל סטטוס</p>
          </div>
        </div>
      </div>
      <div className="p-5">
        {renderStatusPie()}
      </div>
    </div>
  );
};
