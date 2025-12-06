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
import { WorkerFormDialog } from "./worker-form-dialog";
import { WorkerPermissionsDialog } from "./worker-permissions-dialog";

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
}: WorkersManagementProps) => {
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteWorkerId, setDeleteWorkerId] = useState<string | null>(null);
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
      setEditingWorker(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (workerId: string) => {
    setIsSubmitting(true);
    try {
      await onDelete(workerId);
    } finally {
      setIsSubmitting(false);
    }
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
          <Table className="text-right">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">שם מלא</TableHead>
                <TableHead className="text-right">קוד עובד</TableHead>
                <TableHead className="text-right">מחלקה</TableHead>
                <TableHead className="text-right">תחנות משויכות</TableHead>
                <TableHead className="text-right">מצב</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedWorkers.map(({ worker, stationCount }) => (
                <TableRow key={worker.id}>
                  <TableCell className="font-medium">{worker.full_name}</TableCell>
                  <TableCell>{worker.worker_code}</TableCell>
                  <TableCell>
                    {worker.department ? (
                      <Badge variant="secondary">{worker.department}</Badge>
                    ) : (
                      <span className="text-slate-500">ללא</span>
                    )}
                  </TableCell>
                  <TableCell>{stationCount}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={worker.is_active} disabled aria-readonly />
                      <span className="text-sm text-slate-600">
                        {worker.is_active ? "פעיל" : "לא פעיל"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <WorkerPermissionsDialog
                        worker={worker}
                        stations={stations}
                        onFetchAssignments={onFetchAssignments}
                        onAssign={onAssignStation}
                        onRemove={onRemoveStation}
                        trigger={
                          <Button variant="outline" size="sm" aria-label="ניהול הרשאות תחנות">
                            הרשאות
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
                            ערוך
                          </Button>
                        }
                        open={editingWorker?.id === worker.id}
                        onOpenChange={(open) => setEditingWorker(open ? worker : null)}
                        loading={isSubmitting}
                      />
                      <Dialog open={deleteWorkerId === worker.id} onOpenChange={(open) => setDeleteWorkerId(open ? worker.id : null)}>
                        <DialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={isSubmitting}
                            aria-label="מחיקת עובד"
                          >
                            מחק
                          </Button>
                        </DialogTrigger>
                        <DialogContent dir="rtl">
                          <DialogHeader>
                            <DialogTitle>האם למחוק את העובד?</DialogTitle>
                            <DialogDescription>
                              הפעולה תמחק את העובד לחלוטין ותשמור היסטוריה בסשנים קיימים. לא ניתן לבטל.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter className="justify-start">
                            <Button
                              variant="destructive"
                              onClick={() => void handleDelete(worker.id)}
                              disabled={isSubmitting}
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
        )}
      </CardContent>
    </Card>
  );
};


