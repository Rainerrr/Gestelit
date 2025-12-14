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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">עובדים</CardTitle>
          <p className="text-sm text-slate-500">ניהול עובדים והרשאות תחנה.</p>
        </div>
        <WorkerFormDialog
          mode="create"
          departments={departments}
          onSubmit={handleAdd}
          trigger={
            <Button>הוסף עובד</Button>
          }
          loading={isSubmitting}
        />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-slate-500">טוען עובדים...</p>
        ) : sortedWorkers.length === 0 ? (
          <p className="text-sm text-slate-500">אין עובדים להצגה.</p>
        ) : (
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[880px] text-right [&_td]:px-3 [&_td]:py-3 [&_th]:px-3 [&_th]:py-3">
              <TableHeader>
                <TableRow className="h-12">
                  <TableHead className="whitespace-nowrap text-right">שם מלא</TableHead>
                  <TableHead className="whitespace-nowrap text-right">קוד עובד</TableHead>
                  <TableHead className="whitespace-nowrap text-right">מחלקה</TableHead>
                  <TableHead className="whitespace-nowrap text-right">תחנות משויכות</TableHead>
                  <TableHead className="whitespace-nowrap text-right">מצב</TableHead>
                  <TableHead className="hidden whitespace-nowrap text-right lg:table-cell">
                    פעולות
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedWorkers.map(({ worker, stationCount }) => (
                  <TableRow key={worker.id} className="h-14">
                    <TableCell className="whitespace-nowrap font-medium">
                      <div className="flex items-center justify-between gap-3">
                        <span>{worker.full_name}</span>
                        <div className="flex items-center gap-2 lg:hidden">
                          <WorkerPermissionsDialog
                            worker={worker}
                            stations={stations}
                            onFetchAssignments={onFetchAssignments}
                            onAssign={onAssignStation}
                            onRemove={onRemoveStation}
                            onRefresh={onRefresh}
                            trigger={
                            <Button variant="secondary" size="icon" aria-label="ניהול הרשאות תחנות">
                              <KeyRound className="h-4 w-4" />
                              <span className="sr-only">הרשאות</span>
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
                                variant="secondary"
                                size="icon"
                                onClick={() => setEditingWorker(worker)}
                                aria-label="עריכת עובד"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            }
                            open={editingWorker?.id === worker.id}
                            onOpenChange={async (open) => {
                              setEditingWorker(open ? worker : null);
                              // Refresh when dialog closes to update the list
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
                                variant="destructive"
                                size="icon"
                                disabled={isSubmitting}
                                aria-label="מחיקת עובד"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent dir="rtl">
                              <DialogHeader>
                                <DialogTitle>האם למחוק את העובד?</DialogTitle>
                                <DialogDescription>
                                  הפעולה תמחק את העובד לחלוטין ותשמור היסטוריה בסשנים קיימים. לא ניתן לבטל.
                                </DialogDescription>
                              </DialogHeader>
                              {isCheckingDeleteSession ? (
                                <p className="text-sm text-slate-500">בודק סשנים פעילים...</p>
                              ) : deleteWorkerHasActiveSession ? (
                                <Alert
                                  variant="destructive"
                                  className="border-amber-200 bg-amber-50 text-right text-sm text-amber-800"
                                >
                                  <AlertDescription>
                                    לא ניתן למחוק עובד עם סשן פעיל. יש לסיים את הסשן הפעיל לפני מחיקה.
                                  </AlertDescription>
                                </Alert>
                              ) : null}
                              <DialogFooter className="justify-start">
                                <Button
                                  variant="destructive"
                                  onClick={() => void handleDelete(worker.id)}
                                  disabled={isSubmitting || deleteWorkerHasActiveSession || isCheckingDeleteSession}
                                >
                                  מחיקה סופית
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => setDeleteWorkerId(null)}
                                  disabled={isSubmitting}
                                >
                                  ביטול
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{worker.worker_code}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {worker.department ? (
                        <Badge variant="secondary">{worker.department}</Badge>
                      ) : (
                        <span className="text-slate-500">ללא</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{stationCount}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex flex-row-reverse items-center justify-end gap-2">
                        <span className="text-sm text-slate-600">
                          {worker.is_active ? "פעיל" : "לא פעיל"}
                        </span>
                        <Switch checked={worker.is_active} disabled aria-readonly />
                      </div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap lg:table-cell">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <WorkerPermissionsDialog
                          worker={worker}
                          stations={stations}
                          onFetchAssignments={onFetchAssignments}
                          onAssign={onAssignStation}
                          onRemove={onRemoveStation}
                          trigger={
                            <Button variant="secondary" size="icon" aria-label="ניהול הרשאות תחנות">
                              <KeyRound className="h-4 w-4" />
                              <span className="sr-only">הרשאות</span>
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
                              variant="secondary"
                              size="sm"
                              onClick={() => setEditingWorker(worker)}
                              aria-label="עריכת עובד"
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">עריכה</span>
                            </Button>
                          }
                          open={editingWorker?.id === worker.id}
                          onOpenChange={(open) => setEditingWorker(open ? worker : null)}
                          loading={isSubmitting}
                        />
                        <Dialog open={deleteWorkerId === worker.id} onOpenChange={(open) => handleDeleteDialogOpenChange(open, worker.id)}>
                          <DialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={isSubmitting}
                            aria-label="מחיקת עובד"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">מחיקה</span>
                            </Button>
                          </DialogTrigger>
                          <DialogContent dir="rtl">
                            <DialogHeader>
                              <DialogTitle>האם למחוק את העובד?</DialogTitle>
                              <DialogDescription>
                                הפעולה תמחק את העובד לחלוטין ותשמור היסטוריה בסשנים קיימים. לא ניתן לבטל.
                              </DialogDescription>
                            </DialogHeader>
                            {isCheckingDeleteSession ? (
                              <p className="text-sm text-slate-500">בודק סשנים פעילים...</p>
                            ) : deleteWorkerHasActiveSession ? (
                              <Alert
                                variant="destructive"
                                className="border-amber-200 bg-amber-50 text-right text-sm text-amber-800"
                              >
                                <AlertDescription>
                                  לא ניתן למחוק עובד עם סשן פעיל. יש לסיים את הסשן הפעיל לפני מחיקה.
                                </AlertDescription>
                              </Alert>
                            ) : null}
                            <DialogFooter className="justify-start">
                              <Button
                                variant="destructive"
                                onClick={() => void handleDelete(worker.id)}
                                disabled={isSubmitting || deleteWorkerHasActiveSession || isCheckingDeleteSession}
                              >
                                מחיקה סופית
                              </Button>
                              <Button variant="outline" onClick={() => setDeleteWorkerId(null)} disabled={isSubmitting}>
                                ביטול
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};


