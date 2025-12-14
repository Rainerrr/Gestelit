"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";
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
import type { StatusDictionary } from "@/lib/status";
import {
  getStatusBadgeFromDictionary,
  getStatusLabelFromDictionary,
} from "./status-dictionary";
import { SessionTimelineDialog } from "./session-timeline-dialog";

type ActiveSessionsTableProps = {
  sessions: ActiveSession[];
  now: number;
  isLoading: boolean;
  dictionary: StatusDictionary;
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
  dictionary,
}: ActiveSessionsTableProps) => {
  const [openSession, setOpenSession] = useState<ActiveSession | null>(null);

  const handleOpenTimeline = (sessionId: string) => {
    const target = sessions.find((item) => item.id === sessionId) ?? null;
    setOpenSession(target);
  };

  const handleKeyOpen = (sessionId: string, event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenTimeline(sessionId);
    }
  };

  const renderStatusBadge = (
    status: string | null,
    stationId: string | null,
  ) => {
    if (!status) {
      return (
        <Badge variant="secondary" className="bg-slate-100 text-slate-600">
          לא ידוע
        </Badge>
      );
    }

    return (
      <Badge className={getStatusBadgeFromDictionary(status, dictionary, stationId)}>
        {getStatusLabelFromDictionary(status, dictionary, stationId)}
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
          <div className="overflow-x-auto -mx-6 px-6">
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
              <TableRow
                key={session.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer transition-colors hover:bg-slate-50"
                aria-label={`ציר זמן לפק\"ע ${session.jobNumber}`}
                onClick={() => handleOpenTimeline(session.id)}
                onKeyDown={(event) => handleKeyOpen(session.id, event)}
              >
                <TableCell className="font-medium">
                  {session.jobNumber}
                </TableCell>
                <TableCell>{session.stationName}</TableCell>
                <TableCell>{session.workerName}</TableCell>
                <TableCell>
                  {renderStatusBadge(session.currentStatus, session.stationId)}
                </TableCell>
                <TableCell className="font-mono text-sm text-slate-800">
                  {getDurationLabel(session.startedAt, now)}
                </TableCell>
                <TableCell>{session.totalGood}</TableCell>
                <TableCell>{session.totalScrap}</TableCell>
              </TableRow>
            ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
  const selectedSession = openSession;

  return (
    <>
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
            <div className="overflow-x-auto -mx-6 px-6">
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
                    <TableRow
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                      aria-label={`ציר זמן לפק\"ע ${session.jobNumber}`}
                      onClick={() => handleOpenTimeline(session.id)}
                      onKeyDown={(event) => handleKeyOpen(session.id, event)}
                    >
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
            </div>
          )}
        </CardContent>
      </Card>

      {selectedSession ? (
        <SessionTimelineDialog
          session={{
            id: selectedSession.id,
            jobNumber: selectedSession.jobNumber,
            stationName: selectedSession.stationName,
            stationId: selectedSession.stationId,
            workerName: selectedSession.workerName,
            startedAt: selectedSession.startedAt,
            endedAt: null,
            currentStatus: selectedSession.currentStatus ?? null,
          }}
          open={Boolean(selectedSession)}
          onOpenChange={(next) =>
            setOpenSession(next ? selectedSession : null)
          }
        />
      ) : null}
    </>
  );
};


