"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNotification } from "@/contexts/NotificationContext";
import { Trash2 } from "lucide-react";
import type { PipelinePresetWithSteps, Station } from "@/lib/types";
import { PipelineFlowEditor, type PipelineStation } from "@/components/admin/pipeline-flow-editor";

type PipelinePresetEditDialogProps = {
  mode: "create" | "edit";
  preset?: PipelinePresetWithSteps | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: {
    name: string;
    stationIds: string[];
    firstProductApprovalFlags: Record<string, boolean>;
  }) => Promise<void>;
  onDelete?: (presetId: string) => Promise<void>;
  onFetchAvailableStations: () => Promise<Station[]>;
};

export const PipelinePresetEditDialog = ({
  mode,
  preset,
  open,
  onOpenChange,
  onSave,
  onDelete,
  onFetchAvailableStations,
}: PipelinePresetEditDialogProps) => {
  const [name, setName] = useState("");
  const [stations, setStations] = useState<PipelineStation[]>([]);
  const [availableStations, setAvailableStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState("");
  const [firstProductFlags, setFirstProductFlags] = useState<Record<string, boolean>>({});

  const { notify } = useNotification();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track if we've already initialized this dialog session
  const hasInitializedRef = useRef(false);

  // Load available stations when dialog opens
  useEffect(() => {
    if (!open) {
      // Reset the initialization flag when dialog closes
      hasInitializedRef.current = false;
      return;
    }

    // Don't reload if we've already initialized this dialog session
    // This prevents state revert after successful save
    if (hasInitializedRef.current) return;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setShowDeleteConfirm(false);

      try {
        const available = await onFetchAvailableStations();
        setAvailableStations(available);

        // Initialize state based on mode
        if (mode === "edit" && preset) {
          setName(preset.name);
          const initialStations = preset.steps
            .sort((a, b) => a.position - b.position)
            .map((step) => ({
              id: step.station_id,
              station: step.station!,
              position: step.position,
            }))
            .filter((item) => item.station);
          setStations(initialStations);
          // Load first product flags from preset steps
          const flags: Record<string, boolean> = {};
          for (const step of preset.steps) {
            if (step.requires_first_product_approval) {
              flags[step.station_id] = true;
            }
          }
          setFirstProductFlags(flags);
        } else {
          setName("");
          setStations([]);
          setFirstProductFlags({});
        }

        hasInitializedRef.current = true;
      } catch {
        setError("שגיאה בטעינת הנתונים");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [open, mode, preset, onFetchAvailableStations]);

  const handleAddStation = useCallback(() => {
    if (!selectedStationId) return;

    const station = availableStations.find((s) => s.id === selectedStationId);
    if (!station) return;

    setStations((prev) => [
      ...prev,
      {
        id: station.id,
        station,
        position: prev.length + 1,
      },
    ]);
    setSelectedStationId("");
  }, [selectedStationId, availableStations]);

  const handleToggleFirstProductQA = useCallback((stationId: string) => {
    setFirstProductFlags((prev) => ({ ...prev, [stationId]: !prev[stationId] }));
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("יש למלא שם תבנית.");
      return;
    }

    if (stations.length === 0) {
      setError("יש להוסיף לפחות תחנה אחת לתהליך.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        name: name.trim(),
        stationIds: stations.map((s) => s.id),
        firstProductApprovalFlags: firstProductFlags,
      });

      notify({ title: "הצלחה", message: "התבנית נשמרה בהצלחה.", variant: "success" });

      if (mode === "create") {
        // Close dialog automatically after successful creation
        onOpenChange(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בשמירה";
      if (message === "DUPLICATE_STATION") {
        setError("לא ניתן להוסיף את אותה תחנה פעמיים.");
      } else {
        setError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!preset || !onDelete) return;

    setIsDeleting(true);
    setError(null);

    try {
      await onDelete(preset.id);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה במחיקה";
      if (message === "PRESET_IN_USE") {
        setError("לא ניתן למחוק תבנית שבשימוש בעבודות פעילות.");
      } else {
        setError(message);
      }
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setShowDeleteConfirm(false);
    setSelectedStationId("");
    onOpenChange(false);
  };

  const dialogTitle = mode === "create" ? "הוספת תבנית תהליך" : "עריכת תבנית תהליך";
  const isDisabled = isSaving || isDeleting;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        dir="rtl"
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto border-border bg-card"
      >
        <DialogHeader>
          <DialogTitle className="text-foreground">{dialogTitle}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {mode === "create"
              ? "צור תבנית תהליך חדשה לשימוש חוזר בעבודות."
              : "ערוך את שם התבנית והתחנות בתהליך."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error/Success Alerts */}
          {error && (
            <Alert
              variant="destructive"
              className="border-red-500/30 bg-red-500/10 text-right text-sm text-red-400"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
              </div>
              <p className="text-sm text-muted-foreground">טוען נתונים...</p>
            </div>
          ) : (
            <>
              {/* Preset Name */}
              <div className="space-y-1.5">
                <Label htmlFor="preset_name" className="text-foreground/80 text-sm">
                  שם תבנית *
                </Label>
                <Input
                  id="preset_name"
                  aria-label="שם תבנית"
                  placeholder="לדוגמה: תהליך הדפסה מלא"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={isDisabled}
                  className="border-input bg-secondary text-foreground placeholder:text-muted-foreground"
                />
              </div>

              {/* Pipeline Flow Editor */}
              <div className="space-y-1.5">
                <Label className="text-foreground/80 text-sm">תחנות בתהליך</Label>
                <PipelineFlowEditor
                  stations={stations}
                  onStationsChange={setStations}
                  availableStations={availableStations}
                  selectedStationId={selectedStationId}
                  onStationSelect={setSelectedStationId}
                  onAddStation={handleAddStation}
                  disabled={isDisabled}
                  showPresetLoader={false}
                  showStationAdder={true}
                  variant="default"
                  firstProductFlags={firstProductFlags}
                  onToggleFirstProductQA={handleToggleFirstProductQA}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row justify-between gap-3 mt-4 pt-4 border-t border-border">
          {/* Primary actions (save/cancel) - order-1 appears on the right in RTL */}
          <div className="flex items-center gap-2 order-1">
            <Button
              onClick={() => void handleSave()}
              disabled={isDisabled || isLoading || stations.length === 0}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium min-h-[44px]"
            >
              {isSaving ? "שומר..." : "שמור"}
            </Button>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isDisabled}
              className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground min-h-[44px]"
            >
              ביטול
            </Button>
          </div>

          {/* Destructive action (delete) - order-2 appears on the left in RTL */}
          <div className="order-2">
            {mode === "edit" && onDelete && !showDeleteConfirm && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDisabled || isLoading}
                className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10 gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                מחיקה
              </Button>
            )}

            {/* Delete confirmation */}
            {showDeleteConfirm && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-400">למחוק סופית?</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                  className="border-red-500/30 bg-red-500 text-white hover:bg-red-600"
                >
                  {isDeleting ? "מוחק..." : "כן, מחק"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="border-input bg-secondary text-foreground/80 hover:bg-muted"
                >
                  לא
                </Button>
              </div>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
