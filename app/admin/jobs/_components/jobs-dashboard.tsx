"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Briefcase, Archive, ListTodo, BarChart3, CheckCircle2 } from "lucide-react";
import { useNotification } from "@/contexts/NotificationContext";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import {
  fetchJobsAdminApi,
  createJobAdminApi,
  updateJobAdminApi,
  deleteJobAdminApi,
} from "@/lib/api/admin-management";
import type { Job } from "@/lib/types";
import type { JobWithStats } from "@/lib/data/jobs";
import { JobsManagement } from "../../manage/_components/jobs-management";
import { AdminLayout } from "../../_components/admin-layout";
import { AdminPageHeader, MobileBottomBar } from "../../_components/admin-page-header";

// Note: JobsManagement handles both active and archived views via `readOnly` prop

type ActiveTab = "active" | "archived" | "analytics";

const errorCopy: Record<string, string> = {
  JOB_NUMBER_EXISTS: "מספר עבודה כבר קיים במערכת.",
  JOB_HAS_ACTIVE_SESSIONS: "לא ניתן למחוק עבודה עם סשן פעיל.",
  JOB_NOT_FOUND: "עבודה לא נמצאה.",
  JOB_CREATE_FAILED: "יצירת עבודה נכשלה.",
  JOB_UPDATE_FAILED: "עדכון עבודה נכשל.",
  JOB_DELETE_FAILED: "מחיקת עבודה נכשלה.",
};

export const JobsDashboard = () => {
  const { hasAccess } = useAdminGuard();
  const { notify } = useNotification();
  const [activeTab, setActiveTab] = useState<ActiveTab>("active");
  const [jobs, setJobs] = useState<JobWithStats[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState<boolean>(true);

  // Track if initial data has been loaded
  const initialLoadDoneRef = useRef(false);

  const friendlyError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "UNKNOWN_ERROR";
    notify({ title: "שגיאה", message: errorCopy[message] ?? "משהו השתבש, נסה שוב.", variant: "error" });
  }, [notify]);

  const loadJobs = useCallback(async () => {
    setIsLoadingJobs(true);
    try {
      const { jobs: data } = await fetchJobsAdminApi({
        status: "all",
      });
      setJobs(data);
    } catch (error) {
      friendlyError(error);
    } finally {
      setIsLoadingJobs(false);
    }
  }, [friendlyError]);

  // Initial load - runs ONCE when hasAccess becomes true
  useEffect(() => {
    if (hasAccess !== true || initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    void loadJobs();
  }, [hasAccess, loadJobs]);

  const handleAddJob = async (payload: Partial<Job>) => {
    try {
      await createJobAdminApi({
        job_number: payload.job_number ?? "",
        customer_name: payload.customer_name ?? null,
        description: payload.description ?? null,
      });
      await loadJobs();
    } catch (error) {
      friendlyError(error);
    }
  };

  const handleUpdateJob = async (id: string, payload: Partial<Job>) => {
    try {
      await updateJobAdminApi(id, {
        customer_name: payload.customer_name,
        description: payload.description,
        due_date: payload.due_date,
      });
    } catch (error) {
      friendlyError(error);
    }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      await deleteJobAdminApi(id);
      notify({ title: "הצלחה", message: "העבודה נמחקה בהצלחה.", variant: "success" });
      await loadJobs();
    } catch (error) {
      friendlyError(error);
    }
  };

  if (hasAccess === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-xl border border-border bg-card/50 text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <span>טוען הרשאות...</span>
        </div>
      </div>
    );
  }

  if (hasAccess === false) {
    return null;
  }

  const capsuleConfig = {
    options: [
      { id: "active", label: "עבודות פעילות", icon: ListTodo },
      { id: "archived", label: "ארכיון", icon: Archive },
      { id: "analytics", label: "ניתוח", icon: BarChart3 },
    ],
    activeId: activeTab,
    onChange: (id: string) => setActiveTab(id as ActiveTab),
  };

  return (
    <AdminLayout
      header={
        <AdminPageHeader
          icon={Briefcase}
          title="עבודות"
          capsules={capsuleConfig}
        />
      }
      mobileBottomBar={<MobileBottomBar capsules={capsuleConfig} />}
    >
      <div className="space-y-4 pb-mobile-nav">
        {activeTab === "active" && (
          <JobsManagement
            jobs={jobs}
            isLoading={isLoadingJobs}
            onAdd={handleAddJob}
            onEdit={handleUpdateJob}
            onDelete={handleDeleteJob}
            onRefresh={loadJobs}
          />
        )}

        {activeTab === "archived" && (
          <JobsManagement
            jobs={jobs}
            isLoading={isLoadingJobs}
            onAdd={handleAddJob}
            onEdit={handleUpdateJob}
            onDelete={handleDeleteJob}
            onRefresh={loadJobs}
            readOnly
          />
        )}

        {activeTab === "analytics" && (
          <JobsAnalyticsView jobs={jobs} isLoading={isLoadingJobs} />
        )}
      </div>
    </AdminLayout>
  );
};

// Jobs Analytics View component
const JobsAnalyticsView = ({
  jobs,
  isLoading
}: {
  jobs: JobWithStats[];
  isLoading: boolean;
}) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          <div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-b-primary/50" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
        </div>
        <p className="text-sm text-muted-foreground">טוען נתונים...</p>
      </div>
    );
  }

  const activeJobs = jobs.filter(j => !j.isCompleted);
  const completedJobs = jobs.filter(j => j.isCompleted);
  const totalPlanned = jobs.reduce((sum, j) => sum + (j.plannedQuantity || 0), 0);
  const totalGood = jobs.reduce((sum, j) => sum + j.totalGood, 0);
  const totalScrap = jobs.reduce((sum, j) => sum + j.totalScrap, 0);
  const overallProgress = totalPlanned > 0 ? Math.round((totalGood / totalPlanned) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <ListTodo className="h-5 w-5 text-blue-400" />
            </div>
            <span className="text-sm text-muted-foreground">עבודות פעילות</span>
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-foreground">
            {activeJobs.length}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <span className="text-sm text-muted-foreground">עבודות שהושלמו</span>
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-foreground">
            {completedJobs.length}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground">התקדמות כוללת</span>
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-foreground">
            {overallProgress}%
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-amber-400" />
            </div>
            <span className="text-sm text-muted-foreground">סה״כ ייצור</span>
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-foreground">
            {totalGood.toLocaleString()}
          </div>
          {totalScrap > 0 && (
            <div className="text-xs text-red-400 mt-1">
              פסולת: {totalScrap.toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Progress breakdown */}
      <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-5">
        <h3 className="text-lg font-semibold text-foreground mb-4">סיכום ייצור</h3>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">תוכנית מול ביצוע</span>
              <span className="text-sm font-mono tabular-nums text-foreground">
                {totalGood.toLocaleString()} / {totalPlanned.toLocaleString()}
              </span>
            </div>
            <div className="h-4 rounded-lg overflow-hidden bg-secondary">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {totalScrap > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">אחוז פסולת</span>
                <span className="text-sm font-mono tabular-nums text-red-400">
                  {((totalScrap / (totalGood + totalScrap)) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 rounded-lg overflow-hidden bg-secondary">
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{ width: `${(totalScrap / (totalGood + totalScrap)) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
