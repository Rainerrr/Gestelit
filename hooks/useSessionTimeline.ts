import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchStatusEventsAdminApi } from "@/lib/api/admin-management";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  buildStatusDictionary,
  getStatusHex,
  getStatusLabel,
} from "@/lib/status";
import type { StatusDefinition, StatusEventState } from "@/lib/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type TimelineSegment = {
  status: StatusEventState;
  start: number;
  end: number;
  label: string;
  colorHex: string;
  dotClass: string;
  reportType?: string | null;
  reportReasonLabel?: string | null;
  // Production data (populated for production status events)
  jobItemId?: string | null;
  jobItemName?: string | null;
  jobNumber?: string | null;
  quantityGood?: number;
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
  reload: () => Promise<void>;
};

const parseDate = (value?: string | null): number | null => {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
};

type RawEvent = {
  status: StatusEventState;
  startedAt: string;
  endedAt: string | null;
  reportType?: string | null;
  reportReasonLabel?: string | null;
  // Production data
  jobItemId?: string | null;
  jobItemName?: string | null;
  jobNumber?: string | null;
  quantityGood?: number;
};

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
        reportType: item.reportType,
        reportReasonLabel: item.reportReasonLabel,
        // Production data
        jobItemId: item.jobItemId,
        jobItemName: item.jobItemName,
        jobNumber: item.jobNumber,
        quantityGood: item.quantityGood,
      } satisfies TimelineSegment;
    })
    .filter(Boolean) as TimelineSegment[];

  return items;
};

/**
 * Detects if a segment is an "orphan" - a short status event that should be merged.
 * Orphan events are typically created when:
 * 1. User switched from production to stoppage but cancelled the report dialog
 * 2. User switched jobs but cancelled before selecting a new job
 * 3. User completed a job item and the transition created a short intermediate status
 *
 * Criteria for orphan detection:
 * - Duration < 30 seconds (very short events are likely unintentional)
 * - No ACTUAL linked report (reportReasonLabel indicates an actual report was created)
 *   Note: reportType is the status definition's config, not actual report existence
 * - No production data (quantity = 0 or undefined)
 */
const isOrphanSegment = (seg: TimelineSegment): boolean => {
  const duration = seg.end - seg.start;
  const ORPHAN_THRESHOLD_MS = 10_000; // 10 seconds (changed from 30s)

  // If it has an ACTUAL linked report (reportReasonLabel is set), it's intentional - not an orphan
  // Note: reportType is the status definition's report_type (config), not whether a report was created
  if (seg.reportReasonLabel) return false;

  // If it has production data (quantity reported), it's intentional
  if (seg.quantityGood && seg.quantityGood > 0) return false;

  // Short events without actual linked reports or production data are orphans
  return duration < ORPHAN_THRESHOLD_MS;
};

/**
 * Merges short "orphan" segments with adjacent segments.
 *
 * Algorithm (UPDATED for forward merging):
 * 1. First pass (right-to-left): Merge orphan segments INTO NEXT segment
 * 2. Second pass: If first segment is still orphan, merge into second
 * 3. Third pass: If last segment is orphan (no next), merge into previous
 *
 * Only orphan segments merge - events WITH reports/quantities stay visible.
 * This ensures orphan statuses (e.g., cancelled dialog transitions) are
 * absorbed by the NEXT legitimate status, not the previous one.
 */
const mergeShortSegments = (
  segments: TimelineSegment[],
): TimelineSegment[] => {
  if (segments.length <= 1) return segments;

  const result = [...segments];

  // Pass 1: Merge orphans FORWARD (iterate right-to-left)
  for (let i = result.length - 2; i >= 0; i--) {
    const seg = result[i];
    const nextSeg = result[i + 1];

    const isOrphan = isOrphanSegment(seg);

    // ONLY merge orphans - events with reports/quantities stay visible
    if (isOrphan && nextSeg) {
      // Extend NEXT segment to absorb this orphan's start time
      result[i + 1] = {
        ...nextSeg,
        start: seg.start,
      };
      // Remove the orphan segment
      result.splice(i, 1);
    }
  }

  // Pass 2: First segment still orphan -> merge into second
  if (result.length >= 2 && isOrphanSegment(result[0])) {
    result[1] = {
      ...result[1],
      start: result[0].start,
    };
    result.shift();
  }

  // Pass 3: Last segment orphan (no next to merge into) -> merge into previous
  if (result.length >= 2 && isOrphanSegment(result[result.length - 1])) {
    const last = result.length - 1;
    result[last - 1] = {
      ...result[last - 1],
      end: result[last].end,
    };
    result.pop();
  }

  return result;
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
        const { events: fetched } = await fetchStatusEventsAdminApi([targetSessionId]);
        setEvents(
          fetched.map((item) => ({
            status: item.status,
            startedAt: item.startedAt,
            endedAt: item.endedAt,
            reportType: item.reportType,
            reportReasonLabel: item.reportReasonLabel,
            // Production data
            jobItemId: item.jobItemId,
            jobItemName: item.jobItemName,
            jobNumber: item.jobNumber,
            quantityGood: item.quantityGood,
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

  // Refs to prevent infinite recursion in channel cleanup
  const isClosingRef = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!sessionId || !startTs) return;

    // Reset closing flag when effect runs
    isClosingRef.current = false;

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
          // Only reload if not closing
          if (!isClosingRef.current) {
            void load(sessionId);
          }
        },
      )
      .subscribe((status, err) => {
        if (err) {
          console.error("[useSessionTimeline] subscription error", err);
        }
      });

    channelRef.current = channel;

    return () => {
      // Guard against re-entry and infinite recursion
      if (isClosingRef.current) return;
      isClosingRef.current = true;

      const ch = channelRef.current;
      channelRef.current = null;

      if (ch) {
        void supabase.removeChannel(ch);
      }
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
    if (fromEvents.length > 0) return mergeShortSegments(fromEvents);

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

  const reload = useCallback(async () => {
    if (sessionId) {
      await load(sessionId);
    }
  }, [load, sessionId]);

  return {
    segments,
    startTs,
    endTs: effectiveEndTs,
    nowTs,
    isActive,
    isLoading,
    error,
    reload,
  };
};


