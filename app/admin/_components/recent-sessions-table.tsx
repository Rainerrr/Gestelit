"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";
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
import type { StatusDictionary } from "@/lib/status";
import {
  getStatusBadgeFromDictionary,
  getStatusLabelFromDictionary,
} from "./status-dictionary";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { SessionTimelineDialog } from "./session-timeline-dialog";

const getSessionStatusLabel = (
  session: CompletedSession,
  dictionary: StatusDictionary,
): { label: string; badgeClass: string } => {
  if (session.forcedClosedAt && session.lastEventNote === "grace-window-expired") {
    return {
      label: "נסגר עקב אי פעילות",
      badgeClass: "bg-amber-100 text-amber-800",
    };
  }
  if (session.forcedClosedAt && session.lastEventNote === "worker-abandon") {
    return {
      label: "נסגר על ידי העובד",
      badgeClass: "bg-amber-100 text-amber-800",
    };
  }
  if (session.currentStatus) {
    return {
      label: getStatusLabelFromDictionary(
        session.currentStatus,
        dictionary,
        session.stationId,
      ),
      badgeClass: getStatusBadgeFromDictionary(
        session.currentStatus,
        dictionary,
        session.stationId,
      ),
    };
  }
  return { label: "לא ידוע", badgeClass: "bg-slate-100 text-slate-600" };
};

type RecentSessionsTableProps = {
  sessions: CompletedSession[];
  isLoading: boolean;
  selectedIds?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
  sortKey?:
    | "jobNumber"
    | "stationName"
    | "workerName"
    | "endedAt"
    | "durationSeconds"
    | "status"
    | "totalGood"
    | "totalScrap";
  sortDirection?: "asc" | "desc";
  onSort?: (
    key:
      | "jobNumber"
      | "stationName"
      | "workerName"
      | "endedAt"
      | "durationSeconds"
      | "status"
      | "totalGood"
      | "totalScrap",
  ) => void;
  dictionary: StatusDictionary;
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
  selectedIds,
  onToggleRow,
  onToggleAll,
  sortKey,
  sortDirection,
  onSort,
  dictionary,
}: RecentSessionsTableProps) => {
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const selectionEnabled = Boolean(selectedIds && onToggleRow && onToggleAll);
  const allSelected =
    selectionEnabled &&
    sessions.length > 0 &&
    selectedIds !== undefined &&
    sessions.every((session) => selectedIds.has(session.id));

  const handleRowOpen = (sessionId: string) => {
    setOpenSessionId(sessionId);
  };

  const handleRowKeyOpen = (sessionId: string, event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleRowOpen(sessionId);
    }
  };

  const selectedSession = openSessionId
    ? sessions.find((s) => s.id === openSessionId) ?? null
    : null;

  return (
    <>
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
            <div className="w-full">
              <Table className="w-full text-sm">
                <TableHeader className="[position:sticky] top-0 z-10 bg-blue-50">
                  <TableRow className="text-sm text-slate-700">
                    {selectionEnabled ? (
                      <TableHead className="w-10 text-right px-2 py-2">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(checked) =>
                            onToggleAll?.(checked === true)
                          }
                          aria-label="בחירת כל העבודות"
                        />
                      </TableHead>
                    ) : null}
                    {[
                      { key: "jobNumber", label: 'פק"ע' },
                      { key: "stationName", label: "תחנה" },
                      { key: "workerName", label: "עובד" },
                      { key: "endedAt", label: "זמן סיום" },
                      { key: "durationSeconds", label: "משך" },
                      { key: "totalGood", label: "כמות טובה" },
                      { key: "totalScrap", label: "כמות פסולה" },
                      { key: "status", label: "סטטוס אחרון" },
                    ].map((column) => {
                      const isSorted = sortKey === column.key;
                      const ariaSort =
                        isSorted && sortDirection
                          ? sortDirection === "asc"
                            ? "ascending"
                            : "descending"
                          : "none";
                      return (
                        <TableHead
                          key={column.key}
                          className="text-right px-2 py-2 text-xs sm:text-sm"
                          aria-sort={ariaSort}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onSort?.(column.key as NonNullable<typeof sortKey>)
                            }
                            className="flex w-full items-center justify-between gap-1 rounded-md px-1 py-1 transition hover:bg-blue-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                          >
                            <span>{column.label}</span>
                            <span className="text-xs text-slate-400">
                              {isSorted
                                ? sortDirection === "asc"
                                  ? "▲"
                                  : "▼"
                                : ""}
                            </span>
                          </button>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => {
                    const isSelected = selectedIds?.has(session.id);
                    return (
                      <TableRow
                        key={session.id}
                        className={cn(
                          "text-sm cursor-pointer transition-colors",
                          isSelected
                            ? "bg-slate-100/80 border border-slate-200"
                            : "hover:bg-slate-50",
                        )}
                        role="button"
                        tabIndex={0}
                        aria-label={`ציר זמן לפק\"ע ${session.jobNumber}`}
                        onClick={() => handleRowOpen(session.id)}
                        onKeyDown={(event) => handleRowKeyOpen(session.id, event)}
                      >
                        {selectionEnabled ? (
                          <TableCell
                            className="w-10 px-2 py-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => onToggleRow?.(session.id)}
                              aria-label="בחירת עבודה"
                            />
                          </TableCell>
                        ) : null}
                        <TableCell className="px-2 py-2 text-xs sm:text-sm break-words">
                          {session.jobNumber}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-xs sm:text-sm break-words">
                          {session.stationName}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-xs sm:text-sm break-words">
                          {session.workerName}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-xs sm:text-sm break-words">
                          {formatDateTime(session.endedAt)}
                        </TableCell>
                        <TableCell className="font-mono px-2 py-2 text-xs sm:text-sm">
                          {formatDuration(session.durationSeconds)}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-xs sm:text-sm break-words">
                          {session.totalGood}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-xs sm:text-sm break-words">
                          {session.totalScrap}
                        </TableCell>
                        <TableCell className="px-2 py-2 text-xs sm:text-sm break-words">
                          {(() => {
                            const statusLabel = getSessionStatusLabel(
                              session,
                              dictionary,
                            );
                            return (
                              <Badge className={statusLabel.badgeClass}>
                                {statusLabel.label}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
            endedAt: selectedSession.endedAt,
            currentStatus: selectedSession.currentStatus ?? null,
          }}
          open
          onOpenChange={(next) => setOpenSessionId(next ? selectedSession.id : null)}
        />
      ) : null}
    </>
  );
};

