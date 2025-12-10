"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { STATUS_ORDER, STATUS_LABELS, getStatusHex } from "./status-dictionary";

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
};

type HistoryChartsProps = {
  statusData: StatusSummary[];
  throughputData: ThroughputSummary[];
  isLoading: boolean;
};

const tooltipStyle = {
  backgroundColor: "white",
  border: "1px solid #e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  textAlign: "right" as const,
};

const getStatusColor = (statusKey: string): string => getStatusHex(statusKey);

const formatDuration = (valueMs: number): string => {
  const totalMinutes = Math.max(0, Math.round(valueMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}ש ${minutes}דק`;
  }
  return `${minutes}דק`;
};

const throughputColors = {
  good: "#10b981",
  scrap: "#ef4444",
};

export const HistoryCharts = ({
  statusData,
  throughputData,
  isLoading,
}: HistoryChartsProps) => {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const renderStatusPie = () => {
    if (isLoading) {
      return <p className="text-sm text-slate-500">טוען תרשים...</p>;
    }

    const normalized = statusData
      .map((item) => ({
        ...item,
        label:
          item.label ??
          STATUS_LABELS[item.key as keyof typeof STATUS_LABELS] ??
          item.key,
      }))
      .filter((item) => item.value > 0);

    if (normalized.length === 0) {
      return <p className="text-sm text-slate-500">אין נתונים להצגה.</p>;
    }

    const total = normalized.reduce((sum, item) => sum + item.value, 0);

    return (
      <div className="w-full">
        <div dir="ltr" className="w-full [direction:ltr]">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={normalized}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(undefined)}
                animationBegin={0}
                animationDuration={600}
                animationEasing="ease-out"
              >
                {normalized.map((entry, index) => (
                  <Cell
                    key={entry.key ?? entry.label ?? index}
                    fill={getStatusColor(entry.key)}
                    style={{
                      filter:
                        activeIndex === index
                          ? "brightness(1.1)"
                          : activeIndex !== undefined
                            ? "opacity(0.5)"
                            : "none",
                      transition: "filter 0.2s ease",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => {
                  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
                  return [`${formatDuration(value)} (${percent}%)`, ""];
                }}
                labelFormatter={(label) => label}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div
          className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-slate-600"
          dir="rtl"
        >
          {normalized.map((entry, index) => (
            <div
              key={entry.key ?? entry.label ?? index}
              className="flex items-center gap-2 cursor-pointer transition-opacity shrink-0"
              style={{
                opacity: activeIndex !== undefined && activeIndex !== index ? 0.5 : 1,
              }}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(undefined)}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: getStatusColor(entry.key) }}
              />
              <span>{entry.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderThroughputBars = () => {
    if (isLoading) {
      return <p className="text-sm text-slate-500">טוען תרשים...</p>;
    }

    if (throughputData.length === 0) {
      return <p className="text-sm text-slate-500">אין נתוני תפוקה להצגה.</p>;
    }

    const normalized = throughputData.map((item) => ({
      ...item,
      label: item.label ?? item.name,
      good: item.good ?? 0,
      scrap: item.scrap ?? 0,
    }));

    return (
      <div dir="ltr" className="w-full overflow-visible [direction:ltr]">
        <div className="flex justify-center">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={normalized}
              margin={{ top: 12, right: 12, bottom: 24, left: 12 }}
              barCategoryGap={18}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#475569" }}
                interval={0}
              />
              <YAxis
                type="number"
                tick={{ fontSize: 11, fill: "#475569" }}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(15, 23, 42, 0.05)" }}
                contentStyle={tooltipStyle}
                formatter={(value, name) =>
                  [value as number, name === "good" ? "טוב" : "פסול"]
                }
                labelFormatter={(label) => `תחנה: ${label}`}
              />
              <Bar
                dataKey="good"
                name="טוב"
                radius={[6, 6, 0, 0]}
                fill={throughputColors.good}
              />
              <Bar
                dataKey="scrap"
                name="פסול"
                radius={[6, 6, 0, 0]}
                fill={throughputColors.scrap}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div
          className="mt-3 flex justify-center gap-4 text-xs text-slate-600"
          dir="rtl"
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: throughputColors.good }}
            />
            <span>טוב</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: throughputColors.scrap }}
            />
            <span>פסול</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="px-4 pb-3">
            <CardTitle className="text-lg">התפלגות סטטוסים</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">{renderStatusPie()}</CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="px-4 pb-3">
            <CardTitle className="text-lg">תפוקה לפי תחנה</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">{renderThroughputBars()}</CardContent>
        </Card>
      </div>
    </div>
  );
};





