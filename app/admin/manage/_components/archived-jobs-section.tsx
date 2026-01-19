"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ChevronDown,
} from "lucide-react";
import type { JobWithStats } from "@/lib/data/jobs";
import { fetchJobsAdminApi } from "@/lib/api/admin-management";

type ArchivedJobsSectionProps = {
  /** Render function for job rows */
  renderJobRow: (job: JobWithStats) => React.ReactNode;
};

export const ArchivedJobsSection = ({
  renderJobRow,
}: ArchivedJobsSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [archivedJobs, setArchivedJobs] = useState<JobWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadArchivedJobs = useCallback(async () => {
    setIsLoading(true);
    try {
      const { jobs } = await fetchJobsAdminApi({ archived: true });
      setArchivedJobs(jobs);
      setHasLoaded(true);
    } catch (error) {
      console.error("Failed to load archived jobs:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Lazy load on first expand
  useEffect(() => {
    if (isExpanded && !hasLoaded) {
      void loadArchivedJobs();
    }
  }, [isExpanded, hasLoaded, loadArchivedJobs]);

  const handleToggle = () => {
    setIsExpanded((prev) => !prev);
  };

  // Don't render if never expanded and no archived jobs loaded
  if (!isExpanded && !hasLoaded) {
    return (
      <div className="mt-6">
        <button
          onClick={handleToggle}
          className="w-full flex items-center justify-between px-5 py-4 rounded-xl border border-border bg-card/30 hover:bg-card/50 transition-colors text-right"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center">
              <Archive className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-foreground">
                עבודות שהושלמו
              </h4>
              <p className="text-xs text-muted-foreground">
                לחץ לטעינת עבודות שהושלמו
              </p>
            </div>
          </div>
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
        {/* Header */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleToggle}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleToggle();
            }
          }}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-card/50 transition-colors text-right border-b border-border/50 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Archive className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-foreground">
                עבודות שהושלמו
              </h4>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "טוען..."
                  : `${archivedJobs.length} עבודות`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="divide-y divide-border/40">
            {isLoading && !hasLoaded ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="relative h-10 w-10">
                  <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-emerald-500" />
                  <div
                    className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-b-emerald-500/50"
                    style={{
                      animationDirection: "reverse",
                      animationDuration: "1.5s",
                    }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  טוען עבודות שהושלמו...
                </p>
              </div>
            ) : archivedJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                <div className="w-12 h-12 rounded-xl bg-muted/30 border border-border flex items-center justify-center">
                  <Archive className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm">אין עבודות שהושלמו</p>
              </div>
            ) : (
              archivedJobs.map((job) => renderJobRow(job))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
