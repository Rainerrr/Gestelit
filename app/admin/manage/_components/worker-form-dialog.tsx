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
import { Switch } from "@/components/ui/switch";
import { CheckCircle2 } from "lucide-react";
import type { Worker } from "@/lib/types";
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
  const [localOpen, setLocalOpen] = useState(false);
  const [fullName, setFullName] = useState(worker?.full_name ?? "");
  const [workerCode, setWorkerCode] = useState(worker?.worker_code ?? "");
  const [language, setLanguage] = useState(worker?.language ?? "auto");
  const [role, setRole] = useState(worker?.role ?? "worker");
  const [department, setDepartment] = useState(worker?.department ?? "");
  const [isActive, setIsActive] = useState(worker?.is_active ?? true);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [isCheckingActiveSession, setIsCheckingActiveSession] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controlledOpen = open ?? localOpen;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!worker || mode !== "edit") return;
    setFullName(worker.full_name);
    setWorkerCode(worker.worker_code);
    setLanguage(worker.language ?? "auto");
    setRole(worker.role);
    setDepartment(worker.department ?? "");
    setIsActive(worker.is_active);
  }, [worker, mode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (controlledOpen && mode === "edit" && worker?.id) {
      void checkActiveSession(worker.id);
    } else if (controlledOpen && mode === "create") {
      setHasActiveSession(false);
    }
  }, [controlledOpen, mode, worker?.id]);

  const checkActiveSession = async (workerId: string) => {
    setIsCheckingActiveSession(true);
    try {
      const { hasActiveSession: active } = await checkWorkerActiveSessionAdminApi(workerId);
      setHasActiveSession(active);
    } catch (err) {
      console.error("[worker-form-dialog] Failed to check active session", err);
      setHasActiveSession(false);
    } finally {
      setIsCheckingActiveSession(false);
    }
  };

  const handleSubmit = async () => {
    if (!fullName.trim() || !workerCode.trim()) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setWarningMessage(null);

    // Check for active session if editing
    if (mode === "edit" && worker?.id) {
      const { hasActiveSession: active } = await checkWorkerActiveSessionAdminApi(worker.id);
      if (active) {
        setWarningMessage("לא ניתן לערוך עובד עם סשן פעיל. יש לסיים את הסשן הפעיל לפני עריכה.");
        setHasActiveSession(true);
        return;
      }
      setHasActiveSession(false);
    }

    try {
      await onSubmit({
        full_name: fullName.trim(),
        worker_code: workerCode.trim(),
        language,
        role: role as Worker["role"],
        department: department.trim() || null,
        is_active: isActive,
      });

      setSuccessMessage("העובד נשמר בהצלחה.");
      setError(null);
      setWarningMessage(null);

      // Keep dialog open if controlled, otherwise close for create mode
      if (mode === "create" && !open) {
        setLocalOpen(false);
        setFullName("");
        setWorkerCode("");
        setLanguage("auto");
        setRole("worker");
        setDepartment("");
        setIsActive(true);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || "שגיאה בשמירת העובד");
      setSuccessMessage(null);
    }
  };

  const dialogTitle = mode === "create" ? "הוספת עובד חדש" : "עריכת עובד";

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setError(null);
      setSuccessMessage(null);
      setWarningMessage(null);
      setHasActiveSession(false);
    }
    (onOpenChange ?? setLocalOpen)(open);
  };

  return (
    <Dialog open={controlledOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="text-right">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <Alert
              variant="destructive"
              className="border-red-200 bg-red-50 text-right text-sm text-red-700"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {warningMessage && (
            <Alert
              variant="destructive"
              className="border-amber-200 bg-amber-50 text-right text-sm text-amber-800"
            >
              <AlertDescription>{warningMessage}</AlertDescription>
            </Alert>
          )}
          {successMessage && (
            <Alert className="border-emerald-200 bg-emerald-50 text-right text-sm text-emerald-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{successMessage}</AlertDescription>
              </div>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="full_name">שם מלא</Label>
            <Input
              id="full_name"
              aria-label="שם מלא"
              placeholder="שם העובד"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="worker_code">קוד עובד</Label>
            <Input
              id="worker_code"
              aria-label="קוד עובד"
              placeholder="קוד ייחודי"
              value={workerCode}
              onChange={(event) => setWorkerCode(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="department">מחלקה</Label>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>שפה</Label>
              <Select value={language ?? "auto"} onValueChange={setLanguage}>
                <SelectTrigger aria-label="בחירת שפה">
                  <SelectValue placeholder="בחר שפה" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">אוטומטי</SelectItem>
                  <SelectItem value="he">עברית</SelectItem>
                  <SelectItem value="ru">רוסית</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>תפקיד</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger aria-label="בחירת תפקיד">
                  <SelectValue placeholder="בחר תפקיד" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="worker">עובד</SelectItem>
                  <SelectItem value="admin">מנהל</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-900">סטטוס</p>
              <p className="text-xs text-slate-500">פעיל במערכת</p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              aria-label="סטטוס עובד"
            />
          </div>
        </div>
        <DialogFooter className="justify-start">
          <Button onClick={() => void handleSubmit()} disabled={loading}>
            {loading ? "שומר..." : "שמור"}
          </Button>
          <Button
            variant="outline"
            onClick={() => (onOpenChange ?? setLocalOpen)(false)}
            disabled={loading}
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


