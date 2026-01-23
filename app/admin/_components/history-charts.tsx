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
        <div className="flex items-center justify-center h-[200px]">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
            </div>
            <p className="text-sm text-muted-foreground">טוען...</p>
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
        <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
          <PieIcon className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-xs">אין נתונים</p>
        </div>
      );
    }

    const total = normalized.reduce((sum, item) => sum + item.value, 0);

    return (
      <div className="w-full">
        <div dir="ltr" className="w-full [direction:ltr]">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={normalized}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={72}
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
          className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-[11px]"
          dir="rtl"
        >
          {normalized.map((entry, index) => (
            <div
              key={entry.key ?? entry.label ?? index}
              className="flex items-center gap-1.5 cursor-pointer transition-all duration-200"
              style={{
                opacity: activeIndex !== undefined && activeIndex !== index ? 0.4 : 1,
              }}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(undefined)}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
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
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
          <PieIcon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <h3 className="text-xs font-medium text-muted-foreground">התפלגות סטטוסים</h3>
      </div>
      {renderStatusPie()}
    </div>
  );
};
