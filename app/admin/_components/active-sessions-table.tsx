"use client";

import { memo, useMemo, useState, useSyncExternalStore } from "react";
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
import type { StatusDictionary } from "@/lib/status";
import {
  useAdminSession,
  useAdminSessionIds,
  useAdminSessionsLoading,
} from "@/contexts/AdminSessionsContext";
import {
  getStatusBadgeFromDictionary,
  getStatusLabelFromDictionary,
} from "./status-dictionary";
import { SessionTimelineDialog } from "./session-timeline-dialog";

type ActiveSessionsTableProps = {
  dictionary: StatusDictionary;
  isDictionaryLoading?: boolean;
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

let nowInterval: number | null = null;
let nowValue = Date.now();
const nowListeners = new Set<() => void>();

const getNow = () => nowValue;
const subscribeNow = (callback: () => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  nowListeners.add(callback);
  if (nowInterval === null) {
    nowInterval = window.setInterval(() => {
      nowValue = Date.now();
      nowListeners.forEach((listener) => listener());
    }, 1000);
  }

  return () => {
    nowListeners.delete(callback);
    if (nowListeners.size === 0 && nowInterval !== null) {
      window.clearInterval(nowInterval);
      nowInterval = null;
    }
  };
};

const useNow = () =>
  useSyncExternalStore(subscribeNow, getNow, () => Date.now());

type RowProps = {
  sessionId: string;
  dictionary: StatusDictionary;
  onOpenTimeline: (sessionId: string) => void;
};

const SessionRow = memo(
  ({ sessionId, dictionary, onOpenTimeline }: RowProps) => {
    const session = useAdminSession(sessionId);
    const now = useNow();
    const duration = useMemo(
      () => (session ? getDurationLabel(session.startedAt, now) : "-"),
      [session, now],
    );

    if (!session) {
      return null;
    }

    const handleKeyOpen = (sessionId: string, event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpenTimeline(sessionId);
      }
    };

    const renderStatusBadge = (
      status: string | null,
      stationId: string | null,
    ) => {
      if (!status) {
        return (
          <Badge variant="secondary" className="bg-slate-100 text-slate-600">
            ללא סטטוס
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
      <TableRow
        role="button"
        tabIndex={0}
        className="cursor-pointer transition-colors hover:bg-slate-50"
        aria-label={`תחנה פעילה עבור עבודה ${session.jobNumber}`}
        onClick={() => onOpenTimeline(session.id)}
        onKeyDown={(event) => handleKeyOpen(session.id, event)}
      >
        <TableCell className="font-medium">{session.jobNumber}</TableCell>
        <TableCell>{session.stationName}</TableCell>
        <TableCell>{session.workerName}</TableCell>
        <TableCell>
          {renderStatusBadge(session.currentStatus, session.stationId)}
        </TableCell>
        <TableCell className="font-mono text-sm text-slate-800">
          {duration}
        </TableCell>
        <TableCell>{session.totalGood}</TableCell>
        <TableCell>{session.totalScrap}</TableCell>
      </TableRow>
    );
  },
  (prev, next) =>
    prev.sessionId === next.sessionId && prev.dictionary === next.dictionary,
);

SessionRow.displayName = "SessionRow";

const ActiveSessionsTableComponent = ({
  dictionary,
  isDictionaryLoading = false,
}: ActiveSessionsTableProps) => {
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const sessionIds = useAdminSessionIds();
  const isLoading = useAdminSessionsLoading() || isDictionaryLoading;

  const sortedSessions = useMemo(() => [...sessionIds], [sessionIds]);

  const handleOpenTimeline = (sessionId: string) => {
    setOpenSessionId(sessionId);
  };

  const selectedSession = useAdminSession(openSessionId);

  return (
    <>
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-lg">תחנות פעילות</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">טוען תחנות פעילות...</p>
          ) : sortedSessions.length === 0 ? (
            <p className="text-sm text-slate-500">אין תחנות פעילות.</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>עבודה</TableHead>
                    <TableHead>תחנה</TableHead>
                    <TableHead>עובד</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>משך (שעות:דקות:שניות)</TableHead>
                    <TableHead>כמות תקינה</TableHead>
                    <TableHead>כמות פסולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSessions.map((sessionId) => (
                    <SessionRow
                      key={sessionId}
                      sessionId={sessionId}
                      dictionary={dictionary}
                      onOpenTimeline={handleOpenTimeline}
                    />
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
          open
          onOpenChange={(next) =>
            setOpenSessionId(next ? selectedSession.id : null)
          }
        />
      ) : null}
    </>
  );
};

const areEqual = (
  prev: ActiveSessionsTableProps,
  next: ActiveSessionsTableProps,
) => {
  return (
    prev.dictionary === next.dictionary &&
    prev.isDictionaryLoading === next.isDictionaryLoading
  );
};

export const ActiveSessionsTable = memo(ActiveSessionsTableComponent, areEqual);
