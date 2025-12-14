import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchStatusEventsBySessionIds } from "@/lib/data/admin-dashboard";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  buildStatusDictionary,
  getStatusHex,
  getStatusLabel,
} from "@/lib/status";
import type { StatusDefinition, StatusEventState } from "@/lib/types";

export type TimelineSegment = {
  status: StatusEventState;
  start: number;
  end: number;
  label: string;
  colorHex: string;
  dotClass: string;
};

type UseSessionTimelineArgs = {
  sessionId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  currentStatus?: StatusEventState | null;
  stationId?: string | null;
  statusDefinitions?: StatusDefinition[];
};

type UseSessionTimelineResult = {
  segments: TimelineSegment[];
  startTs: number | null;
  endTs: number | null;
  nowTs: number;
  isActive: boolean;
  isLoading: boolean;
  error: string | null;
};

const parseDate = (value?: string | null): number | null => {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
};

type RawEvent = { status: StatusEventState; startedAt: string; endedAt: string | null };

const normalizeSegments = ({
  events,
  startTs,
  endTs,
  nowTs,
  dictionary,
  stationId,
}: {
  events: RawEvent[];
  startTs: number;
  endTs: number;
  nowTs: number;
  dictionary: ReturnType<typeof buildStatusDictionary>;
  stationId?: string | null;
}): TimelineSegment[] => {
  const boundedEnd = Math.max(endTs, startTs + 1);

  const items = events
    .map((item) => {
      const from = Math.max(startTs, parseDate(item.startedAt) ?? startTs);
      const rawEnd =
        item.endedAt !== null ? parseDate(item.endedAt) ?? boundedEnd : nowTs;
      const to = Math.min(rawEnd, boundedEnd);
      if (Number.isNaN(from) || Number.isNaN(to) || to <= from) {
        return null;
      }
      const colorHex = getStatusHex(item.status, dictionary, stationId);
      return {
        status: item.status,
        start: from,
        end: to,
        label: getStatusLabel(item.status, dictionary, stationId),
        colorHex,
        dotClass: "bg-slate-400",
      } satisfies TimelineSegment;
    })
    .filter(Boolean) as TimelineSegment[];

  return items;
};

export const useSessionTimeline = ({
  sessionId,
  startedAt,
  endedAt,
  currentStatus,
  stationId,
  statusDefinitions,
}: UseSessionTimelineArgs): UseSessionTimelineResult => {
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const dictionary = useMemo(
    () => buildStatusDictionary(statusDefinitions),
    [statusDefinitions],
  );

  const startTs = parseDate(startedAt);
  const explicitEndTs = parseDate(endedAt);
  const isActive = !explicitEndTs;

  const load = useCallback(
    async (targetSessionId: string) => {
      if (!startTs) return;
      setIsLoading(true);
      setError(null);
      try {
        const fetched = await fetchStatusEventsBySessionIds([targetSessionId]);
        setEvents(
          fetched.map((item) => ({
            status: item.status,
            startedAt: item.startedAt,
            endedAt: item.endedAt,
          })),
        );
      } catch (err) {
        console.error("[useSessionTimeline] failed to load events", err);
        setError("שגיאה בטעינת ציר הזמן");
        setEvents([]);
      } finally {
        setIsLoading(false);
      }
    },
    [startTs],
  );

  useEffect(() => {
    if (!sessionId || !startTs) return;
    void load(sessionId);
  }, [load, sessionId, startTs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!sessionId || !startTs) return;
    const supabase = getBrowserSupabaseClient();
    const channel = supabase
      .channel(`session-timeline-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "status_events",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          void load(sessionId);
        },
      )
      .subscribe((status, err) => {
        if (err) {
          console.error("[useSessionTimeline] subscription error", err);
        } else {
          console.log("[useSessionTimeline] subscription status", status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, sessionId, startTs]);

  const effectiveEndTs = explicitEndTs ?? nowTs;

  const segments = useMemo(() => {
    if (!startTs) return [];
    const fromEvents = normalizeSegments({
      events,
      startTs,
      endTs: effectiveEndTs,
      nowTs,
      dictionary,
      stationId,
    });
    if (fromEvents.length > 0) return fromEvents;

    if (currentStatus) {
      return [
        {
          status: currentStatus,
          start: startTs,
          end: effectiveEndTs,
          label: getStatusLabel(currentStatus, dictionary, stationId),
          colorHex: getStatusHex(currentStatus, dictionary, stationId),
          dotClass: "bg-slate-400",
        },
      ];
    }
    return [];
  }, [
    currentStatus,
    dictionary,
    effectiveEndTs,
    events,
    nowTs,
    startTs,
    stationId,
  ]);

  return {
    segments,
    startTs,
    endTs: effectiveEndTs,
    nowTs,
    isActive,
    isLoading,
    error,
  };
};


