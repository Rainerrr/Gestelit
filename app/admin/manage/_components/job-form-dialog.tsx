"use client";

import { useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Calendar } from "lucide-react";
import { useNotification } from "@/contexts/NotificationContext";
import type { Job } from "@/lib/types";
import { checkJobActiveSessionAdminApi } from "@/lib/api/admin-management";

type JobFormDialogProps = {
  mode: "create" | "edit";
  job?: Job | null;
  onSubmit: (payload: Partial<Job>) => Promise<void>;
  trigger: ReactNode;
  loading?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const JobFormDialog = ({
  mode,
  job,
  onSubmit,
  trigger,
  loading = false,
  open,
  onOpenChange,
}: JobFormDialogProps) => {
  const { notify } = useNotification();
  const [localOpen, setLocalOpen] = useState(false);
  // Use job.id as key to reset form state when editing different jobs
  const [formKey, setFormKey] = useState(job?.id ?? "new");
  const [jobNumber, setJobNumber] = useState(job?.job_number ?? "");
  const [customerName, setCustomerName] = useState(job?.customer_name ?? "");
  const [description, setDescription] = useState(job?.description ?? "");
  const [dueDate, setDueDate] = useState<Date | undefined>(
    job?.due_date ? parseISO(job.due_date) : undefined
  );
  // planned_quantity removed from jobs - now tracked per job_item
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controlledOpen = open ?? localOpen;

  // Reset form when job changes (for edit mode switching between jobs)
  const currentJobId = job?.id ?? "new";
  if (formKey !== currentJobId) {
    setFormKey(currentJobId);
    setJobNumber(job?.job_number ?? "");
    setCustomerName(job?.customer_name ?? "");
    setDescription(job?.description ?? "");
    setDueDate(job?.due_date ? parseISO(job.due_date) : undefined);
  }

  const handleSubmit = async () => {
    if (!jobNumber.trim()) {
      setError("מספר עבודה (פק\"ע) הוא שדה חובה");
      return;
    }

    setError(null);
    setWarningMessage(null);

    // Check for active session if editing
    if (mode === "edit" && job?.id) {
      const { hasActiveSession: active } = await checkJobActiveSessionAdminApi(
        job.id,
      );
      if (active) {
        setWarningMessage(
          "לא ניתן לערוך עבודה עם סשן פעיל. יש לסיים את הסשן הפעיל לפני עריכה.",
        );
        return;
      }
    }

    try {
      await onSubmit({
        job_number: jobNumber.trim(),
        customer_name: customerName.trim() || null,
        description: description.trim() || null,
        due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
      });

      notify({ title: "הצלחה", message: "העבודה נשמרה בהצלחה.", variant: "success" });
      setError(null);
      setWarningMessage(null);

      // Keep dialog open if controlled, otherwise close for create mode
      if (mode === "create" && !open) {
        setLocalOpen(false);
        setJobNumber("");
        setCustomerName("");
        setDescription("");
        setDueDate(undefined);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || "שגיאה בשמירת העבודה");
    }
  };

  const dialogTitle = mode === "create" ? "הוספת עבודה חדשה" : "עריכת עבודה";

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setError(null);
      setWarningMessage(null);
    }
    (onOpenChange ?? setLocalOpen)(open);
  };

  return (
    <Dialog open={controlledOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="text-right border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">{dialogTitle}</DialogTitle>
          <DialogDescription className="sr-only">טופס הוספה או עריכה של עבודה</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <Alert
              variant="destructive"
              className="border-red-500/30 bg-red-500/10 text-right text-sm text-red-400"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {warningMessage && (
            <Alert
              variant="destructive"
              className="border-primary/30 bg-primary/10 text-right text-sm text-primary"
            >
              <AlertDescription>{warningMessage}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="job_number" className="text-foreground/80">
              מספר עבודה (פק&quot;ע) *
            </Label>
            <Input
              id="job_number"
              aria-label="מספר עבודה"
              placeholder="הזן מספר עבודה"
              value={jobNumber}
              onChange={(event) => setJobNumber(event.target.value)}
              disabled={mode === "edit"}
              className="border-input bg-secondary text-foreground placeholder:text-muted-foreground disabled:opacity-60"
            />
            {mode === "edit" && (
              <p className="text-xs text-muted-foreground">
                לא ניתן לשנות מספר עבודה לאחר יצירה
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer_name" className="text-foreground/80">
              שם לקוח
            </Label>
            <Input
              id="customer_name"
              aria-label="שם לקוח"
              placeholder="שם הלקוח (אופציונלי)"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              className="border-input bg-secondary text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description" className="text-foreground/80">
              תיאור
            </Label>
            <Textarea
              id="description"
              aria-label="תיאור"
              placeholder="תיאור העבודה (אופציונלי)"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="border-input bg-secondary text-foreground placeholder:text-muted-foreground min-h-[80px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="due_date" className="text-foreground/80 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              תאריך יעד
            </Label>
            <DatePicker
              id="due_date"
              value={dueDate}
              onChange={setDueDate}
              placeholder="בחר תאריך יעד (אופציונלי)"
              className="w-full"
              allowPast={false}
            />
          </div>
        </div>
        <DialogFooter className="justify-start">
          <Button
            onClick={() => void handleSubmit()}
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            {loading ? "שומר..." : "שמור"}
          </Button>
          <Button
            variant="outline"
            onClick={() => (onOpenChange ?? setLocalOpen)(false)}
            disabled={loading}
            className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
