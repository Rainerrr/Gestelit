"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Package,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";
import type {
  Job,
  JobItemWithDetails,
  PipelinePresetWithSteps,
  Station,
} from "@/lib/types";
import {
  createJobItemAdminApi,
  deleteJobItemAdminApi,
  fetchJobItemsAdminApi,
  fetchPipelinePresetsAdminApi,
  fetchStationsAdminApi,
  updateJobItemAdminApi,
  updateJobItemStepAdminApi,
} from "@/lib/api/admin-management";
import { cn } from "@/lib/utils";
import {
  PipelineFlowEditor,
  type PipelineStation,
} from "@/components/admin/pipeline-flow-editor";

type JobItemsDialogProps = {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const JobItemsDialog = ({
  job,
  open,
  onOpenChange,
}: JobItemsDialogProps) => {
  const [items, setItems] = useState<JobItemWithDetails[]>([]);
  const [pipelinePresets, setPipelinePresets] = useState<PipelinePresetWithSteps[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New product form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductQuantity, setNewProductQuantity] = useState("");
  const [pipelineStations, setPipelineStations] = useState<PipelineStation[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [selectedStationId, setSelectedStationId] = useState("");
  const [firstProductFlags, setFirstProductFlags] = useState<Record<string, boolean>>({});

  // Edit quantity state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<string>("");

  // Expanded item state (to show pipeline steps)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [updatingStepId, setUpdatingStepId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!job) return;

    setIsLoading(true);
    setError(null);

    try {
      const [itemsRes, presetsRes, stationsRes] = await Promise.all([
        fetchJobItemsAdminApi(job.id, { includeProgress: true, includeStations: true }),
        fetchPipelinePresetsAdminApi(),
        fetchStationsAdminApi(),
      ]);

      setItems(itemsRes.items);
      setPipelinePresets(presetsRes.presets);
      setStations(stationsRes.stations.map((s) => s.station));
    } catch {
      setError("שגיאה בטעינת הנתונים");
    } finally {
      setIsLoading(false);
    }
  }, [job]);

  useEffect(() => {
    if (open && job) {
      void loadData();
    }
  }, [open, job, loadData]);

  const handleLoadPreset = useCallback(() => {
    if (!selectedPresetId) return;

    const preset = pipelinePresets.find((p) => p.id === selectedPresetId);
    if (!preset) return;

    const loadedStations = preset.steps
      .sort((a, b) => a.position - b.position)
      .map((presetStep) => ({
        id: presetStep.station_id,
        station: presetStep.station!,
        position: presetStep.position,
      }))
      .filter((item) => item.station);

    setPipelineStations(loadedStations);

    // Load first product approval flags from preset
    const flags: Record<string, boolean> = {};
    for (const step of preset.steps) {
      if (step.requires_first_product_approval) {
        flags[step.station_id] = true;
      }
    }
    setFirstProductFlags(flags);

    // Auto-fill name from preset if empty
    if (!newProductName.trim()) {
      setNewProductName(preset.name);
    }
  }, [selectedPresetId, pipelinePresets, newProductName]);

  const handleAddStationToPipeline = useCallback(() => {
    if (!selectedStationId) return;

    const station = stations.find((s) => s.id === selectedStationId);
    if (!station) return;

    if (pipelineStations.some((ps) => ps.id === station.id)) {
      setError("התחנה כבר קיימת בתהליך");
      return;
    }

    setPipelineStations((prev) => [
      ...prev,
      {
        id: station.id,
        station,
        position: prev.length + 1,
      },
    ]);

    setSelectedStationId("");
    setError(null);
  }, [selectedStationId, stations, pipelineStations]);

  const handleToggleFirstProductApproval = useCallback((stationId: string) => {
    setFirstProductFlags((prev) => ({
      ...prev,
      [stationId]: !prev[stationId],
    }));
  }, []);

  const handleAddItem = async () => {
    if (!job) return;

    if (!newProductName.trim()) {
      setError("יש להזין שם מוצר");
      return;
    }

    if (!newProductQuantity || parseInt(newProductQuantity) <= 0) {
      setError("יש להזין כמות מתוכננת חיובית");
      return;
    }

    if (pipelineStations.length === 0) {
      setError("יש להוסיף לפחות תחנה אחת למוצר");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Post Phase 5: pipeline-only model
      await createJobItemAdminApi(job.id, {
        name: newProductName.trim(),
        station_ids: pipelineStations.map((ps) => ps.id),
        planned_quantity: parseInt(newProductQuantity),
        first_product_approval_flags: firstProductFlags,
      });

      setSuccessMessage("המוצר נוסף בהצלחה");
      setShowAddForm(false);
      setNewProductName("");
      setNewProductQuantity("");
      setPipelineStations([]);
      setSelectedPresetId("");
      setSelectedStationId("");
      setFirstProductFlags({});
      await loadData();

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בהוספת מוצר";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateQuantity = async (itemId: string) => {
    if (!editQuantity || parseInt(editQuantity) <= 0) {
      setError("יש להזין כמות מתוכננת חיובית");
      return;
    }

    if (!job) return;

    setIsSaving(true);
    setError(null);

    try {
      await updateJobItemAdminApi(job.id, itemId, {
        planned_quantity: parseInt(editQuantity),
      });

      setSuccessMessage("הכמות עודכנה בהצלחה");
      setEditingItemId(null);
      setEditQuantity("");
      await loadData();

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בעדכון כמות";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!job) return;

    setIsSaving(true);
    setError(null);

    try {
      await deleteJobItemAdminApi(job.id, itemId);

      setSuccessMessage("המוצר נמחק בהצלחה");
      await loadData();

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה במחיקת מוצר";
      if (message === "HAS_ACTIVE_SESSIONS") {
        setError("לא ניתן למחוק מוצר עם סשנים פעילים");
      } else {
        setError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStepQA = async (
    itemId: string,
    stepId: string,
    newValue: boolean,
  ) => {
    setUpdatingStepId(stepId);
    setError(null);

    try {
      await updateJobItemStepAdminApi(itemId, stepId, {
        requires_first_product_approval: newValue,
      });

      // Update local state immediately for responsiveness
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== itemId) return item;
          return {
            ...item,
            job_item_stations: item.job_item_stations?.map((step) => {
              if (step.id !== stepId) return step;
              return { ...step, requires_first_product_approval: newValue };
            }),
          };
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בעדכון";
      setError(message);
    } finally {
      setUpdatingStepId(null);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccessMessage(null);
    setShowAddForm(false);
    setEditingItemId(null);
    setNewProductName("");
    setNewProductQuantity("");
    setPipelineStations([]);
    setSelectedPresetId("");
    setSelectedStationId("");
    setFirstProductFlags({});
    onOpenChange(false);
  };

  const getProgressPercent = (item: JobItemWithDetails) => {
    const completed = item.progress?.completed_good ?? 0;
    return Math.min(100, Math.round((completed / item.planned_quantity) * 100));
  };

  const getItemDisplayName = (item: JobItemWithDetails) => {
    // Post Phase 5: Prefer explicit name, then pipeline preset name
    return item.name || item.pipeline_preset?.name || "מוצר";
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="text-right sm:max-w-3xl border-border bg-card max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Package className="h-5 w-5" />
            מוצרים - {job.job_number}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            הגדרת מוצרים ותהליכי הייצור שלהם. עובדים יוכלו לעבוד רק בתחנות שהוגדרו כאן.
          </DialogDescription>
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
          {successMessage && (
            <Alert className="border-emerald-500/30 bg-emerald-500/10 text-right text-sm text-emerald-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <AlertDescription>{successMessage}</AlertDescription>
              </div>
            </Alert>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="relative h-8 w-8">
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
              </div>
              <p className="text-sm text-muted-foreground">טוען...</p>
            </div>
          ) : (
            <>
              {/* Existing Items */}
              <div className="space-y-2 rounded-lg border border-input bg-secondary/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground/80">
                    מוצרים מוגדרים ({items.length})
                  </p>
                  {!showAddForm && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddForm(true)}
                      disabled={isSaving}
                      className="h-7 border-input bg-secondary text-foreground/80 hover:bg-muted"
                    >
                      <Plus className="h-3.5 w-3.5 ml-1" />
                      הוסף מוצר
                    </Button>
                  )}
                </div>

                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Package className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">לא הוגדרו מוצרים לעבודה זו.</p>
                    <p className="text-xs mt-1">
                      הוסיפו מוצרים כדי שעובדים יוכלו לעבוד על עבודה זו.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((item) => {
                      const isEditing = editingItemId === item.id;
                      const isExpanded = expandedItemId === item.id;
                      const progressPercent = getProgressPercent(item);
                      const hasQASteps = item.job_item_stations?.some(
                        (s) => s.requires_first_product_approval,
                      );

                      return (
                        <div
                          key={item.id}
                          className="rounded-md border border-input bg-card p-3"
                        >
                          {/* Header row: name, locked badge, expand toggle, delete */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <Workflow className="h-4 w-4 text-purple-400 flex-shrink-0" />
                              <span className="font-medium text-foreground truncate">
                                {getItemDisplayName(item)}
                              </span>
                              {item.is_pipeline_locked && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30 flex-shrink-0"
                                >
                                  נעול
                                </Badge>
                              )}
                              {hasQASteps && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30 flex-shrink-0 gap-0.5"
                                >
                                  <ClipboardCheck className="h-2.5 w-2.5" />
                                  QA
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {/* Expand toggle */}
                              {item.job_item_stations && item.job_item_stations.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                  onClick={() =>
                                    setExpandedItemId(isExpanded ? null : item.id)
                                  }
                                >
                                  <span className="text-xs mr-1">
                                    {item.job_item_stations.length} שלבים
                                  </span>
                                  <ChevronDown
                                    className={cn(
                                      "h-3.5 w-3.5 transition-transform",
                                      isExpanded && "rotate-180",
                                    )}
                                  />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                onClick={() => void handleDeleteItem(item.id)}
                                disabled={isSaving}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* Expanded pipeline steps */}
                          {isExpanded && item.job_item_stations && item.job_item_stations.length > 0 && (
                            <div className="mt-3 space-y-1.5 border-t border-input/50 pt-3">
                              <p className="text-xs text-muted-foreground mb-2">
                                לחצו על הסמל כדי לדרוש אישור מוצר ראשון בכל שלב:
                              </p>
                              {item.job_item_stations
                                .sort((a, b) => a.position - b.position)
                                .map((step, idx) => {
                                  const isFirst = idx === 0;
                                  const isLast = idx === item.job_item_stations!.length - 1;
                                  const isUpdating = updatingStepId === step.id;

                                  return (
                                    <div
                                      key={step.id}
                                      className={cn(
                                        "flex items-center gap-2 p-2 rounded transition-colors",
                                        isFirst
                                          ? "bg-emerald-500/5 border border-emerald-500/20"
                                          : isLast
                                            ? "bg-blue-500/5 border border-blue-500/20"
                                            : "bg-secondary/50 border border-input/50",
                                      )}
                                    >
                                      {/* Position badge */}
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "h-5 w-5 p-0 flex items-center justify-center text-[10px] font-mono flex-shrink-0",
                                          isFirst
                                            ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                                            : isLast
                                              ? "border-blue-500/50 text-blue-400 bg-blue-500/10"
                                              : "border-input text-muted-foreground",
                                        )}
                                      >
                                        {step.position}
                                      </Badge>

                                      {/* Station name */}
                                      <span className="flex-1 text-sm text-foreground/90 truncate">
                                        {step.station?.name ?? "—"}
                                      </span>

                                      {/* QA Toggle button */}
                                      <button
                                        onClick={() =>
                                          void handleToggleStepQA(
                                            item.id,
                                            step.id,
                                            !step.requires_first_product_approval,
                                          )
                                        }
                                        disabled={isUpdating}
                                        className={cn(
                                          "h-7 w-7 rounded border flex items-center justify-center transition-colors flex-shrink-0",
                                          step.requires_first_product_approval
                                            ? "border-amber-500 bg-amber-500/20 text-amber-400"
                                            : "border-border bg-muted/50 text-muted-foreground hover:border-amber-400/50 hover:bg-amber-500/10",
                                          isUpdating && "opacity-50",
                                        )}
                                        title="דרוש אישור מוצר ראשון"
                                      >
                                        {isUpdating ? (
                                          <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        ) : step.requires_first_product_approval ? (
                                          <Check className="h-3.5 w-3.5" />
                                        ) : (
                                          <ClipboardCheck className="h-3.5 w-3.5 opacity-50" />
                                        )}
                                      </button>
                                    </div>
                                  );
                                })}
                            </div>
                          )}

                          {/* Quantity/progress row */}
                          <div className="flex items-center gap-3 mt-3 pt-2 border-t border-input/50">
                            {isEditing ? (
                              <div className="flex items-center gap-2 flex-1">
                                <Input
                                  type="number"
                                  min="1"
                                  value={editQuantity}
                                  onChange={(e) => setEditQuantity(e.target.value)}
                                  className="w-24 h-7 text-xs border-input bg-secondary"
                                />
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => void handleUpdateQuantity(item.id)}
                                  disabled={isSaving}
                                >
                                  שמור
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setEditingItemId(null);
                                    setEditQuantity("");
                                  }}
                                >
                                  ביטול
                                </Button>
                              </div>
                            ) : (
                              <>
                                <button
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  onClick={() => {
                                    setEditingItemId(item.id);
                                    setEditQuantity(item.planned_quantity.toString());
                                  }}
                                >
                                  מתוכנן:{" "}
                                  <span className="font-medium text-foreground">
                                    {item.planned_quantity.toLocaleString()}
                                  </span>
                                </button>
                                <span className="text-xs text-muted-foreground">|</span>
                                <span className="text-xs text-muted-foreground">
                                  הושלמו:{" "}
                                  <span className="font-medium text-emerald-400">
                                    {(item.progress?.completed_good ?? 0).toLocaleString()}
                                  </span>
                                </span>
                                <div className="flex-1 flex items-center gap-2">
                                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                                    <div
                                      className={`h-full transition-all ${
                                        progressPercent >= 100 ? "bg-emerald-500" : "bg-primary"
                                      }`}
                                      style={{ width: `${progressPercent}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {progressPercent}%
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add Product Form */}
              {showAddForm && (
                <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <p className="text-sm font-medium text-foreground">הוספת מוצר חדש</p>

                  {/* Product Name */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-foreground/80">שם המוצר *</Label>
                    <Input
                      placeholder="הזן שם מוצר"
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      className="border-input bg-secondary text-foreground placeholder:text-muted-foreground"
                    />
                  </div>

                  {/* Pipeline Flow Editor */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-foreground/80">תהליך הייצור *</Label>
                    <PipelineFlowEditor
                      stations={pipelineStations}
                      onStationsChange={setPipelineStations}
                      availableStations={stations}
                      presets={pipelinePresets}
                      selectedPresetId={selectedPresetId}
                      onPresetSelect={setSelectedPresetId}
                      onLoadPreset={handleLoadPreset}
                      selectedStationId={selectedStationId}
                      onStationSelect={setSelectedStationId}
                      onAddStation={handleAddStationToPipeline}
                      disabled={isSaving}
                      variant="default"
                      firstProductFlags={firstProductFlags}
                      onToggleFirstProductQA={handleToggleFirstProductApproval}
                    />
                  </div>

                  {/* Quantity */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-foreground/80">כמות מתוכננת *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newProductQuantity}
                      onChange={(e) => setNewProductQuantity(e.target.value)}
                      placeholder="כמות יחידות"
                      className="border-input bg-secondary text-foreground"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      onClick={() => void handleAddItem()}
                      disabled={
                        isSaving ||
                        !newProductName.trim() ||
                        pipelineStations.length === 0 ||
                        !newProductQuantity
                      }
                      size="sm"
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {isSaving ? "מוסיף..." : "הוסף מוצר"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAddForm(false);
                        setNewProductName("");
                        setNewProductQuantity("");
                        setPipelineStations([]);
                        setSelectedPresetId("");
                        setSelectedStationId("");
                        setFirstProductFlags({});
                        setError(null);
                      }}
                      disabled={isSaving}
                      className="border-input bg-secondary text-foreground/80 hover:bg-muted"
                    >
                      ביטול
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="justify-start mt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
