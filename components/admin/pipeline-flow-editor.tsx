"use client";

import { useCallback } from "react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronDown,
  Cpu,
  Download,
  Flag,
  GripVertical,
  Play,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";
import type { PipelinePresetWithSteps, Station } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PipelineStation = {
  id: string;
  station: Station;
  position: number;
};

type SortableStationCardProps = {
  item: PipelineStation;
  index: number;
  totalCount: number;
  onRemove: () => void;
  disabled: boolean;
  variant: "compact" | "default" | "large";
  isHorizontal: boolean;
};

const SortableStationCard = ({
  item,
  index,
  totalCount,
  onRemove,
  disabled,
  variant,
  isHorizontal,
}: SortableStationCardProps) => {
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

  // Size variants
  const sizeClasses = {
    compact: {
      card: "min-w-[60px] p-1.5 gap-0.5 rounded-lg",
      icon: "h-6 w-6 rounded",
      iconSize: "h-3 w-3",
      name: "text-[10px] max-w-[55px]",
      handle: "w-5 h-2.5 -top-1",
      handleIcon: "h-2 w-2",
      remove: "h-4 w-4 -top-1 -right-1",
      removeIcon: "h-2 w-2",
      badge: "h-4 w-4 text-[8px]",
      arrow: "h-3 w-3",
    },
    default: {
      card: "min-w-[80px] p-2 gap-1 rounded-xl",
      icon: "h-8 w-8 rounded-lg",
      iconSize: "h-4 w-4",
      name: "text-xs max-w-[70px]",
      handle: "w-6 h-3 -top-1.5",
      handleIcon: "h-2.5 w-2.5",
      remove: "h-5 w-5 -top-1.5 -right-1.5",
      removeIcon: "h-2.5 w-2.5",
      badge: "h-5 w-5 text-[10px]",
      arrow: "h-4 w-4",
    },
    large: {
      card: "min-w-[100px] p-3 gap-1.5 rounded-xl",
      icon: "h-10 w-10 rounded-lg",
      iconSize: "h-5 w-5",
      name: "text-sm max-w-[90px]",
      handle: "w-7 h-4 -top-2",
      handleIcon: "h-3 w-3",
      remove: "h-6 w-6 -top-2 -right-2",
      removeIcon: "h-3 w-3",
      badge: "h-6 w-6 text-xs",
      arrow: "h-5 w-5",
    },
  };

  const sizes = sizeClasses[variant];

  // Horizontal card (visual flow chart style)
  if (isHorizontal) {
    return (
      <div className="flex items-center gap-1">
        <div
          ref={setNodeRef}
          style={style}
          className={cn(
            "relative flex flex-col items-center border-2 transition-all",
            sizes.card,
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
              "absolute left-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing",
              "flex items-center justify-center rounded-full",
              "bg-muted border border-border text-muted-foreground",
              "opacity-0 group-hover:opacity-100 transition-opacity",
              sizes.handle,
              isDragging && "opacity-100"
            )}
          >
            <GripVertical className={sizes.handleIcon} />
          </div>

          {/* Position badge */}
          {variant !== "compact" && (
            <Badge
              variant="outline"
              className={cn(
                "p-0 flex items-center justify-center font-mono",
                sizes.badge,
                isFirst
                  ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                  : isLast
                    ? "border-blue-500/50 text-blue-400 bg-blue-500/10"
                    : "border-input text-muted-foreground"
              )}
            >
              {index + 1}
            </Badge>
          )}

          {/* Station icon */}
          <div
            className={cn(
              "flex items-center justify-center",
              sizes.icon,
              isFirst
                ? "bg-emerald-500/20 border border-emerald-500/30"
                : isLast
                  ? "bg-blue-500/20 border border-blue-500/30"
                  : "bg-muted border border-border"
            )}
          >
            {isFirst ? (
              <Play className={cn(sizes.iconSize, "text-emerald-400")} />
            ) : isLast ? (
              <Flag className={cn(sizes.iconSize, "text-blue-400")} />
            ) : (
              <Cpu className={cn(sizes.iconSize, "text-muted-foreground")} />
            )}
          </div>

          {/* Station name */}
          <p className={cn("font-medium text-foreground text-center truncate", sizes.name)}>
            {item.station.name}
          </p>

          {/* Remove button */}
          {!disabled && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "absolute rounded-full",
                "bg-red-500/10 border border-red-500/30",
                "text-red-400 hover:text-red-300 hover:bg-red-500/20",
                "opacity-0 group-hover:opacity-100 transition-opacity",
                sizes.remove
              )}
              onClick={onRemove}
            >
              <Trash2 className={sizes.removeIcon} />
            </Button>
          )}
        </div>

        {/* Arrow connector */}
        {!isLast && (
          <ChevronLeft className={cn(sizes.arrow, "text-muted-foreground/50 flex-shrink-0")} />
        )}
      </div>
    );
  }

  // Vertical list card (mobile style)
  return (
    <div className="flex items-center gap-2 w-full">
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "relative flex items-center flex-1 border rounded-lg p-2 transition-all",
          isDragging
            ? "border-primary bg-primary/10 shadow-lg scale-[1.02] z-50"
            : isFirst
              ? "border-emerald-500/50 bg-emerald-500/5"
              : isLast
                ? "border-blue-500/50 bg-blue-500/5"
                : "border-border bg-card/80 hover:border-border/80",
          "group"
        )}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-6 h-6 mr-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Position badge */}
        <Badge
          variant="outline"
          className={cn(
            "h-6 w-6 p-0 flex items-center justify-center text-xs font-mono mr-3",
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
            "flex h-8 w-8 items-center justify-center rounded-lg mr-3",
            isFirst
              ? "bg-emerald-500/20 border border-emerald-500/30"
              : isLast
                ? "bg-blue-500/20 border border-blue-500/30"
                : "bg-muted border border-border"
          )}
        >
          {isFirst ? (
            <Play className="h-4 w-4 text-emerald-400" />
          ) : isLast ? (
            <Flag className="h-4 w-4 text-blue-400" />
          ) : (
            <Cpu className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {/* Station name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {item.station.name}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {item.station.code}
          </p>
        </div>

        {/* Remove button */}
        {!disabled && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Arrow below (except last) */}
      {!isLast && (
        <ChevronDown className="h-4 w-4 text-muted-foreground/50 absolute -bottom-3 left-1/2 -translate-x-1/2 hidden" />
      )}
    </div>
  );
};

export type PipelineFlowEditorProps = {
  stations: PipelineStation[];
  onStationsChange: (stations: PipelineStation[]) => void;
  availableStations: Station[];
  presets?: PipelinePresetWithSteps[];
  selectedPresetId?: string;
  onPresetSelect?: (presetId: string) => void;
  onLoadPreset?: () => void;
  selectedStationId?: string;
  onStationSelect?: (stationId: string) => void;
  onAddStation?: () => void;
  isLocked?: boolean;
  disabled?: boolean;
  variant?: "compact" | "default" | "large";
  showPresetLoader?: boolean;
  showStationAdder?: boolean;
  className?: string;
};

export const PipelineFlowEditor = ({
  stations,
  onStationsChange,
  availableStations,
  presets = [],
  selectedPresetId = "",
  onPresetSelect,
  onLoadPreset,
  selectedStationId = "",
  onStationSelect,
  onAddStation,
  isLocked = false,
  disabled = false,
  variant = "default",
  showPresetLoader = true,
  showStationAdder = true,
  className,
}: PipelineFlowEditorProps) => {
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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = stations.findIndex((s) => s.id === active.id);
        const newIndex = stations.findIndex((s) => s.id === over.id);

        const reordered = arrayMove(stations, oldIndex, newIndex).map((s, idx) => ({
          ...s,
          position: idx + 1,
        }));

        onStationsChange(reordered);
      }
    },
    [stations, onStationsChange]
  );

  const handleRemoveStation = useCallback(
    (stationId: string) => {
      const filtered = stations
        .filter((s) => s.id !== stationId)
        .map((s, idx) => ({ ...s, position: idx + 1 }));
      onStationsChange(filtered);
    },
    [stations, onStationsChange]
  );

  // Filter available stations (exclude already added)
  const filteredAvailableStations = availableStations.filter(
    (s) => s.is_active && !stations.some((ps) => ps.id === s.id)
  );

  const isDisabled = isLocked || disabled;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Controls */}
      {!isDisabled && (showPresetLoader || showStationAdder) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {/* Load Preset */}
          {showPresetLoader && presets.length > 0 && (
            <div className="flex items-end gap-2 flex-1">
              <div className="flex-1">
                <Select
                  value={selectedPresetId}
                  onValueChange={onPresetSelect}
                  disabled={isDisabled}
                >
                  <SelectTrigger className="border-input bg-secondary text-foreground h-9 text-sm">
                    <SelectValue placeholder="טען תבנית..." />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name} ({preset.steps.length} שלבים)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onLoadPreset}
                disabled={!selectedPresetId || isDisabled}
                className="h-9 border-input bg-secondary text-foreground/80 hover:bg-muted gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                טען
              </Button>
            </div>
          )}

          {/* Add Station */}
          {showStationAdder && (
            <div className="flex items-end gap-2 flex-1">
              <div className="flex-1">
                <Select
                  value={selectedStationId}
                  onValueChange={onStationSelect}
                  disabled={filteredAvailableStations.length === 0 || isDisabled}
                >
                  <SelectTrigger className="border-input bg-secondary text-foreground h-9 text-sm">
                    <SelectValue
                      placeholder={
                        filteredAvailableStations.length === 0
                          ? "כל התחנות נוספו"
                          : "הוסף תחנה..."
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
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onAddStation}
                disabled={!selectedStationId || isDisabled}
                className="h-9 border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                הוסף
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Pipeline Flow Chart */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3 min-h-[100px]">
        {isLocked && (
          <div className="flex items-center gap-2 mb-2 text-xs text-amber-400">
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
              נעול
            </Badge>
            <span>הצינור נעול לעריכה (הייצור התחיל)</span>
          </div>
        )}

        {stations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 border border-border mb-2">
              <Workflow className="h-6 w-6 opacity-50" />
            </div>
            <p className="text-xs">בנו צינור מאפס או טענו תבנית</p>
          </div>
        ) : (
          <>
            {/* Desktop: Horizontal flow */}
            <div className="hidden md:block overflow-x-auto pb-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={stations.map((s) => s.id)}
                  strategy={horizontalListSortingStrategy}
                  disabled={isDisabled}
                >
                  <div className="flex items-center justify-start gap-1 min-w-max py-3 px-1">
                    {stations.map((item, index) => (
                      <SortableStationCard
                        key={item.id}
                        item={item}
                        index={index}
                        totalCount={stations.length}
                        onRemove={() => handleRemoveStation(item.id)}
                        disabled={isDisabled}
                        variant={variant}
                        isHorizontal={true}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* Mobile: Vertical list */}
            <div className="md:hidden space-y-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={stations.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                  disabled={isDisabled}
                >
                  {stations.map((item, index) => (
                    <SortableStationCard
                      key={item.id}
                      item={item}
                      index={index}
                      totalCount={stations.length}
                      onRemove={() => handleRemoveStation(item.id)}
                      disabled={isDisabled}
                      variant={variant}
                      isHorizontal={false}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </>
        )}
      </div>

      {/* Summary */}
      {stations.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
            <p className="text-[10px] text-muted-foreground">התחלה</p>
            <p className="text-xs font-medium text-emerald-400 truncate">
              {stations[0]?.station.name ?? "—"}
            </p>
          </div>
          <div className="rounded-md border border-border bg-card/50 p-2">
            <p className="text-[10px] text-muted-foreground">שלבים</p>
            <p className="text-xs font-medium text-foreground">
              {stations.length}
            </p>
          </div>
          <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-2">
            <p className="text-[10px] text-muted-foreground">סיום</p>
            <p className="text-xs font-medium text-blue-400 truncate">
              {stations[stations.length - 1]?.station.name ?? "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
