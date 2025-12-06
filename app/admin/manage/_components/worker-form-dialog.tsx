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
import type { Worker } from "@/lib/types";

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

  const handleSubmit = async () => {
    if (!fullName.trim() || !workerCode.trim()) {
      return;
    }

    await onSubmit({
      full_name: fullName.trim(),
      worker_code: workerCode.trim(),
      language,
      role: role as Worker["role"],
      department: department.trim() || null,
      is_active: isActive,
    });

    if (!open) {
      setLocalOpen(false);
      setFullName("");
      setWorkerCode("");
      setLanguage("auto");
      setRole("worker");
      setDepartment("");
      setIsActive(true);
    }
  };

  const dialogTitle = mode === "create" ? "הוספת עובד חדש" : "עריכת עובד";

  return (
    <Dialog open={controlledOpen} onOpenChange={onOpenChange ?? setLocalOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="text-right">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
            <Input
              id="department"
              list="department-options"
              aria-label="מחלקה"
              placeholder="לדוגמה: ייצור"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            />
            <datalist id="department-options">
              {departments.map((dept) => (
                <option key={dept} value={dept} />
              ))}
            </datalist>
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


