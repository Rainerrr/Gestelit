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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useNotification } from "@/contexts/NotificationContext";
import type { Worker, WorkerRole } from "@/lib/types";
import { CreatableCombobox } from "@/components/forms/creatable-combobox";
import { checkWorkerActiveSessionAdminApi } from "@/lib/api/admin-management";

type WorkerFormDialogProps = {
  mode: "create" | "edit";
  worker?: Worker | null;
  departments: string[];
  onSubmit: (payload: Partial<Worker>) => Promise<void>;
  trigger: ReactNode;
  loading?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const WorkerFormDialog = ({
  mode,
  worker,
  departments,
  onSubmit,
  trigger,
  loading = false,
  open,
  onOpenChange,
}: WorkerFormDialogProps) => {
  const { notify } = useNotification();
  const [localOpen, setLocalOpen] = useState(false);
  const [fullName, setFullName] = useState(worker?.full_name ?? "");
  const [workerCode, setWorkerCode] = useState(worker?.worker_code ?? "");
  const [role, setRole] = useState<WorkerRole>(worker?.role ?? "worker");
  const [department, setDepartment] = useState(worker?.department ?? "");
  const [isActive, setIsActive] = useState(worker?.is_active ?? true);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controlledOpen = open ?? localOpen;

  useEffect(() => {
    if (!worker || mode !== "edit") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFullName(worker.full_name);
    setWorkerCode(worker.worker_code);
    setRole(worker.role);
    setDepartment(worker.department ?? "");
    setIsActive(worker.is_active);
  }, [worker, mode]);

  const handleSubmit = async () => {
    if (!fullName.trim() || !workerCode.trim()) {
      return;
    }

    setError(null);
    setWarningMessage(null);

    // Check for active session if editing
    if (mode === "edit" && worker?.id) {
      const { hasActiveSession: active } = await checkWorkerActiveSessionAdminApi(worker.id);
      if (active) {
        setWarningMessage("לא ניתן לערוך עובד עם סשן פעיל. יש לסיים את הסשן הפעיל לפני עריכה.");
        return;
      }
    }

    try {
      await onSubmit({
        full_name: fullName.trim(),
        worker_code: workerCode.trim(),
        role: role as Worker["role"],
        department: department.trim() || null,
        is_active: isActive,
      });

      notify({ title: "הצלחה", message: "העובד נשמר בהצלחה.", variant: "success" });
      setError(null);
      setWarningMessage(null);

      // Keep dialog open if controlled, otherwise close for create mode
      if (mode === "create" && !open) {
        setLocalOpen(false);
        setFullName("");
        setWorkerCode("");
        setRole("worker");
        setDepartment("");
        setIsActive(true);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || "שגיאה בשמירת העובד");
    }
  };

  const dialogTitle = mode === "create" ? "הוספת עובד חדש" : "עריכת עובד";

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
            <Label htmlFor="full_name" className="text-foreground/80">שם מלא</Label>
            <Input
              id="full_name"
              aria-label="שם מלא"
              placeholder="שם העובד"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="border-input bg-secondary text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="worker_code" className="text-foreground/80">קוד עובד</Label>
            <Input
              id="worker_code"
              aria-label="קוד עובד"
              placeholder="קוד ייחודי"
              value={workerCode}
              onChange={(event) => setWorkerCode(event.target.value)}
              className="border-input bg-secondary text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="department" className="text-foreground/80">מחלקה</Label>
          <CreatableCombobox
            value={department}
            onChange={setDepartment}
            options={departments}
            placeholder="בחר או הוסף מחלקה"
            ariaLabel="מחלקה"
            allowEmpty
            emptyLabel="ללא מחלקה"
            inputPlaceholder="שם מחלקה חדשה"
            helperText="בחר מחלקה קיימת או הוסיפו אחת חדשה"
            inputId="department"
          />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground/80">תפקיד</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole((value || "worker") as WorkerRole)}
            >
              <SelectTrigger aria-label="בחירת תפקיד" className="border-input bg-secondary text-foreground/80">
                <SelectValue placeholder="בחר תפקיד" />
              </SelectTrigger>
              <SelectContent className="border-input bg-secondary">
                <SelectItem value="worker" className="text-foreground/80 focus:bg-muted">עובד</SelectItem>
                <SelectItem value="admin" className="text-foreground/80 focus:bg-muted">מנהל</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-foreground/80">סטטוס</Label>
            <div className="flex rounded-lg border border-input bg-secondary/50 p-1">
              <button
                type="button"
                onClick={() => setIsActive(true)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground/80 hover:bg-muted"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isActive ? "bg-white" : "bg-muted-foreground"}`} />
                פעיל
              </button>
              <button
                type="button"
                onClick={() => setIsActive(false)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
                  !isActive
                    ? "bg-muted text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground/80 hover:bg-muted"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${!isActive ? "bg-white" : "bg-muted-foreground"}`} />
                לא פעיל
              </button>
            </div>
          </div>
        </div>
        <DialogFooter className="justify-start">
          <Button onClick={() => void handleSubmit()} disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
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
