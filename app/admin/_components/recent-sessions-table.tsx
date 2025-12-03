"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CompletedSession } from "@/lib/data/admin-dashboard";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "./status-dictionary";

const getSessionStatusLabel = (session: CompletedSession): string => {
  if (session.forcedClosedAt && session.lastEventNote === "grace-window-expired") {
    return "נסגר עקב אי פעילות";
  }
  if (session.forcedClosedAt && session.lastEventNote === "worker-abandon") {
    return "נסגר על ידי העובד";
  }
  if (session.currentStatus) {
    return STATUS_LABELS[session.currentStatus];
  }
  return "לא ידוע";
};

type RecentSessionsTableProps = {
  sessions: CompletedSession[];
  isLoading: boolean;
};

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));

export const RecentSessionsTable = ({
  sessions,
  isLoading,
}: RecentSessionsTableProps) => {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">עבודות שהושלמו לאחרונה</CardTitle>
          <p className="text-sm text-slate-500">
            בקרה על הפקדות שנסגרו במערכת.
          </p>
        </div>
        <Badge variant="secondary">{sessions.length}</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-slate-500">טוען נתונים...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500">אין עבודות שהושלמו.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{"פק\"ע"}</TableHead>
                <TableHead>תחנה</TableHead>
                <TableHead>עובד</TableHead>
                <TableHead>זמן סיום</TableHead>
                <TableHead>משך</TableHead>
                <TableHead>סטטוס אחרון</TableHead>
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
                  <TableCell>{formatDateTime(session.endedAt)}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatDuration(session.durationSeconds)}
                  </TableCell>
                  <TableCell>
                    {getSessionStatusLabel(session)}
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


