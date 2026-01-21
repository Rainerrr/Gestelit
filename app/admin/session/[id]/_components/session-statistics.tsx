"use client";

import {
  LayoutList,
  Package,
  Trash2,
  Play,
  Wrench,
  Timer,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ProductionPeriod } from "@/app/api/admin/dashboard/session/[id]/route";

type SessionStatisticsProps = {
  totalGood: number;
  totalScrap: number;
  durationSeconds: number;
  stoppageTimeSeconds: number;
  setupTimeSeconds: number;
  productionPeriods: ProductionPeriod[];
  isActive: boolean;
  liveDurationSeconds?: number;
};

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

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

type StatRowProps = {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  value: string;
  valueColor?: string;
  isLast?: boolean;
};

const StatRow = ({ icon, iconColor, label, value, valueColor = "text-foreground", isLast = false }: StatRowProps) => (
  <div className={`flex items-center justify-between py-3 ${!isLast ? 'border-b border-border' : ''}`}>
    <div className="flex items-center gap-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
        {icon}
      </div>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
    <span className={`text-lg font-bold tabular-nums ${valueColor}`}>{value}</span>
  </div>
);

export const SessionStatistics = ({
  totalGood,
  totalScrap,
  durationSeconds,
  stoppageTimeSeconds,
  setupTimeSeconds,
  productionPeriods,
  isActive,
  liveDurationSeconds,
}: SessionStatisticsProps) => {
  // Calculate unique job items contributed to
  const uniqueJobItemIds = new Set(
    productionPeriods
      .filter((p) => p.jobItemId)
      .map((p) => p.jobItemId)
  );
  const jobItemCount = uniqueJobItemIds.size;

  // Use live duration for active sessions
  const effectiveDuration = isActive && liveDurationSeconds !== undefined
    ? liveDurationSeconds
    : durationSeconds;

  // Calculate production time
  const productionTimeSeconds = Math.max(
    0,
    effectiveDuration - stoppageTimeSeconds - setupTimeSeconds
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Production Section */}
      <Card className="border-border bg-card/50">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
            <Package className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-medium text-foreground">ייצור</h3>
          </div>
          <div className="flex flex-col">
            <StatRow
              icon={<LayoutList className="h-4 w-4 text-blue-500" />}
              iconColor="bg-blue-500/10"
              label="פריטי עבודה"
              value={formatNumber(jobItemCount)}
            />
            <StatRow
              icon={<Package className="h-4 w-4 text-emerald-500" />}
              iconColor="bg-emerald-500/10"
              label="תקינים"
              value={formatNumber(totalGood)}
              valueColor="text-emerald-500"
            />
            <StatRow
              icon={<Trash2 className="h-4 w-4 text-rose-500" />}
              iconColor="bg-rose-500/10"
              label="פסולים"
              value={formatNumber(totalScrap)}
              valueColor={totalScrap > 0 ? "text-rose-500" : "text-foreground"}
              isLast
            />
          </div>
        </CardContent>
      </Card>

      {/* Times Section */}
      <Card className="border-border bg-card/50">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
            <Timer className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-medium text-foreground">זמנים</h3>
          </div>
          <div className="flex flex-col">
            <StatRow
              icon={<Wrench className="h-4 w-4 text-amber-500" />}
              iconColor="bg-amber-500/10"
              label="הכנה"
              value={formatDuration(setupTimeSeconds)}
            />
            <StatRow
              icon={<Timer className="h-4 w-4 text-orange-500" />}
              iconColor="bg-orange-500/10"
              label="עצירה"
              value={formatDuration(stoppageTimeSeconds)}
              valueColor={stoppageTimeSeconds > 0 ? "text-orange-500" : "text-foreground"}
            />
            <StatRow
              icon={<Play className="h-4 w-4 text-green-500" />}
              iconColor="bg-green-500/10"
              label="ייצור"
              value={formatDuration(productionTimeSeconds)}
              valueColor="text-green-500"
              isLast
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
