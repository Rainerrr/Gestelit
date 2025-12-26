"use client";

import { useMemo, useState } from "react";
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
import type { Job } from "@/lib/types";
import type { JobWithStats } from "@/lib/data/jobs";
import { Pencil, Trash2 } from "lucide-react";
import { JobFormDialog } from "./job-form-dialog";
import { checkJobActiveSessionAdminApi } from "@/lib/api/admin-management";
import { Alert, AlertDescription } from "@/components/ui/alert";

type JobsManagementProps = {
  jobs: JobWithStats[];
  isLoading: boolean;
  onAdd: (job: Partial<Job>) => Promise<void>;
  onEdit: (id: string, job: Partial<Job>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
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
  const [deleteJobHasActiveSession, setDeleteJobHasActiveSession] =
    useState(false);
  const [isCheckingDeleteSession, setIsCheckingDeleteSession] = useState(false);

  const sortedJobs = useMemo(
    () =>
      [...jobs].sort(
        (a, b) =>
          new Date(b.job.created_at ?? 0).getTime() -
          new Date(a.job.created_at ?? 0).getTime(),
      ),
    [jobs],
  );

  const handleAdd = async (payload: Partial<Job>) => {
    setIsSubmitting(true);
    try {
      await onAdd(payload);
    } finally {
      setIsSubmitting(false);
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

  const handleDeleteDialogOpenChange = async (
    open: boolean,
    jobId?: string,
  ) => {
    if (open && jobId) {
      setIsCheckingDeleteSession(true);
      try {
        const { hasActiveSession } = await checkJobActiveSessionAdminApi(jobId);
        setDeleteJobHasActiveSession(hasActiveSession);
      } catch (err) {
        console.error(
          "[jobs-management] Failed to check active session",
          err,
        );
        setDeleteJobHasActiveSession(false);
      } finally {
        setIsCheckingDeleteSession(false);
      }
    } else {
      setDeleteJobHasActiveSession(false);
    }
    setDeleteJobId(open ? (jobId ?? null) : null);
  };

  const getProgressPercent = (job: JobWithStats) => {
    if (!job.job.planned_quantity || job.job.planned_quantity <= 0) return null;
    return Math.min(
      100,
      Math.round((job.totalGood / job.job.planned_quantity) * 100),
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-base font-semibold text-foreground">עבודות</h3>
          <p className="text-sm text-muted-foreground">
            ניהול עבודות (פק&quot;ע) ומעקב כמויות.
          </p>
        </div>
        <JobFormDialog
          mode="create"
          onSubmit={handleAdd}
          trigger={
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
              הוסף עבודה
            </Button>
          }
          loading={isSubmitting}
        />
      </div>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">טוען עבודות...</p>
        </div>
      ) : sortedJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <p className="text-sm">אין עבודות להצגה.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  פק&quot;ע
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  לקוח
                </th>
                <th className="hidden md:table-cell px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  תיאור
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  מתוכנן
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  טובים
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  פסולים
                </th>
                <th className="hidden sm:table-cell px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  התקדמות
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  מצב
                </th>
                <th className="hidden lg:table-cell px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedJobs.map((jobWithStats) => {
                const progressPercent = getProgressPercent(jobWithStats);
                return (
                  <tr
                    key={jobWithStats.job.id}
                    className="group hover:bg-accent transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono font-medium text-foreground">
                          {jobWithStats.job.job_number}
                        </span>
                        <div className="flex items-center gap-2 lg:hidden">
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
                                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            }
                            open={editingJob?.id === jobWithStats.job.id}
                            onOpenChange={async (open) => {
                              setEditingJob(open ? jobWithStats.job : null);
                              if (!open && onRefresh) {
                                await onRefresh();
                              }
                            }}
                            loading={isSubmitting}
                          />
                          <Dialog
                            open={deleteJobId === jobWithStats.job.id}
                            onOpenChange={(open) =>
                              handleDeleteDialogOpenChange(
                                open,
                                jobWithStats.job.id,
                              )
                            }
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={isSubmitting}
                                aria-label="מחיקת עבודה"
                                className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent dir="rtl" className="border-border bg-card">
                              <DialogHeader>
                                <DialogTitle className="text-foreground">
                                  האם למחוק את העבודה?
                                </DialogTitle>
                                <DialogDescription className="text-muted-foreground">
                                  הפעולה תמחק את העבודה לחלוטין. סשנים קיימים
                                  ישמרו אך לא יהיו משויכים לעבודה זו. לא ניתן
                                  לבטל.
                                </DialogDescription>
                              </DialogHeader>
                              {isCheckingDeleteSession ? (
                                <p className="text-sm text-muted-foreground">
                                  בודק סשנים פעילים...
                                </p>
                              ) : deleteJobHasActiveSession ? (
                                <Alert
                                  variant="destructive"
                                  className="border-primary/30 bg-primary/10 text-right text-sm text-primary"
                                >
                                  <AlertDescription>
                                    לא ניתן למחוק עבודה עם סשן פעיל. יש לסיים את
                                    הסשן הפעיל לפני מחיקה.
                                  </AlertDescription>
                                </Alert>
                              ) : null}
                              <DialogFooter className="justify-start">
                                <Button
                                  onClick={() =>
                                    void handleDelete(jobWithStats.job.id)
                                  }
                                  disabled={
                                    isSubmitting ||
                                    deleteJobHasActiveSession ||
                                    isCheckingDeleteSession
                                  }
                                  className="bg-red-500 text-white hover:bg-red-600"
                                >
                                  מחיקה סופית
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => setDeleteJobId(null)}
                                  disabled={isSubmitting}
                                  className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
                                >
                                  ביטול
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {jobWithStats.job.customer_name ? (
                        <span className="text-foreground/80">
                          {jobWithStats.job.customer_name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3">
                      {jobWithStats.job.description ? (
                        <span
                          className="text-foreground/80 max-w-[200px] truncate block"
                          title={jobWithStats.job.description}
                        >
                          {jobWithStats.job.description}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground/80">
                      {jobWithStats.job.planned_quantity?.toLocaleString() ??
                        "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-emerald-400 font-medium">
                        {jobWithStats.totalGood.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-red-400 font-medium">
                        {jobWithStats.totalScrap.toLocaleString()}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      {progressPercent !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                progressPercent >= 100
                                  ? "bg-emerald-500"
                                  : "bg-primary"
                              }`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {progressPercent}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {jobWithStats.isCompleted ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          הושלם
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/10 border border-blue-500/30 text-blue-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          בתהליך
                        </span>
                      )}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
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
                              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                          open={editingJob?.id === jobWithStats.job.id}
                          onOpenChange={async (open) => {
                            setEditingJob(open ? jobWithStats.job : null);
                            if (!open && onRefresh) {
                              await onRefresh();
                            }
                          }}
                          loading={isSubmitting}
                        />
                        <Dialog
                          open={deleteJobId === jobWithStats.job.id}
                          onOpenChange={(open) =>
                            handleDeleteDialogOpenChange(
                              open,
                              jobWithStats.job.id,
                            )
                          }
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isSubmitting}
                              aria-label="מחיקת עבודה"
                              className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent dir="rtl" className="border-border bg-card">
                            <DialogHeader>
                              <DialogTitle className="text-foreground">
                                האם למחוק את העבודה?
                              </DialogTitle>
                              <DialogDescription className="text-muted-foreground">
                                הפעולה תמחק את העבודה לחלוטין. סשנים קיימים
                                ישמרו אך לא יהיו משויכים לעבודה זו. לא ניתן
                                לבטל.
                              </DialogDescription>
                            </DialogHeader>
                            {isCheckingDeleteSession ? (
                              <p className="text-sm text-muted-foreground">
                                בודק סשנים פעילים...
                              </p>
                            ) : deleteJobHasActiveSession ? (
                              <Alert
                                variant="destructive"
                                className="border-primary/30 bg-primary/10 text-right text-sm text-primary"
                              >
                                <AlertDescription>
                                  לא ניתן למחוק עבודה עם סשן פעיל. יש לסיים את
                                  הסשן הפעיל לפני מחיקה.
                                </AlertDescription>
                              </Alert>
                            ) : null}
                            <DialogFooter className="justify-start">
                              <Button
                                onClick={() =>
                                  void handleDelete(jobWithStats.job.id)
                                }
                                disabled={
                                  isSubmitting ||
                                  deleteJobHasActiveSession ||
                                  isCheckingDeleteSession
                                }
                                className="bg-red-500 text-white hover:bg-red-600"
                              >
                                מחיקה סופית
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => setDeleteJobId(null)}
                                disabled={isSubmitting}
                                className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
                              >
                                ביטול
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
