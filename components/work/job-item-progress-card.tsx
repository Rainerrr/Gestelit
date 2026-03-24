"use client";

import { AlertTriangle, ChevronDown, ChevronUp, Clock, User } from "lucide-react";
import { MiniPieChart } from "@/components/work/mini-pie-chart";
import { JobProgressBar } from "@/components/work/job-progress-bar";
import { PipelineFlowLayout, type PipelineStation } from "@/components/work/pipeline-flow-layout";

// ============================================
// TYPES
// ============================================

/** Normalized station/step data for the card */
export type StationProgressData = {
  stepId: string;
  stationName: string;
  position: number;
  isTerminal: boolean;
  goodReported: number;
  scrapReported: number;
  hasActiveSession?: boolean;
  activeWorkers?: string[];
};

export type JobItemProgressCardProps = {
  /** Unique id for the job item */
  id: string;
  /** Display name */
  name: string;
  /** Target quantity */
  plannedQuantity: number;
  /** Good completed (terminal station or total) */
  completedGood: number;
  /** Scrap completed */
  completedScrap: number;
  /** Station/step progress data */
  stations: StationProgressData[];
  /** Whether to show percentages or units */
  showPercentages: boolean;
  /** Collapsed state */
  isCollapsed: boolean;
  /** Toggle callback */
  onToggleCollapsed: (id: string) => void;
};

// ============================================
// COMPONENT
// ============================================

export const JobItemProgressCard = ({
  id,
  name,
  plannedQuantity,
  completedGood,
  completedScrap,
  stations,
  showPercentages,
  isCollapsed,
  onToggleCollapsed,
}: JobItemProgressCardProps) => {
  const totalCompleted = completedGood + completedScrap;
  const isComplete = plannedQuantity > 0 && totalCompleted >= plannedQuantity;
  const completionPercent = plannedQuantity > 0
    ? Math.round((totalCompleted / plannedQuantity) * 100)
    : 0;
  const isOverflow = completionPercent > 100;
  const isMultiStation = stations.length > 1;
  const isSingleStation = stations.length === 1;

  return (
    <div
      className={`space-y-2 rounded-xl border p-3 transition-all ${
        isComplete
          ? "bg-emerald-500/5 border-emerald-500/20 shadow-sm shadow-emerald-500/5"
          : "bg-muted/30 border-border/50 shadow-sm shadow-black/5 hover:border-border/70"
      }`}
    >
      {/* Header — entire row toggles expand/collapse */}
      <div
        className="flex items-center justify-between cursor-pointer select-none hover:bg-accent/30 rounded-md transition-colors -mx-1 px-1"
        onClick={(e) => { e.stopPropagation(); onToggleCollapsed(id); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onToggleCollapsed(id); } }}
        aria-expanded={!isCollapsed}
      >
        <div className="flex items-center gap-2">
          <div className="text-lg">
            <span className={`font-semibold ${isComplete ? "text-emerald-400" : "text-emerald-400"}`}>
              {name}
            </span>
            {isComplete && (
              <span className="mr-2 text-xs text-emerald-500 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                הושלם
              </span>
            )}
            {isOverflow && (
              <span className="mr-2 text-xs text-amber-500 bg-amber-500/20 px-1.5 py-0.5 rounded">
                ייצור עודף
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-left">
            <div className={`text-2xl font-bold font-mono ${isComplete ? "text-emerald-300" : "text-emerald-400"}`}>
              {showPercentages ? `${completionPercent}%` : completedGood.toLocaleString()}
            </div>
            {completedScrap > 0 && !showPercentages && (
              <div className="text-xs text-rose-400 tabular-nums">
                +{completedScrap.toLocaleString()} פסול
              </div>
            )}
            <div className={`text-xs ${isComplete ? "text-emerald-400/70" : "text-muted-foreground"}`}>
              {showPercentages
                ? (completedScrap > 0 ? `תקין + ${completedScrap} פסול` : "הושלם")
                : `מתוך ${plannedQuantity.toLocaleString()}`}
            </div>
          </div>
          {/* Collapse indicator */}
          <div className="p-1">
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded bars area with pie chart on the left (hide when collapsed) */}
      {!isCollapsed && (
        <div className="flex gap-5 items-center">
          {/* Bars area — first child = right side in RTL */}
          <div className="flex-1 min-w-0">
            {/* Single Station */}
            {isSingleStation && (
              <JobProgressBar
                plannedQuantity={plannedQuantity}
                totalGood={completedGood}
                totalScrap={completedScrap}
                displayMode={showPercentages ? "percentage" : "numbers"}
                size="lg"
                showOverlay
              />
            )}

            {/* Multi Station Pipeline */}
            {isMultiStation && stations.length > 0 && (() => {
              const pipelineStations: PipelineStation[] = stations.map((s) => ({
                id: s.stepId,
                name: s.stationName,
                position: s.position,
                isTerminal: s.isTerminal,
              }));

              const completedStationIds = new Set(
                stations
                  .filter((s) => s.goodReported >= plannedQuantity)
                  .map((s) => s.stepId)
              );

              const activeStationIds = new Set(
                stations
                  .filter((s) => s.hasActiveSession)
                  .map((s) => s.stepId)
              );

              return (
                <PipelineFlowLayout stations={pipelineStations} completedStationIds={completedStationIds} activeStationIds={activeStationIds}>
                  {stations.map((s, idx) => {
                    const prev = idx > 0 ? stations[idx - 1] : null;
                    const currentTotal = s.goodReported + s.scrapReported;
                    const prevGood = prev?.goodReported ?? 0;
                    const prevTotal = prev ? prev.goodReported + prev.scrapReported : 0;

                    // Products waiting: previous station reported more good than current station processed total
                    const hasWaiting = prev !== null && prevGood > currentTotal && prevGood > 0;
                    const waitingCount = hasWaiting ? prevGood - currentTotal : 0;

                    // Reporting error: current station processed more than previous station reported good
                    const hasReportError = prev !== null && currentTotal > prevGood;
                    const overCount = hasReportError ? currentTotal - prevGood : 0;

                    return (
                      <div key={s.stepId} className="space-y-1">
                        {/* Station label row */}
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm font-medium text-muted-foreground truncate max-w-[120px]" title={s.stationName}>
                              {s.stationName}
                            </span>
                            {(s.activeWorkers?.length ?? 0) > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 bg-accent rounded px-1 py-0.5">
                                <User className="w-2.5 h-2.5" />
                                {s.activeWorkers!.join(", ")}
                              </span>
                            )}
                            {hasWaiting && (
                              <span className="flex items-center gap-0.5 text-[10px] text-amber-400 bg-amber-500/15 rounded px-1 py-0.5 whitespace-nowrap">
                                <Clock className="w-2.5 h-2.5" />
                                מוצרים ממתינים ({waitingCount})
                              </span>
                            )}
                            {hasReportError && (
                              <span className="flex items-center gap-0.5 text-[10px] text-rose-400 bg-rose-500/15 rounded px-1 py-0.5 whitespace-nowrap">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                תקלת דיווח (+{overCount})
                              </span>
                            )}
                          </div>
                          <span dir="ltr" className="font-mono text-muted-foreground tabular-nums text-sm">
                            {s.goodReported.toLocaleString()}
                            {s.scrapReported > 0 && (
                              <span className="text-rose-400"> +{s.scrapReported.toLocaleString()}</span>
                            )}
                            {" / "}
                            {plannedQuantity.toLocaleString()}
                          </span>
                        </div>
                        {/* Per-station bar */}
                        <JobProgressBar
                          plannedQuantity={plannedQuantity}
                          totalGood={s.goodReported}
                          totalScrap={s.scrapReported}
                          size="sm"
                          showOverlay={false}
                        />
                      </div>
                    );
                  })}
                </PipelineFlowLayout>
              );
            })()}
          </div>

          {/* Pie chart — last child = left side in RTL */}
          <div className="flex-shrink-0 min-w-[96px] flex items-center justify-center">
            <MiniPieChart good={completedGood} scrap={completedScrap} planned={plannedQuantity} size={88} />
          </div>
        </div>
      )}

      {/* Single Station Legend (hide when collapsed) */}
      {isSingleStation && stations.length > 0 && !isCollapsed && (() => {
        const s = stations[0];
        const hasActiveWorkers = (s.activeWorkers?.length ?? 0) > 0;

        return (
          <div className="bg-muted/50 rounded-lg px-3 py-1.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="relative w-3 h-3 flex items-center justify-center">
                  {s.hasActiveSession && (
                    <span className="absolute w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-75" />
                  )}
                  <span className="relative w-2.5 h-2.5 rounded-full bg-emerald-500" />
                </div>
                <span className={`text-xs font-medium ${
                  s.hasActiveSession ? "text-foreground" : "text-muted-foreground"
                }`}>
                  {s.stationName}
                </span>

                {hasActiveWorkers && (
                  <div className="flex items-center gap-1 bg-accent rounded px-1.5 py-0.5">
                    <User className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] text-emerald-300 font-medium">
                      {s.activeWorkers!.join(", ")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
