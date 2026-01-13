"use client";

import { useCallback, useMemo, useState, useRef } from "react";
import { FileText, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getStatusBadgeClass } from "@/lib/status";
import type { TimelineSegment } from "@/hooks/useSessionTimeline";
import type { StatusDictionary } from "@/lib/status";

type VisSessionTimelineProps = {
  segments: TimelineSegment[];
  startTs: number | null;
  endTs: number | null;
  nowTs: number;
  isActive: boolean;
  dictionary?: StatusDictionary;
  stationId?: string | null;
};

const formatTime = (ts: number) =>
  new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);

const formatDuration = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

type TooltipData = {
  segment: TimelineSegment;
  x: number;
  containerWidth: number;
};

const CustomTooltip = ({ segment }: { segment: TimelineSegment }) => {
  const duration = segment.end - segment.start;
  const hasReport = segment.reportType && segment.reportReasonLabel;
  const isMalfunction = segment.reportType === "malfunction";

  return (
    <div
      className="pointer-events-none rounded-lg bg-popover overflow-hidden border border-border shadow-lg"
      style={{
        minWidth: 150,
        direction: "rtl",
      }}
    >
      <div
        className="px-3 py-2 text-center font-medium text-white text-xs"
        style={{ backgroundColor: segment.colorHex }}
      >
        {segment.label}
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {/* Report info */}
        {hasReport && (
          <div className="flex items-center justify-center gap-2 text-xs pb-1.5 border-b border-border">
            {isMalfunction ? (
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
            )}
            <span className="text-foreground font-medium text-center">
              {segment.reportReasonLabel}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">התחלה</span>
          <span className="text-foreground font-medium tabular-nums">
            {formatTime(segment.start)}
          </span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">סיום</span>
          <span className="text-foreground font-medium tabular-nums">
            {formatTime(segment.end)}
          </span>
        </div>
        <div className="flex justify-between items-center text-xs pt-1 border-t border-border">
          <span className="text-muted-foreground">משך</span>
          <span className="text-foreground font-semibold tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>
      </div>
    </div>
  );
};

export const VisSessionTimeline = ({
  segments,
  startTs,
  endTs,
  nowTs,
  isActive,
  dictionary,
  stationId,
}: VisSessionTimelineProps) => {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasBounds = Boolean(startTs && endTs);
  const totalDuration = hasBounds ? endTs! - startTs! : 0;

  // Calculate round hour ticks
  const hourTicks = useMemo(() => {
    if (!startTs || !endTs) return [];

    const durationHours = (endTs - startTs) / 3_600_000;
    let interval = 3_600_000; // 1 hour default

    if (durationHours <= 2) {
      interval = 1_800_000; // 30 minutes
    } else if (durationHours > 8) {
      interval = 7_200_000; // 2 hours
    }

    const ticks: number[] = [];
    const firstTick = Math.ceil(startTs / interval) * interval;

    for (let t = firstTick; t <= endTs; t += interval) {
      ticks.push(t);
    }

    return ticks;
  }, [startTs, endTs]);

  // Calculate percentage position for a timestamp
  const getPosition = useCallback((ts: number): number => {
    if (!startTs || totalDuration === 0) return 0;
    return ((ts - startTs) / totalDuration) * 100;
  }, [startTs, totalDuration]);

  // Calculate "now" marker position
  const nowPosition = useMemo(() => {
    if (!isActive || !startTs || !endTs) return null;
    if (nowTs < startTs || nowTs > endTs) return null;
    return getPosition(nowTs);
  }, [isActive, startTs, endTs, nowTs, getPosition]);

  const handleSegmentHover = (
    segment: TimelineSegment,
    e: React.MouseEvent<HTMLDivElement>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      const x = rect.left + rect.width / 2 - containerRect.left;
      const containerWidth = containerRect.width;
      setTooltip({ segment, x, containerWidth });
    }
  };

  if (!hasBounds || !startTs || !endTs) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
        חסרים נתונים להצגת ציר הזמן.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative" dir="ltr">
      {/* Timeline bar - pill shaped */}
      <div className="relative h-10 bg-muted rounded-full overflow-hidden shadow-inner">
        {/* Segments */}
        {segments.map((seg, idx) => {
          const left = getPosition(seg.start);
          const width = getPosition(seg.end) - left;
          const isHovered = tooltip?.segment.start === seg.start;
          const isFirst = idx === 0;
          const isLast = idx === segments.length - 1;
          const badgeClass = dictionary
            ? getStatusBadgeClass(seg.status, dictionary, stationId)
            : undefined;
          const hasReport = seg.reportType && seg.reportReasonLabel;
          const isMalfunction = seg.reportType === "malfunction";

          return (
            <div
              key={`${seg.status}-${seg.start}-${idx}`}
              className="absolute top-0 h-full cursor-pointer transition-all duration-200 ease-out"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: seg.colorHex,
                transform: isHovered ? "scaleY(1.1)" : "scaleY(1)",
                zIndex: isHovered ? 10 : 1,
                filter: isHovered ? "brightness(1.1)" : "none",
                borderRadius: isFirst && isLast
                  ? "9999px"
                  : isFirst
                    ? "9999px 0 0 9999px"
                    : isLast
                      ? "0 9999px 9999px 0"
                      : "0",
              }}
              onMouseEnter={(e) => handleSegmentHover(seg, e)}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Show status badge if segment is wide enough */}
              {width > 15 && (
                <div className="absolute inset-0 flex items-center justify-center px-2 gap-1.5">
                  {/* Report icon */}
                  {hasReport && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 shrink-0 pointer-events-none">
                      {isMalfunction ? (
                        <AlertTriangle className="h-3 w-3 text-white drop-shadow-sm" />
                      ) : (
                        <FileText className="h-3 w-3 text-white drop-shadow-sm" />
                      )}
                    </div>
                  )}
                  {badgeClass ? (
                    <Badge
                      className={`${badgeClass} text-[10px] px-2 py-0 h-5 truncate max-w-full shadow-sm pointer-events-none`}
                    >
                      {seg.label}
                    </Badge>
                  ) : (
                    <span className="text-white text-[10px] font-medium truncate drop-shadow-sm pointer-events-none">
                      {seg.label}
                    </span>
                  )}
                </div>
              )}
              {/* Show just icon if segment is narrow but has report */}
              {width <= 15 && width > 5 && hasReport && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
                    {isMalfunction ? (
                      <AlertTriangle className="h-3 w-3 text-white drop-shadow-sm" />
                    ) : (
                      <FileText className="h-3 w-3 text-white drop-shadow-sm" />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* "Now" marker - subtle line only */}
        {nowPosition !== null && (
          <div
            className="absolute top-0 h-full z-20 pointer-events-none"
            style={{ left: `${nowPosition}%` }}
          >
            <div className="relative h-full flex items-center">
              <div className="w-0.5 h-full bg-white shadow-md" />
            </div>
          </div>
        )}
      </div>

      {/* Time axis */}
      <div className="relative h-5 mt-2">
        {hourTicks.map((tick) => {
          const position = getPosition(tick);
          return (
            <div
              key={tick}
              className="absolute top-0 flex flex-col items-center"
              style={{ left: `${position}%`, transform: "translateX(-50%)" }}
            >
              <div className="w-px h-1.5 bg-border" />
              <span className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                {formatTime(tick)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: Math.max(80, Math.min(tooltip.x, tooltip.containerWidth ? tooltip.containerWidth - 80 : tooltip.x)),
            top: -8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <CustomTooltip segment={tooltip.segment} />
        </div>
      )}

      {/* Session time labels - LTR layout: start on left, end on right */}
      <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
        <span className="tabular-nums">{formatTime(startTs)}</span>
        {isActive ? (
          <Badge className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 h-5 pointer-events-none">
            פעיל עכשיו
          </Badge>
        ) : (
          <span className="tabular-nums">{formatTime(endTs)}</span>
        )}
      </div>
    </div>
  );
};
