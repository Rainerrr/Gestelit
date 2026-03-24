"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

const VARIANT_COLORS = {
  default: {
    priorGood: "bg-emerald-700",
    sessionGood: "bg-emerald-400",
    priorScrap: "bg-rose-700",
    sessionScrap: "bg-rose-400",
    legendGood: "bg-emerald-700",
    legendSessionGood: "bg-emerald-400",
    legendScrap: "bg-rose-700",
    legendSessionScrap: "bg-rose-400",
  },
  blue: {
    priorGood: "bg-blue-700",
    sessionGood: "bg-blue-400",
    priorScrap: "bg-rose-700",
    sessionScrap: "bg-rose-400",
    legendGood: "bg-blue-700",
    legendSessionGood: "bg-blue-400",
    legendScrap: "bg-rose-700",
    legendSessionScrap: "bg-rose-400",
  },
  amber: {
    priorGood: "bg-amber-700",
    sessionGood: "bg-amber-400",
    priorScrap: "bg-rose-700",
    sessionScrap: "bg-rose-400",
    legendGood: "bg-amber-700",
    legendSessionGood: "bg-amber-400",
    legendScrap: "bg-rose-700",
    legendSessionScrap: "bg-rose-400",
  },
  neutral: {
    priorGood: "bg-slate-600",
    sessionGood: "bg-slate-400",
    priorScrap: "bg-rose-700",
    sessionScrap: "bg-rose-400",
    legendGood: "bg-slate-600",
    legendSessionGood: "bg-slate-400",
    legendScrap: "bg-rose-700",
    legendSessionScrap: "bg-rose-400",
  },
} as const;

/** Hex colors matching each Tailwind bg class, used for tooltip backgrounds */
const VARIANT_HEX = {
  default: { priorGood: "#047857", sessionGood: "#34d399", priorScrap: "#be123c", sessionScrap: "#fb7185" },
  blue:    { priorGood: "#1d4ed8", sessionGood: "#60a5fa", priorScrap: "#be123c", sessionScrap: "#fb7185" },
  amber:   { priorGood: "#b45309", sessionGood: "#fbbf24", priorScrap: "#be123c", sessionScrap: "#fb7185" },
  neutral: { priorGood: "#475569", sessionGood: "#94a3b8", priorScrap: "#be123c", sessionScrap: "#fb7185" },
} as const;

/** Text color for tooltip readability on each hex background */
const TOOLTIP_TEXT = {
  priorGood: "#fff",
  sessionGood: "#052e16",
  priorScrap: "#fff",
  sessionScrap: "#4c0519",
} as const;

const TOOLTIP_TEXT_BLUE: Record<string, string> = { sessionGood: "#172554" };
const TOOLTIP_TEXT_AMBER: Record<string, string> = { sessionGood: "#451a03" };
const TOOLTIP_TEXT_NEUTRAL: Record<string, string> = { sessionGood: "#0f172a" };

const SIZE_CONFIG = {
  sm: { bar: "h-3", font: "text-[9px]", legendFont: "text-[10px]", legendDot: "h-2.5 w-2.5" },
  md: { bar: "h-7", font: "text-sm", legendFont: "text-xs", legendDot: "h-3 w-3" },
  lg: { bar: "h-10", font: "text-base", legendFont: "text-sm", legendDot: "h-3.5 w-3.5" },
} as const;

export type JobProgressBarProps = {
  /** Planned/target quantity */
  plannedQuantity: number;
  /** Total good produced (all sessions) */
  totalGood: number;
  /** Total scrap produced (all sessions) */
  totalScrap: number;
  /** This session's good contribution (subset of totalGood) */
  sessionGood?: number;
  /** This session's scrap contribution (subset of totalScrap) */
  sessionScrap?: number;
  /** Display mode */
  displayMode?: "percentage" | "numbers";
  /** Color variant */
  variant?: "default" | "blue" | "amber" | "neutral";
  /** Size */
  size?: "sm" | "md" | "lg";
  /** Show legend below bar */
  showLegend?: boolean;
  /** Show numbers overlay inside bar */
  showOverlay?: boolean;
  /** Additional classes */
  className?: string;
};

// ============================================
// COMPONENT
// ============================================

/**
 * Segmented progress bar for job production tracking.
 * RTL layout: segments fill from right to left using absolute positioning from right.
 *
 * Segments order (from right edge):
 * 1. Prior good (dark tone) → Session good (light tone)
 * 2. Prior scrap (dark rose) → Session scrap (light rose)
 * 3. Remaining (empty space on the left)
 *
 * Overflow (>100%): All segments scale proportionally,
 * a prominent tick marks the 100% position with label.
 */
export function JobProgressBar({
  plannedQuantity,
  totalGood,
  totalScrap,
  sessionGood = 0,
  sessionScrap = 0,
  displayMode = "percentage",
  variant = "default",
  size = "md",
  showLegend = false,
  showOverlay = true,
  className,
}: JobProgressBarProps) {
  const colors = VARIANT_COLORS[variant];
  const hexColors = VARIANT_HEX[variant];
  const sizeConfig = SIZE_CONFIG[size];

  // Cursor-following tooltip state
  const barRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ label: string; bg: string; text: string; x: number } | null>(null);

  const {
    priorGoodPct,
    sessionGoodPct,
    priorScrapPct,
    sessionScrapPct,
    priorGoodQty,
    priorScrapQty,
    remaining,
    totalPct,
    isOverflow,
    tickPosition,
  } = useMemo(() => {
    const safePlanned = Math.max(1, plannedQuantity);
    const totalProduced = totalGood + totalScrap;

    const priorGood = Math.max(0, totalGood - sessionGood);
    const priorScrap = Math.max(0, totalScrap - sessionScrap);

    // Raw percentages relative to planned
    const rawPriorGood = (priorGood / safePlanned) * 100;
    const rawSessionGood = (sessionGood / safePlanned) * 100;
    const rawPriorScrap = (priorScrap / safePlanned) * 100;
    const rawSessionScrap = (sessionScrap / safePlanned) * 100;
    const rawTotal = rawPriorGood + rawSessionGood + rawPriorScrap + rawSessionScrap;

    const overflow = rawTotal > 100;
    const scale = overflow ? 100 / rawTotal : 1;

    const pGood = rawPriorGood * scale;
    const sGood = rawSessionGood * scale;
    const pScrap = rawPriorScrap * scale;
    const sScrap = rawSessionScrap * scale;
    const actualRem = Math.max(0, safePlanned - totalProduced);

    // Tick position: percentage from the RIGHT edge where 100% mark falls
    // When overflow, the filled bar is wider than planned, so the 100% mark
    // is at (planned / total) of the bar width, measured from right
    const tick = overflow ? (100 / rawTotal) * 100 : 100;

    return {
      priorGoodPct: pGood,
      sessionGoodPct: sGood,
      priorScrapPct: pScrap,
      sessionScrapPct: sScrap,
      priorGoodQty: priorGood,
      priorScrapQty: priorScrap,
      remaining: actualRem,
      totalPct: Math.round((totalProduced / safePlanned) * 100),
      isOverflow: overflow,
      tickPosition: tick,
    };
  }, [totalGood, totalScrap, plannedQuantity, sessionGood, sessionScrap]);

  const isComplete = remaining === 0 && !isOverflow;
  const isFullyProduced = totalGood >= plannedQuantity && plannedQuantity > 0;

  // Ensure non-zero segments have minimum visibility
  const minW = (pct: number) => (pct > 0 ? Math.max(pct, 0.5) : 0);

  // Cumulative offsets from right for absolute positioning (RTL)
  const pGoodW = minW(priorGoodPct);
  const sGoodW = minW(sessionGoodPct);
  const pScrapW = minW(priorScrapPct);
  const sScrapW = minW(sessionScrapPct);

  const sGoodRight = pGoodW;
  const pScrapRight = pGoodW + sGoodW;
  const sScrapRight = pGoodW + sGoodW + pScrapW;
  const totalFilledPct = pGoodW + sGoodW + pScrapW + sScrapW;

  // Overlay text: RTL order — planned first, then produced (read right-to-left)
  // Always shows total (good + scrap) as progress
  const totalProducedAll = totalGood + totalScrap;
  const overlayText = useMemo(() => {
    if (displayMode === "percentage") {
      return `${totalPct}%`;
    }
    if (isOverflow) {
      return `${plannedQuantity.toLocaleString()} / ${totalProducedAll.toLocaleString()}`;
    }
    return `${plannedQuantity.toLocaleString()} / ${totalProducedAll.toLocaleString()}`;
  }, [displayMode, totalPct, totalProducedAll, plannedQuantity, isOverflow]);

  // Resolve tooltip text color per segment key
  const getTooltipTextColor = useCallback((key: string) => {
    const overrides = variant === "blue" ? TOOLTIP_TEXT_BLUE
      : variant === "amber" ? TOOLTIP_TEXT_AMBER
      : variant === "neutral" ? TOOLTIP_TEXT_NEUTRAL
      : {};
    return overrides[key] ?? TOOLTIP_TEXT[key as keyof typeof TOOLTIP_TEXT] ?? "#fff";
  }, [variant]);

  // Tooltip segment data
  const segments = useMemo(() => {
    const segs: { key: string; pct: number; width: number; right: number; color: string; hex: string; textColor: string; shadow: boolean; label: string; value: number }[] = [];

    if (priorGoodPct > 0) {
      segs.push({
        key: "priorGood",
        pct: priorGoodPct,
        width: pGoodW,
        right: 0,
        color: colors.priorGood,
        hex: hexColors.priorGood,
        textColor: getTooltipTextColor("priorGood"),
        shadow: false,
        label: `תקין: ${priorGoodQty.toLocaleString()}`,
        value: priorGoodQty,
      });
    }
    if (sessionGoodPct > 0) {
      segs.push({
        key: "sessionGood",
        pct: sessionGoodPct,
        width: sGoodW,
        right: sGoodRight,
        color: colors.sessionGood,
        hex: hexColors.sessionGood,
        textColor: getTooltipTextColor("sessionGood"),
        shadow: true,
        label: `משמרת: +${sessionGood.toLocaleString()}`,
        value: sessionGood,
      });
    }
    if (priorScrapPct > 0) {
      segs.push({
        key: "priorScrap",
        pct: priorScrapPct,
        width: pScrapW,
        right: pScrapRight,
        color: colors.priorScrap,
        hex: hexColors.priorScrap,
        textColor: getTooltipTextColor("priorScrap"),
        shadow: false,
        label: `פסול: ${priorScrapQty.toLocaleString()}`,
        value: priorScrapQty,
      });
    }
    if (sessionScrapPct > 0) {
      segs.push({
        key: "sessionScrap",
        pct: sessionScrapPct,
        width: sScrapW,
        right: sScrapRight,
        color: colors.sessionScrap,
        hex: hexColors.sessionScrap,
        textColor: getTooltipTextColor("sessionScrap"),
        shadow: true,
        label: `משמרת פסול: +${sessionScrap.toLocaleString()}`,
        value: sessionScrap,
      });
    }

    return segs;
  }, [
    priorGoodPct, sessionGoodPct, priorScrapPct, sessionScrapPct,
    pGoodW, sGoodW, pScrapW, sScrapW,
    sGoodRight, pScrapRight, sScrapRight,
    colors, hexColors, priorGoodQty, priorScrapQty, sessionGood, sessionScrap,
    getTooltipTextColor,
  ]);

  const handleSegmentEnter = useCallback((e: React.MouseEvent, seg: typeof segments[number]) => {
    if (!barRef.current) return;
    const barRect = barRef.current.getBoundingClientRect();
    const x = e.clientX - barRect.left;
    setHovered({ label: seg.label, bg: seg.hex, text: seg.textColor, x });
  }, []);

  const handleSegmentMove = useCallback((e: React.MouseEvent) => {
    if (!barRef.current || !hovered) return;
    const barRect = barRef.current.getBoundingClientRect();
    const x = e.clientX - barRect.left;
    setHovered((prev) => prev ? { ...prev, x } : null);
  }, [hovered]);

  const handleSegmentLeave = useCallback(() => {
    setHovered(null);
  }, []);

  return (
    <div className={cn("space-y-0", className)}>
        {/* Bar Container */}
        <div
          ref={barRef}
          className={cn(
            "relative w-full overflow-visible rounded-lg",
            "border-2 bg-muted/50",
            isFullyProduced
              ? "border-emerald-400/60 ring-2 ring-emerald-400/30 shadow-[0_0_12px_rgba(16,185,129,0.4),0_0_4px_rgba(16,185,129,0.2)]"
              : "border-border",
            sizeConfig.bar
          )}
        >
          {/* Clip wrapper for segments so they don't bleed past rounded corners */}
          <div className="absolute inset-0 overflow-hidden rounded-[6px]">
            {/* Segments */}
            {segments.map((seg) => (
              <div
                key={seg.key}
                className={cn(
                  seg.color,
                  "absolute inset-y-0 ease-out",
                  seg.shadow && "shadow-[inset_0_0_8px_rgba(255,255,255,0.2)] animate-pulse-slow"
                )}
                style={{
                  right: `${seg.right}%`,
                  width: `${seg.width}%`,
                  transition: "width 500ms ease-out, right 500ms ease-out",
                }}
                onMouseEnter={(e) => handleSegmentEnter(e, seg)}
                onMouseMove={handleSegmentMove}
                onMouseLeave={handleSegmentLeave}
              />
            ))}

            {/* Completion shimmer */}
            {isComplete && (
              <div className="absolute inset-0 bg-gradient-to-l from-transparent via-white/20 to-transparent animate-shimmer" />
            )}
          </div>

          {/* Overflow 100% tick mark — prominent with label */}
          {isOverflow && (
            <>
              {/* Tick line */}
              <div
                className="absolute inset-y-0 z-20 w-[3px] bg-amber-400"
                style={{ right: `${tickPosition}%`, transform: "translateX(50%)" }}
              />
              {/* 100% label above tick */}
              {size !== "sm" && (
                <div
                  className="absolute z-20 -top-0.5 -translate-y-full"
                  style={{ right: `${tickPosition}%`, transform: `translateX(50%) translateY(-2px)` }}
                >
                  <span className="text-[9px] font-bold text-amber-400 bg-card/90 px-1 py-px rounded border border-amber-500/50">
                    100%
                  </span>
                </div>
              )}
            </>
          )}

          {/* Overlay Text */}
          {showOverlay && size !== "sm" && (
            <div
              dir="ltr"
              className={cn(
                "absolute inset-0 flex items-center justify-center gap-1.5 z-10 pointer-events-none",
                sizeConfig.font,
                "font-bold font-mono tabular-nums tracking-tight",
                "drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]",
                isFullyProduced ? "text-emerald-100" : totalFilledPct > 50 ? "text-white" : "text-foreground"
              )}
            >
              <span>{overlayText}</span>
              {isOverflow && (
                <span className="text-[10px] font-bold bg-amber-500/90 text-amber-950 px-1.5 py-0.5 rounded leading-none">
                  ייצור עודף
                </span>
              )}
            </div>
          )}

          {/* Cursor-following tooltip */}
          {hovered && (
            <div
              className="absolute z-50 pointer-events-none -translate-x-1/2 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold font-mono tabular-nums shadow-lg transition-opacity duration-100"
              style={{
                left: hovered.x,
                bottom: "calc(100% + 8px)",
                backgroundColor: hovered.bg,
                color: hovered.text,
              }}
            >
              {hovered.label}
              {/* Arrow */}
              <div
                className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0"
                style={{
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: `5px solid ${hovered.bg}`,
                }}
              />
            </div>
          )}
        </div>

      {/* 100% Tick below bar — in RTL, left:0 = physical left edge = end of bar */}
      <div className="relative w-full h-5">
        <div
          className="absolute top-0 flex flex-col items-center"
          style={isOverflow
            ? { right: `${tickPosition}%`, transform: "translateX(50%)" }
            : { left: 0, transform: "translateX(-50%)" }
          }
        >
          <div
            className={cn(
              "h-2",
              isOverflow ? "w-[2px] bg-amber-400" : "w-[2px] bg-amber-500/70"
            )}
          />
          <span
            className={cn(
              "text-[10px] font-mono font-semibold leading-none mt-0.5",
              isOverflow ? "text-amber-400 font-bold" : "text-amber-500/80"
            )}
          >
            100%
          </span>
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className={cn("flex items-center justify-between gap-2 flex-wrap", size !== "sm" && "mt-0")}>
          {/* Good */}
          <div className="flex items-center gap-1.5">
            <span className={cn(sizeConfig.legendDot, "rounded-sm border border-border/50", colors.legendGood)} />
            <span className={cn(sizeConfig.legendFont, "text-muted-foreground tabular-nums")}>
              תקין: {totalGood.toLocaleString()}
            </span>
          </div>

          {/* Session Good */}
          {sessionGood > 0 && (
            <div className="flex items-center gap-1.5">
              <span className={cn(sizeConfig.legendDot, "rounded-sm border border-border/50", colors.legendSessionGood)} />
              <span className={cn(sizeConfig.legendFont, "text-foreground font-medium tabular-nums")}>
                תקין במשמרת: +{sessionGood.toLocaleString()}
              </span>
            </div>
          )}

          {/* Scrap */}
          {totalScrap > 0 && (
            <div className="flex items-center gap-1.5">
              <span className={cn(sizeConfig.legendDot, "rounded-sm border border-border/50", colors.legendScrap)} />
              <span className={cn(sizeConfig.legendFont, "text-rose-400 tabular-nums")}>
                פסול: {totalScrap.toLocaleString()}
              </span>
            </div>
          )}

          {/* Session Scrap */}
          {sessionScrap > 0 && (
            <div className="flex items-center gap-1.5">
              <span className={cn(sizeConfig.legendDot, "rounded-sm border border-border/50", colors.legendSessionScrap)} />
              <span className={cn(sizeConfig.legendFont, "text-rose-400 font-medium tabular-nums")}>
                פסול במשמרת: +{sessionScrap.toLocaleString()}
              </span>
            </div>
          )}

          {/* Remaining */}
          {remaining > 0 && (
            <div className="flex items-center gap-1.5">
              <span className={cn(sizeConfig.legendDot, "rounded-sm bg-muted border border-border")} />
              <span className={cn(sizeConfig.legendFont, "text-muted-foreground/70 tabular-nums")}>
                נותרו: {remaining.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
