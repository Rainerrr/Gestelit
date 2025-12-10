"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { Station, StationReason, StationType } from "@/lib/types";
import {
  GENERAL_STATION_REASON,
  GENERAL_STATION_REASON_ID,
} from "@/lib/data/station-reasons";
import { CreatableCombobox } from "@/components/forms/creatable-combobox";

type StationFormDialogProps = {
  mode: "create" | "edit";
  station?: Station | null;
  stationTypes: string[];
  onSubmit: (payload: Partial<Station>) => Promise<void>;
  trigger: ReactNode;
  loading?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const generateReasonId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `reason-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const StationFormDialog = ({
  mode,
  station,
  stationTypes,
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
  const [stationReasons, setStationReasons] = useState<StationReason[]>(
    (station?.station_reasons ?? []).filter(
      (reason) => reason.id !== GENERAL_STATION_REASON_ID,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const controlledOpen = open ?? localOpen;
  const availableStationTypes = useMemo(
    () => Array.from(new Set((stationTypes.includes("other") ? stationTypes : ["other", ...stationTypes]).filter(Boolean))),
    [stationTypes],
  );

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setError(null);
    }
    (onOpenChange ?? setLocalOpen)(open);
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  // Sync dialog fields when editing an existing station
  useEffect(() => {
    if (!station || mode !== "edit") return;
    setName(station.name);
    setCode(station.code);
    setType(station.station_type);
    setIsActive(station.is_active);
    setStationReasons(
      (station.station_reasons ?? []).filter(
        (reason) => reason.id !== GENERAL_STATION_REASON_ID,
      ),
    );
  }, [station, mode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async () => {
    if (!name.trim() || !code.trim()) {
      return;
    }

    setError(null);
    const normalizedType = type.trim() || "other";
    const trimmedReasons = stationReasons.map((reason) => ({
      ...reason,
      label_he: reason.label_he.trim(),
      label_ru: reason.label_ru.trim(),
      is_active: reason.is_active ?? true,
    }));

    const hasEmpty = trimmedReasons.some(
      (reason) => !reason.label_he || !reason.label_ru,
    );
    if (hasEmpty) {
      setError("יש למלא תוויות בעברית וברוסית לכל תקלה.");
      return;
    }

    const seenHe = new Set<string>();
    const seenRu = new Set<string>();
    const hasDuplicates = trimmedReasons.some((reason) => {
      if (seenHe.has(reason.label_he) || seenRu.has(reason.label_ru)) {
        return true;
      }
      seenHe.add(reason.label_he);
      seenRu.add(reason.label_ru);
      return false;
    });

    if (hasDuplicates) {
      setError("יש לוודא שתוויות התקלה ייחודיות בכל שפה.");
      return;
    }

    const payloadReasons: StationReason[] = [
      { ...GENERAL_STATION_REASON },
      ...trimmedReasons,
    ];

    try {
      await onSubmit({
        name: name.trim(),
        code: code.trim(),
        station_type: normalizedType,
        is_active: isActive,
        station_reasons: payloadReasons,
      });

      if (!open) {
        setLocalOpen(false);
        setName("");
        setCode("");
        setType("other");
        setIsActive(true);
        setStationReasons([]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || "שגיאה בשמירת התחנה");
    }
  };

  const dialogTitle = mode === "create" ? "הוספת תחנה" : "עריכת תחנה";

  const handleCodeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCode(event.target.value);
    if (error) {
      setError(null);
    }
  };

  const handleAddReason = () => {
    setStationReasons((prev) => [
      ...prev,
      {
        id: generateReasonId(),
        label_he: "",
        label_ru: "",
        is_active: true,
      },
    ]);
  };

  const handleUpdateReason = (
    index: number,
    key: "label_he" | "label_ru" | "is_active",
    value: string | boolean,
  ) => {
    setStationReasons((prev) =>
      prev.map((reason, idx) =>
        idx === index
          ? {
              ...reason,
              [key]: value,
            }
          : reason,
      ),
    );
  };

  const handleDeleteReason = (index: number) => {
    setStationReasons((prev) => prev.filter((_, idx) => idx !== index));
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
              onChange={handleCodeChange}
            />
          </div>
          <div className="space-y-2">
            <Label>סוג תחנה</Label>
          <CreatableCombobox
            value={type}
            onChange={(value) => setType(value as StationType)}
            options={availableStationTypes}
            placeholder="בחר או הוסף סוג תחנה"
            ariaLabel="בחירת סוג תחנה"
            inputPlaceholder="שם סוג תחנה חדש"
            helperText="בחרו סוג קיים או הוסיפו סוג חדש"
            inputId="station_type_input"
          />
          </div>
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">סוגי תקלות</p>
                <p className="text-xs text-slate-500">מוצגות לבחירת תקלה בתחנה זו</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddReason}
                disabled={loading}
                className="whitespace-nowrap"
              >
                הוספת סיבה
              </Button>
            </div>
            {stationReasons.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">
                לא הוגדרו סוגי תקלות. הוסיפו סוג חדש כדי להתחיל.
              </p>
            ) : (
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {stationReasons.map((reason, index) => (
                  <div
                    key={reason.id}
                    className="grid grid-cols-[1fr,1fr,auto] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="space-y-1">
                      <Label htmlFor={`reason-he-${reason.id}`} className="text-xs text-slate-600">
                        תווית בעברית
                      </Label>
                      <Input
                        id={`reason-he-${reason.id}`}
                        aria-label={`תווית בעברית לסיבה ${index + 1}`}
                        value={reason.label_he}
                        onChange={(event) =>
                          handleUpdateReason(index, "label_he", event.target.value)
                        }
                        disabled={loading}
                        placeholder="לדוגמה: תקלה בהזנה"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`reason-ru-${reason.id}`} className="text-xs text-slate-600">
                        תווית ברוסית
                      </Label>
                      <Input
                        id={`reason-ru-${reason.id}`}
                        aria-label={`תווית ברוסית לסיבה ${index + 1}`}
                        value={reason.label_ru}
                        onChange={(event) =>
                          handleUpdateReason(index, "label_ru", event.target.value)
                        }
                        disabled={loading}
                        placeholder="Например: проблема подачи"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteReason(index)}
                        disabled={loading}
                        className="text-rose-600 hover:text-rose-700"
                      >
                        מחיקה
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
            onClick={() => handleDialogOpenChange(false)}
            disabled={loading}
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

