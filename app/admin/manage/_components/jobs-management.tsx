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
import type { Job, JobItemWithDetails } from "@/lib/types";
import type { JobWithStats } from "@/lib/data/jobs";
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ChevronsUpDown,
  Pencil,
  Trash2,
  Package,
  AlertTriangle,
  Plus,
  Cpu,
  GitBranch,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { JobCreationWizard } from "./job-creation-wizard";
import { JobFormDialog } from "./job-form-dialog";
import { JobItemsDialog } from "./job-items-dialog";
import { JobFilters, type JobFiltersState } from "./job-filters";
import {
  getJobDeletionInfoAdminApi,
  fetchJobItemsAdminApi,
  type JobDeletionInfo,
} from "@/lib/api/admin-management";
import { differenceInDays, format } from "date-fns";
import { he } from "date-fns/locale";

type JobsManagementProps = {
  jobs: JobWithStats[];
  isLoading: boolean;
  onAdd: (job: Partial<Job>) => Promise<void>;
  onEdit: (id: string, job: Partial<Job>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  /** Read-only mode for archive view - hides edit/delete buttons and add functionality */
  readOnly?: boolean;
};

const SortIcon = ({ active, direction }: { active: boolean; direction?: "asc" | "desc" }) => {
  if (!active) return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
  return direction === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
    : <ChevronDown className="h-3.5 w-3.5 text-primary" />;
};

const getDueDateStyle = (dueDate: string | null | undefined) => {
  if (!dueDate) return { bg: "bg-muted", text: "text-muted-foreground", label: "ללא יעד" };
  const date = new Date(dueDate);
  const daysUntil = differenceInDays(date, new Date());

  if (daysUntil < 0) {
    return { bg: "bg-red-500/10", text: "text-red-400", label: "איחור" };
  }
  if (daysUntil <= 3) {
    return { bg: "bg-amber-500/10", text: "text-amber-400", label: "בקרוב" };
  }
  if (daysUntil <= 7) {
    return { bg: "bg-blue-500/10", text: "text-blue-400", label: "השבוע" };
  }
  return { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "עתידי" };
};

export const JobsManagement = ({
  jobs,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
  onRefresh,
  readOnly = false,
}: JobsManagementProps) => {
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);
  const [deletionInfo, setDeletionInfo] = useState<JobDeletionInfo | null>(null);
  const [isCheckingDeleteInfo, setIsCheckingDeleteInfo] = useState(false);
  const [jobItemsJob, setJobItemsJob] = useState<Job | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [jobItems, setJobItems] = useState<Record<string, JobItemWithDetails[]>>({});
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});
  const [showWizard, setShowWizard] = useState(false);
  const [showPercentages, setShowPercentages] = useState(true);

  // Filters
  const [filters, setFilters] = useState<JobFiltersState>({
    sortBy: "created_at",
    sortDirection: "desc",
  });

  // Track which jobs have been fetched to avoid duplicate requests
  const fetchedJobsRef = useRef<Set<string>>(new Set());

  // Clear the ref on mount to ensure fresh data when component remounts
  useEffect(() => {
    fetchedJobsRef.current = new Set();
  }, []);

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

  // Extract unique values for filters
  const { jobItemNames, clientNames } = useMemo(() => {
    const itemNames = new Set<string>();
    const clients = new Set<string>();

    jobs.forEach((j) => {
      if (j.job.customer_name) clients.add(j.job.customer_name);
      const items = jobItems[j.job.id] ?? [];
      items.forEach((item) => {
        if (item.name) itemNames.add(item.name);
      });
    });

    return {
      jobItemNames: Array.from(itemNames),
      clientNames: Array.from(clients),
    };
  }, [jobs, jobItems]);

  const getProgressPercent = useCallback((job: JobWithStats) => {
    if (!job.plannedQuantity || job.plannedQuantity <= 0) return null;
    return Math.min(100, Math.round((job.totalGood / job.plannedQuantity) * 100));
  }, []);

  const isJobBlocked = useCallback((jobId: string) => {
    const items = jobItems[jobId];
    return !items || items.length === 0;
  }, [jobItems]);

  // Filter and sort jobs
  const filteredJobs = useMemo(() => {
    // In readOnly mode (archive), show only completed jobs. Otherwise show only active jobs.
    let filtered = readOnly
      ? jobs.filter((j) => j.isCompleted)
      : jobs.filter((j) => !j.isCompleted);

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (j) =>
          j.job.job_number.toLowerCase().includes(searchLower) ||
          (j.job.customer_name?.toLowerCase().includes(searchLower) ?? false)
      );
    }

    // Apply job item name filter
    if (filters.jobItemName) {
      filtered = filtered.filter((j) => {
        const items = jobItems[j.job.id] ?? [];
        return items.some((item) => item.name === filters.jobItemName);
      });
    }

    // Apply client name filter
    if (filters.clientName) {
      filtered = filtered.filter(
        (j) => j.job.customer_name === filters.clientName
      );
    }

    // Apply due date range filter
    if (filters.dueDateRange?.from) {
      filtered = filtered.filter((j) => {
        if (!j.job.due_date) return false;
        const jobDate = new Date(j.job.due_date);
        jobDate.setHours(0, 0, 0, 0);

        const from = new Date(filters.dueDateRange!.from!);
        from.setHours(0, 0, 0, 0);

        const to = filters.dueDateRange!.to
          ? new Date(filters.dueDateRange!.to)
          : new Date(from);
        to.setHours(23, 59, 59, 999);

        return jobDate >= from && jobDate <= to;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (filters.sortBy) {
        case "due_date":
          if (!a.job.due_date && !b.job.due_date) comparison = 0;
          else if (!a.job.due_date) comparison = 1;
          else if (!b.job.due_date) comparison = -1;
          else comparison = new Date(a.job.due_date).getTime() - new Date(b.job.due_date).getTime();
          break;
        case "progress":
          const progressA = a.plannedQuantity ? (a.totalGood / a.plannedQuantity) : 0;
          const progressB = b.plannedQuantity ? (b.totalGood / b.plannedQuantity) : 0;
          comparison = progressA - progressB;
          break;
        case "created_at":
        default:
          comparison = new Date(a.job.created_at ?? 0).getTime() - new Date(b.job.created_at ?? 0).getTime();
          break;
      }
      return filters.sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [jobs, jobItems, filters, readOnly]);

  const handleExpand = useCallback((jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
    } else {
      setExpandedJobId(jobId);
      void loadJobItems(jobId);
    }
  }, [expandedJobId, loadJobItems]);

  const handleSort = useCallback((column: "created_at" | "due_date" | "progress") => {
    setFilters((prev) => ({
      ...prev,
      sortBy: column,
      sortDirection: prev.sortBy === column && prev.sortDirection === "desc" ? "asc" : "desc",
    }));
  }, []);

  const handleEdit = useCallback(async (payload: Partial<Job>) => {
    if (!editingJob) return;
    setIsSubmitting(true);
    try {
      await onEdit(editingJob.id, payload);
    } finally {
      setIsSubmitting(false);
    }
  }, [editingJob, onEdit]);

  const handleDelete = useCallback(async (jobId: string) => {
    setIsSubmitting(true);
    try {
      // Re-check for active sessions before deletion
      const info = await getJobDeletionInfoAdminApi(jobId);
      if (info.hasActiveSessions) {
        setDeletionInfo(info);
        setIsSubmitting(false);
        return;
      }
      await onDelete(jobId);
      setDeleteJobId(null);
      setDeletionInfo(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [onDelete]);

  const handleDeleteDialogOpenChange = useCallback(async (open: boolean, jobId?: string) => {
    if (open && jobId) {
      setIsCheckingDeleteInfo(true);
      try {
        const info = await getJobDeletionInfoAdminApi(jobId);
        setDeletionInfo(info);
      } catch {
        setDeletionInfo(null);
      } finally {
        setIsCheckingDeleteInfo(false);
      }
    } else {
      setDeletionInfo(null);
    }
    setDeleteJobId(open ? (jobId ?? null) : null);
  }, []);

  // Render a job row (shared between active and archived sections)
  const renderJobRow = useCallback((jobWithStats: JobWithStats, _isArchived = false) => {
    const progressPercent = getProgressPercent(jobWithStats);
    const isExpanded = expandedJobId === jobWithStats.job.id;
    const items = jobItems[jobWithStats.job.id] ?? [];
    const blocked = isJobBlocked(jobWithStats.job.id);
    const isLoadingJobItems = loadingItems[jobWithStats.job.id];
    const dueDateStyle = getDueDateStyle(jobWithStats.job.due_date);

    return (
      <div key={jobWithStats.job.id} className="group">
        {/* Collapsed Row - Desktop Only */}
        <div
          className={`hidden md:grid md:grid-cols-[40px_120px_90px_1fr_90px_70px] gap-3 px-5 py-3 transition-all cursor-pointer ${
            isExpanded
              ? "bg-secondary/40"
              : "hover:bg-secondary/20"
          }`}
          onClick={() => handleExpand(jobWithStats.job.id)}
        >
          {/* Expand Toggle */}
          <div className="hidden md:flex items-center justify-center">
            <div
              className={`w-6 h-6 rounded-md bg-secondary/80 border border-input flex items-center justify-center transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
            >
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>

          {/* Job Number & Customer */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-foreground text-sm tracking-tight">
                  {jobWithStats.job.job_number}
                </span>
                {blocked && !isLoadingJobItems && (
                  <div className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
              </div>
              {jobWithStats.job.customer_name && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {jobWithStats.job.customer_name}
                </p>
              )}
            </div>
          </div>

          {/* Due Date Column */}
          <div className="hidden md:flex items-center justify-center">
            {jobWithStats.job.due_date ? (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${dueDateStyle.bg} ${dueDateStyle.text}`}
              >
                <Calendar className="h-3 w-3" />
                {format(new Date(jobWithStats.job.due_date), "d/M", { locale: he })}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground/50">—</span>
            )}
          </div>

          {/* Progress Bar */}
          <div className="hidden md:flex items-center gap-2 w-full">
            {progressPercent !== null ? (
              <div className="flex-1 flex items-center gap-2">
                <div className="h-7 rounded-lg overflow-hidden bg-muted/50 flex flex-1 min-w-0">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-xs font-bold font-mono tabular-nums text-foreground/80 whitespace-nowrap">
                  {showPercentages
                    ? `${progressPercent}%`
                    : `${jobWithStats.totalGood.toLocaleString()}/${(jobWithStats.plannedQuantity || 0).toLocaleString()}`
                  }
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground/60 text-xs">ללא יעד</span>
            )}
          </div>

          {/* Job Items Count */}
          <div className="hidden md:flex items-center justify-center">
            <span className="text-xs text-foreground/70">
              {isLoadingJobItems ? (
                <span className="text-muted-foreground/60">...</span>
              ) : (
                `${jobWithStats.completedItemCount}/${jobWithStats.jobItemCount} הושלמו`
              )}
            </span>
          </div>

          {/* Actions - hidden in readOnly mode */}
          {!readOnly && (
            <div
              className="hidden md:flex items-center justify-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
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
                    className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted/50"
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
                    className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl" className="border-border bg-card">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">
                      האם למחוק את העבודה?
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      {isCheckingDeleteInfo ? (
                        "טוען פרטי מחיקה..."
                      ) : deletionInfo ? (
                        <>
                          פעולה זו תמחק{" "}
                          <span className="font-semibold text-foreground">
                            {deletionInfo.jobItemCount} מוצרים
                          </span>
                          {deletionInfo.sessionCount > 0 && (
                            <>
                              {" "}ותנתק{" "}
                              <span className="font-semibold text-foreground">
                                {deletionInfo.sessionCount} סשנים
                              </span>{" "}
                              מהעבודה
                            </>
                          )}
                          . סשנים ישמרו עם נתוני הייצור שלהם. לא ניתן לבטל.
                        </>
                      ) : (
                        "הפעולה תמחק את העבודה לחלוטין. לא ניתן לבטל."
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  {deletionInfo?.hasActiveSessions && (
                    <Alert
                      variant="destructive"
                      className="border-red-500/30 bg-red-500/10 text-right text-sm text-red-400"
                    >
                      <AlertDescription>
                        לא ניתן למחוק עבודה עם סשן פעיל. יש לסיים את
                        הסשן הפעיל לפני מחיקה.
                      </AlertDescription>
                    </Alert>
                  )}
                  <DialogFooter className="justify-start">
                    <Button
                      onClick={() => void handleDelete(jobWithStats.job.id)}
                      disabled={
                        isSubmitting ||
                        deletionInfo?.hasActiveSessions ||
                        isCheckingDeleteInfo
                      }
                      className="bg-red-600 text-white hover:bg-red-500"
                    >
                      מחיקה סופית
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setDeleteJobId(null)}
                      disabled={isSubmitting}
                      className="border-input bg-secondary text-foreground/80 hover:bg-muted"
                    >
                      ביטול
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

        </div>

        {/* Mobile Card Layout - Outside grid so it renders on mobile */}
        <div
          className={`md:hidden p-4 space-y-3 cursor-pointer transition-colors ${
            isExpanded ? "bg-secondary/40" : "bg-card/30 hover:bg-secondary/20"
          }`}
          onClick={() => handleExpand(jobWithStats.job.id)}
        >
          {/* Top Row: Job Number & Items Count */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-foreground text-base tracking-tight">
                {jobWithStats.job.job_number}
              </span>
              {blocked && !isLoadingJobItems && (
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
              {/* Due Date Badge inline on mobile too */}
              {jobWithStats.job.due_date && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${dueDateStyle.bg} ${dueDateStyle.text}`}
                >
                  <Calendar className="h-2.5 w-2.5" />
                  {format(new Date(jobWithStats.job.due_date), "d/M", { locale: he })}
                </span>
              )}
            </div>
            <span className="text-xs text-foreground/70 font-medium">
              {isLoadingJobItems ? (
                <span className="text-muted-foreground/60">...</span>
              ) : (
                `${jobWithStats.completedItemCount}/${jobWithStats.jobItemCount} מוצרים`
              )}
            </span>
          </div>

          {/* Customer Name */}
          {jobWithStats.job.customer_name && (
            <p className="text-sm text-muted-foreground truncate">
              {jobWithStats.job.customer_name}
            </p>
          )}

          {/* Progress Bar */}
          {progressPercent !== null && (
            <div className="h-8 rounded-lg overflow-hidden bg-muted/50 flex">
              <div
                className="h-full bg-emerald-500 flex items-center justify-center transition-all"
                style={{ width: `${progressPercent}%`, minWidth: progressPercent > 0 ? "48px" : "0" }}
              >
                {progressPercent > 0 && (
                  <span className="text-xs font-bold font-mono tabular-nums text-white drop-shadow-sm">
                    {showPercentages
                      ? `${progressPercent}%`
                      : `${jobWithStats.totalGood.toLocaleString()}/${(jobWithStats.plannedQuantity || 0).toLocaleString()}`
                    }
                  </span>
                )}
              </div>
              {progressPercent < 100 && (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">
                    {showPercentages
                      ? `${((jobWithStats.plannedQuantity || 0) - jobWithStats.totalGood).toLocaleString()} נותרו`
                      : `(${progressPercent}%)`
                    }
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Expand Button Row */}
          <div className="flex items-center justify-end pt-2 border-t border-border/50">
            <div
              className={`w-7 h-7 rounded-md bg-secondary/80 border border-input flex items-center justify-center transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="px-5 py-4 bg-card/60 backdrop-blur-sm border-t border-border/40">
            {/* Description */}
            {jobWithStats.job.description && (
              <div className="mb-4 p-3 rounded-lg bg-secondary/40 border border-input">
                <p className="text-sm text-foreground/70 font-mono">{jobWithStats.job.description}</p>
              </div>
            )}

            {/* Action buttons row */}
            <div className="flex items-center mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setJobItemsJob(jobWithStats.job)}
                className="h-8 text-xs border-input bg-secondary/50 text-foreground/70 hover:bg-muted gap-1.5"
              >
                <Pencil className="h-3 w-3" />
                ערוך מוצרים
              </Button>
            </div>

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
                      לא הוגדרו מוצרים לעבודה זו.
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

            {/* Job Items */}
            {isLoadingJobItems ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-transparent border-t-primary" />
              </div>
            ) : items.length > 0 ? (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  מוצרים ({items.length})
                </h4>

                {/* Items Grid */}
                <div className="space-y-4">
                  {items.map((item) => {
                    const completed = item.progress?.completed_good ?? 0;
                    const planned = item.planned_quantity;
                    const percent = Math.min(100, Math.round((completed / planned) * 100));
                    const stages = item.job_item_steps ?? item.job_item_stations ?? [];
                    const wipBalances = item.wip_balances ?? [];
                    const isMultiStation = stages.length > 1;

                    const wipByStationId = new Map(
                      wipBalances.map((wb) => [wb.job_item_step_id, wb.good_available])
                    );

                    const wipDistribution = stages.map((stage) => wipByStationId.get(stage.id) ?? 0);
                    const wipSum = wipDistribution.reduce((a, b) => a + b, 0);
                    // totalInSystem = max of WIP sum or completed (handles data where WIP wasn't synced with completed_good)
                    const totalInSystem = Math.max(wipSum, completed);
                    const totalPercent = planned > 0 ? Math.min(100, (totalInSystem / planned) * 100) : 0;

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

                    const nonTerminalWip = stages.length > 1 ? wipDistribution.slice(0, -1) : [];
                    const maxWip = Math.max(0, ...nonTerminalWip);
                    const bottleneckIdx = maxWip > 0 ? nonTerminalWip.indexOf(maxWip) : -1;

                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-xl bg-secondary/30 border border-input/60"
                      >
                        {/* Item Header */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                isMultiStation
                                  ? "bg-blue-500/20 border border-blue-500/30"
                                  : "bg-cyan-500/20 border border-cyan-500/30"
                              }`}
                            >
                              {isMultiStation ? (
                                <GitBranch className="h-4 w-4 text-blue-400" />
                              ) : (
                                <Cpu className="h-4 w-4 text-cyan-400" />
                              )}
                            </div>
                            <div>
                              <span className="font-medium text-foreground text-sm">
                                {item.name || item.pipeline_preset?.name || "מוצר"}
                              </span>
                              <Badge
                                variant="secondary"
                                className="mr-2 text-[9px] bg-secondary/80 text-muted-foreground border-input"
                              >
                                {stages.length} שלבים
                              </Badge>
                            </div>
                          </div>
                          <div className="text-left">
                            <div className="text-lg font-bold font-mono tabular-nums text-emerald-400">
                              {showPercentages ? `${percent}%` : completed.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono tabular-nums">
                              הושלם מתוך {planned.toLocaleString()}
                            </div>
                          </div>
                        </div>

                        {/* Single-step Pipeline - Simple Progress Bar */}
                        {!isMultiStation && stages.length === 1 && (
                          <div className="space-y-2">
                            <div className="h-10 rounded-xl overflow-hidden bg-secondary flex items-center">
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
                                  <span className="text-[10px] text-muted-foreground/60 font-mono">
                                    {(planned - completed).toLocaleString()} נותרו
                                  </span>
                                </div>
                              )}
                            </div>
                            {/* Single Station Legend */}
                            <div className="bg-muted/50 rounded-lg p-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-emerald-500"
                                />
                                <span className="text-xs font-medium text-muted-foreground">
                                  {stages[0]?.station?.name ?? "תחנה"}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Multi-step Pipeline - Segmented Bar */}
                        {isMultiStation && (
                          <div className="space-y-2">
                            <div className="h-12 rounded-xl overflow-hidden bg-secondary flex">
                              {/* Show completed segment when WIP is empty but completed > 0 */}
                              {wipSum === 0 && completed > 0 && (
                                <div
                                  className="h-full flex items-center justify-center relative transition-all bg-emerald-500"
                                  style={{
                                    width: `${percent}%`,
                                    minWidth: "50px"
                                  }}
                                >
                                  <div className="flex flex-col items-center justify-center px-1">
                                    <span className="text-[10px] font-medium text-white/90 truncate max-w-full drop-shadow-sm">
                                      הושלם
                                    </span>
                                    <span className="text-sm font-bold font-mono text-white drop-shadow-md">
                                      {showPercentages
                                        ? `${percent}%`
                                        : completed.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Show WIP at each stage when there is WIP */}
                              {wipSum > 0 && stages.map((stage, idx) => {
                                const stageWip = wipDistribution[idx] ?? 0;
                                const stagePercent = planned > 0 ? (stageWip / planned) * 100 : 0;
                                const segmentStyle = getSegmentStyle(idx, stages.length, stage.is_terminal);
                                const isBottleneck = idx === bottleneckIdx && maxWip > 0;

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
                                    {isBottleneck && (
                                      <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-white animate-pulse" />
                                    )}
                                    {idx < stages.length - 1 && stageWip > 0 && (
                                      <div className="absolute left-0 top-0 bottom-0 w-px bg-black/20" />
                                    )}
                                  </div>
                                );
                              })}

                              {totalPercent < 100 && (
                                <div
                                  className="h-full flex items-center justify-center flex-1"
                                  style={{ minWidth: "40px" }}
                                >
                                  <span className="text-[10px] text-muted-foreground/60 font-mono">
                                    {(planned - totalInSystem).toLocaleString()} נותרו
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Stage Legend */}
                            <div className="bg-muted/50 rounded-lg p-3 mt-3">
                              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                                {stages.map((stage, idx) => {
                                  const segmentStyle = getSegmentStyle(idx, stages.length, stage.is_terminal);
                                  return (
                                    <div key={stage.id} className="flex items-center gap-2">
                                      {/* Color dot */}
                                      <span
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: segmentStyle.color }}
                                      />
                                      {/* Station name */}
                                      <span className="text-xs font-medium text-muted-foreground">
                                        {stage.station?.name ?? `שלב ${stage.position}`}
                                      </span>
                                      {/* Arrow separator (RTL) */}
                                      {idx < stages.length - 1 && (
                                        <ChevronLeft className="h-3 w-3 text-muted-foreground/50" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Mobile Actions - hidden in readOnly mode */}
            {!readOnly && (
              <div className="md:hidden flex items-center gap-2 mt-4 pt-4 border-t border-border/50">
                <JobFormDialog
                  mode="edit"
                  job={jobWithStats.job}
                  onSubmit={handleEdit}
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingJob(jobWithStats.job)}
                      className="flex-1 border-input bg-secondary/50 text-foreground/80 hover:bg-muted"
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
                <Dialog
                  open={deleteJobId === jobWithStats.job.id}
                  onOpenChange={(open) =>
                    handleDeleteDialogOpenChange(open, jobWithStats.job.id)
                  }
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      className="border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4 ml-2" />
                      מחיקה
                    </Button>
                  </DialogTrigger>
                  <DialogContent dir="rtl" className="border-border bg-card">
                    <DialogHeader>
                      <DialogTitle className="text-foreground">
                        האם למחוק את העבודה?
                      </DialogTitle>
                      <DialogDescription className="text-muted-foreground">
                        {isCheckingDeleteInfo ? (
                          "טוען פרטי מחיקה..."
                        ) : deletionInfo ? (
                          <>
                            פעולה זו תמחק{" "}
                            <span className="font-semibold text-foreground">
                              {deletionInfo.jobItemCount} מוצרים
                            </span>
                            {deletionInfo.sessionCount > 0 && (
                              <>
                                {" "}ותנתק{" "}
                                <span className="font-semibold text-foreground">
                                  {deletionInfo.sessionCount} סשנים
                                </span>{" "}
                                מהעבודה
                              </>
                            )}
                            . סשנים ישמרו עם נתוני הייצור שלהם. לא ניתן לבטל.
                          </>
                        ) : (
                          "הפעולה תמחק את העבודה לחלוטין. לא ניתן לבטל."
                        )}
                      </DialogDescription>
                    </DialogHeader>
                    {deletionInfo?.hasActiveSessions && (
                      <Alert
                        variant="destructive"
                        className="border-red-500/30 bg-red-500/10 text-right text-sm text-red-400"
                      >
                        <AlertDescription>
                          לא ניתן למחוק עבודה עם סשן פעיל. יש לסיים את
                          הסשן הפעיל לפני מחיקה.
                        </AlertDescription>
                      </Alert>
                    )}
                    <DialogFooter className="justify-start">
                      <Button
                        onClick={() => void handleDelete(jobWithStats.job.id)}
                        disabled={
                          isSubmitting ||
                          deletionInfo?.hasActiveSessions ||
                          isCheckingDeleteInfo
                        }
                        className="bg-red-600 text-white hover:bg-red-500"
                      >
                        מחיקה סופית
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setDeleteJobId(null)}
                        disabled={isSubmitting}
                        className="border-input bg-secondary text-foreground/80 hover:bg-muted"
                      >
                        ביטול
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }, [
    expandedJobId,
    jobItems,
    loadingItems,
    showPercentages,
    isSubmitting,
    editingJob,
    deleteJobId,
    deletionInfo,
    isCheckingDeleteInfo,
    getProgressPercent,
    isJobBlocked,
    loadJobItems,
    handleExpand,
    handleEdit,
    handleDelete,
    handleDeleteDialogOpenChange,
    onRefresh,
    readOnly,
  ]);

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <JobFilters
        jobItemNames={jobItemNames}
        clientNames={clientNames}
        value={filters}
        onChange={setFilters}
      />

      {/* Header with Add Button and Global Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">
            {readOnly ? `עבודות שהושלמו (${filteredJobs.length})` : `עבודות פעילות (${filteredJobs.length})`}
          </h3>
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Clear all cached job items to force fresh fetch
                fetchedJobsRef.current.clear();
                setJobItems({});
                void onRefresh();
              }}
              disabled={isLoading}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label="רענון נתונים"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
        {!readOnly && (
          <Button
            onClick={() => setShowWizard(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-lg shadow-primary/20"
          >
            <Plus className="h-4 w-4 ml-2" />
            עבודה חדשה
          </Button>
        )}
      </div>

      {/* Jobs Table */}
      <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="relative h-12 w-12">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
              <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-b-primary/50" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
            </div>
            <p className="text-sm text-muted-foreground">טוען עבודות...</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
            <div className="w-16 h-16 rounded-xl bg-secondary/50 border border-input flex items-center justify-center">
              <Package className="h-8 w-8 text-muted-foreground/60" />
            </div>
            <div className="text-center">
              <p className="text-base font-medium text-foreground/80">
                {readOnly ? "אין עבודות שהושלמו" : "אין עבודות להצגה"}
              </p>
              <p className="text-sm mt-1">
                {readOnly ? "עבודות שיושלמו יופיעו כאן" : "התחל ביצירת עבודה חדשה"}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-[40px_120px_90px_1fr_90px_70px] gap-3 px-5 py-3 bg-card/50 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <div></div>
              <div className="flex items-center gap-1 text-right justify-start">
                פק&quot;ע / לקוח
              </div>
              <button
                type="button"
                onClick={() => handleSort("due_date")}
                className="flex items-center gap-1 hover:text-foreground transition-colors justify-center"
              >
                <Calendar className="h-3 w-3" />
                יעד
                <SortIcon active={filters.sortBy === "due_date"} direction={filters.sortDirection} />
              </button>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSort("progress")}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  התקדמות
                  <SortIcon active={filters.sortBy === "progress"} direction={filters.sortDirection} />
                </button>
                {/* Global Units/Percent Toggle */}
                <div className="flex items-center rounded-md bg-muted p-0.5 normal-case tracking-normal">
                  <button
                    type="button"
                    onClick={() => setShowPercentages(false)}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-all ${
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
                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-all ${
                      showPercentages
                        ? "bg-accent text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    %
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-center">מוצרים</div>
              <div className="flex items-center justify-center">פעולות</div>
            </div>

            {/* Job Rows */}
            {filteredJobs.map((job) => renderJobRow(job))}
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
