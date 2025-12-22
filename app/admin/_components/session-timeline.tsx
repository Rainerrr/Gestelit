"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import type { TimelineSegment } from "@/hooks/useSessionTimeline";

type SessionTimelineProps = {
  segments: TimelineSegment[];
  startTs: number | null;
  endTs: number | null;
  nowTs: number;
  isActive: boolean;
};

type Tick = { ts: number; label: string };
type SwitchMarker = { ts: number; label: string };

const formatTime = (ts: number) =>
  new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);

const COLLAPSE_THRESHOLD_MS = 15 * 60 * 1000;

const collapseRapidSwitches = (
  segments: TimelineSegment[],
): { segments: TimelineSegment[]; markers: SwitchMarker[] } => {
  const result: TimelineSegment[] = [];
  const markers: SwitchMarker[] = [];

  const sorted = [...segments].sort((a, b) => a.start - b.start);

  let i = 0;
  while (i < sorted.length) {
    const current = sorted[i];
    const duration = current.end - current.start;
    if (duration >= COLLAPSE_THRESHOLD_MS) {
      result.push(current);
      i += 1;
      continue;
    }

    const prevLong = [...result].reverse().find((seg) => seg.end - seg.start >= COLLAPSE_THRESHOLD_MS);
    let j = i;
    let runEnd = current.end;
    while (
      j + 1 < sorted.length &&
      sorted[j + 1].end - sorted[j + 1].start < COLLAPSE_THRESHOLD_MS
    ) {
      j += 1;
      runEnd = sorted[j].end;
    }
    const nextLong = sorted.slice(j + 1).find((seg) => seg.end - seg.start >= COLLAPSE_THRESHOLD_MS);

    if (prevLong && nextLong) {
      const runStart = current.start;
      const avg = (runStart + runEnd) / 2;
      markers.push({ ts: avg, label: formatTime(avg) });
      // skip adding the rapid segments
      i = j + 1;
      continue;
    }

    // If we cannot collapse (no long neighbor), keep as-is
    result.push(current);
    i += 1;
  }

  return { segments: result, markers };
};

const buildTicks = (start: number, end: number): Tick[] => {
  const totalHours = (end - start) / 3_600_000;
  const stepHours =
    totalHours > 24
      ? 4
      : totalHours > 12
        ? 2
        : totalHours > 6
          ? 1
          : totalHours > 3
            ? 0.5
            : 0.25;
  const stepMs = stepHours * 3_600_000;
  const alignedStart = Math.floor(start / stepMs) * stepMs;
  const ticks: Tick[] = [];
  for (let ts = alignedStart; ts <= end; ts += stepMs) {
    if (ts < start) continue;
    ticks.push({ ts, label: formatTime(ts) });
  }
  if (ticks.length === 0) {
    ticks.push({ ts: start, label: formatTime(start) });
    ticks.push({ ts: end, label: formatTime(end) });
  }
  return ticks;
};

export const SessionTimeline = ({
  segments,
  startTs,
  endTs,
  nowTs,
  isActive,
}: SessionTimelineProps) => {
  const hasBounds = Boolean(startTs && endTs);
  const total = useMemo(() => {
    if (!hasBounds || !startTs || !endTs) return 1;
    return Math.max(1, endTs - startTs);
  }, [endTs, hasBounds, startTs]);
  const ticks = useMemo(
    () => (hasBounds && startTs && endTs ? buildTicks(startTs, endTs) : []),
    [endTs, hasBounds, startTs],
  );

  const { segments: mergedSegments, markers: collapseMarkers } = useMemo(
    () => collapseRapidSwitches(segments),
    [segments],
  );

  const toPercent = (ts: number) =>
    Math.min(
      100,
      Math.max(0, ((ts - (startTs ?? 0)) / (total || 1)) * 100),
    );

  const hasSegments = mergedSegments.length > 0;
  const changeMarkers: SwitchMarker[] = useMemo(() => {
    const base = mergedSegments.map((seg) => ({
      ts: seg.start,
      label: formatTime(seg.start),
    }));
    return [...base, ...collapseMarkers];
  }, [collapseMarkers, mergedSegments]);

  const barTop = 18;
  const barHeight = 12;
  const tickTop = barTop + barHeight + 8;

  if (!hasBounds || !startTs || !endTs) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
        חסרים נתונים להצגת ציר הזמן.
      </div>
    );
  }

  return (
    <div className="space-y-3" dir="ltr">
      <div className="relative h-36 w-full overflow-visible rounded-md border border-border bg-card px-3 pt-10 pb-10 shadow-sm">
        {/* Status change markers (top) */}
        {changeMarkers.map((marker, idx) => (
          <div
            key={`${marker.ts}-${idx}`}
            className="absolute top-2 flex -translate-x-1/2 flex-col items-center gap-1"
            style={{ left: `${toPercent(marker.ts)}%` }}
            aria-label={`שינוי סטטוס ${marker.label}`}
          >
            <div className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground shadow-sm">
              {marker.label}
            </div>
            <span className="h-10 w-[1px] bg-border" />
          </div>
        ))}

        {/* Timeline bar area */}
        <div
          className="absolute left-4 right-4 rounded-sm bg-muted"
          style={{ top: `${barTop}px`, height: `${barHeight}px` }}
        >
          {hasSegments ? (
            mergedSegments.map((segment, index) => (
              <div
                key={`${segment.status}-${segment.start}-${index}`}
                className="absolute top-1/2 -translate-y-1/2 rounded-[5px] border border-background/70 shadow-sm"
                style={{
                  left: `${toPercent(segment.start)}%`,
                  width: `${Math.max(
                    0.5,
                    toPercent(segment.end) - toPercent(segment.start),
                  )}%`,
                  height: "110%",
                  backgroundColor: segment.colorHex,
                }}
                title={`${segment.label} ${formatTime(segment.start)} - ${formatTime(segment.end)}`}
                aria-label={`${segment.label} ${formatTime(segment.start)} - ${formatTime(segment.end)}`}
              />
            ))
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              אין אירועי סטטוס להצגה
            </div>
          )}

          {isActive ? (
            <div
              className="absolute flex w-[2px] flex-col items-center"
              style={{ left: `${toPercent(nowTs)}%`, top: barTop - 10, height: barHeight + 20 }}
              aria-label="עכשיו"
            >
              <div className="mb-1 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">עכשיו</div>
              <div className="h-full w-[2px] bg-emerald-500" />
              <div className="mt-1 text-[11px] text-muted-foreground">{formatTime(nowTs)}</div>
            </div>
          ) : null}
        </div>

        {/* Hour ticks (bottom) */}
        {ticks.map((tick) => (
          <div
            key={tick.ts}
            className="absolute flex -translate-x-1/2 flex-col items-center gap-1"
            style={{ left: `${toPercent(tick.ts)}%`, top: `${tickTop}px` }}
            aria-hidden="true"
          >
            <span className="h-8 w-[1px] bg-border" />
            <div className="h-3 w-3 rounded-full border border-border bg-background shadow-sm" />
            <div className="text-[12px] font-medium text-foreground">{tick.label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-foreground">
        <span className="font-medium">התחלה: {formatTime(startTs)}</span>
        <span>
          {isActive ? (
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              הסתיים בינתיים: עכשיו
            </Badge>
          ) : (
            <span className="font-medium">סיום: {formatTime(endTs)}</span>
          )}
        </span>
      </div>
    </div>
  );
};


