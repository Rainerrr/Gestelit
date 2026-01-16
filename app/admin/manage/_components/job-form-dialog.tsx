"use client";

import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
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
  const [localOpen, setLocalOpen] = useState(false);
  // Use job.id as key to reset form state when editing different jobs
  const [formKey, setFormKey] = useState(job?.id ?? "new");
  const [jobNumber, setJobNumber] = useState(job?.job_number ?? "");
  const [customerName, setCustomerName] = useState(job?.customer_name ?? "");
  const [description, setDescription] = useState(job?.description ?? "");
  // planned_quantity removed from jobs - now tracked per job_item
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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
  }

  const handleSubmit = async () => {
    if (!jobNumber.trim()) {
      setError("מספר עבודה (פק\"ע) הוא שדה חובה");
      return;
    }

    setError(null);
    setSuccessMessage(null);
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
        // planned_quantity removed - now tracked per job_item
      });

      setSuccessMessage("העבודה נשמרה בהצלחה.");
      setError(null);
      setWarningMessage(null);

      // Keep dialog open if controlled, otherwise close for create mode
      if (mode === "create" && !open) {
        setLocalOpen(false);
        setJobNumber("");
        setCustomerName("");
        setDescription("");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || "שגיאה בשמירת העבודה");
      setSuccessMessage(null);
    }
  };

  const dialogTitle = mode === "create" ? "הוספת עבודה חדשה" : "עריכת עבודה";

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setError(null);
      setSuccessMessage(null);
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
          {successMessage && (
            <Alert className="border-emerald-500/30 bg-emerald-500/10 text-right text-sm text-emerald-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <AlertDescription>{successMessage}</AlertDescription>
              </div>
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
