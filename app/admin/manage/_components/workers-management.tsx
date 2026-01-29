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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Station, Worker } from "@/lib/types";
import type { WorkerWithStats } from "@/lib/data/admin-management";
import { KeyRound, Pencil, Trash2 } from "lucide-react";
import { WorkerFormDialog } from "./worker-form-dialog";
import { WorkerPermissionsDialog } from "./worker-permissions-dialog";
import { checkWorkerActiveSessionAdminApi } from "@/lib/api/admin-management";
import { Alert, AlertDescription } from "@/components/ui/alert";

type WorkersManagementProps = {
  workers: WorkerWithStats[];
  stations: Station[];
  departments: string[];
  isLoading: boolean;
  onAdd: (worker: Partial<Worker>) => Promise<void>;
  onEdit: (id: string, worker: Partial<Worker>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onFetchAssignments: (workerId: string) => Promise<Station[]>;
  onAssignStation: (workerId: string, stationId: string) => Promise<void>;
  onRemoveStation: (workerId: string, stationId: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
};

export const WorkersManagement = ({
  workers,
  stations,
  departments,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
  onFetchAssignments,
  onAssignStation,
  onRemoveStation,
  onRefresh,
}: WorkersManagementProps) => {
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteWorkerId, setDeleteWorkerId] = useState<string | null>(null);
  const [deleteWorkerHasActiveSession, setDeleteWorkerHasActiveSession] = useState(false);
  const [isCheckingDeleteSession, setIsCheckingDeleteSession] = useState(false);
  const sortedWorkers = useMemo(
    () =>
      [...workers].sort((a, b) =>
        a.worker.full_name.localeCompare(b.worker.full_name, "he"),
      ),
    [workers],
  );

  const handleAdd = async (payload: Partial<Worker>) => {
    setIsSubmitting(true);
    try {
      await onAdd(payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (payload: Partial<Worker>) => {
    if (!editingWorker) return;
    setIsSubmitting(true);
    try {
      await onEdit(editingWorker.id, payload);
      // Don't close dialog - let the form dialog show success message and stay open
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (workerId: string) => {
    setIsSubmitting(true);
    setDeleteWorkerHasActiveSession(false);
    try {
      // Check for active session before attempting delete
      const { hasActiveSession } = await checkWorkerActiveSessionAdminApi(workerId);
      if (hasActiveSession) {
        setDeleteWorkerHasActiveSession(true);
        setIsSubmitting(false);
        return;
      }
      await onDelete(workerId);
      setDeleteWorkerId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDialogOpenChange = async (open: boolean, workerId?: string) => {
    if (open && workerId) {
      setIsCheckingDeleteSession(true);
      try {
        const { hasActiveSession } = await checkWorkerActiveSessionAdminApi(workerId);
        setDeleteWorkerHasActiveSession(hasActiveSession);
      } catch (err) {
        console.error("[workers-management] Failed to check active session", err);
        setDeleteWorkerHasActiveSession(false);
      } finally {
        setIsCheckingDeleteSession(false);
      }
    } else {
      setDeleteWorkerHasActiveSession(false);
    }
    setDeleteWorkerId(open ? (workerId ?? null) : null);
  };

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-base font-semibold text-foreground">עובדים</h3>
          <p className="text-sm text-muted-foreground">ניהול עובדים והרשאות תחנה.</p>
        </div>
        <WorkerFormDialog
          mode="create"
          departments={departments}
          onSubmit={handleAdd}
          trigger={
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">הוסף עובד</Button>
          }
          loading={isSubmitting}
        />
      </div>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">טוען עובדים...</p>
        </div>
      ) : sortedWorkers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <p className="text-sm">אין עובדים להצגה.</p>
        </div>
      ) : (
        <>
        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-border">
          {sortedWorkers.map(({ worker, stationCount }) => (
            <div key={worker.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">{worker.full_name}</span>
                {worker.is_active ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    פעיל
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-500/10 border border-zinc-500/30 text-zinc-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                    לא פעיל
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-mono text-foreground/80">{worker.worker_code}</span>
                <span className="text-muted-foreground">|</span>
                {worker.department ? (
                  <Badge variant="secondary" className="bg-secondary text-foreground/80 border-input">{worker.department}</Badge>
                ) : (
                  <span className="text-muted-foreground">ללא מחלקה</span>
                )}
                <span className="text-muted-foreground">|</span>
                <span className="text-muted-foreground">{stationCount} תחנות</span>
              </div>
              <div className="flex items-center gap-2">
                <WorkerPermissionsDialog
                  worker={worker}
                  stations={stations}
                  onFetchAssignments={onFetchAssignments}
                  onAssign={onAssignStation}
                  onRemove={onRemoveStation}
                  onRefresh={onRefresh}
                  trigger={
                    <Button variant="outline" size="sm" aria-label="ניהול הרשאות תחנות" className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground hover:bg-muted border-input">
                      <KeyRound className="h-4 w-4" />
                    </Button>
                  }
                />
                <WorkerFormDialog
                  mode="edit"
                  worker={worker}
                  departments={departments}
                  onSubmit={handleEdit}
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingWorker(worker)}
                      aria-label="עריכת עובד"
                      className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground hover:bg-muted border-input"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  }
                  open={editingWorker?.id === worker.id}
                  onOpenChange={async (open) => {
                    setEditingWorker(open ? worker : null);
                    if (!open && onRefresh) {
                      await onRefresh();
                    }
                  }}
                  loading={isSubmitting}
                />
                <Dialog
                  open={deleteWorkerId === worker.id}
                  onOpenChange={(open) => handleDeleteDialogOpenChange(open, worker.id)}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      aria-label="מחיקת עובד"
                      className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-red-400 hover:bg-red-500/10 border-input"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent dir="rtl" className="border-border bg-card">
                    <DialogHeader>
                      <DialogTitle className="text-foreground">האם למחוק את העובד?</DialogTitle>
                      <DialogDescription className="text-muted-foreground">
                        הפעולה תמחק את העובד לחלוטין ותשמור היסטוריה בסשנים קיימים. לא ניתן לבטל.
                      </DialogDescription>
                    </DialogHeader>
                    {isCheckingDeleteSession ? (
                      <p className="text-sm text-muted-foreground">בודק סשנים פעילים...</p>
                    ) : deleteWorkerHasActiveSession ? (
                      <Alert
                        variant="destructive"
                        className="border-primary/30 bg-primary/10 text-right text-sm text-primary"
                      >
                        <AlertDescription>
                          לא ניתן למחוק עובד עם סשן פעיל. יש לסיים את הסשן הפעיל לפני מחיקה.
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    <DialogFooter className="justify-start">
                      <Button
                        onClick={() => void handleDelete(worker.id)}
                        disabled={isSubmitting || deleteWorkerHasActiveSession || isCheckingDeleteSession}
                        className="bg-red-500 text-white hover:bg-red-600"
                      >
                        מחיקה סופית
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setDeleteWorkerId(null)}
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
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">שם מלא</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">קוד עובד</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">מחלקה</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">תחנות</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">מצב</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedWorkers.map(({ worker, stationCount }) => (
                <tr key={worker.id} className="group hover:bg-accent transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{worker.full_name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-foreground/80">{worker.worker_code}</span>
                  </td>
                  <td className="px-4 py-3">
                    {worker.department ? (
                      <Badge variant="secondary" className="bg-secondary text-foreground/80 border-input">{worker.department}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{stationCount}</td>
                  <td className="px-4 py-3">
                    {worker.is_active ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        פעיל
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-500/10 border border-zinc-500/30 text-zinc-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                        לא פעיל
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <WorkerPermissionsDialog
                        worker={worker}
                        stations={stations}
                        onFetchAssignments={onFetchAssignments}
                        onAssign={onAssignStation}
                        onRemove={onRemoveStation}
                        onRefresh={onRefresh}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="ניהול הרשאות תחנות" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <WorkerFormDialog
                        mode="edit"
                        worker={worker}
                        departments={departments}
                        onSubmit={handleEdit}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingWorker(worker)}
                            aria-label="עריכת עובד"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                        open={editingWorker?.id === worker.id}
                        onOpenChange={async (open) => {
                          setEditingWorker(open ? worker : null);
                          if (!open && onRefresh) {
                            await onRefresh();
                          }
                        }}
                        loading={isSubmitting}
                      />
                      <Dialog open={deleteWorkerId === worker.id} onOpenChange={(open) => handleDeleteDialogOpenChange(open, worker.id)}>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isSubmitting}
                            aria-label="מחיקת עובד"
                            className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent dir="rtl" className="border-border bg-card">
                          <DialogHeader>
                            <DialogTitle className="text-foreground">האם למחוק את העובד?</DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                              הפעולה תמחק את העובד לחלוטין ותשמור היסטוריה בסשנים קיימים. לא ניתן לבטל.
                            </DialogDescription>
                          </DialogHeader>
                          {isCheckingDeleteSession ? (
                            <p className="text-sm text-muted-foreground">בודק סשנים פעילים...</p>
                          ) : deleteWorkerHasActiveSession ? (
                            <Alert
                              variant="destructive"
                              className="border-primary/30 bg-primary/10 text-right text-sm text-primary"
                            >
                              <AlertDescription>
                                לא ניתן למחוק עובד עם סשן פעיל. יש לסיים את הסשן הפעיל לפני מחיקה.
                              </AlertDescription>
                            </Alert>
                          ) : null}
                          <DialogFooter className="justify-start">
                            <Button
                              onClick={() => void handleDelete(worker.id)}
                              disabled={isSubmitting || deleteWorkerHasActiveSession || isCheckingDeleteSession}
                              className="bg-red-500 text-white hover:bg-red-600"
                            >
                              מחיקה סופית
                            </Button>
                            <Button variant="outline" onClick={() => setDeleteWorkerId(null)} disabled={isSubmitting} className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground">
                              ביטול
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
};


