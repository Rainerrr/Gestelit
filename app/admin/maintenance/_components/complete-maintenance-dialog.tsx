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
import { Calendar } from "lucide-react";
import type { StationMaintenanceInfo } from "@/lib/types";

type CompleteMaintenanceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  station: StationMaintenanceInfo | null;
  onConfirm: (completionDate: string) => Promise<void>;
};

export const CompleteMaintenanceDialog = ({
  open,
  onOpenChange,
  station,
  onConfirm,
}: CompleteMaintenanceDialogProps) => {
  const [completionDate, setCompletionDate] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set today's date when dialog opens
  useEffect(() => {
    if (open) {
      setCompletionDate(new Date());
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!completionDate || !station) return;

    setIsSubmitting(true);
    try {
      await onConfirm(format(completionDate, "yyyy-MM-dd"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const computeNextDate = () => {
    if (!completionDate || !station?.maintenance_interval_days) return null;
    const next = new Date(completionDate);
    next.setDate(next.getDate() + station.maintenance_interval_days);
    return next.toLocaleDateString("he-IL");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-right sm:max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">סימון טיפול כהושלם</DialogTitle>
          <DialogDescription className="text-right">
            {station && `תחנה: ${station.name}`}
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
