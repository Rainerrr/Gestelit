"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActiveSession } from "@/lib/data/admin-dashboard";
import type { StatusEventState } from "@/lib/types";
import {
  STATUS_BADGE_STYLES,
  STATUS_LABELS,
} from "./status-dictionary";

type ActiveSessionsTableProps = {
  sessions: ActiveSession[];
  now: number;
  isLoading: boolean;
};

const getDurationLabel = (startedAt: string, now: number): string => {
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) {
    return "-";
  }

  const diffSeconds = Math.max(0, Math.floor((now - start) / 1000));
  const hours = Math.floor(diffSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((diffSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(diffSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
};

export const ActiveSessionsTable = ({
  sessions,
  now,
  isLoading,
}: ActiveSessionsTableProps) => {
  const renderStatusBadge = (status: StatusEventState | null) => {
    if (!status) {
      return (
        <Badge variant="secondary" className="bg-slate-100 text-slate-600">
          לא ידוע
        </Badge>
      );
    }

    return (
      <Badge className={STATUS_BADGE_STYLES[status]}>
        {STATUS_LABELS[status]}
      </Badge>
    );
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg">עבודות פעילות</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-slate-500">טוען נתונים בזמן אמת...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500">אין עבודות פעילות כרגע.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{"פק\"ע"}</TableHead>
                <TableHead>תחנה</TableHead>
                <TableHead>עובד</TableHead>
                <TableHead>סטטוס נוכחי</TableHead>
                <TableHead>זמן ריצה (שעות:דקות:שניות)</TableHead>
                <TableHead>כמות טובה</TableHead>
                <TableHead>כמות פסולה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="font-medium">
                    {session.jobNumber}
                  </TableCell>
                  <TableCell>{session.stationName}</TableCell>
                  <TableCell>{session.workerName}</TableCell>
                  <TableCell>{renderStatusBadge(session.currentStatus)}</TableCell>
                  <TableCell className="font-mono text-sm text-slate-800">
                    {getDurationLabel(session.startedAt, now)}
                  </TableCell>
                  <TableCell>{session.totalGood}</TableCell>
                  <TableCell>{session.totalScrap}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};


