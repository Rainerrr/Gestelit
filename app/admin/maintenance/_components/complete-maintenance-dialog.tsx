"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Loader2 } from "lucide-react";
import { fetchStationWorkersApi } from "@/lib/api/maintenance";
import type { ServiceMaintenanceInfo, Worker } from "@/lib/types";

type CompleteMaintenanceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: ServiceMaintenanceInfo | null;
  stationId: string | null;
  stationName: string | null;
  onConfirm: (serviceId: string, completionDate: string, workerId?: string | null) => Promise<void>;
};

export const CompleteMaintenanceDialog = ({
  open,
  onOpenChange,
  service,
  stationId,
  stationName,
  onConfirm,
}: CompleteMaintenanceDialogProps) => {
  const [completionDate, setCompletionDate] = useState<Date | undefined>(undefined);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("");
  const [workers, setWorkers] = useState<Pick<Worker, "id" | "full_name" | "worker_code">[]>([]);
  const [isLoadingWorkers, setIsLoadingWorkers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set today's date and load workers when dialog opens
  useEffect(() => {
    if (open) {
      setCompletionDate(new Date());
      setSelectedWorkerId("");

      if (stationId) {
        setIsLoadingWorkers(true);
        fetchStationWorkersApi(stationId)
          .then(({ workers: w }) => setWorkers(w))
          .catch(() => setWorkers([]))
          .finally(() => setIsLoadingWorkers(false));
      }
    }
  }, [open, stationId]);

  const handleConfirm = async () => {
    if (!completionDate || !service) return;

    setIsSubmitting(true);
    try {
      const workerId = selectedWorkerId && selectedWorkerId !== "none" ? selectedWorkerId : null;
      await onConfirm(
        service.id,
        format(completionDate, "yyyy-MM-dd"),
        workerId
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const computeNextDate = () => {
    if (!completionDate || !service?.interval_days) return null;
    const next = new Date(completionDate);
    next.setDate(next.getDate() + service.interval_days);
    return next.toLocaleDateString("he-IL");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-right sm:max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">סימון טיפול כהושלם</DialogTitle>
          <DialogDescription className="text-right">
            {stationName && service && `תחנה: ${stationName} — ${service.name}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="completion_date" className="text-foreground/80 text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              תאריך ביצוע הטיפול
            </Label>
            <DatePicker
              id="completion_date"
              value={completionDate}
              onChange={setCompletionDate}
              placeholder="בחר תאריך ביצוע"
              className="w-full"
              allowFuture={false}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-foreground/80 text-sm">
              עובד מבצע
            </Label>
            {isLoadingWorkers ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                טוען עובדים...
              </div>
            ) : (
              <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
                <SelectTrigger className="w-full border-input bg-secondary text-foreground">
                  <SelectValue placeholder="לא צוין" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">לא צוין</SelectItem>
                  {workers.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id}>
                      {worker.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {computeNextDate() && (
            <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-foreground/80">
              <span className="font-medium text-primary">טיפול הבא:</span>{" "}
              {computeNextDate()}
            </div>
          )}
        </div>

        <DialogFooter className="justify-start gap-2 mt-4">
          <Button
            onClick={() => void handleConfirm()}
            disabled={!completionDate || isSubmitting}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSubmitting ? "שומר..." : "אשר"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
