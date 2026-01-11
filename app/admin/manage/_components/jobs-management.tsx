"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import type { Job, JobItemWithDetails } from "@/lib/types";
import type { JobWithStats } from "@/lib/data/jobs";
import {
  ChevronDown,
  ChevronLeft,
  Pencil,
  Trash2,
  Package,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  Zap,
  Factory,
  Gauge,
  TrendingUp,
} from "lucide-react";
import { JobCreationWizard } from "./job-creation-wizard";
import { JobFormDialog } from "./job-form-dialog";
import { JobItemsDialog } from "./job-items-dialog";
import {
  checkJobActiveSessionAdminApi,
  fetchJobItemsAdminApi,
} from "@/lib/api/admin-management";

type JobsManagementProps = {
  jobs: JobWithStats[];
  isLoading: boolean;
  onAdd: (job: Partial<Job>) => Promise<void>;
  onEdit: (id: string, job: Partial<Job>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
};

type QuickFilter = "all" | "active" | "blocked" | "nearComplete" | "complete";

type ProgressTier = {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
};

const getProgressTier = (percent: number | null, isBlocked: boolean): ProgressTier => {
  if (isBlocked) {
    return {
      label: "חסום",
      color: "text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
    };
  }
  if (percent === null) {
    return {
      label: "ללא יעד",
      color: "text-zinc-500",
      bgColor: "bg-zinc-800/50",
      borderColor: "border-zinc-700",
    };
  }
  if (percent >= 100) {
    return {
      label: "הושלם",
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/30",
    };
  }
  if (percent >= 80) {
    return {
      label: "קרוב לסיום",
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/30",
    };
  }
  if (percent >= 50) {
    return {
      label: "באמצע",
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/30",
    };
  }
  return {
    label: "התחלה",
    color: "text-teal-400",
    bgColor: "bg-teal-500/10",
    borderColor: "border-teal-500/30",
  };
};

const getProgressBarColor = (percent: number): string => {
  if (percent >= 100) return "bg-emerald-500";
  if (percent >= 80) return "bg-amber-500";
  if (percent >= 50) return "bg-blue-500";
  return "bg-teal-500";
};


export const JobsManagement = ({
  jobs,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
  onRefresh,
}: JobsManagementProps) => {
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);
  const [deleteJobHasActiveSession, setDeleteJobHasActiveSession] = useState(false);
  const [isCheckingDeleteSession, setIsCheckingDeleteSession] = useState(false);
  const [jobItemsJob, setJobItemsJob] = useState<Job | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [jobItems, setJobItems] = useState<Record<string, JobItemWithDetails[]>>({});
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [showWizard, setShowWizard] = useState(false);
  const [showPercentages, setShowPercentages] = useState(true);

  // Track which jobs have been fetched to avoid duplicate requests
  const fetchedJobsRef = useRef<Set<string>>(new Set());

  // Load job items for a single job (used when expanding)
  const loadJobItems = useCallback(async (jobId: string, force = false) => {
    // Check ref to avoid duplicate fetches
    if (!force && fetchedJobsRef.current.has(jobId)) return;
    fetchedJobsRef.current.add(jobId);

    setLoadingItems((prev) => ({ ...prev, [jobId]: true }));
    try {
      const { items } = await fetchJobItemsAdminApi(jobId, {
        includeProgress: true,
        includeStations: true,
        includeWipBalances: true,
      });
      setJobItems((prev) => ({ ...prev, [jobId]: items }));
    } catch {
      // Remove from fetched set on error to allow retry
      fetchedJobsRef.current.delete(jobId);
    } finally {
      setLoadingItems((prev) => ({ ...prev, [jobId]: false }));
    }
  }, []);

  // Load items for all jobs to enable filtering - runs ONCE when jobs change
  useEffect(() => {
    // Get jobs that haven't been fetched yet
    const jobsToFetch = jobs.filter(
      (job) => !fetchedJobsRef.current.has(job.job.id)
    );

    if (jobsToFetch.length === 0) return;

    // Load all unfetched jobs in parallel
    void Promise.all(jobsToFetch.map((job) => loadJobItems(job.job.id)));
  }, [jobs, loadJobItems]);

  const getProgressPercent = useCallback((job: JobWithStats) => {
    if (!job.job.planned_quantity || job.job.planned_quantity <= 0) return null;
    return Math.min(100, Math.round((job.totalGood / job.job.planned_quantity) * 100));
  }, []);

  const isJobBlocked = useCallback((jobId: string) => {
    const items = jobItems[jobId];
    return !items || items.length === 0;
  }, [jobItems]);

  // Filter and sort jobs
  const sortedJobs = useMemo(() => {
    let filtered = [...jobs].sort(
      (a, b) =>
        new Date(b.job.created_at ?? 0).getTime() -
        new Date(a.job.created_at ?? 0).getTime()
    );

    switch (quickFilter) {
      case "active":
        filtered = filtered.filter((j) => {
          const percent = getProgressPercent(j);
          return !isJobBlocked(j.job.id) && percent !== null && percent < 100;
        });
        break;
      case "blocked":
        filtered = filtered.filter((j) => isJobBlocked(j.job.id));
        break;
      case "nearComplete":
        filtered = filtered.filter((j) => {
          const percent = getProgressPercent(j);
          return percent !== null && percent >= 80 && percent < 100;
        });
        break;
      case "complete":
        filtered = filtered.filter((j) => {
          const percent = getProgressPercent(j);
          return percent !== null && percent >= 100;
        });
        break;
    }

    return filtered;
  }, [jobs, quickFilter, getProgressPercent, isJobBlocked]);

  // Calculate filter counts
  const filterCounts = useMemo(() => {
    const counts = { all: jobs.length, active: 0, blocked: 0, nearComplete: 0, complete: 0 };
    for (const j of jobs) {
      const percent = getProgressPercent(j);
      const blocked = isJobBlocked(j.job.id);

      if (blocked) {
        counts.blocked++;
      } else if (percent !== null && percent >= 100) {
        counts.complete++;
      } else if (percent !== null && percent >= 80) {
        counts.nearComplete++;
      } else if (!blocked && (percent === null || percent < 100)) {
        counts.active++;
      }
    }
    return counts;
  }, [jobs, getProgressPercent, isJobBlocked]);

  const handleExpand = (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
    } else {
      setExpandedJobId(jobId);
      void loadJobItems(jobId);
    }
  };

  const handleEdit = async (payload: Partial<Job>) => {
    if (!editingJob) return;
    setIsSubmitting(true);
    try {
      await onEdit(editingJob.id, payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (jobId: string) => {
    setIsSubmitting(true);
    setDeleteJobHasActiveSession(false);
    try {
      const { hasActiveSession } = await checkJobActiveSessionAdminApi(jobId);
      if (hasActiveSession) {
        setDeleteJobHasActiveSession(true);
        setIsSubmitting(false);
        return;
      }
      await onDelete(jobId);
      setDeleteJobId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDialogOpenChange = async (open: boolean, jobId?: string) => {
    if (open && jobId) {
      setIsCheckingDeleteSession(true);
      try {
        const { hasActiveSession } = await checkJobActiveSessionAdminApi(jobId);
        setDeleteJobHasActiveSession(hasActiveSession);
      } catch {
        setDeleteJobHasActiveSession(false);
      } finally {
        setIsCheckingDeleteSession(false);
      }
    } else {
      setDeleteJobHasActiveSession(false);
    }
    setDeleteJobId(open ? (jobId ?? null) : null);
  };

  const quickFilters: { id: QuickFilter; label: string; icon: typeof Filter; count: number }[] = [
    { id: "all", label: "הכל", icon: Factory, count: filterCounts.all },
    { id: "active", label: "בייצור", icon: Zap, count: filterCounts.active },
    { id: "blocked", label: "חסום", icon: AlertTriangle, count: filterCounts.blocked },
    { id: "nearComplete", label: "קרוב לסיום", icon: TrendingUp, count: filterCounts.nearComplete },
    { id: "complete", label: "הושלם", icon: CheckCircle2, count: filterCounts.complete },
  ];

  // Get assignments summary for a job
  const getJobAssignments = useCallback((jobId: string): string => {
    const items = jobItems[jobId];
    if (!items || items.length === 0) return "—";

    const lines = items.filter((i) => i.kind === "line").length;
    const stations = items.filter((i) => i.kind === "station").length;

    const parts: string[] = [];
    if (lines > 0) parts.push(`${lines} קווים`);
    if (stations > 0) parts.push(`${stations} תחנות`);
    return parts.join(", ");
  }, [jobItems]);

  return (
    <div className="space-y-4">
      {/* Header Panel */}
      <div className="rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 overflow-hidden">
        {/* Title Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between px-5 py-4 border-b border-zinc-800/80 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500/20 to-cyan-500/20 border border-teal-500/30 flex items-center justify-center">
              <Gauge className="h-5 w-5 text-teal-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-100 tracking-tight">
                לוח בקרה - עבודות
              </h3>
              <p className="text-sm text-zinc-500">ניהול ומעקב התקדמות ייצור</p>
            </div>
          </div>
          <Button
            onClick={() => setShowWizard(true)}
            className="bg-teal-600 text-white hover:bg-teal-500 font-medium shadow-lg shadow-teal-900/30"
          >
            <Plus className="h-4 w-4 ml-2" />
            עבודה חדשה
          </Button>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 bg-zinc-950/70 border-b border-zinc-800/50">
          <Filter className="h-4 w-4 text-zinc-600" />
          {quickFilters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setQuickFilter(filter.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                quickFilter === filter.id
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm shadow-teal-500/20"
                  : "bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 border border-zinc-800"
              }`}
            >
              <filter.icon className="h-3.5 w-3.5" />
              {filter.label}
              <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                quickFilter === filter.id
                  ? "bg-teal-500/30 text-teal-200"
                  : "bg-zinc-700/50 text-zinc-500"
              }`}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>

        {/* Jobs Table */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="relative h-12 w-12">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-teal-500" />
              <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-b-cyan-500" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
            </div>
            <p className="text-sm text-zinc-500">טוען עבודות...</p>
          </div>
        ) : sortedJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-zinc-500">
            <div className="w-16 h-16 rounded-xl bg-zinc-800/50 border border-zinc-700 flex items-center justify-center">
              <Package className="h-8 w-8 text-zinc-600" />
            </div>
            <div className="text-center">
              <p className="text-base font-medium text-zinc-400">אין עבודות להצגה</p>
              <p className="text-sm mt-1">התחל ביצירת עבודה חדשה</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-[40px_1fr_140px_100px_160px_100px_120px] gap-3 px-5 py-3 bg-zinc-900/50 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              <div></div>
              <div>פק"ע / לקוח</div>
              <div>שיוך</div>
              <div className="text-center">מתוכנן</div>
              <div>התקדמות</div>
              <div className="text-center">מצב</div>
              <div className="text-left">פעולות</div>
            </div>

            {/* Job Rows */}
            {sortedJobs.map((jobWithStats) => {
              const progressPercent = getProgressPercent(jobWithStats);
              const isExpanded = expandedJobId === jobWithStats.job.id;
              const items = jobItems[jobWithStats.job.id] ?? [];
              const blocked = isJobBlocked(jobWithStats.job.id);
              const isLoadingJobItems = loadingItems[jobWithStats.job.id];
              const tier = getProgressTier(progressPercent, blocked);
              const assignments = getJobAssignments(jobWithStats.job.id);

              return (
                <div key={jobWithStats.job.id} className="group">
                  {/* Collapsed Row */}
                  <div
                    className={`grid grid-cols-1 md:grid-cols-[40px_1fr_140px_100px_160px_100px_120px] gap-3 px-5 py-3 transition-all cursor-pointer ${
                      isExpanded
                        ? "bg-zinc-800/40"
                        : "hover:bg-zinc-800/20"
                    }`}
                    onClick={() => handleExpand(jobWithStats.job.id)}
                  >
                    {/* Expand Toggle */}
                    <div className="hidden md:flex items-center justify-center">
                      <div
                        className={`w-6 h-6 rounded-md bg-zinc-800/80 border border-zinc-700 flex items-center justify-center transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      >
                        <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                      </div>
                    </div>

                    {/* Job Number & Customer */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-zinc-100 text-sm tracking-tight">
                            {jobWithStats.job.job_number}
                          </span>
                          {blocked && !isLoadingJobItems && (
                            <div className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          )}
                        </div>
                        {jobWithStats.job.customer_name && (
                          <p className="text-xs text-zinc-500 truncate mt-0.5">
                            {jobWithStats.job.customer_name}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Assignments */}
                    <div className="hidden md:flex items-center">
                      <span className="text-xs text-zinc-400 truncate">
                        {isLoadingJobItems ? (
                          <span className="text-zinc-600">...</span>
                        ) : (
                          assignments
                        )}
                      </span>
                    </div>

                    {/* Planned Quantity */}
                    <div className="hidden md:flex items-center justify-center">
                      <span className="font-mono text-sm text-zinc-300">
                        {jobWithStats.job.planned_quantity?.toLocaleString() ?? "—"}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="hidden md:flex items-center gap-2">
                      {progressPercent !== null ? (
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${getProgressBarColor(progressPercent)}`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono font-medium text-zinc-400 w-10 text-left">
                            {progressPercent}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-zinc-600 text-xs">ללא יעד</span>
                      )}
                    </div>

                    {/* Status Badge */}
                    <div className="hidden md:flex items-center justify-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${tier.bgColor} border ${tier.borderColor} ${tier.color}`}
                      >
                        {blocked ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : progressPercent !== null && progressPercent >= 100 ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {tier.label}
                      </span>
                    </div>

                    {/* Actions */}
                    <div
                      className="hidden md:flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setJobItemsJob(jobWithStats.job)}
                        aria-label="הוסף מוצר"
                        className="h-7 w-7 text-zinc-500 hover:text-teal-400 hover:bg-teal-500/10"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <JobFormDialog
                        mode="edit"
                        job={jobWithStats.job}
                        onSubmit={handleEdit}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingJob(jobWithStats.job)}
                            aria-label="עריכת עבודה"
                            className="h-7 w-7 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        }
                        open={editingJob?.id === jobWithStats.job.id}
                        onOpenChange={async (open) => {
                          setEditingJob(open ? jobWithStats.job : null);
                          if (!open && onRefresh) await onRefresh();
                        }}
                        loading={isSubmitting}
                      />
                      <Dialog
                        open={deleteJobId === jobWithStats.job.id}
                        onOpenChange={(open) =>
                          handleDeleteDialogOpenChange(open, jobWithStats.job.id)
                        }
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isSubmitting}
                            aria-label="מחיקת עבודה"
                            className="h-7 w-7 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent dir="rtl" className="border-zinc-800 bg-zinc-900">
                          <DialogHeader>
                            <DialogTitle className="text-zinc-100">
                              האם למחוק את העבודה?
                            </DialogTitle>
                            <DialogDescription className="text-zinc-500">
                              הפעולה תמחק את העבודה לחלוטין. סשנים קיימים ישמרו
                              אך לא יהיו משויכים לעבודה זו. לא ניתן לבטל.
                            </DialogDescription>
                          </DialogHeader>
                          {isCheckingDeleteSession ? (
                            <p className="text-sm text-zinc-500">בודק סשנים פעילים...</p>
                          ) : deleteJobHasActiveSession ? (
                            <Alert
                              variant="destructive"
                              className="border-red-500/30 bg-red-500/10 text-right text-sm text-red-400"
                            >
                              <AlertDescription>
                                לא ניתן למחוק עבודה עם סשן פעיל. יש לסיים את
                                הסשן הפעיל לפני מחיקה.
                              </AlertDescription>
                            </Alert>
                          ) : null}
                          <DialogFooter className="justify-start">
                            <Button
                              onClick={() => void handleDelete(jobWithStats.job.id)}
                              disabled={
                                isSubmitting ||
                                deleteJobHasActiveSession ||
                                isCheckingDeleteSession
                              }
                              className="bg-red-600 text-white hover:bg-red-500"
                            >
                              מחיקה סופית
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => setDeleteJobId(null)}
                              disabled={isSubmitting}
                              className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                            >
                              ביטול
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {/* Mobile Summary Row */}
                    <div className="md:hidden flex items-center justify-between mt-2 pt-2 border-t border-zinc-800/50">
                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${tier.bgColor} border ${tier.borderColor} ${tier.color}`}
                        >
                          {tier.label}
                        </span>
                        {progressPercent !== null && (
                          <span className="text-xs text-zinc-400 font-mono">
                            {progressPercent}%
                          </span>
                        )}
                      </div>
                      <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-5 py-4 bg-zinc-900/70 border-t border-zinc-800/40">
                      {/* Blocked Warning */}
                      {blocked && !isLoadingJobItems && (
                        <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent border border-red-500/20">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                              <AlertTriangle className="h-5 w-5 text-red-400" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-red-300">עבודה חסומה</h4>
                              <p className="text-sm text-red-400/80 mt-1">
                                לא הוגדרו מוצרים (קו ייצור או תחנה) לעבודה זו.
                                עובדים לא יוכלו לעבוד על עבודה זו עד שיוגדר לפחות מוצר אחד.
                              </p>
                              <Button
                                onClick={() => setJobItemsJob(jobWithStats.job)}
                                className="mt-3 bg-red-600 text-white hover:bg-red-500"
                                size="sm"
                              >
                                <Plus className="h-4 w-4 ml-2" />
                                הגדר מוצרים
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Description */}
                      {jobWithStats.job.description && (
                        <div className="mb-4 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800">
                          <p className="text-sm text-zinc-400">{jobWithStats.job.description}</p>
                        </div>
                      )}

                      {/* Job Items */}
                      {isLoadingJobItems ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-2 border-transparent border-t-teal-500" />
                        </div>
                      ) : items.length > 0 ? (
                        <div className="space-y-4">
                          {/* Header with toggle */}
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                              <Package className="h-4 w-4 text-teal-400" />
                              מוצרים ({items.length})
                            </h4>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer">
                                <span>יחידות</span>
                                <Switch
                                  checked={showPercentages}
                                  onCheckedChange={setShowPercentages}
                                  className="h-4 w-8"
                                />
                                <span>אחוזים</span>
                              </label>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setJobItemsJob(jobWithStats.job)}
                                className="h-7 text-xs border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                              >
                                <Pencil className="h-3 w-3 ml-1" />
                                ערוך
                              </Button>
                            </div>
                          </div>

                          {/* Items Grid */}
                          <div className="space-y-4">
                            {items.map((item) => {
                              const completed = item.progress?.completed_good ?? 0;
                              const planned = item.planned_quantity;
                              const percent = Math.min(100, Math.round((completed / planned) * 100));
                              const stages = item.job_item_stations ?? [];
                              const wipBalances = item.wip_balances ?? [];

                              // Build WIP distribution from actual balances
                              // Maps job_item_station_id to good_available count
                              const wipByStationId = new Map(
                                wipBalances.map((wb) => [wb.job_item_station_id, wb.good_available])
                              );

                              // Get WIP for each stage in order
                              const wipDistribution = stages.map((stage) => {
                                return wipByStationId.get(stage.id) ?? 0;
                              });

                              const totalInSystem = wipDistribution.reduce((a, b) => a + b, 0);
                              const totalPercent = planned > 0 ? Math.min(100, (totalInSystem / planned) * 100) : 0;

                              // Calculate segment colors based on position (red → yellow → green gradient)
                              // Returns both background class and inline style for the legend dots
                              const getSegmentStyle = (idx: number, total: number, isTerminal: boolean) => {
                                if (isTerminal || total <= 1) {
                                  return { bg: "bg-emerald-500", color: "#10b981" }; // Green for terminal
                                }
                                // Progress ratio from 0 (start) to 1 (end)
                                const ratio = idx / Math.max(1, total - 1);

                                // Red → Orange → Yellow → Lime → Green gradient
                                if (ratio <= 0.2) {
                                  return { bg: "bg-red-500", color: "#ef4444" };
                                }
                                if (ratio <= 0.4) {
                                  return { bg: "bg-orange-500", color: "#f97316" };
                                }
                                if (ratio <= 0.6) {
                                  return { bg: "bg-amber-500", color: "#f59e0b" };
                                }
                                if (ratio <= 0.8) {
                                  return { bg: "bg-lime-500", color: "#84cc16" };
                                }
                                return { bg: "bg-green-500", color: "#22c55e" };
                              };

                              // Find bottleneck (highest WIP excluding terminal)
                              const nonTerminalWip = stages.length > 1 ? wipDistribution.slice(0, -1) : [];
                              const maxWip = Math.max(0, ...nonTerminalWip);
                              const bottleneckIdx = maxWip > 0 ? nonTerminalWip.indexOf(maxWip) : -1;

                              return (
                                <div
                                  key={item.id}
                                  className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-800/60"
                                >
                                  {/* Item Header */}
                                  <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                          item.kind === "line"
                                            ? "bg-blue-500/20 border border-blue-500/30"
                                            : "bg-emerald-500/20 border border-emerald-500/30"
                                        }`}
                                      >
                                        {item.kind === "line" ? (
                                          <Factory className="h-4 w-4 text-blue-400" />
                                        ) : (
                                          <Zap className="h-4 w-4 text-emerald-400" />
                                        )}
                                      </div>
                                      <div>
                                        <span className="font-medium text-zinc-200 text-sm">
                                          {item.kind === "line"
                                            ? item.production_line?.name ?? "קו ייצור"
                                            : item.station?.name ?? "תחנה"}
                                        </span>
                                        <Badge
                                          variant="secondary"
                                          className="mr-2 text-[9px] bg-zinc-800/80 text-zinc-500 border-zinc-700"
                                        >
                                          {item.kind === "line" ? `${stages.length} שלבים` : "תחנה"}
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="text-left">
                                      <div className="text-lg font-bold font-mono text-emerald-400">
                                        {showPercentages ? `${percent}%` : completed.toLocaleString()}
                                      </div>
                                      <div className="text-[10px] text-zinc-500">
                                        הושלם מתוך {planned.toLocaleString()}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Single Station - Simple Progress Bar */}
                                  {item.kind === "station" && (
                                    <div className="h-10 rounded-xl overflow-hidden bg-zinc-900 flex items-center">
                                      <div
                                        className="h-full bg-emerald-500 flex items-center justify-center transition-all relative"
                                        style={{ width: `${percent}%`, minWidth: percent > 0 ? "60px" : "0" }}
                                      >
                                        {percent > 0 && (
                                          <span className="text-xs font-bold font-mono text-white drop-shadow-md">
                                            {showPercentages ? `${percent}%` : completed.toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                      {percent < 100 && (
                                        <div className="flex-1 h-full flex items-center justify-center">
                                          <span className="text-[10px] text-zinc-600 font-mono">
                                            {(planned - completed).toLocaleString()} נותרו
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Production Line - Segmented Bar */}
                                  {item.kind === "line" && stages.length > 0 && (
                                    <div className="space-y-2">
                                      {/* Thick Segmented Progress Bar */}
                                      <div className="h-12 rounded-xl overflow-hidden bg-zinc-900 flex">
                                        {stages.map((stage, idx) => {
                                          const stageWip = wipDistribution[idx] ?? 0;
                                          const stagePercent = planned > 0 ? (stageWip / planned) * 100 : 0;
                                          const segmentStyle = getSegmentStyle(idx, stages.length, stage.is_terminal);
                                          const isBottleneck = idx === bottleneckIdx && maxWip > 0;

                                          // Only show segment if there's WIP in it
                                          if (stageWip === 0) return null;

                                          return (
                                            <div
                                              key={stage.id}
                                              className={`h-full flex items-center justify-center relative transition-all ${segmentStyle.bg} ${
                                                isBottleneck ? "ring-2 ring-white/50 ring-inset" : ""
                                              }`}
                                              style={{
                                                width: `${stagePercent}%`,
                                                minWidth: stageWip > 0 ? "50px" : "0"
                                              }}
                                            >
                                              {/* Segment Content */}
                                              <div className="flex flex-col items-center justify-center px-1">
                                                <span className="text-[10px] font-medium text-white/90 truncate max-w-full drop-shadow-sm">
                                                  {stage.station?.name ?? `שלב ${stage.position}`}
                                                </span>
                                                <span className="text-sm font-bold font-mono text-white drop-shadow-md">
                                                  {showPercentages
                                                    ? `${Math.round(stagePercent)}%`
                                                    : stageWip.toLocaleString()}
                                                </span>
                                              </div>
                                              {/* Bottleneck indicator */}
                                              {isBottleneck && (
                                                <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-white animate-pulse" />
                                              )}
                                              {/* Segment Divider */}
                                              {idx < stages.length - 1 && stageWip > 0 && (
                                                <div className="absolute left-0 top-0 bottom-0 w-px bg-black/20" />
                                              )}
                                            </div>
                                          );
                                        })}

                                        {/* Remaining (empty) space */}
                                        {totalPercent < 100 && (
                                          <div
                                            className="h-full flex items-center justify-center flex-1"
                                            style={{ minWidth: "40px" }}
                                          >
                                            <span className="text-[10px] text-zinc-600 font-mono">
                                              {(planned - totalInSystem).toLocaleString()} נותרו
                                            </span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Stage Labels Below Bar */}
                                      <div className="flex items-center justify-between px-1">
                                        {stages.map((stage, idx) => {
                                          const segmentStyle = getSegmentStyle(idx, stages.length, stage.is_terminal);
                                          return (
                                            <div key={stage.id} className="flex items-center">
                                              <div className="flex items-center gap-1">
                                                <div
                                                  className="w-2 h-2 rounded-full"
                                                  style={{ backgroundColor: segmentStyle.color }}
                                                />
                                                <span className="text-[9px] text-zinc-500">
                                                  {stage.station?.name ?? `שלב ${stage.position}`}
                                                </span>
                                              </div>
                                              {idx < stages.length - 1 && (
                                                <ChevronLeft className="h-3 w-3 text-zinc-700 mx-1" />
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
                      ) : null}

                      {/* Mobile Actions */}
                      <div className="md:hidden flex items-center gap-2 mt-4 pt-4 border-t border-zinc-800/50">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setJobItemsJob(jobWithStats.job)}
                          className="flex-1 border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700"
                        >
                          <Package className="h-4 w-4 ml-2" />
                          מוצרים
                        </Button>
                        <JobFormDialog
                          mode="edit"
                          job={jobWithStats.job}
                          onSubmit={handleEdit}
                          trigger={
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingJob(jobWithStats.job)}
                              className="flex-1 border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700"
                            >
                              <Pencil className="h-4 w-4 ml-2" />
                              עריכה
                            </Button>
                          }
                          open={editingJob?.id === jobWithStats.job.id}
                          onOpenChange={async (open) => {
                            setEditingJob(open ? jobWithStats.job : null);
                            if (!open && onRefresh) await onRefresh();
                          }}
                          loading={isSubmitting}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Job Items Dialog */}
      <JobItemsDialog
        job={jobItemsJob}
        open={jobItemsJob !== null}
        onOpenChange={(open) => {
          if (!open) {
            const jobToRefresh = jobItemsJob;
            setJobItemsJob(null);
            // Refresh items for this job (force refetch)
            if (jobToRefresh) {
              setJobItems((prev) => {
                const next = { ...prev };
                delete next[jobToRefresh.id];
                return next;
              });
              fetchedJobsRef.current.delete(jobToRefresh.id);
              void loadJobItems(jobToRefresh.id);
            }
          }
        }}
      />

      {/* Job Creation Wizard */}
      <JobCreationWizard
        open={showWizard}
        onOpenChange={setShowWizard}
        onComplete={async (job) => {
          await onAdd(job);
          if (onRefresh) await onRefresh();
        }}
      />
    </div>
  );
};
