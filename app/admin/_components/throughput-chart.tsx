"use client";

import { Button } from "@/components/ui/button";
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronLeft, ChevronRight, BarChart3 } from "lucide-react";

export type ThroughputSummary = {
  name: string;
  label: string;
  good: number;
  scrap: number;
  planned: number;
};

type ThroughputChartProps = {
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

const throughputColors = {
  good: "#10b981",
  scrap: "#ef4444",
  planned: "#f59e0b",
};

export const ThroughputChart = ({
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
}: ThroughputChartProps) => {
  const renderThroughputBars = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-[280px]">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
            </div>
            <p className="text-sm text-muted-foreground">טוען נתונים...</p>
          </div>
        </div>
      );
    }

    if (throughputData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
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
                strokeDasharray="3 3"
                stroke="hsl(var(--chart-grid))"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--chart-axis))" }}
                axisLine={{ stroke: "hsl(var(--chart-grid))" }}
                tickLine={false}
                interval={0}
              />
              <YAxis
                type="number"
                tick={{ fontSize: 11, fill: "hsl(var(--chart-axis))" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
                contentStyle={tooltipStyle}
                itemStyle={{ color: "hsl(var(--tooltip-text))" }}
                labelStyle={{ color: "hsl(var(--tooltip-text-muted))" }}
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
                dot={{ r: 3, fill: "hsl(var(--card))", strokeWidth: 2, stroke: throughputColors.planned }}
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
            <span className="text-muted-foreground">תקין</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded shrink-0"
              style={{ backgroundColor: throughputColors.scrap }}
            />
            <span className="text-muted-foreground">פסול</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-0.5 w-4 rounded shrink-0"
              style={{ backgroundColor: throughputColors.planned }}
            />
            <span className="text-muted-foreground">מתוכנן</span>
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
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[50px] text-center font-mono">
            {pageLabel}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNextPage}
            disabled={!canNextPage}
            aria-label="סט הבא"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">תפוקה לפי פק״ע</h3>
            <p className="text-xs text-muted-foreground">כמויות בחודש הנבחר</p>
          </div>
        </div>
        {/* Month Navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label="חודש הבא"
            onClick={onNextMonth}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs text-foreground/80 min-w-[80px] text-center font-medium">
            {monthLabel}
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="חודש קודם"
            onClick={onPrevMonth}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="p-5">
        {renderThroughputBars()}
      </div>
    </div>
  );
};
