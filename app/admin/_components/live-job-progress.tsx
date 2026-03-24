"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Package,
} from "lucide-react";
import { JobItemProgressCard, type StationProgressData } from "@/components/work/job-item-progress-card";
import { useRealtimeJobProgress } from "@/lib/hooks/useRealtimeJobProgress";
import { useAdminActiveJobsSummary } from "@/contexts/AdminSessionsContext";
import type { LiveJobProgress as LiveJobProgressData, WipStationData, LiveJobItemAssignment } from "@/lib/types";


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

  // Seed collapsed state for completed items on first meaningful load
  useEffect(() => {
    if (mergedJobs.length === 0) return;
    const completedIds = new Set<string>();
    for (const job of mergedJobs) {
      for (const item of job.jobItems) {
        const total = (item.completedGood || 0) + (item.completedScrap || 0);
        if (item.plannedQuantity > 0 && total >= item.plannedQuantity) {
          completedIds.add(item.jobItem.id);
        }
      }
    }
    setCollapsedItems((prev) => (prev.size === 0 && completedIds.size > 0 ? completedIds : prev));
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
      <div className="px-4 sm:px-5 py-4 border-b border-border space-y-3 sm:space-y-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground">התקדמות עבודות</h3>
          </div>

          {/* Desktop controls - inline */}
          <div className="hidden sm:flex items-center gap-3">
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

        {/* Mobile controls - row below title */}
        <div className="flex sm:hidden items-center justify-between gap-2">
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
            const completedGood = assignment.completedGood || 0;
            const completedScrap = assignment.completedScrap || 0;
            const totalCompleted = completedGood + completedScrap;
            const isComplete = plannedQty > 0 && totalCompleted >= plannedQty;
            return { assignment, isComplete, completedGood, completedScrap };
          })
          .sort((a, b) => (a.isComplete === b.isComplete ? 0 : a.isComplete ? 1 : -1))
          .map(({ assignment, completedGood, completedScrap }) => {
            const wipDistribution = assignment.wipDistribution || [];
            const stations: StationProgressData[] = wipDistribution.map((wip) => ({
              stepId: wip.jobItemStepId,
              stationName: wip.stationName,
              position: wip.position,
              isTerminal: wip.isTerminal,
              goodReported: wip.goodReported,
              scrapReported: wip.scrapReported,
              hasActiveSession: wip.hasActiveSession,
              activeWorkers: (wip as WipStationData & { activeWorkers?: string[] }).activeWorkers ?? [],
            }));

            return (
              <JobItemProgressCard
                key={assignment.jobItem.id}
                id={assignment.jobItem.id}
                name={assignment.jobItem.name || assignment.jobItem.pipeline_preset?.name || "מוצר"}
                plannedQuantity={assignment.plannedQuantity || 0}
                completedGood={completedGood}
                completedScrap={completedScrap}
                stations={stations}
                showPercentages={showPercentages}
                isCollapsed={collapsedItems.has(assignment.jobItem.id)}
                onToggleCollapsed={toggleCollapsed}
              />
            );
          })}
      </div>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const LiveJobProgress = memo(LiveJobProgressComponent);
