"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Factory,
  Package,
  Zap,
  User,
} from "lucide-react";
import { useRealtimeJobProgress } from "@/lib/hooks/useRealtimeJobProgress";
import { useAdminActiveJobsSummary } from "@/contexts/AdminSessionsContext";
import type { LiveJobProgress as LiveJobProgressData, WipStationData, LiveJobItemAssignment } from "@/lib/types";

// Gradient colors based on position (red -> orange -> yellow -> lime -> green)
const getSegmentStyle = (idx: number, total: number, isTerminal: boolean) => {
  if (isTerminal || total <= 1) {
    return { bg: "bg-emerald-500", color: "#10b981" };
  }
  const ratio = idx / Math.max(1, total - 1);

  if (ratio <= 0.2) return { bg: "bg-red-500", color: "#ef4444" };
  if (ratio <= 0.4) return { bg: "bg-orange-500", color: "#f97316" };
  if (ratio <= 0.6) return { bg: "bg-amber-500", color: "#f59e0b" };
  if (ratio <= 0.8) return { bg: "bg-lime-500", color: "#84cc16" };
  return { bg: "bg-green-500", color: "#22c55e" };
};

type LiveJobProgressProps = {
  className?: string;
};

type EnrichedJobItemAssignment = LiveJobItemAssignment & {
  wipDistribution: (WipStationData & { activeWorkers?: string[] })[];
};

type EnrichedJobProgress = LiveJobProgressData & {
  jobItems: EnrichedJobItemAssignment[];
  stationWorkersMap: Map<string, string[]>;
};

const LiveJobProgressComponent = ({ className }: LiveJobProgressProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showPercentages, setShowPercentages] = useState(false);
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());

  // Use SSE-based real-time job progress
  const { jobs, isLoading } = useRealtimeJobProgress();

  // Get real-time active session data from context
  const activeJobsSummary = useAdminActiveJobsSummary();

  // Toggle collapsed state for a job item
  const toggleCollapsed = useCallback((jobItemId: string) => {
    setCollapsedItems((prev) => {
      const next = new Set(prev);
      if (next.has(jobItemId)) {
        next.delete(jobItemId);
      } else {
        next.add(jobItemId);
      }
      return next;
    });
  }, []);

  // Merge live session data with fetched job progress
  const mergedJobs = useMemo(() => {
    if (jobs.length === 0) return [];

    // Create a map from context data for quick lookup
    const contextMap = new Map(
      activeJobsSummary.map((j) => [j.jobId, j])
    );

    return jobs.map((job) => {
      const contextData = contextMap.get(job.job.id);
      if (contextData) {
        // Update active station IDs and worker info from live context
        const liveActiveStationIds = contextData.activeStationIds;
        const stationWorkersMap = new Map(
          contextData.stationWorkers.map((sw) => [sw.stationId, sw.workerNames])
        );
        return {
          ...job,
          activeSessionCount: contextData.sessionCount,
          activeStationIds: liveActiveStationIds,
          stationWorkersMap,
          jobItems: job.jobItems.map((assignment) => ({
            ...assignment,
            wipDistribution: assignment.wipDistribution.map((wip) => ({
              ...wip,
              hasActiveSession: liveActiveStationIds.includes(wip.stationId),
              activeWorkers: stationWorkersMap.get(wip.stationId) ?? [],
            })),
          })),
        };
      }
      return {
        ...job,
        stationWorkersMap: new Map<string, string[]>(),
        jobItems: job.jobItems.map((assignment) => ({
          ...assignment,
          wipDistribution: assignment.wipDistribution.map((wip) => ({
            ...wip,
            activeWorkers: [] as string[],
          })),
        })),
      };
    }) as EnrichedJobProgress[];
  }, [jobs, activeJobsSummary]);

  // Sort by session count and keep index in bounds
  const sortedJobs = useMemo(() => {
    return [...mergedJobs].sort(
      (a, b) => b.activeSessionCount - a.activeSessionCount
    );
  }, [mergedJobs]);

  // Keep current index in bounds when jobs change
  useEffect(() => {
    if (currentIndex >= sortedJobs.length && sortedJobs.length > 0) {
      setCurrentIndex(Math.max(0, sortedJobs.length - 1));
    }
  }, [sortedJobs.length, currentIndex]);

  const currentJob = sortedJobs[currentIndex] ?? null;
  const totalJobs = sortedJobs.length;

  const handlePrevious = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(totalJobs - 1, prev + 1));
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className={`rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden ${className}`}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-base font-semibold text-foreground">התקדמות עבודות</h3>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
            </div>
            <p className="text-sm text-muted-foreground">טוען עבודות...</p>
          </div>
        </div>
      </div>
    );
  }

  // Render empty state
  if (totalJobs === 0) {
    return (
      <div className={`rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden ${className}`}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-base font-semibold text-foreground">התקדמות עבודות</h3>
        </div>
        <div className="flex flex-col items-center justify-center h-64">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-4">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">אין עבודות פעילות</p>
        </div>
      </div>
    );
  }

  const job = currentJob!;

  return (
    <div className={`rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-base font-semibold text-foreground">התקדמות עבודות</h3>
        </div>

        <div className="flex items-center gap-3">
          {/* Segmented Toggle Buttons */}
          <div className="flex items-center rounded-lg bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setShowPercentages(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                !showPercentages
                  ? "bg-accent text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              יחידות
            </button>
            <button
              type="button"
              onClick={() => setShowPercentages(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                showPercentages
                  ? "bg-accent text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              אחוזים
            </button>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center rounded-lg bg-muted p-0.5">
            <button
              type="button"
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className={`p-1.5 rounded-md transition-all ${
                currentIndex === 0
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs font-mono text-muted-foreground min-w-[40px] text-center">
              {currentIndex + 1} / {totalJobs}
            </span>
            <button
              type="button"
              onClick={handleNext}
              disabled={currentIndex === totalJobs - 1}
              className={`p-1.5 rounded-md transition-all ${
                currentIndex === totalJobs - 1
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">
        {/* Job Info Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/20 border border-primary/30">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-foreground">
                עבודה {job.job.job_number}
              </div>
              <div className="text-xs text-muted-foreground">
                {job.job.customer_name && (
                  <span>{job.job.customer_name}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Render all job item assignments */}
        {job.jobItems.length === 0 && (
          <div className="flex items-center justify-center h-16 rounded-xl bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400">עבודה ללא מוצרים מוגדרים</p>
          </div>
        )}

        {/* Sort job items: incomplete first, completed at bottom */}
        {[...job.jobItems]
          .map((assignment) => {
            const plannedQty = assignment.plannedQuantity || 0;
            const completedQty = assignment.completedGood || 0;
            const isComplete = plannedQty > 0 && completedQty >= plannedQty;
            return { assignment, isComplete };
          })
          .sort((a, b) => (a.isComplete === b.isComplete ? 0 : a.isComplete ? 1 : -1))
          .map(({ assignment, isComplete }) => {
          // Post Phase 5: all items are pipelines, determine multi-station by step count
          const wipDistribution = assignment.wipDistribution || [];
          const isMultiStation = wipDistribution.length > 1;
          const isSingleStation = wipDistribution.length === 1;
          const plannedQuantity = assignment.plannedQuantity || 0;
          // Use terminal station's WIP as completed count (they're the same thing)
          const terminalWip = wipDistribution.find((w) => w.isTerminal);
          const completedGood = terminalWip?.goodAvailable ?? 0;
          // Total WIP across all stations
          const totalWip = wipDistribution.reduce((sum, w) => sum + w.goodAvailable, 0);
          const completionPercent = plannedQuantity > 0
            ? Math.min(100, Math.round((completedGood / plannedQuantity) * 100))
            : 0;

          // Find bottleneck for production lines (highest WIP excluding terminal)
          const nonTerminalWip = wipDistribution.filter((w) => !w.isTerminal);
          const maxWip = Math.max(0, ...nonTerminalWip.map((w) => w.goodAvailable));
          const bottleneckIdx = maxWip > 0
            ? wipDistribution.findIndex((w) => !w.isTerminal && w.goodAvailable === maxWip)
            : -1;

          // Check if this item is collapsed
          const isCollapsed = collapsedItems.has(assignment.jobItem.id);

          return (
            <div
              key={assignment.jobItem.id}
              className={`space-y-3 border-t border-border pt-3 first:border-t-0 first:pt-0 rounded-lg transition-all ${
                isComplete ? "bg-emerald-500/5 border border-emerald-500/20 p-3 -mx-1" : ""
              }`}
            >
              {/* Assignment Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isComplete
                        ? "bg-emerald-500/30 border border-emerald-500/50"
                        : isMultiStation
                        ? "bg-blue-500/20 border border-blue-500/30"
                        : "bg-emerald-500/20 border border-emerald-500/30"
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : isMultiStation ? (
                      <Factory className="h-4 w-4 text-blue-400" />
                    ) : (
                      <Zap className="h-4 w-4 text-emerald-400" />
                    )}
                  </div>
                  <div className="text-sm">
                    <span className={isComplete ? "text-emerald-400 font-medium" : isMultiStation ? "text-blue-400 font-medium" : "text-emerald-400 font-medium"}>
                      {assignment.jobItem.name || assignment.jobItem.pipeline_preset?.name || "מוצר"}
                    </span>
                    {isComplete && (
                      <span className="mr-2 text-[10px] text-emerald-500 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                        הושלם
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-left">
                    <div className={`text-lg font-bold font-mono ${isComplete ? "text-emerald-400" : "text-emerald-400"}`}>
                      {showPercentages ? `${completionPercent}%` : completedGood.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-muted-foreground">
                      {showPercentages ? "הושלם" : `מתוך ${plannedQuantity.toLocaleString()}`}
                    </div>
                  </div>
                  {/* Collapse toggle for completed items */}
                  {isComplete && (
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(assignment.jobItem.id)}
                      className="p-1 rounded hover:bg-accent transition-colors"
                      aria-label={isCollapsed ? "הרחב" : "צמצם"}
                    >
                      {isCollapsed ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Single Station - Simple Progress Bar (hide when collapsed) */}
              {isSingleStation && !isCollapsed && (
                <div className="h-12 rounded-xl overflow-hidden bg-muted/50 flex items-center">
                  <div
                    className={`h-full flex items-center justify-center transition-all relative ${
                      isComplete ? "bg-emerald-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${completionPercent}%`, minWidth: completionPercent > 0 ? "60px" : "0" }}
                  >
                    {completionPercent > 0 && (
                      <span className="text-sm font-bold font-mono text-white drop-shadow-md">
                        {showPercentages ? `${completionPercent}%` : completedGood.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {completionPercent < 100 && (
                    <div className="flex-1 h-full flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {showPercentages
                          ? `${100 - completionPercent}% נותרו`
                          : `${(plannedQuantity - completedGood).toLocaleString()} נותרו`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Production Line / Pipeline - Segmented Bar (hide when collapsed) */}
              {isMultiStation && wipDistribution.length > 0 && !isCollapsed && (
                <div className="space-y-3">
                  {/* Segmented Progress Bar - Each station's WIP as percentage of planned quantity */}
                  <div className="h-12 rounded-xl overflow-hidden bg-muted/50 flex">
                    {/* WIP segments for all stations (terminal = completed, others = in-progress) */}
                    {wipDistribution
                      .filter((wip) => wip.goodAvailable > 0)
                      .map((wip) => {
                        const idx = wipDistribution.indexOf(wip);
                        const segmentStyle = getSegmentStyle(idx, wipDistribution.length, wip.isTerminal);
                        const isBottleneck = idx === bottleneckIdx && maxWip > 0;
                        const stagePercent = plannedQuantity > 0 ? (wip.goodAvailable / plannedQuantity) * 100 : 0;

                        return (
                          <div
                            key={wip.jobItemStepId}
                            className={`h-full flex items-center justify-center relative transition-all ${segmentStyle.bg} ${
                              isBottleneck ? "ring-2 ring-white/50 ring-inset" : ""
                            }`}
                            style={{
                              width: `${stagePercent}%`,
                              minWidth: "50px",
                            }}
                          >
                            <div className="flex flex-col items-center justify-center px-1">
                              <span className="text-[10px] font-medium truncate max-w-full drop-shadow-sm text-white/90">
                                {wip.stationName}
                              </span>
                              <span className="text-sm font-bold font-mono text-white drop-shadow-md">
                                {showPercentages
                                  ? `${Math.round(stagePercent)}%`
                                  : wip.goodAvailable.toLocaleString()}
                              </span>
                            </div>
                            {isBottleneck && (
                              <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-white animate-pulse" />
                            )}
                            {idx < wipDistribution.length - 1 && (
                              <div className="absolute left-0 top-0 bottom-0 w-px bg-black/30" />
                            )}
                          </div>
                        );
                      })}

                    {/* Remaining space - products not yet in pipeline */}
                    {totalWip < plannedQuantity && (
                      <div className="h-full flex items-center justify-center flex-1" style={{ minWidth: "40px" }}>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {showPercentages
                            ? `${Math.round(((plannedQuantity - totalWip) / plannedQuantity) * 100)}% נותרו`
                            : `${(plannedQuantity - completedGood).toLocaleString()} נותרו`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Station Legend - More prominent with worker names */}
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                      {wipDistribution.map((wip, idx) => {
                        const segmentStyle = getSegmentStyle(idx, wipDistribution.length, wip.isTerminal);
                        const activeWorkers = (wip as WipStationData & { activeWorkers?: string[] }).activeWorkers ?? [];
                        const hasActiveWorkers = activeWorkers.length > 0;

                        return (
                          <div key={wip.jobItemStepId} className="flex items-center gap-2">
                            {/* Station indicator with pulse */}
                            <div className="flex items-center gap-1.5">
                              <div className="relative w-3 h-3 flex items-center justify-center">
                                {wip.hasActiveSession && (
                                  <span
                                    className="absolute w-3 h-3 rounded-full animate-ping opacity-75"
                                    style={{ backgroundColor: segmentStyle.color }}
                                  />
                                )}
                                <span
                                  className="relative w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: segmentStyle.color }}
                                />
                              </div>
                              <span className={`text-xs font-medium ${
                                wip.hasActiveSession ? "text-foreground" : "text-muted-foreground"
                              }`}>
                                {wip.stationName}
                              </span>
                            </div>

                            {/* Worker names for active stations */}
                            {hasActiveWorkers && (
                              <div className="flex items-center gap-1 bg-accent rounded px-1.5 py-0.5">
                                <User className="w-3 h-3 text-emerald-400" />
                                <span className="text-[10px] text-emerald-300 font-medium">
                                  {activeWorkers.join(", ")}
                                </span>
                              </div>
                            )}

                            {/* Arrow separator */}
                            {idx < wipDistribution.length - 1 && (
                              <ChevronLeft className="h-3 w-3 text-muted-foreground/50 mx-0.5" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Single Station Legend (hide when collapsed) */}
              {isSingleStation && wipDistribution.length > 0 && !isCollapsed && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    {wipDistribution.map((wip) => {
                      const activeWorkers = (wip as WipStationData & { activeWorkers?: string[] }).activeWorkers ?? [];
                      const hasActiveWorkers = activeWorkers.length > 0;

                      return (
                        <div key={wip.jobItemStepId} className="flex items-center gap-2">
                          <div className="relative w-3 h-3 flex items-center justify-center">
                            {wip.hasActiveSession && (
                              <span className="absolute w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-75" />
                            )}
                            <span className="relative w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          </div>
                          <span className={`text-xs font-medium ${
                            wip.hasActiveSession ? "text-foreground" : "text-muted-foreground"
                          }`}>
                            {wip.stationName}
                          </span>

                          {hasActiveWorkers && (
                            <div className="flex items-center gap-1 bg-accent rounded px-1.5 py-0.5">
                              <User className="w-3 h-3 text-emerald-400" />
                              <span className="text-[10px] text-emerald-300 font-medium">
                                {activeWorkers.join(", ")}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const LiveJobProgress = memo(LiveJobProgressComponent);
