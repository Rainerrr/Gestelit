"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import {
  CheckCircle2,
  GripVertical,
  Plus,
  Trash2,
  ChevronLeft,
  Cpu,
  Play,
  Flag,
} from "lucide-react";
import type { PipelinePresetWithSteps, Station } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type StationItem = {
  id: string;
  station: Station;
  position: number;
};

// Sortable station card component
const SortableStationCard = ({
  item,
  index,
  totalCount,
  onRemove,
  disabled,
}: {
  item: StationItem;
  index: number;
  totalCount: number;
  onRemove: () => void;
  disabled: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isFirst = index === 0;
  const isLast = index === totalCount - 1;

  return (
    <div className="flex items-center gap-1">
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "relative flex flex-col items-center gap-1 rounded-xl border-2 p-3 min-w-[100px] transition-all",
          isDragging
            ? "border-primary bg-primary/10 shadow-lg scale-105 z-50"
            : isFirst
              ? "border-emerald-500/50 bg-emerald-500/5"
              : isLast
                ? "border-blue-500/50 bg-blue-500/5"
                : "border-border bg-card/80 hover:border-border/80 hover:bg-card",
          "group"
        )}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className={cn(
            "absolute -top-2 left-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing",
            "flex items-center justify-center w-8 h-4 rounded-full",
            "bg-muted border border-border text-muted-foreground",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            isDragging && "opacity-100"
          )}
        >
          <GripVertical className="h-3 w-3" />
        </div>

        {/* Position badge */}
        <Badge
          variant="outline"
          className={cn(
            "h-6 w-6 p-0 flex items-center justify-center text-xs font-mono",
            isFirst
              ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
              : isLast
                ? "border-blue-500/50 text-blue-400 bg-blue-500/10"
                : "border-input text-muted-foreground"
          )}
        >
          {index + 1}
        </Badge>

        {/* Station icon */}
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            isFirst
              ? "bg-emerald-500/20 border border-emerald-500/30"
              : isLast
                ? "bg-blue-500/20 border border-blue-500/30"
                : "bg-muted border border-border"
          )}
        >
          {isFirst ? (
            <Play className="h-5 w-5 text-emerald-400" />
          ) : isLast ? (
            <Flag className="h-5 w-5 text-blue-400" />
          ) : (
            <Cpu className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        {/* Station name */}
        <p className="text-sm font-medium text-foreground text-center truncate max-w-[90px]">
          {item.station.name}
        </p>
        <p className="text-[10px] text-muted-foreground font-mono">
          {item.station.code}
        </p>

        {/* Remove button */}
        {!disabled && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "absolute -top-2 -right-2 h-6 w-6 rounded-full",
              "bg-red-500/10 border border-red-500/30",
              "text-red-400 hover:text-red-300 hover:bg-red-500/20",
              "opacity-0 group-hover:opacity-100 transition-opacity"
            )}
            onClick={onRemove}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}

        {/* Status label */}
        {isFirst && (
          <span className="absolute -bottom-2 text-[9px] font-medium text-emerald-400 bg-card px-1.5 rounded">
            התחלה
          </span>
        )}
        {isLast && (
          <span className="absolute -bottom-2 text-[9px] font-medium text-blue-400 bg-card px-1.5 rounded">
            סיום
          </span>
        )}
      </div>

      {/* Arrow connector */}
      {!isLast && (
        <ChevronLeft className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
      )}
    </div>
  );
};

type PipelinePresetStepsDialogProps = {
  preset: PipelinePresetWithSteps | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (presetId: string, stationIds: string[]) => Promise<void>;
  onFetchAvailableStations: () => Promise<Station[]>;
};

export const PipelinePresetStepsDialog = ({
  preset,
  open,
  onOpenChange,
  onSave,
  onFetchAvailableStations,
}: PipelinePresetStepsDialogProps) => {
  const [stations, setStations] = useState<StationItem[]>([]);
  const [availableStations, setAvailableStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load available stations when dialog opens
  useEffect(() => {
    if (!open || !preset) return;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        // Load available stations
        const available = await onFetchAvailableStations();
        setAvailableStations(available);

        // Set initial stations from preset
        const initialStations = preset.steps
          .sort((a, b) => a.position - b.position)
          .map((step) => ({
            id: step.station_id,
            station: step.station!,
            position: step.position,
          }))
          .filter((item) => item.station);

        setStations(initialStations);
      } catch {
        setError("שגיאה בטעינת הנתונים");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [open, preset, onFetchAvailableStations]);

  // Filter out already-added stations from available list
  const filteredAvailableStations = availableStations.filter(
    (station) => !stations.some((s) => s.id === station.id)
  );

  const handleAddStation = () => {
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
  };

  const handleRemoveStation = (stationId: string) => {
    setStations((prev) =>
      prev
        .filter((s) => s.id !== stationId)
        .map((s, idx) => ({ ...s, position: idx + 1 }))
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setStations((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);

        return arrayMove(items, oldIndex, newIndex).map((s, idx) => ({
          ...s,
          position: idx + 1,
        }));
      });
    }
  };

  const handleSave = async () => {
    if (!preset) return;

    // Validate minimum 1 station
    if (stations.length === 0) {
      setError("יש להוסיף לפחות תחנה אחת לצינור");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const stationIds = stations.map((s) => s.id);
      await onSave(preset.id, stationIds);
      setSuccessMessage("השלבים נשמרו בהצלחה");
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בשמירה";
      if (message === "DUPLICATE_STATION") {
        setError("לא ניתן להוסיף את אותה תחנה פעמיים");
      } else {
        setError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccessMessage(null);
    setSelectedStationId("");
    onOpenChange(false);
  };

  if (!preset) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="text-right sm:max-w-3xl border-border bg-card max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            עריכת שלבי צינור - {preset.name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            גררו את התחנות לסידור מחדש. הצינור יתחיל מימין ויסתיים משמאל.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden">
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
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
              </div>
              <p className="text-sm text-muted-foreground">טוען תחנות...</p>
            </div>
          ) : (
            <>
              {/* Add Station */}
              <div className="flex items-center gap-2">
                <Select
                  value={selectedStationId}
                  onValueChange={setSelectedStationId}
                  disabled={filteredAvailableStations.length === 0}
                >
                  <SelectTrigger className="flex-1 border-input bg-secondary text-foreground">
                    <SelectValue
                      placeholder={
                        filteredAvailableStations.length === 0
                          ? "כל התחנות כבר נוספו"
                          : "בחר תחנה להוספה..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredAvailableStations.map((station) => (
                      <SelectItem key={station.id} value={station.id}>
                        {station.name} ({station.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAddStation}
                  disabled={!selectedStationId || isSaving}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  הוסף
                </Button>
              </div>

              {/* Pipeline Flow Chart */}
              <div className="rounded-xl border border-border bg-secondary/30 p-4 min-h-[200px]">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    זרימת הצינור
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {stations.length === 0
                      ? "לא הוגדרו שלבים"
                      : `${stations.length} שלבים`}
                  </p>
                </div>

                {stations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50 border border-border mb-4">
                      <Cpu className="h-8 w-8 opacity-50" />
                    </div>
                    <p className="text-sm font-medium">אין שלבים בצינור</p>
                    <p className="text-xs mt-1">הוסיפו תחנות כדי להגדיר את זרימת הייצור</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto pb-4">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={stations.map((s) => s.id)}
                        strategy={horizontalListSortingStrategy}
                      >
                        <div className="flex items-center justify-start gap-1 min-w-max py-4 px-2">
                          {stations.map((item, index) => (
                            <SortableStationCard
                              key={item.id}
                              item={item}
                              index={index}
                              totalCount={stations.length}
                              onRemove={() => handleRemoveStation(item.id)}
                              disabled={isSaving}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                )}
              </div>

              {/* Summary */}
              {stations.length > 0 && (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <p className="text-xs text-muted-foreground mb-1">התחלה</p>
                    <p className="text-sm font-medium text-emerald-400 truncate">
                      {stations[0]?.station.name ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card/50 p-3">
                    <p className="text-xs text-muted-foreground mb-1">שלבים</p>
                    <p className="text-sm font-medium text-foreground">
                      {stations.length}
                    </p>
                  </div>
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                    <p className="text-xs text-muted-foreground mb-1">סיום</p>
                    <p className="text-sm font-medium text-blue-400 truncate">
                      {stations[stations.length - 1]?.station.name ?? "—"}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="justify-start gap-2 mt-4 pt-4 border-t border-border">
          <Button
            onClick={() => void handleSave()}
            disabled={isLoading || isSaving || stations.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            {isSaving ? "שומר..." : "שמור שינויים"}
          </Button>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
            className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
