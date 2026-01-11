"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import type { Station } from "@/lib/types";

// ============================================
// TYPES
// ============================================

export type PipelineStation = {
  id: string;
  name: string;
  code: string;
  position: number;
  isTerminal: boolean;
  wipAvailable: number;
  occupiedBy?: string | null;
};

export type ProductionPipelineProps = {
  /** Current station info */
  currentStation: Station;
  /** Position in the line (1-indexed) */
  currentPosition: number;
  /** Is this a terminal station? */
  isTerminal: boolean;
  /** Previous station in line (null if first) - UPSTREAM */
  prevStation: PipelineStation | null;
  /** Next station in line (null if terminal) - DOWNSTREAM */
  nextStation: PipelineStation | null;
  /** WIP available from upstream */
  upstreamWip: number;
  /** Our output waiting for downstream */
  waitingOutput: number;
  /** Current good count */
  goodCount: number;
  /** Current scrap count */
  scrapCount: number;
  /** Callback when good count changes */
  onGoodChange: (delta: number) => void;
  /** Callback when good count is set directly */
  onGoodSet: (value: number) => void;
  /** Callback when scrap count changes */
  onScrapChange: (delta: number) => void;
  /** Callback when scrap count is set directly */
  onScrapSet: (value: number) => void;
  /** Error message to display */
  error?: string | null;
  /** Is this a single station (not in a line)? */
  isSingleStation?: boolean;
  /** Is this a legacy session without job items? */
  isLegacy?: boolean;
  /** Timestamp for detecting real-time updates (for animations) */
  lastUpdated?: number;
};

// ============================================
// ANIMATION HOOK
// ============================================

const useValueChangeAnimation = (value: number, duration = 600) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const prevValueRef = useRef(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      setIsAnimating(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setIsAnimating(false);
      }, duration);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, duration]);

  return isAnimating;
};

// ============================================
// SUB-COMPONENTS
// ============================================

type NeighborStationCardProps = {
  station: PipelineStation | null;
  type: "upstream" | "downstream";
  wipCount: number;
  label: string;
  wipLabel: string;
  emptyLabel: string;
  lastUpdated?: number;
};

const NeighborStationCard = ({
  station,
  type,
  wipCount,
  label,
  wipLabel,
  emptyLabel,
  lastUpdated,
}: NeighborStationCardProps) => {
  const isUpstream = type === "upstream";
  const isWipAnimating = useValueChangeAnimation(wipCount);

  // Detect if value changed from external update (real-time)
  const prevWipRef = useRef(wipCount);
  const [showFlowAnimation, setShowFlowAnimation] = useState(false);

  useEffect(() => {
    if (lastUpdated && prevWipRef.current !== wipCount) {
      prevWipRef.current = wipCount;
      setShowFlowAnimation(true);
      const timeout = setTimeout(() => setShowFlowAnimation(false), 800);
      return () => clearTimeout(timeout);
    }
  }, [wipCount, lastUpdated]);

  if (!station) {
    return (
      <div className="flex h-full min-h-[100px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/40 bg-muted/10 p-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/30">
          {isUpstream ? (
            // Input/start icon for first station
            <svg className="h-4 w-4 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
            </svg>
          ) : (
            // Checkmark for terminal/last station
            <svg className="h-4 w-4 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <span className="mt-2 text-xs text-muted-foreground/50">
          {emptyLabel}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-full min-h-[100px] w-full flex-col justify-between rounded-xl border-2 p-3 transition-all duration-300",
        isUpstream
          ? "border-amber-500/40 bg-gradient-to-b from-amber-50/80 to-amber-50/30 dark:border-amber-500/30 dark:from-amber-500/10 dark:to-amber-500/5"
          : "border-sky-500/40 bg-gradient-to-b from-sky-50/80 to-sky-50/30 dark:border-sky-500/30 dark:from-sky-500/10 dark:to-sky-500/5"
      )}
    >
      {/* Station label */}
      <div className="text-right">
        <p className={cn(
          "text-[10px] font-bold uppercase tracking-wider",
          isUpstream ? "text-amber-600/70 dark:text-amber-400/70" : "text-sky-600/70 dark:text-sky-400/70"
        )}>
          {label}
        </p>
        <h4 className="mt-0.5 text-sm font-semibold text-foreground line-clamp-1">
          {station.name}
        </h4>
        {station.occupiedBy && (
          <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
            {station.occupiedBy}
          </p>
        )}
      </div>

      {/* WIP count with animation */}
      <div className="mt-2 text-right">
        <p className={cn(
          "text-[10px] font-medium",
          isUpstream ? "text-amber-600/70 dark:text-amber-400/70" : "text-sky-600/70 dark:text-sky-400/70"
        )}>
          {wipLabel}
        </p>
        <p
          className={cn(
            "font-mono text-2xl font-bold tabular-nums transition-all duration-300",
            isUpstream ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400",
            isWipAnimating && "scale-110"
          )}
        >
          {wipCount.toLocaleString()}
        </p>
      </div>

      {/* Flow animation indicator */}
      {showFlowAnimation && (
        <div
          className={cn(
            "absolute inset-0 rounded-xl border-2 animate-pulse pointer-events-none",
            isUpstream ? "border-amber-400" : "border-sky-400"
          )}
        />
      )}
    </div>
  );
};

type ProductionControlsProps = {
  goodCount: number;
  scrapCount: number;
  onGoodChange: (delta: number) => void;
  onGoodSet: (value: number) => void;
  onScrapChange: (delta: number) => void;
  onScrapSet: (value: number) => void;
  goodLabel: string;
  scrapLabel: string;
  collapseLabel: string;
  expandLabel: string;
};

const ProductionControls = ({
  goodCount,
  scrapCount,
  onGoodChange,
  onGoodSet,
  onScrapChange,
  onScrapSet,
  goodLabel,
  scrapLabel,
  collapseLabel,
  expandLabel,
}: ProductionControlsProps) => {
  const [isScrapExpanded, setScrapExpanded] = useState(false);

  const handleGoodInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (!Number.isNaN(val) && val >= 0) {
        onGoodSet(val);
      }
    },
    [onGoodSet]
  );

  const handleScrapInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (!Number.isNaN(val) && val >= 0) {
        onScrapSet(val);
      }
    },
    [onScrapSet]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Good counter - primary */}
      <div className="overflow-hidden rounded-xl border-2 border-emerald-500/40 bg-gradient-to-b from-emerald-50 to-emerald-50/30 shadow-sm dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-emerald-500/5">
        <div className="p-3 pb-2">
          <p className="text-right text-xs font-bold text-emerald-700 dark:text-emerald-400">
            {goodLabel}
          </p>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={goodCount}
            onChange={handleGoodInputChange}
            className="mt-2 w-full appearance-none rounded-lg border-2 border-emerald-500/30 bg-white py-4 text-center font-mono text-5xl font-bold tabular-nums text-emerald-600 outline-none transition-all duration-200 focus:border-emerald-500/60 focus:ring-0 dark:border-emerald-500/20 dark:bg-card dark:text-emerald-400 dark:focus:border-emerald-500/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
        <div className="flex border-t border-emerald-500/20 bg-emerald-100/40 dark:border-emerald-500/10 dark:bg-emerald-500/5">
          <Button
            type="button"
            variant="ghost"
            className="h-11 flex-1 rounded-none border-l border-emerald-500/20 text-base font-bold text-slate-500 hover:bg-emerald-200/50 hover:text-slate-700 dark:border-emerald-500/10 dark:text-muted-foreground dark:hover:bg-emerald-500/10 dark:hover:text-foreground"
            onClick={() => onGoodChange(-10)}
          >
            -10
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 flex-1 rounded-none border-l border-emerald-500/20 text-base font-bold text-slate-500 hover:bg-emerald-200/50 hover:text-slate-700 dark:border-emerald-500/10 dark:text-muted-foreground dark:hover:bg-emerald-500/10 dark:hover:text-foreground"
            onClick={() => onGoodChange(-1)}
          >
            -1
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 flex-1 rounded-none border-l border-emerald-500/20 text-base font-bold text-emerald-600 hover:bg-emerald-200/50 hover:text-emerald-700 dark:border-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300"
            onClick={() => onGoodChange(1)}
          >
            +1
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 flex-1 rounded-none text-base font-bold text-emerald-600 hover:bg-emerald-200/50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300"
            onClick={() => onGoodChange(10)}
          >
            +10
          </Button>
        </div>
      </div>

      {/* Scrap counter - secondary/compact */}
      <div
        className={cn(
          "overflow-hidden rounded-xl border transition-all duration-300",
          isScrapExpanded
            ? "border-rose-500/30 bg-rose-50/50 dark:border-rose-500/20 dark:bg-rose-500/5"
            : "border-rose-500/20 bg-rose-50/30 dark:border-rose-500/15 dark:bg-rose-500/5 cursor-pointer hover:border-rose-500/40 hover:bg-rose-50/50"
        )}
        onClick={() => !isScrapExpanded && setScrapExpanded(true)}
      >
        {isScrapExpanded ? (
          <>
            <div className="flex items-center justify-between p-2.5 pb-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setScrapExpanded(false);
                }}
              >
                {collapseLabel}
              </Button>
              <p className="text-right text-xs font-medium text-rose-600 dark:text-rose-400">
                {scrapLabel}
              </p>
            </div>
            <div className="px-2.5 pb-1.5">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={scrapCount}
                onChange={handleScrapInputChange}
                className="w-full appearance-none rounded-lg border border-rose-500/30 bg-white py-2.5 text-center font-mono text-3xl font-bold tabular-nums text-rose-600 outline-none transition-all duration-200 focus:border-rose-500/60 focus:ring-0 dark:border-rose-500/20 dark:bg-card dark:text-rose-400 dark:focus:border-rose-500/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div className="flex border-t border-rose-500/15 bg-rose-100/30 dark:border-rose-500/10 dark:bg-rose-500/5">
              <Button
                type="button"
                variant="ghost"
                className="h-9 flex-1 rounded-none border-l border-rose-500/15 text-sm font-bold text-slate-500 hover:bg-rose-200/50 hover:text-slate-700 dark:border-rose-500/10 dark:text-muted-foreground dark:hover:bg-rose-500/10 dark:hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); onScrapChange(-10); }}
              >
                -10
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 flex-1 rounded-none border-l border-rose-500/15 text-sm font-bold text-slate-500 hover:bg-rose-200/50 hover:text-slate-700 dark:border-rose-500/10 dark:text-muted-foreground dark:hover:bg-rose-500/10 dark:hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); onScrapChange(-1); }}
              >
                -1
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 flex-1 rounded-none border-l border-rose-500/15 text-sm font-bold text-rose-600 hover:bg-rose-200/50 hover:text-rose-700 dark:border-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 dark:hover:text-rose-300"
                onClick={(e) => { e.stopPropagation(); onScrapChange(1); }}
              >
                +1
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 flex-1 rounded-none text-sm font-bold text-rose-600 hover:bg-rose-200/50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/20 dark:hover:text-rose-300"
                onClick={(e) => { e.stopPropagation(); onScrapChange(10); }}
              >
                +10
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between p-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-rose-500/10 px-2 py-0.5 font-mono text-base font-bold tabular-nums text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
                {scrapCount}
              </span>
              <span className="text-[10px] text-muted-foreground/70">{expandLabel}</span>
            </div>
            <p className="text-xs font-medium text-rose-600/70 dark:text-rose-400/70">
              {scrapLabel}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// FLOW ARROW CONNECTOR - RTL aware
// ============================================

type FlowArrowProps = {
  isActive?: boolean;
  direction: "from-upstream" | "to-downstream";
};

const FlowArrow = ({ isActive = true, direction }: FlowArrowProps) => {
  const isFromUpstream = direction === "from-upstream";

  return (
    <div className="relative flex h-full min-h-[100px] w-8 flex-col items-center justify-center">
      {/* Animated dashed line */}
      <div
        className={cn(
          "h-full w-0.5 border-r-2 border-dashed transition-colors duration-300",
          isActive
            ? isFromUpstream
              ? "border-amber-400/50"
              : "border-sky-400/50"
            : "border-border/40"
        )}
      />
      {/* Arrow circle with direction indicator */}
      <div
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background shadow-sm transition-all duration-300",
          isActive
            ? isFromUpstream
              ? "border-amber-400 text-amber-500"
              : "border-sky-400 text-sky-500"
            : "border-muted text-muted-foreground/50"
        )}
      >
        {/* Arrow pointing left (RTL flow direction) */}
        <svg
          className={cn(
            "h-3 w-3 transition-transform duration-300",
            isActive && "animate-pulse"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </div>
    </div>
  );
};

// ============================================
// CURRENT STATION CARD
// ============================================

type CurrentStationCardProps = {
  station: Station;
  position: number;
  output: number;
  outputLabel: string;
};

const CurrentStationCard = ({ station, position, output, outputLabel }: CurrentStationCardProps) => (
  <div className="rounded-xl border-2 border-primary/40 bg-gradient-to-b from-primary/10 to-primary/5 p-3 shadow-sm">
    <div className="flex items-center justify-between">
      <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
        #{position}
      </span>
      <div className="text-right">
        <h3 className="text-sm font-bold text-foreground line-clamp-1">{station.name}</h3>
        <p className="text-[10px] text-muted-foreground">{station.code}</p>
      </div>
    </div>
    <div className="mt-2 text-right">
      <p className="text-[10px] font-medium text-primary/70">{outputLabel}</p>
      <p className="font-mono text-xl font-bold tabular-nums text-primary">
        {output.toLocaleString()}
      </p>
    </div>
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================

export const ProductionPipeline = ({
  currentStation,
  currentPosition,
  isTerminal,
  prevStation,
  nextStation,
  upstreamWip,
  waitingOutput,
  goodCount,
  scrapCount,
  onGoodChange,
  onGoodSet,
  onScrapChange,
  onScrapSet,
  error,
  isSingleStation = false,
  isLegacy = false,
  lastUpdated,
}: ProductionPipelineProps) => {
  const { t } = useTranslation();

  // For legacy sessions or single stations, render simplified layout
  if (isLegacy || isSingleStation) {
    return (
      <div className="space-y-4">
        {/* Current station header - only for single stations, not legacy */}
        {isSingleStation && !isLegacy && (
          <div className="rounded-xl border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-3">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
                {t("work.pipeline.singleStation")}
              </span>
              <div className="text-right">
                <h3 className="text-base font-bold text-foreground">{currentStation.name}</h3>
                <p className="text-xs text-muted-foreground">{currentStation.code}</p>
              </div>
            </div>
          </div>
        )}

        {/* Production controls */}
        <ProductionControls
          goodCount={goodCount}
          scrapCount={scrapCount}
          onGoodChange={onGoodChange}
          onGoodSet={onGoodSet}
          onScrapChange={onScrapChange}
          onScrapSet={onScrapSet}
          goodLabel={t("work.counters.good")}
          scrapLabel={t("work.counters.scrap")}
          collapseLabel={t("work.pipeline.collapse")}
          expandLabel={t("work.pipeline.expand")}
        />

        {/* Error display */}
        {error && (
          <p className="text-right text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Production line layout with flow visualization
  // RTL flow: Upstream (RIGHT) → Current (CENTER) → Downstream (LEFT)
  return (
    <div className="space-y-4">
      {/* Section 1: Production Counter */}
      <ProductionControls
        goodCount={goodCount}
        scrapCount={scrapCount}
        onGoodChange={onGoodChange}
        onGoodSet={onGoodSet}
        onScrapChange={onScrapChange}
        onScrapSet={onScrapSet}
        goodLabel={t("work.counters.good")}
        scrapLabel={t("work.counters.scrap")}
        collapseLabel={t("work.pipeline.collapse")}
        expandLabel={t("work.pipeline.expand")}
      />

      {/* Section 2: Production Line Flow Visualization */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
        <p className="mb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("work.pipeline.flowTitle")}
        </p>

        {/* Flow grid: RTL layout - first item appears on RIGHT visually */}
        {/* Visual order (RTL): Upstream (right) → Current (center) → Downstream (left) */}
        <div className="grid grid-cols-[1fr,auto,1.2fr,auto,1fr] items-stretch gap-1">
          {/* Upstream station (RIGHT in RTL) - where products COME FROM */}
          <NeighborStationCard
            station={prevStation}
            type="upstream"
            wipCount={upstreamWip}
            label={t("work.pipeline.upstream")}
            wipLabel={t("work.pipeline.available")}
            emptyLabel={currentPosition === 1 ? t("work.pipeline.firstStation") : t("work.pipeline.noStation")}
            lastUpdated={lastUpdated}
          />

          {/* Flow arrow: from upstream */}
          <FlowArrow
            direction="from-upstream"
            isActive={upstreamWip > 0}
          />

          {/* Current station (CENTER) */}
          <CurrentStationCard
            station={currentStation}
            position={currentPosition}
            output={goodCount}
            outputLabel={t("work.pipeline.output")}
          />

          {/* Flow arrow: to downstream */}
          <FlowArrow
            direction="to-downstream"
            isActive={goodCount > 0}
          />

          {/* Downstream station (LEFT in RTL) - where products GO TO */}
          <NeighborStationCard
            station={nextStation}
            type="downstream"
            wipCount={waitingOutput}
            label={t("work.pipeline.downstream")}
            wipLabel={t("work.pipeline.waiting")}
            emptyLabel={isTerminal ? t("work.pipeline.lastStation") : t("work.pipeline.noStation")}
            lastUpdated={lastUpdated}
          />
        </div>
      </div>

      {/* Error display */}
      {error && (
        <p className="text-right text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
};

export default ProductionPipeline;
