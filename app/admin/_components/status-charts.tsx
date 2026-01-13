"use client";

import { memo, useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { StatusDictionary } from "@/lib/status";
import { PieChartIcon } from "lucide-react";
import {
  getStatusColorFromDictionary,
} from "./status-dictionary";
import { LiveJobProgress } from "./live-job-progress";
import type { ReactNode } from "react";

type StatusDataPoint = {
  key: string;
  label: string;
  value: number;
};

type StatusChartsProps = {
  statusData: StatusDataPoint[];
  isLoading: boolean;
  dictionary: StatusDictionary;
  /** Optional widget to render alongside the pie chart on desktop */
  sideWidget?: ReactNode;
};

const tooltipStyle = {
  backgroundColor: "hsl(var(--tooltip-bg))",
  border: "1px solid hsl(var(--tooltip-border))",
  borderRadius: "0.5rem",
  padding: "0.75rem 1rem",
  textAlign: "right" as const,
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
};

const getStatusColor = (
  statusKey: string,
  dictionary: StatusDictionary,
): string => getStatusColorFromDictionary(statusKey, dictionary);

const ChartCard = ({
  title,
  icon: Icon,
  children
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode
}) => (
  <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
    <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
    </div>
    <div className="p-5">
      {children}
    </div>
  </div>
);

const StatusChartsComponent = ({
  statusData,
  isLoading,
  dictionary,
  sideWidget,
}: StatusChartsProps) => {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const normalizedStatusData = useMemo(
    () =>
      statusData
        .map((item) => ({
          ...item,
          label: item.label ?? item.key,
        }))
        .filter((item) => item.value > 0),
    [statusData],
  );

  const renderStatusPie = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
            </div>
            <p className="text-sm text-muted-foreground">טוען סטטוסים...</p>
          </div>
        </div>
      );
    }

    if (normalizedStatusData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-4">
            <PieChartIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">אין סטטוסים להצגה</p>
        </div>
      );
    }

    const onPieEnter = (_: unknown, index: number) => {
      setActiveIndex(index);
    };

    const onPieLeave = () => {
      setActiveIndex(undefined);
    };

    const total = normalizedStatusData.reduce((sum, item) => sum + item.value, 0);

    return (
      <div className="w-full">
        <div dir="ltr" className="w-full [direction:ltr]">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={normalizedStatusData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={3}
                onMouseEnter={onPieEnter}
                onMouseLeave={onPieLeave}
                isAnimationActive
                animationDuration={600}
              >
                {normalizedStatusData.map((entry, index) => (
                  <Cell
                    key={entry.key ?? entry.label ?? index}
                    fill={getStatusColor(entry.key, dictionary)}
                    style={{
                      filter: activeIndex === index ? "brightness(1.2)" : activeIndex !== undefined ? "opacity(0.4)" : "none",
                      transition: "filter 0.2s ease",
                      cursor: "pointer",
                    }}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: "hsl(var(--tooltip-text))" }}
                labelStyle={{ color: "hsl(var(--tooltip-text-muted))", marginBottom: "4px" }}
                formatter={(value: number) => {
                  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
                  return [`${value} (${percent}%)`, ""];
                }}
                labelFormatter={(label) => label}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2.5 text-xs" dir="rtl">
          {normalizedStatusData.map((entry, index) => (
            <button
              type="button"
              key={entry.key ?? entry.label ?? index}
              className="flex items-center gap-2 cursor-pointer transition-all duration-200 rounded-lg px-2 py-1 hover:bg-accent"
              style={{
                opacity: activeIndex !== undefined && activeIndex !== index ? 0.4 : 1,
              }}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(undefined)}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-border"
                style={{ backgroundColor: getStatusColor(entry.key, dictionary) }}
              />
              <span className="text-foreground/80">{entry.label}</span>
              <span className="text-muted-foreground font-mono">({entry.value})</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Top row: Side widget first on mobile (for visibility), then pie chart */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-2">
        {/* On mobile: widget shows first. On desktop: shown second (order-last) */}
        {sideWidget && (
          <div className="xl:order-last">
            {sideWidget}
          </div>
        )}
        <ChartCard title="פיזור סטטוסים" icon={PieChartIcon}>
          {renderStatusPie()}
        </ChartCard>
      </div>

      {/* Bottom row: Live Job Progress - full width */}
      <LiveJobProgress />
    </div>
  );
};

const statusDataEqual = (a: StatusDataPoint[], b: StatusDataPoint[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const prev = a[i];
    const next = b[i];
    if (prev.key !== next.key) return false;
    if (prev.label !== next.label) return false;
    if (prev.value !== next.value) return false;
  }
  return true;
};

const areEqual = (prev: StatusChartsProps, next: StatusChartsProps) => {
  if (prev.isLoading !== next.isLoading) return false;
  if (prev.dictionary !== next.dictionary) return false;
  if (prev.sideWidget !== next.sideWidget) return false;
  if (!statusDataEqual(prev.statusData, next.statusData)) return false;
  return true;
};

export const StatusCharts = memo(StatusChartsComponent, areEqual);
