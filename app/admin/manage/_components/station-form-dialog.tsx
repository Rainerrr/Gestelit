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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import type {
  Station,
  StationReason,
  StationType,
  StatusDefinition,
} from "@/lib/types";
import { ALLOWED_STATUS_COLORS } from "@/lib/status";
import {
  GENERAL_STATION_REASON,
  GENERAL_STATION_REASON_ID,
} from "@/lib/data/station-reasons";
import { CreatableCombobox } from "@/components/forms/creatable-combobox";
import {
  createStatusDefinitionAdminApi,
  deleteStatusDefinitionAdminApi,
  fetchStatusDefinitionsAdminApi,
  updateStatusDefinitionAdminApi,
} from "@/lib/api/admin-management";

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

const ColorDot = ({
  hex,
  isActive,
  onSelect,
}: {
  hex: string;
  isActive: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    aria-label={`בחר צבע ${hex}`}
    onClick={onSelect}
    className={`h-5 w-5 rounded-full border transition hover:scale-105 ${
      isActive ? "ring-2 ring-offset-2 ring-sky-400 border-sky-400" : "border-slate-200"
    }`}
    style={{ backgroundColor: hex }}
  />
);

const ColorDotPicker = ({
  value,
  isOpen,
  onToggle,
  onSelect,
  label,
  disabled = false,
}: {
  value: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (hex: string) => void;
  label: string;
  disabled?: boolean;
}) => (
  <div className="relative">
    <button
      type="button"
      aria-label={`בחירת צבע עבור ${label || "סטטוס"}`}
      aria-expanded={isOpen}
      onClick={onToggle}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white transition hover:scale-105 disabled:opacity-50"
    >
      <span
        aria-hidden
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: value }}
      />
    </button>
    {isOpen ? (
      <div className="absolute right-0 top-full z-10 mt-2 grid grid-cols-5 gap-2 rounded-md border border-slate-200 bg-white p-2 shadow-md">
        {ALLOWED_STATUS_COLORS.map((hex) => (
          <ColorDot
            key={hex}
            hex={hex}
            isActive={value === hex}
            onSelect={() => onSelect(hex)}
          />
        ))}
      </div>
    ) : null}
  </div>
);

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
  const [stationStatuses, setStationStatuses] = useState<StatusDefinition[]>([]);
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [activeColorPickerId, setActiveColorPickerId] = useState<string | null>(null);
  const [pendingDeletedStatusIds, setPendingDeletedStatusIds] = useState<string[]>([]);
  const [isSavingStatuses, setIsSavingStatuses] = useState(false);
  const controlledOpen = open ?? localOpen;
  const availableStationTypes = useMemo(
    () => Array.from(new Set((stationTypes.includes("other") ? stationTypes : ["other", ...stationTypes]).filter(Boolean))),
    [stationTypes],
  );

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setError(null);
      setStatusError(null);
      setActiveColorPickerId(null);
      setPendingDeletedStatusIds([]);
    }
    (onOpenChange ?? setLocalOpen)(open);
  };

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
    void loadStatuses(station.id);
  }, [station, mode]);

  useEffect(() => {
    if (controlledOpen && mode === "edit" && station?.id) {
      void loadStatuses(station.id);
    }
  }, [controlledOpen, mode, station?.id]);

  const loadStatuses = async (stationId?: string) => {
    if (!stationId) {
      setStationStatuses([]);
      return;
    }
    setIsLoadingStatuses(true);
    setStatusError(null);
    setPendingDeletedStatusIds([]);
    try {
      const { statuses } = await fetchStatusDefinitionsAdminApi({
        stationId,
      });
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "initial",
          hypothesisId: "H4",
          location: "station-form-dialog:loadStatuses",
          message: "loaded statuses",
          data: {
            stationId,
            count: statuses?.length ?? 0,
            ids: (statuses ?? []).map((s) => s.id),
            items: (statuses ?? []).map((s) => ({
              id: s.id,
              scope: s.scope,
              station_id: s.station_id,
              label_he: s.label_he,
            })),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setStationStatuses(
        (statuses ?? []).filter((item) => item.scope === "station"),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בטעינת הסטטוסים";
      setStatusError(message);
      setStationStatuses([]);
    } finally {
      setIsLoadingStatuses(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !code.trim()) {
      return;
    }

    setError(null);
    setStatusError(null);
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

    const preparedStatuses = stationStatuses.map((status) => ({
      ...status,
      label_he: status.label_he.trim(),
      label_ru: status.label_ru?.trim() ?? "",
      color_hex: status.color_hex ?? "#0ea5e9",
    }));

    const hasInvalidStatus =
      preparedStatuses.length > 0 &&
      preparedStatuses.some((status) => !status.label_he.trim());

    if (hasInvalidStatus) {
      setStatusError("יש למלא שם סטטוס בעברית לכל שורה.");
      return;
    }

    if (
      station?.id &&
      (preparedStatuses.length > 0 || pendingDeletedStatusIds.length > 0)
    ) {
      setIsSavingStatuses(true);
      try {
        await syncStationStatuses(station.id, preparedStatuses);
      } catch (err) {
        const message = err instanceof Error ? err.message : "שמירת סטטוסים נכשלה";
        setStatusError(message);
        setIsSavingStatuses(false);
        return;
      }
      setIsSavingStatuses(false);
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

  const addEmptyStatus = () => {
    setStationStatuses((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        scope: "station",
        station_id: station?.id ?? "",
        label_he: "",
        label_ru: "",
        color_hex: "#0ea5e9",
        created_at: new Date().toISOString(),
      },
    ]);
  };

  const updateStatusField = (
    id: string,
    key:
      | "label_he"
      | "label_ru"
      | "color_hex"
      | "station_id",
    value: string | boolean | number,
  ) => {
    setStationStatuses((prev) =>
      prev.map((status) =>
        status.id === id
          ? {
              ...status,
              [key]: value,
            }
          : status,
      ),
    );
  };

  const handleToggleColorPicker = (statusId: string) => {
    setActiveColorPickerId((prev) => (prev === statusId ? null : statusId));
  };

  const handleSelectColor = (statusId: string, hex: string) => {
    updateStatusField(statusId, "color_hex", hex);
    setActiveColorPickerId(null);
  };

  const handleRemoveStatus = (status: StatusDefinition) => {
    setStationStatuses((prev) => prev.filter((item) => item.id !== status.id));
    setActiveColorPickerId((prev) => (prev === status.id ? null : prev));
    if (!status.id.startsWith("temp-")) {
      setPendingDeletedStatusIds((prev) => [...prev, status.id]);
    }
  };

  const syncStationStatuses = async (
    stationId: string,
    preparedStatuses: StatusDefinition[],
  ) => {
    const createdMap = new Map<string, StatusDefinition>();
    const updatedMap = new Map<string, StatusDefinition>();

    if (pendingDeletedStatusIds.length) {
      await Promise.all(
        pendingDeletedStatusIds.map((id) => deleteStatusDefinitionAdminApi(id)),
      );
    }

    for (const status of preparedStatuses) {
      const payload = {
        scope: "station" as const,
        station_id: stationId,
        label_he: status.label_he.trim(),
        label_ru: status.label_ru?.trim() ?? "",
        color_hex: status.color_hex ?? "#0ea5e9",
      };

      if (status.id.startsWith("temp-")) {
        const { status: created } = await createStatusDefinitionAdminApi(payload);
        createdMap.set(status.id, created);
      } else if (status.id) {
        const { status: updated } = await updateStatusDefinitionAdminApi(
          status.id,
          payload,
        );
        updatedMap.set(status.id, updated);
      }
    }

    setPendingDeletedStatusIds([]);
    setStationStatuses((prev) =>
      preparedStatuses.map((status) => {
        if (status.id.startsWith("temp-")) {
          return createdMap.get(status.id) ?? status;
        }
        return updatedMap.get(status.id) ?? status;
      }),
    );
  };

  return (
    <Dialog open={controlledOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="text-right w-[880px] max-w-5xl">
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
                size="icon"
                onClick={handleAddReason}
                disabled={loading}
                aria-label="הוספת סיבה"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {stationReasons.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">
                לא הוגדרו סוגי תקלות. הוסיפו סוג חדש כדי להתחיל.
              </p>
            ) : (
              <div className="space-y-2 pr-1">
                {stationReasons.map((reason, index) => (
                  <div
                    key={reason.id}
                    className="flex flex-nowrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <Label className="sr-only" htmlFor={`reason-he-${reason.id}`}>
                      תווית בעברית
                    </Label>
                    <div className="relative flex-1 min-w-[220px]">
                      <Input
                        id={`reason-he-${reason.id}`}
                        aria-label={`תווית בעברית לסיבה ${index + 1}`}
                        value={reason.label_he}
                        onChange={(event) =>
                          handleUpdateReason(index, "label_he", event.target.value)
                        }
                        disabled={loading}
                        placeholder="לדוגמה: תקלה בהזנה"
                        className="h-9 pr-10 pl-3 text-sm text-right"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-lg">
                        🇮🇱
                      </span>
                    </div>
                    <Label className="sr-only" htmlFor={`reason-ru-${reason.id}`}>
                      תווית ברוסית
                    </Label>
                    <div className="relative flex-1 min-w-[220px]">
                      <Input
                        id={`reason-ru-${reason.id}`}
                        aria-label={`תווית ברוסית לסיבה ${index + 1}`}
                        value={reason.label_ru}
                        onChange={(event) =>
                          handleUpdateReason(index, "label_ru", event.target.value)
                        }
                        disabled={loading}
                        placeholder="Например: проблема подачи"
                        className="h-9 pr-10 pl-3 text-sm text-right"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-lg">
                        🇷🇺
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="מחיקת סיבה"
                      onClick={() => handleDeleteReason(index)}
                      disabled={loading}
                      className="text-rose-600 hover:text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">סטטוסים לתחנה</p>
                <p className="text-xs text-slate-500">
                  סטטוסים ספציפיים לתחנה זו (סטטוסים גלובליים זמינים כברירת מחדל)
                </p>
              </div>
              <Button
                type="button"
              variant="outline"
              size="icon"
                onClick={addEmptyStatus}
              disabled={loading || isLoadingStatuses || isSavingStatuses}
              aria-label="הוספת סטטוס"
              >
              <Plus className="h-4 w-4" />
              </Button>
            </div>
            {statusError ? (
              <Alert
                variant="destructive"
                className="border-rose-200 bg-rose-50 text-sm text-rose-700"
              >
                <AlertDescription>{statusError}</AlertDescription>
              </Alert>
            ) : null}
            {isLoadingStatuses ? (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">
                טוען סטטוסים...
              </p>
            ) : stationStatuses.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">
                אין סטטוסים ייעודיים לתחנה זו.
              </p>
            ) : (
              <div className="space-y-2 pr-1">
                {stationStatuses
                  .sort(
                    (a, b) =>
                      new Date(a.created_at ?? 0).getTime() -
                      new Date(b.created_at ?? 0).getTime(),
                  )
                  .map((status) => {
                    const isColorPickerOpen = activeColorPickerId === status.id;
                    return (
                      <div
                        key={status.id}
                        className="flex flex-nowrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <Label className="sr-only">שם סטטוס</Label>
                        <div className="relative flex-1 min-w-[220px]">
                          <Input
                            value={status.label_he}
                            onChange={(event) =>
                              updateStatusField(status.id, "label_he", event.target.value)
                            }
                            disabled={loading || isSavingStatuses}
                            placeholder="לדוגמה: עבודה רגילה"
                            className="h-9 pr-10 pl-3 text-sm text-right"
                            aria-label="שם סטטוס"
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-lg">
                            🇮🇱
                          </span>
                        </div>
                        <Label className="sr-only">תווית ברוסית</Label>
                        <div className="relative flex-1 min-w-[220px]">
                          <Input
                            value={status.label_ru ?? ""}
                            onChange={(event) =>
                              updateStatusField(status.id, "label_ru", event.target.value)
                            }
                            disabled={loading || isSavingStatuses}
                            placeholder="Например: Работа"
                            className="h-9 pr-10 pl-3 text-sm text-right"
                            aria-label="תווית ברוסית"
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-lg">
                            🇷🇺
                          </span>
                        </div>
                        <ColorDotPicker
                          value={status.color_hex ?? "#0ea5e9"}
                          isOpen={isColorPickerOpen}
                          onToggle={() => handleToggleColorPicker(status.id)}
                          onSelect={(hex) => handleSelectColor(status.id, hex)}
                          label={status.label_he || "סטטוס"}
                          disabled={loading || isSavingStatuses}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="מחיקת סטטוס"
                          onClick={() => handleRemoveStatus(status)}
                          disabled={loading || isSavingStatuses}
                          className="text-rose-600 hover:text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
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
          <Button
            onClick={() => void handleSubmit()}
            disabled={loading || isSavingStatuses}
          >
            {loading || isSavingStatuses ? "שומר..." : "שמור"}
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

