"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Plus, CheckCircle2, AlertCircle } from "lucide-react";
import type { MachineState, StatusDefinition, StatusReportType } from "@/lib/types";
import {
  createStatusDefinitionAdminApi,
  deleteStatusDefinitionAdminApi,
  fetchStatusDefinitionsAdminApi,
  updateStatusDefinitionAdminApi,
} from "@/lib/api/admin-management";
import { StatusCard, PROTECTED_LABELS_HE } from "./status-card";

export const GlobalStatusesManagement = () => {
  const [statuses, setStatuses] = useState<StatusDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeColorPickerId, setActiveColorPickerId] = useState<string | null>(null);
  const [pendingDeletedIds, setPendingDeletedIds] = useState<string[]>([]);

  const loadStatuses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { statuses: data } = await fetchStatusDefinitionsAdminApi();
      setStatuses(data.filter((s) => s.scope === "global"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת סטטוסים");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  const handleAddStatus = () => {
    setStatuses((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        scope: "global",
        station_id: null,
        label_he: "",
        label_ru: "",
        color_hex: "#0ea5e9",
        machine_state: "production" as MachineState,
        report_type: "none" as StatusReportType,
        created_at: new Date().toISOString(),
      },
    ]);
  };

  const handleUpdateField = (
    id: string,
    key: "label_he" | "label_ru" | "color_hex" | "machine_state" | "report_type",
    value: string | boolean,
  ) => {
    setStatuses((prev) =>
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
    handleUpdateField(statusId, "color_hex", hex);
    setActiveColorPickerId(null);
  };

  const handleRemoveStatus = (status: StatusDefinition) => {
    if (PROTECTED_LABELS_HE.includes(status.label_he)) {
      setError("לא ניתן למחוק סטטוס מוגן - הוא קריטי למערכת.");
      return;
    }
    setStatuses((prev) => prev.filter((item) => item.id !== status.id));
    setActiveColorPickerId((prev) => (prev === status.id ? null : prev));
    if (!status.id.startsWith("temp-")) {
      setPendingDeletedIds((prev) => [...prev, status.id]);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    const editableStatuses = statuses.filter(
      (s) => !PROTECTED_LABELS_HE.includes(s.label_he),
    );

    const hasInvalid = editableStatuses.some((s) => !s.label_he.trim());
    if (hasInvalid) {
      setError("יש למלא שם סטטוס בעברית לכל שורה.");
      setIsSaving(false);
      return;
    }

    try {
      if (pendingDeletedIds.length > 0) {
        await Promise.all(
          pendingDeletedIds.map((id) => deleteStatusDefinitionAdminApi(id)),
        );
      }

      for (const status of editableStatuses) {
        const payload = {
          scope: "global" as const,
          station_id: null,
          label_he: status.label_he.trim(),
          label_ru: status.label_ru?.trim() ?? "",
          color_hex: status.color_hex ?? "#0ea5e9",
          machine_state: status.machine_state ?? "production",
          report_type: status.report_type ?? "none",
        };

        if (status.id.startsWith("temp-")) {
          await createStatusDefinitionAdminApi(payload);
        } else {
          await updateStatusDefinitionAdminApi(status.id, payload);
        }
      }

      setPendingDeletedIds([]);
      setSuccessMessage("הסטטוסים נשמרו בהצלחה.");
      await loadStatuses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת הסטטוסים");
    } finally {
      setIsSaving(false);
    }
  };

  const isProtected = (status: StatusDefinition) =>
    PROTECTED_LABELS_HE.includes(status.label_he);

  // Sort: protected statuses at the end
  const sortedStatuses = [...statuses].sort((a, b) => {
    const aProtected = isProtected(a);
    const bProtected = isProtected(b);
    if (aProtected && !bProtected) return 1;
    if (!aProtected && bProtected) return -1;
    return (
      new Date(a.created_at ?? 0).getTime() -
      new Date(b.created_at ?? 0).getTime()
    );
  });

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">ניהול סטטוסים גלובליים</h3>
          <p className="text-xs text-muted-foreground mt-1">
            סטטוסים זמינים בכל התחנות. סטטוסים מוגנים לא ניתנים לעריכה או מחיקה.
          </p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddStatus}
            disabled={isLoading || isSaving}
            className="border-input bg-secondary text-foreground/80 hover:bg-muted"
          >
            <Plus className="h-4 w-4 ml-1.5" />
            <span>הוסף</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={isLoading || isSaving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSaving ? "שומר..." : "שמור"}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {error && (
          <Alert
            variant="destructive"
            className="border-red-500/30 bg-red-500/10 text-right text-sm text-red-400"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <AlertDescription>{error}</AlertDescription>
            </div>
          </Alert>
        )}

        {successMessage && (
          <Alert className="border-emerald-500/30 bg-emerald-500/10 text-right text-sm text-emerald-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <AlertDescription>{successMessage}</AlertDescription>
            </div>
          </Alert>
        )}

        {isLoading ? (
          <div className="rounded-lg border border-dashed border-input bg-muted/30 px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">טוען סטטוסים...</p>
          </div>
        ) : sortedStatuses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-input bg-muted/30 px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              אין סטטוסים גלובליים. הוסיפו סטטוס חדש כדי להתחיל.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedStatuses.map((status) => (
              <StatusCard
                key={status.id}
                status={status}
                onUpdateField={handleUpdateField}
                onRemove={handleRemoveStatus}
                isColorPickerOpen={activeColorPickerId === status.id}
                onToggleColorPicker={() => handleToggleColorPicker(status.id)}
                onSelectColor={(hex) => handleSelectColor(status.id, hex)}
                disabled={isSaving}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
