"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useNotification } from "@/contexts/NotificationContext";
import type { Station, Worker } from "@/lib/types";

type WorkerPermissionsDialogProps = {
  worker: Worker;
  stations: Station[];
  trigger: ReactNode;
  onFetchAssignments: (workerId: string) => Promise<Station[]>;
  onAssign: (workerId: string, stationId: string) => Promise<void>;
  onRemove: (workerId: string, stationId: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
};

export const WorkerPermissionsDialog = ({
  worker,
  stations,
  trigger,
  onFetchAssignments,
  onAssign,
  onRemove,
  onRefresh,
}: WorkerPermissionsDialogProps) => {
  const { notify } = useNotification();
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
    if (!open) {
      setErrorText(null);
      return;
    }
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

      notify({ title: "הצלחה", message: "ההרשאות עודכנו בהצלחה.", variant: "success" });
      setOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "עדכון ההרשאות נכשל.";
      setErrorText(errorCopy[message] ?? "עדכון ההרשאות נכשל.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDialogOpenChange = async (newOpen: boolean) => {
    setOpen(newOpen);
    // Refresh when dialog closes to update the list
    if (!newOpen && onRefresh) {
      await onRefresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="text-right border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">הרשאות תחנות עבור {worker.full_name}</DialogTitle>
          <DialogDescription className="sr-only">ניהול הרשאות תחנות לעובד</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pr-1 max-h-[50vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">טוען הרשאות...</p>
          ) : stations.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין תחנות זמינות.</p>
          ) : (
            stations.map((station) => (
              <label
                key={station.id}
                className="flex items-center justify-between rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{station.name}</span>
                  <span className="text-xs text-muted-foreground">{station.code}</span>
                </div>
                <Checkbox
                  checked={selectedIds.has(station.id)}
                  onCheckedChange={(checked) =>
                    handleToggle(station.id, Boolean(checked))
                  }
                  aria-label={`הרשאה לתחנה ${station.name}`}
                  className="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
              </label>
            ))
          )}
        </div>
        {errorText ? (
          <Alert
            variant="destructive"
            className="border-red-500/30 bg-red-500/10 text-right text-sm text-red-400"
          >
            <AlertDescription>{errorText}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter className="justify-start">
          <Button onClick={() => void handleSave()} disabled={isSaving || isLoading} className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
            {isSaving ? "שומר..." : "שמור הרשאות"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSaving || isLoading}
            className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

