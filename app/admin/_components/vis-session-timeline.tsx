"use client";

import { useCallback, useMemo, useState, useRef } from "react";
import { FileText, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getStatusBadgeClass } from "@/lib/status";
import type { TimelineSegment } from "@/hooks/useSessionTimeline";
import type { StatusDictionary } from "@/lib/status";
import type { JobItemDistribution } from "@/lib/types";

type VisSessionTimelineProps = {
  segments: TimelineSegment[];
  startTs: number | null;
  endTs: number | null;
  nowTs: number;
  isActive: boolean;
  dictionary?: StatusDictionary;
  stationId?: string | null;
  jobItemDistribution?: JobItemDistribution | null;
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
  // Show job item context if available (even without quantity reported yet)
  const hasJobItem = !!segment.jobItemName;
  const hasQuantity = (segment.quantityGood ?? 0) > 0;

  return (
    <div
      className="pointer-events-none rounded-lg bg-popover overflow-hidden border border-border shadow-lg"
      style={{
        minWidth: 180,
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
        {/* Job item context (shown even without quantity) */}
        {hasJobItem && (
          <div className="pb-1.5 border-b border-border space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">פריט</span>
              <span className="text-foreground font-medium truncate max-w-[120px]">
                {segment.jobItemName}
              </span>
            </div>
            {segment.jobNumber && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">הזמנה</span>
                <span className="text-foreground font-mono">#{segment.jobNumber}</span>
              </div>
            )}
            {hasQuantity ? (
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">כמות טובה</span>
                <span className="text-emerald-400 font-semibold">{segment.quantityGood}</span>
              </div>
            ) : (
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">כמות טובה</span>
                <span className="text-muted-foreground italic">ממתין לדיווח</span>
              </div>
            )}
          </div>
        )}
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
        {/* Times - compact horizontal layout */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{formatTime(segment.start)}</span>
          <span>-</span>
          <span className="tabular-nums">{formatTime(segment.end)}</span>
        </div>
        {/* Duration below */}
        <div className="flex justify-center items-center text-xs pt-1 border-t border-border">
          <span className="text-foreground font-semibold tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>
      </div>
    </div>
  );
};

// Alternating color palette for job item distribution segments
const JOB_ITEM_COLORS = [
  { bg: "rgba(59, 130, 246, 0.5)", border: "rgba(59, 130, 246, 0.7)", stripe: "rgba(59, 130, 246, 0.25)" },   // blue
  { bg: "rgba(99, 102, 241, 0.5)", border: "rgba(99, 102, 241, 0.7)", stripe: "rgba(99, 102, 241, 0.25)" },   // indigo
  { bg: "rgba(14, 165, 233, 0.5)", border: "rgba(14, 165, 233, 0.7)", stripe: "rgba(14, 165, 233, 0.25)" },   // sky
  { bg: "rgba(168, 85, 247, 0.5)", border: "rgba(168, 85, 247, 0.7)", stripe: "rgba(168, 85, 247, 0.25)" },   // purple
];

type DistributionTooltipData = {
  jobItemId: string;
  jobItemName: string;
  jobNumber: string;
  startedAt: string;
  endedAt: string | null;
  x: number;
  containerWidth: number;
};

const DistributionTooltip = ({ data }: { data: DistributionTooltipData }) => {
  const startTime = formatTime(new Date(data.startedAt).getTime());
  const endTime = data.endedAt ? formatTime(new Date(data.endedAt).getTime()) : "עכשיו";

  return (
    <div
      className="pointer-events-none rounded-lg bg-popover overflow-hidden border border-border shadow-lg"
      style={{ minWidth: 160, direction: "rtl" }}
    >
      <div className="px-3 py-2 bg-blue-500/20 border-b border-border">
        <p className="text-xs font-medium text-foreground truncate text-center">
          #{data.jobNumber} ({data.jobItemName})
        </p>
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{startTime}</span>
          <span>-</span>
          <span className="tabular-nums">{endTime}</span>
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
  jobItemDistribution,
}: VisSessionTimelineProps) => {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [distTooltip, setDistTooltip] = useState<DistributionTooltipData | null>(null);
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

  // Build color map for unique job items
  const jobItemColorMap = useMemo(() => {
    const map = new Map<string, typeof JOB_ITEM_COLORS[0]>();
    if (!jobItemDistribution?.periods) return map;
    let colorIdx = 0;
    for (const period of jobItemDistribution.periods) {
      if (!map.has(period.jobItemId)) {
        map.set(period.jobItemId, JOB_ITEM_COLORS[colorIdx % JOB_ITEM_COLORS.length]);
        colorIdx++;
      }
    }
    return map;
  }, [jobItemDistribution]);

  const handleDistSegmentHover = (
    period: { jobItemId: string; jobItemName: string; jobNumber: string; startedAt: string; endedAt: string | null },
    e: React.MouseEvent<HTMLDivElement>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      const x = rect.left + rect.width / 2 - containerRect.left;
      setDistTooltip({ ...period, x, containerWidth: containerRect.width });
    }
  };

  return (
    <div ref={containerRef} className="relative" dir="ltr">
      {/* Job Item Distribution — DNA Lane */}
      {jobItemDistribution && jobItemDistribution.periods.length > 0 && (
        <div className="mb-1">
          <p className="text-[10px] text-muted-foreground/60 mb-1.5 text-right tracking-wider uppercase" dir="rtl">פריטי עבודה</p>
          <div className="relative" style={{ height: 24 }}>
            {/* Top rail */}
            <div
              className="absolute top-0 left-0 right-0"
              style={{ height: 2, background: "rgba(255,255,255,0.1)" }}
            />
            {/* Bottom rail */}
            <div
              className="absolute bottom-0 left-0 right-0"
              style={{ height: 2, background: "rgba(255,255,255,0.1)" }}
            />

            {/* Colored fills between rails */}
            {jobItemDistribution.periods.map((period) => {
              const periodStart = new Date(period.startedAt).getTime();
              const periodEnd = period.endedAt ? new Date(period.endedAt).getTime() : nowTs;
              const left = getPosition(periodStart);
              const width = getPosition(periodEnd) - left;
              const colors = jobItemColorMap.get(period.jobItemId) ?? JOB_ITEM_COLORS[0];
              const isHovered = distTooltip?.startedAt === period.startedAt && distTooltip?.jobItemId === period.jobItemId;

              return (
                <div
                  key={`dna-${period.jobItemId}-${period.startedAt}`}
                  className="absolute cursor-pointer transition-all duration-150"
                  style={{
                    top: 2,
                    bottom: 2,
                    left: `${left}%`,
                    width: `${Math.max(width, 0.3)}%`,
                    background: `linear-gradient(180deg, ${colors.border} 0%, ${colors.bg} 40%, ${colors.bg} 60%, ${colors.border} 100%)`,
                    boxShadow: isHovered
                      ? `0 0 8px ${colors.border}, inset 0 0 4px ${colors.stripe}`
                      : `inset 0 1px 2px ${colors.stripe}`,
                    opacity: isHovered ? 1 : 0.85,
                    zIndex: isHovered ? 10 : 1,
                  }}
                  onMouseEnter={(e) => handleDistSegmentHover(period, e)}
                  onMouseLeave={() => setDistTooltip(null)}
                >
                  {/* Hovered rail thickening effect — top */}
                  {isHovered && (
                    <>
                      <div
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{ top: -3, height: 4, background: colors.border, borderRadius: 2 }}
                      />
                      <div
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{ bottom: -3, height: 4, background: colors.border, borderRadius: 2 }}
                      />
                    </>
                  )}
                  {/* Label inside fill */}
                  {width > 10 && (
                    <div className="absolute inset-0 flex items-center justify-center px-1 pointer-events-none" dir="rtl">
                      <span
                        className="text-[11px] font-semibold truncate leading-none"
                        style={{ color: "rgba(255,255,255,0.95)", textShadow: `0 1px 3px ${colors.border}`, unicodeBidi: "plaintext" }}
                      >
                        {`#${period.jobNumber} (${period.jobItemName})`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Drop-line connectors — dashed vertical ticks at segment boundaries */}
          <div className="relative" style={{ height: 6 }}>
            {jobItemDistribution.periods.map((period, idx) => {
              const periodStart = new Date(period.startedAt).getTime();
              const pos = getPosition(periodStart);
              if (idx === 0 && pos < 1) return null;
              return (
                <div
                  key={`drop-${period.jobItemId}-${period.startedAt}`}
                  className="absolute top-0 pointer-events-none"
                  style={{
                    left: `${pos}%`,
                    width: 0,
                    height: "100%",
                    borderLeft: "1px dashed rgba(255,255,255,0.1)",
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

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

      {/* Status Tooltip */}
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

      {/* Distribution Tooltip */}
      {distTooltip && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: Math.max(80, Math.min(distTooltip.x, distTooltip.containerWidth ? distTooltip.containerWidth - 80 : distTooltip.x)),
            top: -8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <DistributionTooltip data={distTooltip} />
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
