"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Station, Worker } from "@/lib/types";

type WorkerPermissionsDialogProps = {
  worker: Worker;
  stations: Station[];
  trigger: ReactNode;
  onFetchAssignments: (workerId: string) => Promise<Station[]>;
  onAssign: (workerId: string, stationId: string) => Promise<void>;
  onRemove: (workerId: string, stationId: string) => Promise<void>;
};

export const WorkerPermissionsDialog = ({
  worker,
  stations,
  trigger,
  onFetchAssignments,
  onAssign,
  onRemove,
}: WorkerPermissionsDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const errorCopy: Record<string, string> = {
    ASSIGNMENT_EXISTS: "לעובד כבר יש הרשאה לתחנה.",
    ASSIGNMENT_DELETE_FAILED: "מחיקת ההרשאה נכשלה.",
    ASSIGNMENT_NOT_FOUND: "ההרשאה לא נמצאה.",
  };

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setIsLoading(true);
      setErrorText(null);
      const assigned = await onFetchAssignments(worker.id);
      setSelectedIds(new Set(assigned.map((station) => station.id)));
      setIsLoading(false);
    };
    void load();
  }, [open, worker.id, onFetchAssignments]);

  const handleToggle = (stationId: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(stationId);
    } else {
      next.delete(stationId);
    }
    setSelectedIds(next);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorText(null);

    try {
      const currentAssignments = await onFetchAssignments(worker.id);
      const currentIds = new Set(currentAssignments.map((station) => station.id));

      const toAdd = Array.from(selectedIds).filter((id) => !currentIds.has(id));
      const toRemove = Array.from(currentIds).filter((id) => !selectedIds.has(id));

      await Promise.all([
        ...toAdd.map((stationId) => onAssign(worker.id, stationId)),
        ...toRemove.map((stationId) => onRemove(worker.id, stationId)),
      ]);

      setOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "עדכון ההרשאות נכשל.";
      setErrorText(errorCopy[message] ?? "עדכון ההרשאות נכשל.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="text-right">
        <DialogHeader>
          <DialogTitle>הרשאות תחנות עבור {worker.full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
          {isLoading ? (
            <p className="text-sm text-slate-500">טוען הרשאות...</p>
          ) : stations.length === 0 ? (
            <p className="text-sm text-slate-500">אין תחנות זמינות.</p>
          ) : (
            stations.map((station) => (
              <label
                key={station.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-slate-900">{station.name}</span>
                  <span className="text-xs text-slate-500">{station.code}</span>
                </div>
                <Checkbox
                  checked={selectedIds.has(station.id)}
                  onCheckedChange={(checked) =>
                    handleToggle(station.id, Boolean(checked))
                  }
                  aria-label={`הרשאה לתחנה ${station.name}`}
                />
              </label>
            ))
          )}
        </div>
        {errorText ? (
          <p className="text-sm text-red-600">{errorText}</p>
        ) : null}
        <DialogFooter className="justify-start">
          <Button onClick={() => void handleSave()} disabled={isSaving || isLoading}>
            {isSaving ? "שומר..." : "שמור הרשאות"}
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

