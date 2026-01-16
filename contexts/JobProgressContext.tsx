"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchJobProgressAdminApi } from "@/lib/api/admin-management";
import type { LiveJobProgress, WipStationData } from "@/lib/types";

const POLL_INTERVAL_MS = 3000;

type StationProgressInfo = {
  jobItemName: string;
  plannedQuantity: number;
  completedAtStation: number; // WIP at this station (goodAvailable)
  totalCompleted: number; // Completed good for the entire job item
  isTerminal: boolean;
};

type JobProgressContextValue = {
  jobs: LiveJobProgress[];
  isLoading: boolean;
  /** Get progress info for a session by jobId and stationId */
  getStationProgress: (jobId: string, stationId: string) => StationProgressInfo | null;
};

const JobProgressContext = createContext<JobProgressContextValue | null>(null);

export const JobProgressProvider = ({ children }: { children: ReactNode }) => {
  const [jobs, setJobs] = useState<LiveJobProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetchJobProgressAdminApi();
      setJobs(response.jobs);
      setIsLoading(false);
    } catch (error) {
      console.error("[JobProgressContext] Failed to fetch job progress", error);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Build lookup maps for efficient queries
  const { jobMap, stationLookup } = useMemo(() => {
    const jobMap = new Map<string, LiveJobProgress>();
    // Map: jobId -> stationId -> StationProgressInfo[]
    const stationLookup = new Map<string, Map<string, StationProgressInfo[]>>();

    for (const job of jobs) {
      jobMap.set(job.job.id, job);

      const stationMap = new Map<string, StationProgressInfo[]>();
      stationLookup.set(job.job.id, stationMap);

      for (const assignment of job.jobItems) {
        const jobItemName = assignment.jobItem.name ||
          assignment.jobItem.pipeline_preset?.name ||
          "מוצר";
        const plannedQuantity = assignment.plannedQuantity || 0;
        const totalCompleted = assignment.completedGood || 0;

        for (const wip of assignment.wipDistribution) {
          const info: StationProgressInfo = {
            jobItemName,
            plannedQuantity,
            completedAtStation: wip.goodAvailable,
            totalCompleted,
            isTerminal: wip.isTerminal,
          };

          const existing = stationMap.get(wip.stationId) || [];
          existing.push(info);
          stationMap.set(wip.stationId, existing);
        }
      }
    }

    return { jobMap, stationLookup };
  }, [jobs]);

  const getStationProgress = useCallback(
    (jobId: string, stationId: string): StationProgressInfo | null => {
      const stationMap = stationLookup.get(jobId);
      if (!stationMap) return null;

      const progressList = stationMap.get(stationId);
      if (!progressList || progressList.length === 0) return null;

      // If there are multiple job items at this station, sum them up
      if (progressList.length === 1) {
        return progressList[0];
      }

      // Aggregate multiple job items at same station
      const aggregated: StationProgressInfo = {
        jobItemName: progressList.map((p) => p.jobItemName).join(", "),
        plannedQuantity: progressList.reduce((sum, p) => sum + p.plannedQuantity, 0),
        completedAtStation: progressList.reduce((sum, p) => sum + p.completedAtStation, 0),
        totalCompleted: progressList.reduce((sum, p) => sum + p.totalCompleted, 0),
        isTerminal: progressList.some((p) => p.isTerminal),
      };

      return aggregated;
    },
    [stationLookup]
  );

  const value = useMemo(
    () => ({ jobs, isLoading, getStationProgress }),
    [jobs, isLoading, getStationProgress]
  );

  return (
    <JobProgressContext.Provider value={value}>
      {children}
    </JobProgressContext.Provider>
  );
};

export const useJobProgress = () => {
  const ctx = useContext(JobProgressContext);
  if (!ctx) {
    throw new Error("useJobProgress must be used within JobProgressProvider");
  }
  return ctx;
};

export const useStationProgress = (jobId: string, stationId: string | null) => {
  const { getStationProgress, isLoading } = useJobProgress();

  return useMemo(() => {
    if (!stationId) return { progress: null, isLoading };
    return { progress: getStationProgress(jobId, stationId), isLoading };
  }, [jobId, stationId, getStationProgress, isLoading]);
};
