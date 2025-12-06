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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { Station, StationType } from "@/lib/types";

type StationFormDialogProps = {
  mode: "create" | "edit";
  station?: Station | null;
  onSubmit: (payload: Partial<Station>) => Promise<void>;
  trigger: ReactNode;
  loading?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const stationTypes: StationType[] = [
  "prepress",
  "digital_press",
  "offset",
  "folding",
  "cutting",
  "binding",
  "shrink",
  "lamination",
  "other",
];

export const StationFormDialog = ({
  mode,
  station,
  onSubmit,
  trigger,
  loading = false,
  open,
  onOpenChange,
}: StationFormDialogProps) => {
  const [localOpen, setLocalOpen] = useState(false);
  const [name, setName] = useState(station?.name ?? "");
  const [code, setCode] = useState(station?.code ?? "");
  const [type, setType] = useState<StationType>(station?.station_type ?? "other");
  const [isActive, setIsActive] = useState(station?.is_active ?? true);
  const controlledOpen = open ?? localOpen;

  /* eslint-disable react-hooks/set-state-in-effect */
  // Sync dialog fields when editing an existing station
  useEffect(() => {
    if (!station || mode !== "edit") return;
    setName(station.name);
    setCode(station.code);
    setType(station.station_type);
    setIsActive(station.is_active);
  }, [station, mode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async () => {
    if (!name.trim() || !code.trim()) {
      return;
    }

    await onSubmit({
      name: name.trim(),
      code: code.trim(),
      station_type: type,
      is_active: isActive,
    });

    if (!open) {
      setLocalOpen(false);
      setName("");
      setCode("");
      setType("other");
      setIsActive(true);
    }
  };

  const dialogTitle = mode === "create" ? "הוספת תחנה" : "עריכת תחנה";

  return (
    <Dialog open={controlledOpen} onOpenChange={onOpenChange ?? setLocalOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="text-right">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="station_name">שם תחנה</Label>
            <Input
              id="station_name"
              aria-label="שם תחנה"
              placeholder="לדוגמה: מכונת הדפסה A"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="station_code">קוד תחנה</Label>
            <Input
              id="station_code"
              aria-label="קוד תחנה"
              placeholder="קוד ייחודי"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>סוג תחנה</Label>
            <Select value={type} onValueChange={(value) => setType(value as StationType)}>
              <SelectTrigger aria-label="בחירת סוג תחנה">
                <SelectValue placeholder="בחר סוג" />
              </SelectTrigger>
              <SelectContent>
                {stationTypes.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-900">סטטוס</p>
              <p className="text-xs text-slate-500">פעיל במערכת</p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              aria-label="סטטוס תחנה"
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

