"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { DualProgressBar } from "./dual-progress-bar";
import { ChevronLeft, User, Package, CheckCircle2 } from "lucide-react";
import type { ActiveJobItemContext } from "@/contexts/WorkerSessionContext";
import type { Job } from "@/lib/types";
import type { PipelineNeighborStation } from "@/lib/api/client";

// Format large numbers compactly (e.g., 3M, 15K) for mobile readability
const formatCompactNumber = (num: number): string => {
  if (num >= 1_000_000) {
    const millions = num / 1_000_000;
    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (num >= 10_000) {
    const thousands = num / 1_000;
    return thousands % 1 === 0 ? `${thousands}K` : `${thousands.toFixed(1)}K`;
  }
  return num.toLocaleString();
};

// ============================================
// TYPES
// ============================================

export type PipelineContext = {
  /** Products waiting FROM previous station (available to consume) */
  upstreamWip: number;
  /** Our products waiting FOR next station */
  waitingOutput: number;
  /** Previous station info (null if first station) */
  prevStation: PipelineNeighborStation | null;
  /** Next station info (null if last station) */
  nextStation: PipelineNeighborStation | null;
  /** Whether current station is terminal (last in pipeline) */
  isTerminal: boolean;
  /** Whether this is a production line job */
  isProductionLine: boolean;
  /** Whether this is a single-station pipeline */
  isSingleStation: boolean;
  /** Total number of stages in the pipeline (for color gradient) */
  totalStages?: number;
  /** Current station's position in the pipeline (0-indexed, for color gradient) */
  currentStageIndex?: number;
};

export type JobProgressPanelProps = {
  /** The active job (for display info) */
  job: Job | null | undefined;
  /** The active job item context */
  activeJobItem: ActiveJobItemContext | null | undefined;
  /** Session-level totals (this session's contribution) */
  sessionTotals: {
    good: number;
    scrap: number;
  };
  /** Whether currently in production status */
  isInProduction: boolean;
  /** Callback when "Switch Job" is clicked */
  onSwitchJob?: () => void;
  /** Whether switch job action is disabled */
  switchJobDisabled?: boolean;
  /** Current station name */
  currentStationName?: string;
  /** Pipeline context for multi-station jobs */
  pipelineContext?: PipelineContext;
  /** Additional class names */
  className?: string;
};

// ============================================
// COMPONENT
// ============================================

/**
 * Always-visible job progress panel with industrial HMI aesthetic.
 *
 * Features:
 * - Empty state when no job selected
 * - Dual-color progress bar (total + session contribution)
 * - Percentage/numbers toggle
 * - Large, bold typography for shop floor visibility
 * - Integrated pipeline visualization for multi-station jobs
 */
export function JobProgressPanel({
  job,
  activeJobItem,
  sessionTotals,
  isInProduction,
  onSwitchJob,
  switchJobDisabled = false,
  currentStationName,
  pipelineContext,
  className,
}: JobProgressPanelProps) {
  const { t } = useTranslation();
  const [displayMode, setDisplayMode] = useState<"percentage" | "numbers">("percentage");

  // Total completed is the authoritative value from the database (completedGood).
  // DO NOT add sessionTotals.good - the DB value already includes this session's reports.
  // sessionTotals is only used for the dual-color bar to show "this session's contribution".
  const totalCompleted = activeJobItem?.completedGood ?? 0;

  const toggleDisplayMode = () => {
    setDisplayMode((prev) => (prev === "percentage" ? "numbers" : "percentage"));
  };

  // Check if we should show pipeline (multi-station production line)
  const showPipeline = pipelineContext?.isProductionLine &&
    !pipelineContext?.isSingleStation &&
    (pipelineContext?.prevStation || pipelineContext?.nextStation);

  // Empty state - no job selected
  if (!activeJobItem) {
    return (
      <div
        className={cn(
          "rounded-xl border-2 border-dashed border-border bg-muted/30 p-6",
          "transition-all duration-300",
          className
        )}
      >
        <div className="flex flex-col items-center justify-center gap-3 py-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted border-2 border-border">
            <svg
              className="h-8 w-8 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
              />
            </svg>
          </div>

          <div className="text-center">
            <h3 className="text-lg font-bold text-muted-foreground">{t("jobProgress.noJobSelected")}</h3>
            <p className="mt-1 text-sm text-muted-foreground/70">
              {t("jobProgress.selectJobToStart")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Active state - job selected
  return (
    <div
      className={cn(
        "rounded-xl border-2 p-4 transition-all duration-300",
        isInProduction
          ? "border-emerald-500/60 bg-gradient-to-br from-emerald-500/10 via-card/50 to-card/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
          : "border-border bg-muted/30",
        className
      )}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 text-right">
          <div className="flex flex-wrap items-center gap-2">
            {isInProduction ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {t("jobProgress.activeProduction")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground border border-border">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                {t("jobProgress.waiting")}
              </span>
            )}
            {job ? (
              <span className="text-lg font-bold text-foreground">
                {t("jobProgress.job", { number: job.job_number })}
              </span>
            ) : null}
          </div>
          {job?.customer_name ? (
            <span className="text-sm text-muted-foreground">{job.customer_name}</span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleDisplayMode}
            className="h-8 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            {displayMode === "percentage" ? "#" : "%"}
          </Button>

          {/* Switch Job */}
          {onSwitchJob ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onSwitchJob}
              disabled={switchJobDisabled}
              className={cn(
                "shrink-0 border-border bg-card/50 text-foreground",
                "hover:bg-accent hover:text-foreground hover:border-border",
                "disabled:opacity-50"
              )}
            >
              {t("jobProgress.switchJob")}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Job Item Info */}
      <div className="mt-4 space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-muted-foreground">{t("jobProgress.product")}</span>
          <span className="text-lg font-bold text-foreground">{activeJobItem.name}</span>
        </div>

        <DualProgressBar
          totalCompleted={totalCompleted}
          sessionContribution={sessionTotals.good}
          plannedQuantity={activeJobItem.plannedQuantity}
          displayMode={displayMode}
        />

        {/* Stats Grid - 2 tiles */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-card/80 border border-border px-4 py-3 text-center">
            <div className="text-xs font-medium text-muted-foreground">{t("jobProgress.totalReported")}</div>
            <div className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCompactNumber(totalCompleted)}
            </div>
          </div>

          <div className="rounded-lg bg-card/80 border border-border px-4 py-3 text-center">
            <div className="text-xs font-medium text-muted-foreground">{t("jobProgress.remaining")}</div>
            <div className={cn(
              "text-2xl font-bold tabular-nums",
              Math.max(0, activeJobItem.plannedQuantity - totalCompleted) === 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-foreground"
            )}>
              {formatCompactNumber(Math.max(0, activeJobItem.plannedQuantity - totalCompleted))}
            </div>
          </div>
        </div>

        {/* Pipeline Visualization - only for multi-station jobs */}
        {showPipeline && pipelineContext && currentStationName && (
          <PipelineFlowDisplay
            upstreamWip={pipelineContext.upstreamWip}
            waitingOutput={pipelineContext.waitingOutput}
            prevStation={pipelineContext.prevStation}
            nextStation={pipelineContext.nextStation}
            currentStationName={currentStationName}
            isTerminal={pipelineContext.isTerminal}
            sessionGoodCount={sessionTotals.good}
            totalStages={pipelineContext.totalStages}
            currentStageIndex={pipelineContext.currentStageIndex}
          />
        )}
      </div>
    </div>
  );
}

// ============================================
// PIPELINE FLOW DISPLAY - Refined Original Style
// ============================================

// Color scheme matching the live dashboard job progress (red → orange → amber → lime → green → emerald)
// Uses dark: prefix for light/dark mode contrast support
const getPipelineStageStyle = (stageIndex: number, totalStages: number, isTerminal: boolean) => {
  // Terminal stage always emerald
  if (isTerminal) {
    return {
      border: "border-emerald-500/50",
      bg: "bg-emerald-500/10",
      text: "text-emerald-700 dark:text-emerald-400",
      accent: "text-emerald-800 dark:text-emerald-300",
      glow: "shadow-[0_0_10px_rgba(16,185,129,0.15)]",
      wipBorder: "border-emerald-500/40",
      wipBg: "bg-emerald-500/15",
    };
  }

  // Calculate position ratio (0 = start, 1 = end)
  const ratio = totalStages <= 1 ? 1 : stageIndex / (totalStages - 1);

  // Red → Orange → Amber → Lime → Green gradient based on position
  if (ratio <= 0.2) {
    return {
      border: "border-red-500/50",
      bg: "bg-red-500/10",
      text: "text-red-700 dark:text-red-400",
      accent: "text-red-800 dark:text-red-300",
      glow: "shadow-[0_0_10px_rgba(239,68,68,0.15)]",
      wipBorder: "border-red-500/40",
      wipBg: "bg-red-500/15",
    };
  }
  if (ratio <= 0.4) {
    return {
      border: "border-orange-500/50",
      bg: "bg-orange-500/10",
      text: "text-orange-700 dark:text-orange-400",
      accent: "text-orange-800 dark:text-orange-300",
      glow: "shadow-[0_0_10px_rgba(249,115,22,0.15)]",
      wipBorder: "border-orange-500/40",
      wipBg: "bg-orange-500/15",
    };
  }
  if (ratio <= 0.6) {
    return {
      border: "border-amber-500/50",
      bg: "bg-amber-500/10",
      text: "text-amber-700 dark:text-amber-400",
      accent: "text-amber-800 dark:text-amber-300",
      glow: "shadow-[0_0_10px_rgba(245,158,11,0.15)]",
      wipBorder: "border-amber-500/40",
      wipBg: "bg-amber-500/15",
    };
  }
  if (ratio <= 0.8) {
    return {
      border: "border-lime-500/50",
      bg: "bg-lime-500/10",
      text: "text-lime-700 dark:text-lime-400",
      accent: "text-lime-800 dark:text-lime-300",
      glow: "shadow-[0_0_10px_rgba(132,204,22,0.15)]",
      wipBorder: "border-lime-500/40",
      wipBg: "bg-lime-500/15",
    };
  }
  return {
    border: "border-green-500/50",
    bg: "bg-green-500/10",
    text: "text-green-700 dark:text-green-400",
    accent: "text-green-800 dark:text-green-300",
    glow: "shadow-[0_0_10px_rgba(34,197,94,0.15)]",
    wipBorder: "border-green-500/40",
    wipBg: "bg-green-500/15",
  };
};

type PipelineFlowDisplayProps = {
  upstreamWip: number;
  waitingOutput: number;
  prevStation: PipelineNeighborStation | null;
  nextStation: PipelineNeighborStation | null;
  currentStationName: string;
  isTerminal: boolean;
  sessionGoodCount: number;
  /** Total number of stages in the pipeline (for color calculation) */
  totalStages?: number;
  /** Current station's position in the pipeline (0-indexed) */
  currentStageIndex?: number;
};

/**
 * Pipeline flow visualization with original tile shapes + animations.
 * Keeps the colored tiles with integrated WIP counters, adds directional arrows.
 * Colors follow the live dashboard gradient: red → orange → amber → lime → green → emerald
 */
function PipelineFlowDisplay({
  upstreamWip,
  waitingOutput,
  prevStation,
  nextStation,
  currentStationName,
  isTerminal,
  sessionGoodCount,
  totalStages = 3,
  currentStageIndex = 1,
}: PipelineFlowDisplayProps) {
  const { t } = useTranslation();
  // Track previous values for animation triggers
  const [animatingUpstream, setAnimatingUpstream] = useState(false);
  const [animatingDownstream, setAnimatingDownstream] = useState(false);
  const prevUpstreamRef = useRef(upstreamWip);
  const prevDownstreamRef = useRef(waitingOutput);

  // Trigger pulse animation when values change
  useEffect(() => {
    if (prevUpstreamRef.current !== upstreamWip) {
      setAnimatingUpstream(true);
      const timer = setTimeout(() => setAnimatingUpstream(false), 600);
      prevUpstreamRef.current = upstreamWip;
      return () => clearTimeout(timer);
    }
  }, [upstreamWip]);

  useEffect(() => {
    if (prevDownstreamRef.current !== waitingOutput) {
      setAnimatingDownstream(true);
      const timer = setTimeout(() => setAnimatingDownstream(false), 600);
      prevDownstreamRef.current = waitingOutput;
      return () => clearTimeout(timer);
    }
  }, [waitingOutput]);

  const isFirstStation = !prevStation;

  return (
    <div className="mt-1 pt-4 border-t border-border">
      {/* Section Label */}
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 text-right">
        {t("pipeline.flowTitle")}
      </div>

      {/* Pipeline Flow - RTL direction */}
      <div className="flex items-stretch gap-1.5">
        {/* Previous Station / Start */}
        {isFirstStation ? (
          <StartStationTile />
        ) : (
          <NeighborStationTile
            name={prevStation.name}
            occupiedBy={prevStation.occupiedBy}
            wipCount={upstreamWip}
            wipLabel={t("pipeline.waitingForUs")}
            isAnimating={animatingUpstream}
            stageIndex={currentStageIndex - 1}
            totalStages={totalStages}
          />
        )}

        {/* Flow Arrow */}
        <FlowArrow hasFlow={!isFirstStation && upstreamWip > 0} stageIndex={currentStageIndex - 1} totalStages={totalStages} />

        {/* Current Station - Emphasized */}
        <CurrentStationTile
          name={currentStationName}
          sessionCount={sessionGoodCount}
          isTerminal={isTerminal}
          stageIndex={currentStageIndex}
          totalStages={totalStages}
        />

        {/* Flow Arrow */}
        <FlowArrow hasFlow={waitingOutput > 0} stageIndex={currentStageIndex} totalStages={totalStages} />

        {/* Next Station / End */}
        {isTerminal ? (
          <EndStationTile completedCount={waitingOutput} isAnimating={animatingDownstream} />
        ) : (
          <NeighborStationTile
            name={nextStation?.name ?? ""}
            occupiedBy={nextStation?.occupiedBy}
            wipCount={waitingOutput}
            wipLabel={t("pipeline.goingOut")}
            isAnimating={animatingDownstream}
            stageIndex={currentStageIndex + 1}
            totalStages={totalStages}
            isTerminal={currentStageIndex + 1 === totalStages - 1}
          />
        )}
      </div>
    </div>
  );
}

// ============================================
// PIPELINE SUB-COMPONENTS - Original Style Refined
// ============================================

/** Start of pipeline indicator */
function StartStationTile() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-w-0 rounded-xl border-2 border-dashed border-border bg-muted/20 px-3 py-2">
      <Package className="h-5 w-5 text-muted-foreground mb-1" />
      <span className="text-xs font-semibold text-muted-foreground">{t("pipeline.startLine")}</span>
      <span className="text-[10px] text-muted-foreground/70 mt-0.5">{t("pipeline.rawMaterial")}</span>
    </div>
  );
}

/** End of pipeline indicator with completed count */
type EndStationTileProps = {
  completedCount: number;
  isAnimating: boolean;
};

function EndStationTile({ completedCount, isAnimating }: EndStationTileProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-w-0 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 px-3 py-2">
      <CheckCircle2 className="h-5 w-5 text-emerald-700 dark:text-emerald-400 mb-1" />
      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{t("pipeline.endLine")}</span>

      {/* Completed count */}
      <div
        className={cn(
          "mt-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 transition-transform duration-300",
          isAnimating && "scale-110"
        )}
      >
        <span className={cn(
          "text-lg font-bold tabular-nums text-emerald-800 dark:text-emerald-300 transition-all duration-300",
          isAnimating && "animate-pulse"
        )}>
          {formatCompactNumber(completedCount)}
        </span>
      </div>
      <span className="text-[9px] text-emerald-700/70 dark:text-emerald-400/70 mt-0.5">{t("pipeline.finishedProducts")}</span>
    </div>
  );
}

/** Neighbor station tile with integrated WIP counter */
type NeighborStationTileProps = {
  name: string;
  occupiedBy?: string | null;
  wipCount: number;
  wipLabel: string;
  isAnimating: boolean;
  /** Stage index for color calculation */
  stageIndex: number;
  /** Total stages for color calculation */
  totalStages: number;
  /** Whether this is the terminal stage */
  isTerminal?: boolean;
};

function NeighborStationTile({
  name,
  occupiedBy,
  wipCount,
  wipLabel,
  isAnimating,
  stageIndex,
  totalStages,
  isTerminal = false,
}: NeighborStationTileProps) {
  const { t } = useTranslation();
  const hasWorker = !!occupiedBy;
  const style = getPipelineStageStyle(stageIndex, totalStages, isTerminal);

  return (
    <div
      className={cn(
        "flex flex-col flex-1 min-w-0 rounded-xl border-2 px-2.5 py-2 transition-all",
        style.border,
        style.bg
      )}
    >
      {/* Station Name */}
      <span className={cn("text-xs font-bold text-center line-clamp-1", style.text)}>
        {name}
      </span>

      {/* Worker Badge */}
      <div className="flex justify-center mt-1">
        {hasWorker ? (
          <span className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold",
            style.wipBg, style.text, style.wipBorder, "border"
          )}>
            <User className="h-2.5 w-2.5" />
            <span className="truncate max-w-12">{occupiedBy.split(" ")[0]}</span>
          </span>
        ) : (
          <span className="text-[9px] text-muted-foreground px-1.5 py-0.5">{t("pipeline.free")}</span>
        )}
      </div>

      {/* WIP Counter - integrated into tile */}
      <div
        className={cn(
          "mt-1.5 flex flex-col items-center rounded-lg py-1.5 px-1.5 transition-all duration-300 border",
          style.wipBg,
          style.wipBorder,
          isAnimating && "scale-105"
        )}
      >
        <span className={cn("text-[9px] font-medium opacity-70", style.text)}>
          {wipLabel}
        </span>
        <span
          className={cn(
            "text-lg font-bold tabular-nums transition-all duration-300",
            style.accent,
            isAnimating && "animate-pulse"
          )}
        >
          {formatCompactNumber(wipCount)}
        </span>
      </div>
    </div>
  );
}

/** Current station tile - emphasized */
type CurrentStationTileProps = {
  name: string;
  sessionCount: number;
  isTerminal: boolean;
  /** Stage index for color calculation */
  stageIndex: number;
  /** Total stages for color calculation */
  totalStages: number;
};

function CurrentStationTile({
  name,
  sessionCount,
  isTerminal,
  stageIndex,
  totalStages,
}: CurrentStationTileProps) {
  const { t } = useTranslation();
  const style = getPipelineStageStyle(stageIndex, totalStages, isTerminal);

  return (
    <div
      className={cn(
        "flex flex-col flex-[1.15] min-w-0 rounded-xl border-2 px-3 py-2 transition-all",
        style.border,
        style.bg,
        style.glow
      )}
    >
      {/* Station Name - emphasized */}
      <span className={cn("text-sm font-bold text-center line-clamp-1", style.accent)}>
        {name}
      </span>

      {/* "You are here" indicator */}
      <div className="flex justify-center mt-1">
        <span className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border",
          style.wipBg, style.accent, style.wipBorder
        )}>
          <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", style.text.replace("text-", "bg-"))} />
          {t("pipeline.youAreHere")}
        </span>
      </div>

      {/* Session Count - what we reported this session */}
      <div className={cn(
        "mt-1.5 flex flex-col items-center rounded-lg py-1.5 px-1.5 border",
        style.wipBg,
        style.wipBorder
      )}>
        <span className={cn("text-[9px] font-medium opacity-70", style.text)}>
          {t("pipeline.reportedInShift")}
        </span>
        <span className={cn("text-lg font-bold tabular-nums", style.accent)}>
          {sessionCount.toLocaleString()}
        </span>
      </div>

      {/* Terminal indicator */}
      {isTerminal && (
        <span className="text-[8px] font-semibold text-emerald-700 dark:text-emerald-400 text-center mt-1">
          {t("pipeline.endLine")}
        </span>
      )}
    </div>
  );
}

/** Flow arrow between stations - RTL chevron with animation */
type FlowArrowProps = {
  hasFlow: boolean;
  /** Stage index for color calculation */
  stageIndex: number;
  /** Total stages for color calculation */
  totalStages: number;
};

// Get arrow color based on stage (simpler version of full style)
// Uses dark: prefix for light/dark mode contrast support
const getArrowColor = (stageIndex: number, totalStages: number) => {
  const ratio = totalStages <= 1 ? 1 : stageIndex / (totalStages - 1);
  if (ratio <= 0.2) return { text: "text-red-600 dark:text-red-400", ping: "bg-red-400/30", glow: "drop-shadow-[0_0_4px_rgba(239,68,68,0.6)]" };
  if (ratio <= 0.4) return { text: "text-orange-600 dark:text-orange-400", ping: "bg-orange-400/30", glow: "drop-shadow-[0_0_4px_rgba(249,115,22,0.6)]" };
  if (ratio <= 0.6) return { text: "text-amber-600 dark:text-amber-400", ping: "bg-amber-400/30", glow: "drop-shadow-[0_0_4px_rgba(245,158,11,0.6)]" };
  if (ratio <= 0.8) return { text: "text-lime-600 dark:text-lime-400", ping: "bg-lime-400/30", glow: "drop-shadow-[0_0_4px_rgba(132,204,22,0.6)]" };
  return { text: "text-green-600 dark:text-green-400", ping: "bg-green-400/30", glow: "drop-shadow-[0_0_4px_rgba(34,197,94,0.6)]" };
};

function FlowArrow({ hasFlow, stageIndex, totalStages }: FlowArrowProps) {
  const arrowStyle = getArrowColor(stageIndex, totalStages);

  return (
    <div className="flex items-center justify-center w-6 shrink-0">
      <div className="relative flex items-center justify-center">
        {/* Animated glow when flow is active */}
        {hasFlow && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn("h-4 w-4 rounded-full animate-ping", arrowStyle.ping)} />
          </div>
        )}
        <ChevronLeft
          className={cn(
            "h-5 w-5 transition-all duration-300 relative z-10",
            hasFlow
              ? cn(arrowStyle.text, arrowStyle.glow)
              : "text-muted-foreground/50"
          )}
        />
      </div>
    </div>
  );
}
