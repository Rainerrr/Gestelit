"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type StatusDataPoint = {
  key: string;
  label: string;
  value: number;
};

type ThroughputDataPoint = {
  name: string;
  label: string;
  value: number;
};

type StatusChartsProps = {
  statusData: StatusDataPoint[];
  throughputData: ThroughputDataPoint[];
  isLoading: boolean;
};

const tooltipStyle = {
  backgroundColor: "white",
  border: "1px solid #e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  textAlign: "right" as const,
};

export const StatusCharts = ({
  statusData,
  throughputData,
  isLoading,
}: StatusChartsProps) => {
  const renderChart = (
    data: Array<StatusDataPoint | ThroughputDataPoint>,
    emptyLabel: string,
    barColor: string,
  ) => {
    if (isLoading) {
      return <p className="text-sm text-slate-500">טוען תרשים...</p>;
    }

    if (data.length === 0) {
      return <p className="text-sm text-slate-500">{emptyLabel}</p>;
    }

    return (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label" // for status data
            tick={{ fontSize: 12, fill: "#475569" }}
            width={120}
          />
          <Tooltip
            cursor={{ fill: "rgba(15, 23, 42, 0.05)" }}
            contentStyle={tooltipStyle}
          />
          <Bar
            dataKey="value"
            radius={[6, 6, 6, 6]}
            barSize={18}
            fill={barColor}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">התפלגות סטטוסים</CardTitle>
        </CardHeader>
        <CardContent>
          {renderChart(
            statusData,
            "אין עבודות פעילות להצגה.",
            "hsl(142, 71%, 45%)",
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">תפוקה לפי תחנה</CardTitle>
        </CardHeader>
        <CardContent>
          {renderChart(
            throughputData,
            "אין נתוני תפוקה מהעבודות הפעילות.",
            "hsl(222, 47%, 11%)",
          )}
        </CardContent>
      </Card>
    </div>
  );
};


