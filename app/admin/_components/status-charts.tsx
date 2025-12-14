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
import type { StatusDictionary } from "@/lib/status";
import {
  getStatusColorFromDictionary,
} from "./status-dictionary";

type StatusDataPoint = {
  key: string;
  label: string;
  value: number;
};

type ThroughputDataPoint = {
  name: string;
  label: string;
  good: number;
  scrap: number;
};

type StatusChartsProps = {
  statusData: StatusDataPoint[];
  throughputData: ThroughputDataPoint[];
  isLoading: boolean;
  dictionary: StatusDictionary;
};

const tooltipStyle = {
  backgroundColor: "white",
  border: "1px solid #e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  textAlign: "right" as const,
};

const getStatusColor = (
  statusKey: string,
  dictionary: StatusDictionary,
): string => getStatusColorFromDictionary(statusKey, dictionary);
const throughputColors = {
  good: "#10b981",
  scrap: "#ef4444",
};

export const StatusCharts = ({
  statusData,
  throughputData,
  isLoading,
  dictionary,
}: StatusChartsProps) => {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const renderStatusPie = () => {

    if (isLoading) {
      return <p className="text-sm text-slate-500">טוען תרשים...</p>;
    }

    if (statusData.length === 0) {
      return <p className="text-sm text-slate-500">אין עבודות פעילות להצגה.</p>;
    }

    const normalized = statusData
      .map((item) => ({
        ...item,
        label: item.label ?? item.key,
      }))
      .filter((item) => item.value > 0);

    if (normalized.length === 0) {
      return <p className="text-sm text-slate-500">אין עבודות פעילות להצגה.</p>;
    }

    const onPieEnter = (_: unknown, index: number) => {
      setActiveIndex(index);
    };

    const onPieLeave = () => {
      setActiveIndex(undefined);
    };

    const total = normalized.reduce((sum, item) => sum + item.value, 0);

    return (
      <div className="w-full">
        <div dir="ltr" className="w-full [direction:ltr]">
          <ResponsiveContainer width="100%" height={240} className="sm:h-[280px]">
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
                onMouseEnter={onPieEnter}
                onMouseLeave={onPieLeave}
                animationBegin={0}
                animationDuration={600}
                animationEasing="ease-out"
              >
                {normalized.map((entry, index) => (
                  <Cell
                    key={entry.key ?? entry.label ?? index}
                    fill={getStatusColor(entry.key, dictionary)}
                    style={{
                      filter: activeIndex === index ? "brightness(1.1)" : activeIndex !== undefined ? "opacity(0.5)" : "none",
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
                  return [`${value} (${percent}%)`, ""];
                }}
                labelFormatter={(label) => label}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-slate-600" dir="rtl">
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
                style={{ backgroundColor: getStatusColor(entry.key, dictionary) }}
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
      return <p className="text-sm text-slate-500">אין נתוני תפוקה מהעבודות הפעילות.</p>;
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
          <ResponsiveContainer width="100%" height={280} className="sm:h-[320px]">
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

        <div className="mt-3 flex justify-center gap-4 text-xs text-slate-600" dir="rtl">
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
      <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
            <CardTitle className="text-base sm:text-lg">התפלגות סטטוסים</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            {renderStatusPie()}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
            <CardTitle className="text-base sm:text-lg">תפוקה לפי תחנה</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            {renderThroughputBars()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
