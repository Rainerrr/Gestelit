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
import { CheckCircle2 } from "lucide-react";
import type { Worker, WorkerRole } from "@/lib/types";
import type { SupportedLanguage } from "@/lib/i18n/translations";
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
  const [language, setLanguage] = useState<SupportedLanguage | "auto">(
    worker?.language ?? "auto",
  );
  const [role, setRole] = useState<WorkerRole>(worker?.role ?? "worker");
  const [department, setDepartment] = useState(worker?.department ?? "");
  const [isActive, setIsActive] = useState(worker?.is_active ?? true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controlledOpen = open ?? localOpen;

  useEffect(() => {
    if (!worker || mode !== "edit") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFullName(worker.full_name);
    setWorkerCode(worker.worker_code);
    setLanguage(worker.language ?? "auto");
    setRole(worker.role);
    setDepartment(worker.department ?? "");
    setIsActive(worker.is_active);
  }, [worker, mode]);

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
        return;
      }
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
    }
    (onOpenChange ?? setLocalOpen)(open);
  };

  return (
    <Dialog open={controlledOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="text-right border-zinc-800 bg-zinc-900">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">{dialogTitle}</DialogTitle>
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
              className="border-amber-500/30 bg-amber-500/10 text-right text-sm text-amber-400"
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
            <Label htmlFor="full_name" className="text-zinc-200">שם מלא</Label>
            <Input
              id="full_name"
              aria-label="שם מלא"
              placeholder="שם העובד"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="border-zinc-700 bg-zinc-800/80 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="worker_code" className="text-zinc-200">קוד עובד</Label>
            <Input
              id="worker_code"
              aria-label="קוד עובד"
              placeholder="קוד ייחודי"
              value={workerCode}
              onChange={(event) => setWorkerCode(event.target.value)}
              className="border-zinc-700 bg-zinc-800/80 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="department" className="text-zinc-200">מחלקה</Label>
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
              <Label className="text-zinc-200">שפה</Label>
              <Select
                value={language ?? "auto"}
                onValueChange={(value) =>
                  setLanguage((value || "auto") as SupportedLanguage | "auto")
                }
              >
                <SelectTrigger aria-label="בחירת שפה" className="border-zinc-700 bg-zinc-800 text-zinc-200">
                  <SelectValue placeholder="בחר שפה" />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-800">
                  <SelectItem value="auto" className="text-zinc-200 focus:bg-zinc-700">אוטומטי</SelectItem>
                  <SelectItem value="he" className="text-zinc-200 focus:bg-zinc-700">עברית</SelectItem>
                  <SelectItem value="ru" className="text-zinc-200 focus:bg-zinc-700">רוסית</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-200">תפקיד</Label>
              <Select
                value={role}
                onValueChange={(value) => setRole((value || "worker") as WorkerRole)}
              >
                <SelectTrigger aria-label="בחירת תפקיד" className="border-zinc-700 bg-zinc-800 text-zinc-200">
                  <SelectValue placeholder="בחר תפקיד" />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-800">
                  <SelectItem value="worker" className="text-zinc-200 focus:bg-zinc-700">עובד</SelectItem>
                  <SelectItem value="admin" className="text-zinc-200 focus:bg-zinc-700">מנהל</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-200">סטטוס</Label>
            <div className="flex rounded-lg border border-zinc-700 bg-zinc-800/50 p-1">
              <button
                type="button"
                onClick={() => setIsActive(true)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isActive ? "bg-white" : "bg-zinc-500"}`} />
                פעיל
              </button>
              <button
                type="button"
                onClick={() => setIsActive(false)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
                  !isActive
                    ? "bg-zinc-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${!isActive ? "bg-white" : "bg-zinc-500"}`} />
                לא פעיל
              </button>
            </div>
          </div>
        </div>
        <DialogFooter className="justify-start">
          <Button onClick={() => void handleSubmit()} disabled={loading} className="bg-amber-500 text-zinc-900 hover:bg-amber-400 font-medium">
            {loading ? "שומר..." : "שמור"}
          </Button>
          <Button
            variant="outline"
            onClick={() => (onOpenChange ?? setLocalOpen)(false)}
            disabled={loading}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
