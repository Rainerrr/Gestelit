"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Switch } from "@/components/ui/switch";
import { useNotification } from "@/contexts/NotificationContext";
import { Plus, Trash2, Calendar } from "lucide-react";
import type {
  MachineState,
  MaintenanceService,
  Station,
  StationReason,
  StationType,
  StatusDefinition,
  StatusReportType,
} from "@/lib/types";
import {
  GENERAL_STATION_REASON,
  GENERAL_STATION_REASON_ID,
} from "@/lib/data/station-reasons";
import { CreatableCombobox } from "@/components/forms/creatable-combobox";
import {
  checkStationActiveSessionAdminApi,
  createStatusDefinitionAdminApi,
  deleteStatusDefinitionAdminApi,
  fetchStatusDefinitionsAdminApi,
  updateStatusDefinitionAdminApi,
} from "@/lib/api/admin-management";
import { StatusCard } from "./status-card";

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
  const [stationStatuses, setStationStatuses] = useState<StatusDefinition[]>([]);
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  // Maintenance tracking state
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(station?.maintenance_enabled ?? false);
  const [maintenanceServices, setMaintenanceServices] = useState<MaintenanceService[]>(
    station?.maintenance_services ?? []
  );
  const [activeColorPickerId, setActiveColorPickerId] = useState<string | null>(null);
  const [pendingDeletedStatusIds, setPendingDeletedStatusIds] = useState<string[]>([]);
  const { notify } = useNotification();
  const [isSavingStatuses, setIsSavingStatuses] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const controlledOpen = open ?? localOpen;
  const availableStationTypes = useMemo(
    () => Array.from(new Set((stationTypes.includes("other") ? stationTypes : ["other", ...stationTypes]).filter(Boolean))),
    [stationTypes],
  );

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setActiveColorPickerId(null);
      setPendingDeletedStatusIds([]);
      setWarningMessage(null);
    }
    (onOpenChange ?? setLocalOpen)(open);
  };

  // Sync dialog fields and load statuses when dialog opens for editing
  useEffect(() => {
    if (!controlledOpen || !station || mode !== "edit") return;
    setName(station.name);
    setCode(station.code);
    setType(station.station_type);
    setIsActive(station.is_active);
    setStationReasons(
      (station.station_reasons ?? []).filter(
        (reason) => reason.id !== GENERAL_STATION_REASON_ID,
      ),
    );
    // Sync maintenance fields
    setMaintenanceEnabled(station.maintenance_enabled ?? false);
    setMaintenanceServices(station.maintenance_services ?? []);
    void loadStatuses(station.id);
  }, [controlledOpen, station, mode]);

  const loadStatuses = async (stationId?: string) => {
    if (!stationId) {
      setStationStatuses([]);
      return;
    }
    setIsLoadingStatuses(true);
    setPendingDeletedStatusIds([]);
    try {
      const { statuses } = await fetchStatusDefinitionsAdminApi({
        stationId,
      });
      setStationStatuses(
        (statuses ?? []).filter((item) => item.scope === "station"),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בטעינת הסטטוסים";
      notify({ title: "שגיאה", message, variant: "error" });
      setStationStatuses([]);
    } finally {
      setIsLoadingStatuses(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !code.trim()) {
      return;
    }

    setWarningMessage(null);

    // Check for active session if editing
    if (mode === "edit" && station?.id) {
      const { hasActiveSession: active } = await checkStationActiveSessionAdminApi(station.id);
      if (active) {
        setWarningMessage("לא ניתן לערוך תחנה עם סשן פעיל. יש לסיים את הסשן הפעיל לפני עריכה.");
        return;
      }
    }
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
      notify({ title: "שגיאה", message: "יש למלא תוויות בעברית וברוסית לכל תקלה.", variant: "error" });
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
      notify({ title: "שגיאה", message: "יש לוודא שתוויות התקלה ייחודיות בכל שפה.", variant: "error" });
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
      notify({ title: "שגיאה", message: "יש למלא שם סטטוס בעברית לכל שורה.", variant: "error" });
      return;
    }

    // Validate maintenance services if enabled
    if (maintenanceEnabled && maintenanceServices.length > 0) {
      const hasInvalidService = maintenanceServices.some(
        (s) => !s.name.trim() || !s.interval_days || s.interval_days < 1
      );
      if (hasInvalidService) {
        notify({ title: "שגיאה", message: "יש למלא שם ומרווח ימים (מינימום 1) לכל טיפול.", variant: "error" });
        return;
      }
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
        notify({ title: "שגיאה", message, variant: "error" });
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
        // Maintenance tracking fields
        maintenance_enabled: maintenanceEnabled,
        maintenance_services: maintenanceEnabled ? maintenanceServices : [],
      } as Partial<Station>);

      notify({ title: "הצלחה", message: "התחנה נשמרה בהצלחה.", variant: "success" });
      setWarningMessage(null);

      // Keep dialog open if controlled, otherwise close for create mode
      if (mode === "create" && !open) {
        setLocalOpen(false);
        setName("");
        setCode("");
        setType("other");
        setIsActive(true);
        setStationReasons([]);
        // Reset maintenance fields
        setMaintenanceEnabled(false);
        setMaintenanceServices([]);
      }
    } catch {
      // Error notification is handled by the parent (management-dashboard friendlyError)
    }
  };

  const dialogTitle = mode === "create" ? "הוספת תחנה" : "עריכת תחנה";

  const handleCodeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCode(event.target.value);
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
        machine_state: "production" as MachineState,
        report_type: "none" as StatusReportType,
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
      | "machine_state"
      | "report_type",
    value: string | boolean,
  ) => {
    setStationStatuses((prev) =>
      prev.map((status) => {
        if (status.id !== id) return status;

        // If changing machine_state away from "stoppage", reset report_type to "none"
        if (key === "machine_state" && value !== "stoppage") {
          return {
            ...status,
            machine_state: value as MachineState,
            report_type: "none" as StatusReportType,
          };
        }

        if (key === "machine_state") {
          return {
            ...status,
            machine_state: value as MachineState,
          };
        }

        return {
          ...status,
          [key]: value,
        };
      }),
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
        machine_state: status.machine_state ?? "production",
        report_type: status.report_type ?? "none",
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
    setStationStatuses(() =>
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
      <DialogContent className="text-right sm:max-w-2xl border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">{dialogTitle}</DialogTitle>
          <DialogDescription className="sr-only">טופס הוספה או עריכה של תחנה</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {warningMessage && (
            <Alert
              variant="destructive"
              className="border-primary/30 bg-primary/10 text-right text-sm text-primary"
            >
              <AlertDescription>{warningMessage}</AlertDescription>
            </Alert>
          )}
          {/* Station Name */}
          <div className="space-y-1.5">
            <Label htmlFor="station_name" className="text-foreground/80 text-sm">שם תחנה</Label>
            <Input
              id="station_name"
              aria-label="שם תחנה"
              placeholder="לדוגמה: מכונת הדפסה A"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="border-input bg-secondary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Station Code */}
          <div className="space-y-1.5">
            <Label htmlFor="station_code" className="text-foreground/80 text-sm">קוד תחנה</Label>
            <Input
              id="station_code"
              aria-label="קוד תחנה"
              placeholder="קוד ייחודי"
              value={code}
              onChange={handleCodeChange}
              className="border-input bg-secondary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Station Type */}
          <div className="space-y-1.5">
            <Label className="text-foreground/80 text-sm">סוג תחנה</Label>
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

          {/* Station Reasons */}
          <div className="space-y-2 rounded-lg border border-input bg-secondary/30 p-3">
            <div className="flex items-center justify-between">
              <div className="text-right">
                <p className="text-sm font-medium text-foreground/80">סוגי תקלות</p>
                <p className="text-xs text-muted-foreground">מוצגות לבחירת תקלה בתחנה זו</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddReason}
                disabled={loading}
                aria-label="הוספת סיבה"
                className="h-7 border-input bg-secondary text-foreground/80 hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5 ml-1" />
                <span className="text-xs">הוסף</span>
              </Button>
            </div>
            {stationReasons.length === 0 ? (
              <p className="rounded-md border border-dashed border-input bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
                לא הוגדרו סוגי תקלות.
              </p>
            ) : (
              <div className="space-y-1.5">
                {stationReasons.map((reason, index) => (
                  <div
                    key={reason.id}
                    className="flex items-center gap-2 rounded-md border border-input bg-secondary/50 p-2"
                  >
                    <div className="relative flex-1 min-w-0">
                      <Input
                        id={`reason-he-${reason.id}`}
                        value={reason.label_he}
                        onChange={(e) => handleUpdateReason(index, "label_he", e.target.value)}
                        disabled={loading}
                        placeholder="תווית בעברית"
                        className="h-8 pr-7 text-xs text-right border-input bg-muted/50"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-50">
                        HE
                      </span>
                    </div>
                    <div className="relative flex-1 min-w-0">
                      <Input
                        id={`reason-ru-${reason.id}`}
                        value={reason.label_ru}
                        onChange={(e) => handleUpdateReason(index, "label_ru", e.target.value)}
                        disabled={loading}
                        placeholder="Название"
                        className="h-8 pr-7 text-xs text-right border-input bg-muted/50"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-50">
                        RU
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteReason(index)}
                      disabled={loading}
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Station Statuses */}
          <div className="space-y-2 rounded-lg border border-input bg-secondary/30 p-3">
            <div className="flex items-center justify-between">
              <div className="text-right">
                <p className="text-sm font-medium text-foreground/80">סטטוסים לתחנה</p>
                <p className="text-xs text-muted-foreground">
                  סטטוסים ספציפיים לתחנה זו
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addEmptyStatus}
                disabled={loading || isLoadingStatuses || isSavingStatuses}
                aria-label="הוספת סטטוס"
                className="h-7 border-input bg-secondary text-foreground/80 hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5 ml-1" />
                <span className="text-xs">הוסף</span>
              </Button>
            </div>
            {isLoadingStatuses ? (
              <p className="rounded-md border border-dashed border-input bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
                טוען סטטוסים...
              </p>
            ) : stationStatuses.length === 0 ? (
              <p className="rounded-md border border-dashed border-input bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
                אין סטטוסים ייעודיים לתחנה זו.
              </p>
            ) : (
              <div className="space-y-1.5">
                {stationStatuses
                  .sort(
                    (a, b) =>
                      new Date(a.created_at ?? 0).getTime() -
                      new Date(b.created_at ?? 0).getTime(),
                  )
                  .map((status) => (
                    <StatusCard
                      key={status.id}
                      status={status}
                      onUpdateField={updateStatusField}
                      onRemove={handleRemoveStatus}
                      isColorPickerOpen={activeColorPickerId === status.id}
                      onToggleColorPicker={() => handleToggleColorPicker(status.id)}
                      onSelectColor={(hex) => handleSelectColor(status.id, hex)}
                      disabled={loading || isSavingStatuses}
                      compact
                    />
                  ))}
              </div>
            )}
          </div>

          {/* Maintenance Tracking */}
          <div className="space-y-2 rounded-lg border border-input bg-secondary/30 p-3">
            <div className="flex items-center justify-between">
              <div className="text-right">
                <p className="text-sm font-medium text-foreground/80">מעקב טיפולים</p>
                <p className="text-xs text-muted-foreground">הפעל תזכורות לטיפולים מתוזמנים</p>
              </div>
              <Switch
                checked={maintenanceEnabled}
                onCheckedChange={setMaintenanceEnabled}
                disabled={loading}
                aria-label="הפעל מעקב טיפולים"
              />
            </div>

            {maintenanceEnabled && (
              <div className="space-y-3 pt-3 border-t border-border/50">
                {maintenanceServices.map((service, idx) => (
                  <div key={service.id} className="flex items-start gap-2 rounded-md border border-border/50 bg-secondary/20 p-2">
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="שם הטיפול"
                        value={service.name}
                        onChange={(e) => {
                          const updated = [...maintenanceServices];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setMaintenanceServices(updated);
                        }}
                        disabled={loading}
                        className="border-input bg-secondary text-foreground placeholder:text-muted-foreground text-sm"
                      />
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          placeholder="מרווח (ימים)"
                          value={service.interval_days || ""}
                          onChange={(e) => {
                            const updated = [...maintenanceServices];
                            updated[idx] = { ...updated[idx], interval_days: parseInt(e.target.value, 10) || 0 };
                            setMaintenanceServices(updated);
                          }}
                          disabled={loading}
                          className="border-input bg-secondary text-foreground placeholder:text-muted-foreground text-sm flex-1"
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">ימים</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setMaintenanceServices((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={loading}
                      className="shrink-0 text-muted-foreground hover:text-destructive mt-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setMaintenanceServices((prev) => [
                      ...prev,
                      {
                        id: generateReasonId(),
                        name: "",
                        last_serviced: null,
                        interval_days: 0,
                        last_service_worker_id: null,
                      },
                    ])
                  }
                  disabled={loading}
                  className="w-full border-dashed"
                >
                  <Plus className="h-4 w-4 ml-2" />
                  הוסף טיפול
                </Button>
              </div>
            )}
          </div>

          {/* Active/Inactive Toggle */}
          <div className="space-y-1.5">
            <Label className="text-foreground/80 text-sm">סטטוס תחנה</Label>
            <div className="flex rounded-lg border border-input bg-secondary/30 p-1">
              <button
                type="button"
                onClick={() => setIsActive(true)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground/80 hover:bg-muted"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-white" : "bg-muted-foreground"}`} />
                פעיל
              </button>
              <button
                type="button"
                onClick={() => setIsActive(false)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  !isActive
                    ? "bg-muted text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground/80 hover:bg-muted"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${!isActive ? "bg-white" : "bg-muted-foreground"}`} />
                לא פעיל
              </button>
            </div>
          </div>
        </div>
        <DialogFooter className="justify-start gap-2 mt-4">
          <Button
            onClick={() => void handleSubmit()}
            disabled={loading || isSavingStatuses}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            {loading || isSavingStatuses ? "שומר..." : "שמור"}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleDialogOpenChange(false)}
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
