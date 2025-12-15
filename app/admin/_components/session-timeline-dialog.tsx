"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SessionTimeline } from "./session-timeline";
import { useSessionTimeline } from "@/hooks/useSessionTimeline";
import {
  getStatusBadgeFromDictionary,
  getStatusLabelFromDictionary,
  useStatusDictionary,
} from "./status-dictionary";
import type { StatusEventState } from "@/lib/types";

type SessionTimelineDialogProps = {
  session: {
    id: string;
    jobNumber: string;
    stationName: string;
    stationId?: string | null;
    workerName: string;
    startedAt: string;
    endedAt?: string | null;
    currentStatus?: StatusEventState | null;
  };
  open: boolean;
  onOpenChange: (next: boolean) => void;
};

export const SessionTimelineDialog = ({
  session,
  open,
  onOpenChange,
}: SessionTimelineDialogProps) => {
  const { dictionary, statuses } = useStatusDictionary(
    session.stationId ? [session.stationId] : [],
  );
  const timeline = useSessionTimeline({
    sessionId: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? null,
    currentStatus: session.currentStatus ?? null,
    stationId: session.stationId ?? null,
    statusDefinitions: statuses,
  });

  const renderStatusBadge = (status: StatusEventState | null | undefined) => {
    if (!status) {
      return (
        <Badge variant="secondary" className="bg-slate-100 text-slate-600">
          ללא סטטוס
        </Badge>
      );
    }
    return (
      <Badge
        className={getStatusBadgeFromDictionary(
          status,
          dictionary,
          session.stationId ?? undefined,
        )}
      >
        {getStatusLabelFromDictionary(
          status,
          dictionary,
          session.stationId ?? undefined,
        )}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[1200px] max-h-[90vh] overflow-visible text-right">
        <DialogHeader className="text-right">
          <DialogTitle className="text-lg">
            ציר זמן תחנה - עבודה {session.jobNumber}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            סקירה של הסטטוסים האחרונים בתחנה זו.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-slate-700">
              <p className="font-semibold text-slate-900">
                {session.stationName}
              </p>
              <p className="text-xs text-slate-500">{session.workerName}</p>
            </div>
            {renderStatusBadge(session.currentStatus)}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <Badge variant="outline" className="bg-white text-slate-700">
              התחלה:{" "}
              {new Intl.DateTimeFormat("he-IL", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
              }).format(new Date(session.startedAt))}
            </Badge>
            <Badge variant="outline" className="bg-white text-slate-700">
              {session.endedAt
                ? `סיום: ${new Intl.DateTimeFormat("he-IL", {
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "2-digit",
                    month: "2-digit",
                  }).format(new Date(session.endedAt))}`
                : "עדיין פעילה"}
            </Badge>
          </div>
        </div>

        <Separator />

        {timeline.isLoading ? (
          <p className="text-sm text-slate-500">טוען את ציר הזמן...</p>
        ) : timeline.error ? (
          <p className="text-sm text-rose-600">{timeline.error}</p>
        ) : (
          <SessionTimeline
            segments={timeline.segments}
            startTs={timeline.startTs}
            endTs={timeline.endTs}
            nowTs={timeline.nowTs}
            isActive={timeline.isActive}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
