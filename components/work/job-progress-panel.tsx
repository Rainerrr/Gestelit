"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { JobProgressBar } from "./job-progress-bar";
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
  /** When true, skip outer wrapper + header, render body only (for embedding in parent card) */
  embedded?: boolean;
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
  embedded = false,
}: JobProgressPanelProps) {
  const { t } = useTranslation();
  const displayMode = "numbers" as const;

  // Total completed values from the database.
  // DO NOT add sessionTotals - the DB values already include this session's reports.
  // sessionTotals is only used for the dual-color bar to show "this session's contribution".
  const totalCompletedGood = activeJobItem?.completedGood ?? 0;
  const totalCompletedScrap = activeJobItem?.completedScrap ?? 0;
  const totalCompleted = totalCompletedGood + totalCompletedScrap;

  // Check if we should show pipeline (multi-station production line)
  const showPipeline = pipelineContext?.isProductionLine &&
    !pipelineContext?.isSingleStation &&
    (pipelineContext?.prevStation || pipelineContext?.nextStation);

  // Empty state - no job selected (parent handles this in embedded mode)
  if (!activeJobItem && !embedded) {
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

  // In embedded mode with no active job item, render nothing (parent handles empty state)
  if (!activeJobItem) {
    return null;
  }

  // Embedded mode: render only the body (progress bar, stats, pipeline) — no outer wrapper or header
  if (embedded) {
    return (
      <div className={cn("space-y-4", className)}>
        <JobProgressBar
          plannedQuantity={activeJobItem.plannedQuantity}
          totalGood={totalCompletedGood}
          totalScrap={totalCompletedScrap}
          sessionGood={sessionTotals.good}
          sessionScrap={sessionTotals.scrap}
          displayMode={displayMode}
          showLegend
          showOverlay
        />

        {/* This Session Stats - 3 tiles */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">
            משמרת זו
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-card/80 border border-border px-3 py-3 text-center">
              <div className="text-xs font-medium text-muted-foreground">תקין במשמרת</div>
              <div className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCompactNumber(sessionTotals.good)}
              </div>
            </div>

            <div className="rounded-lg bg-card/80 border border-border px-3 py-3 text-center">
              <div className="text-xs font-medium text-muted-foreground">פסול במשמרת</div>
              <div className={cn(
                "text-2xl font-bold tabular-nums",
                sessionTotals.scrap > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground/50"
              )}>
                {formatCompactNumber(sessionTotals.scrap)}
              </div>
            </div>

            <div className="rounded-lg bg-card/80 border border-border px-3 py-3 text-center">
              <div className="text-xs font-medium text-muted-foreground">נותרו</div>
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
            totalGoodReported={totalCompletedGood}
            totalScrapReported={totalCompletedScrap}
            totalStages={pipelineContext.totalStages}
            currentStageIndex={pipelineContext.currentStageIndex}
          />
        )}
      </div>
    );
  }

  // Active state - job selected (standalone mode with full wrapper)
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

        <JobProgressBar
          plannedQuantity={activeJobItem.plannedQuantity}
          totalGood={totalCompletedGood}
          totalScrap={totalCompletedScrap}
          sessionGood={sessionTotals.good}
          sessionScrap={sessionTotals.scrap}
          displayMode={displayMode}
          showLegend
          showOverlay
        />

        {/* This Session Stats - 3 tiles */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">
            משמרת זו
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-card/80 border border-border px-3 py-3 text-center">
              <div className="text-xs font-medium text-muted-foreground">תקין במשמרת</div>
              <div className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCompactNumber(sessionTotals.good)}
              </div>
            </div>

            <div className="rounded-lg bg-card/80 border border-border px-3 py-3 text-center">
              <div className="text-xs font-medium text-muted-foreground">פסול במשמרת</div>
              <div className={cn(
                "text-2xl font-bold tabular-nums",
                sessionTotals.scrap > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground/50"
              )}>
                {formatCompactNumber(sessionTotals.scrap)}
              </div>
            </div>

            <div className="rounded-lg bg-card/80 border border-border px-3 py-3 text-center">
              <div className="text-xs font-medium text-muted-foreground">נותרו</div>
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
            totalGoodReported={totalCompletedGood}
            totalScrapReported={totalCompletedScrap}
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

// Color scheme matching the live dashboard pipeline dots (blue gradient → emerald terminal)
// Blue: #0661D0 → #06B6D4 (cyan) interpolated by position, terminal = emerald
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

  // Calculate position ratio (0 = start/blue, 1 = end/cyan)
  const ratio = totalStages <= 1 ? 0 : stageIndex / (totalStages - 1);

  // Blue → Cyan gradient based on position
  if (ratio <= 0.5) {
    return {
      border: "border-blue-500/50",
      bg: "bg-blue-500/10",
      text: "text-blue-700 dark:text-blue-400",
      accent: "text-blue-800 dark:text-blue-300",
      glow: "shadow-[0_0_10px_rgba(6,97,208,0.15)]",
      wipBorder: "border-blue-500/40",
      wipBg: "bg-blue-500/15",
    };
  }
  return {
    border: "border-cyan-500/50",
    bg: "bg-cyan-500/10",
    text: "text-cyan-700 dark:text-cyan-400",
    accent: "text-cyan-800 dark:text-cyan-300",
    glow: "shadow-[0_0_10px_rgba(6,182,212,0.15)]",
    wipBorder: "border-cyan-500/40",
    wipBg: "bg-cyan-500/15",
  };
};

type PipelineFlowDisplayProps = {
  upstreamWip: number;
  waitingOutput: number;
  prevStation: PipelineNeighborStation | null;
  nextStation: PipelineNeighborStation | null;
  currentStationName: string;
  isTerminal: boolean;
  /** Total good reported at current station (all sessions) */
  totalGoodReported: number;
  /** Total scrap reported at current station (all sessions) */
  totalScrapReported: number;
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
  totalGoodReported,
  totalScrapReported,
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
            goodReported={prevStation.goodReported}
            scrapReported={prevStation.scrapReported}
            isAnimating={animatingUpstream}
            stageIndex={currentStageIndex - 1}
            totalStages={totalStages}
          />
        )}

        {/* Flow Arrow */}
        <FlowArrow hasFlow={!isFirstStation && (prevStation?.goodReported ?? 0) > 0} stageIndex={currentStageIndex - 1} totalStages={totalStages} />

        {/* Current Station - Emphasized */}
        <CurrentStationTile
          name={currentStationName}
          totalGoodReported={totalGoodReported}
          totalScrapReported={totalScrapReported}
          isTerminal={isTerminal}
          stageIndex={currentStageIndex}
          totalStages={totalStages}
        />

        {/* Flow Arrow */}
        <FlowArrow hasFlow={totalGoodReported > 0 || totalScrapReported > 0} stageIndex={currentStageIndex} totalStages={totalStages} />

        {/* Next Station / End */}
        {isTerminal ? (
          <EndStationTile completedCount={waitingOutput} isAnimating={animatingDownstream} />
        ) : (
          <NeighborStationTile
            name={nextStation?.name ?? ""}
            occupiedBy={nextStation?.occupiedBy}
            goodReported={nextStation?.goodReported ?? 0}
            scrapReported={nextStation?.scrapReported ?? 0}
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

/** Neighbor station tile with good/scrap reported counts */
type NeighborStationTileProps = {
  name: string;
  occupiedBy?: string | null;
  goodReported: number;
  scrapReported: number;
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
  goodReported,
  scrapReported,
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

      {/* Reported Counter - good + scrap */}
      <div
        className={cn(
          "mt-1.5 flex flex-col items-center rounded-lg py-1.5 px-1.5 transition-all duration-300 border",
          style.wipBg,
          style.wipBorder,
          isAnimating && "scale-105"
        )}
      >
        <span className={cn("text-[9px] font-medium opacity-70", style.text)}>
          דווח בתחנה
        </span>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "text-lg font-bold tabular-nums transition-all duration-300",
              style.accent,
              isAnimating && "animate-pulse"
            )}
          >
            {formatCompactNumber(goodReported)}
          </span>
          {scrapReported > 0 && (
            <span className="text-xs font-bold tabular-nums text-rose-400">
              +{formatCompactNumber(scrapReported)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Current station tile - emphasized */
type CurrentStationTileProps = {
  name: string;
  totalGoodReported: number;
  totalScrapReported: number;
  isTerminal: boolean;
  /** Stage index for color calculation */
  stageIndex: number;
  /** Total stages for color calculation */
  totalStages: number;
};

function CurrentStationTile({
  name,
  totalGoodReported,
  totalScrapReported,
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

      {/* Total reported at this station (good + scrap) — same format as neighbor stations */}
      <div className={cn(
        "mt-1.5 flex flex-col items-center rounded-lg py-1.5 px-1.5 border",
        style.wipBg,
        style.wipBorder
      )}>
        <span className={cn("text-[9px] font-medium opacity-70", style.text)}>
          דווח בתחנה
        </span>
        <div className="flex items-center gap-1">
          <span className={cn("text-lg font-bold tabular-nums", style.accent)}>
            {totalGoodReported.toLocaleString()}
          </span>
          {totalScrapReported > 0 && (
            <span className="text-xs font-bold tabular-nums text-rose-400">
              +{totalScrapReported.toLocaleString()}
            </span>
          )}
        </div>
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

// Get arrow color based on stage — blue gradient matching pipeline dots
const getArrowColor = (stageIndex: number, totalStages: number) => {
  const ratio = totalStages <= 1 ? 0 : stageIndex / (totalStages - 1);
  if (ratio <= 0.5) return { text: "text-blue-600 dark:text-blue-400", ping: "bg-blue-400/30", glow: "drop-shadow-[0_0_4px_rgba(6,97,208,0.6)]" };
  return { text: "text-cyan-600 dark:text-cyan-400", ping: "bg-cyan-400/30", glow: "drop-shadow-[0_0_4px_rgba(6,182,212,0.6)]" };
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
