"use client";
import { useId, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ClipboardCheck,
  Flag,
  GripVertical,
  LockKeyhole,
  Plus,
  Search,
  Trash2,
  Undo2,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PipelinePresetWithSteps, Station } from "@/lib/types";
import { MAX_WORKFLOW_STEPS, type WorkflowPlan } from "@/lib/workflows/plan";
import { WorkflowAgentSetup } from "./workflow-agent-config";
import type { WorkflowAgentConfig } from "@/lib/workflows/agent";
import { WorkflowAiPanel } from "./workflow-ai-panel";

const stationTypes: Record<string, string> = {
  digital_press: "דפוס דיגיטלי",
  cutting: "חיתוך",
  binding: "כריכה וגימור",
  folding: "קיפול",
  lamination: "למינציה",
  shrink: "אריזה בשרינק",
  other: "כללי",
};
export type PipelineStation = {
  id: string;
  station: Station;
  position: number;
  agent_config?: WorkflowAgentConfig | null;
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
  showAgentSetup?: boolean;
  isLocked?: boolean;
  disabled?: boolean;
  variant?: "compact" | "default" | "large";
  showPresetLoader?: boolean;
  showStationAdder?: boolean;
  className?: string;
  firstProductFlags?: Record<string, boolean>;
  onToggleFirstProductQA?: (stationId: string) => void;
  aiContext?: string;
};
type NodeProps = {
  item: PipelineStation;
  index: number;
  total: number;
  selected: boolean;
  disabled: boolean;
  approval: boolean;
  canApprove: boolean;
  onSelect: () => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
  onApprove: () => void;
};
const StationNode = ({
  item,
  index,
  total,
  selected,
  disabled,
  approval,
  canApprove,
  onSelect,
  onMove,
  onRemove,
  onApprove,
}: NodeProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative flex w-full shrink-0 items-center gap-3 md:w-auto",
        isDragging && "z-20",
      )}
    >
      <div
        className={cn(
          "w-full rounded-xl border bg-card shadow-sm md:w-60",
          selected ? "border-primary ring-2 ring-primary/15" : "border-border",
          isDragging && "shadow-xl",
          !item.station.is_active && "border-amber-500",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
            {index + 1}
          </span>
          <span className="text-xs text-muted-foreground">
            {index === 0
              ? "תחנה ראשונה"
              : index === total - 1
                ? "תחנה אחרונה"
                : "שלב בתהליך"}
          </span>
          <button
            type="button"
            {...attributes}
            {...listeners}
            disabled={disabled}
            aria-label={`גרירת תחנה ${item.station.name}`}
            className="mr-auto flex h-8 w-8 touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`בחירת תחנה ${item.station.name}`}
          className="block min-h-20 w-full px-4 py-3 text-right focus-visible:outline-primary"
        >
          <span className="block text-sm font-semibold leading-relaxed">
            {item.station.name}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {item.station.code} ·{" "}
            {stationTypes[item.station.station_type] ??
              item.station.station_type}
          </span>
          {item.agent_config && (
            <span className="mt-2 block text-xs font-medium text-violet-500">
              ✦ {item.agent_config.name}
            </span>
          )}
        </button>
        {!item.station.is_active && (
          <p className="px-3 pb-2 text-xs text-amber-700 dark:text-amber-300">
            תחנה לא פעילה, בחרו תחנה חלופית
          </p>
        )}
        {canApprove && (
          <button
            type="button"
            disabled={disabled}
            onClick={onApprove}
            aria-pressed={approval}
            aria-label={`אישור מוצר ראשון בתחנה ${item.station.name}`}
            className={cn(
              "flex min-h-10 w-full items-center gap-2 border-t px-3 text-xs disabled:opacity-60",
              approval
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <ClipboardCheck className="h-4 w-4" />
            אישור מוצר ראשון{approval && <Check className="mr-auto h-4 w-4" />}
          </button>
        )}
        {!disabled && (
          <div className="flex items-center justify-between border-t border-border/60 px-2 py-1">
            <div className="flex">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === 0}
                onClick={() => onMove(-1)}
                aria-label={`הקדמת ${item.station.name}`}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === total - 1}
                onClick={() => onMove(1)}
                aria-label={`דחיית ${item.station.name}`}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRemove}
              aria-label={`הסרת ${item.station.name}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      {index < total - 1 && (
        <ArrowLeft
          aria-hidden
          className="hidden h-5 w-5 shrink-0 text-primary/50 md:block"
        />
      )}
    </li>
  );
};

const stateKey = (
  stations: PipelineStation[],
  flags: Record<string, boolean>,
) =>
  JSON.stringify(
    stations.map((s) => [s.id, !!flags[s.id], s.agent_config ?? null]),
  );
export const PipelineFlowEditor = ({
  stations,
  onStationsChange,
  availableStations,
  presets = [],
  selectedPresetId = "",
  onPresetSelect,
  onLoadPreset,
  isLocked = false,
  disabled = false,
  showPresetLoader = true,
  showStationAdder = true,
  showAgentSetup = true,
  className,
  firstProductFlags = {},
  onToggleFirstProductQA,
  aiContext,
}: PipelineFlowEditorProps) => {
  const presetSelectId = useId();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [undo, setUndo] = useState<{
    stations: PipelineStation[];
    flags: Record<string, boolean>;
    expected: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const locked = disabled || isLocked;
  const fingerprint = stateKey(stations, firstProductFlags);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const applyFlags = (next: Record<string, boolean>) => {
    for (const id of new Set([
      ...Object.keys(firstProductFlags),
      ...Object.keys(next),
    ]))
      if (!!firstProductFlags[id] !== !!next[id]) onToggleFirstProductQA?.(id);
  };
  const handleChange = (next: PipelineStation[], flags = firstProductFlags) => {
    if (locked) return;
    const normalized = next.map((s, i) => ({ ...s, position: i + 1 }));
    setUndo({
      stations,
      flags: { ...firstProductFlags },
      expected: stateKey(normalized, flags),
    });
    applyFlags(flags);
    onStationsChange(normalized);
    setNotice("הרצף עודכן בטיוטה. יש לשמור כדי להחיל את השינויים.");
  };
  const handleAdd = (station: Station) => {
    if (
      locked ||
      !station.is_active ||
      stations.some((s) => s.id === station.id) ||
      stations.length >= MAX_WORKFLOW_STEPS
    )
      return;
    const selectedIndex = stations.findIndex((s) => s.id === selected);
    const index = selectedIndex >= 0 ? selectedIndex + 1 : stations.length;
    const next = [...stations];
    next.splice(index, 0, { id: station.id, station, position: index + 1 });
    handleChange(next);
    setSelected(station.id);
  };
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (locked || !over || active.id === over.id) return;
    const from = stations.findIndex((s) => s.id === active.id),
      to = stations.findIndex((s) => s.id === over.id);
    if (from >= 0 && to >= 0) handleChange(arrayMove(stations, from, to));
  };
  const handleApplyPlan = (plan: WorkflowPlan) => {
    const next = plan.steps.map((s, i) => ({
      id: s.stationId,
      station: availableStations.find((a) => a.id === s.stationId)!,
      position: i + 1,
    }));
    if (next.some((s) => !s.station?.is_active)) {
      setNotice("רשימת התחנות השתנתה. רעננו לפני החלת ההצעה.");
      return;
    }
    handleChange(
      next,
      Object.fromEntries(
        plan.steps
          .filter((s) => s.requiresFirstProductApproval)
          .map((s) => [s.stationId, true]),
      ),
    );
  };
  const active = availableStations.filter((s) => s.is_active);
  const filtered = active.filter(
    (s) =>
      (!type || s.station_type === type) &&
      `${s.name} ${s.code}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const selectedNode = stations.find((s) => s.id === selected);
  return (
    <div className={cn("min-w-0 space-y-4", className)} dir="rtl">
      {isLocked && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-sm"
        >
          <LockKeyhole className="h-4 w-4" />
          התהליך נעול כי הייצור התחיל. אפשר לצפות בתחנות ובנקודות האישור.
        </p>
      )}
      {!locked && onToggleFirstProductQA && (
        <WorkflowAiPanel
          stations={stations}
          flags={firstProductFlags}
          context={aiContext}
          onApply={handleApplyPlan}
        />
      )}
      {showPresetLoader && presets.length > 0 && !locked && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor={presetSelectId}>
            התחלה מתבנית
          </label>
          <select
            id={presetSelectId}
            value={selectedPresetId}
            onChange={(e) => onPresetSelect?.(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">בחרו תבנית קיימת</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.steps.length} תחנות
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            disabled={!selectedPresetId}
            onClick={onLoadPreset}
          >
            טעינת תבנית
          </Button>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">מפת תהליך הייצור</h4>
            <Badge variant="secondary">{stations.length} תחנות</Badge>
          </div>
          {!locked && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!undo || undo.expected !== fingerprint}
              onClick={() => {
                if (undo) {
                  applyFlags(undo.flags);
                  onStationsChange(undo.stations);
                  setUndo(null);
                  setNotice("השינוי האחרון בוטל.");
                }
              }}
            >
              <Undo2 className="ml-1 h-4 w-4" />
              ביטול שינוי
            </Button>
          )}
        </div>
        <div
          className="max-w-full overflow-x-auto p-4 md:p-6"
          tabIndex={0}
          aria-label="מפת תחנות, ניתן לגלול אופקית"
        >
          {stations.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center text-center">
              <Workflow className="mb-3 h-8 w-8 text-primary/60" />
              <p className="font-medium">כל תהליך מתחיל בתחנה אחת</p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                בחרו תחנה מהספרייה למטה, טענו תבנית או תארו לעוזר AI מה מייצרים.
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={stations.map((s) => s.id)}
                strategy={rectSortingStrategy}
                disabled={locked}
              >
                <ol className="flex flex-col gap-3 md:w-max md:flex-row md:items-center">
                  {stations.map((item, i) => (
                    <StationNode
                      key={item.id}
                      item={item}
                      index={i}
                      total={stations.length}
                      selected={selected === item.id}
                      disabled={locked}
                      approval={!!firstProductFlags[item.id]}
                      canApprove={!!onToggleFirstProductQA}
                      onSelect={() =>
                        setSelected(selected === item.id ? null : item.id)
                      }
                      onApprove={() => {
                        if (!locked)
                          handleChange(stations, {
                            ...firstProductFlags,
                            [item.id]: !firstProductFlags[item.id],
                          });
                      }}
                      onMove={(offset) =>
                        handleChange(arrayMove(stations, i, i + offset))
                      }
                      onRemove={() => {
                        const flags = { ...firstProductFlags };
                        delete flags[item.id];
                        handleChange(
                          stations.filter((s) => s.id !== item.id),
                          flags,
                        );
                        if (selected === item.id) setSelected(null);
                      }}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}
        </div>
        {stations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <Flag className="h-4 w-4" />
            <span>
              התוצר נספר בתחנה האחרונה:{" "}
              <strong className="text-foreground">
                {stations[stations.length - 1].station.name}
              </strong>
            </span>
            <span className="mr-auto">
              {stations.filter((s) => firstProductFlags[s.id]).length} נקודות
              אישור מוצר ראשון
            </span>
          </div>
        )}
      </div>
      {showAgentSetup && selectedNode && (
        <WorkflowAgentSetup
          stationName={selectedNode.station.name}
          value={selectedNode.agent_config}
          disabled={locked}
          onChange={(value) =>
            handleChange(
              stations.map((s) =>
                s.id === selectedNode.id ? { ...s, agent_config: value } : s,
              ),
            )
          }
        />
      )}
      {showAgentSetup && !selectedNode && stations.length > 0 && !locked && (
        <p className="text-xs text-muted-foreground">
          בחרו תחנה במפה כדי להגדיר לה סוכן AI.
        </p>
      )}
      {showStationAdder && !locked && (
        <section className="space-y-3" aria-label="ספריית תחנות">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">הוספת תחנה לתהליך</h4>
            <p className="text-xs text-muted-foreground">
              {selectedNode
                ? `התחנה תתווסף אחרי ${selectedNode.station.name}`
                : "התחנה תתווסף בסוף הרצף"}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="חיפוש תחנה"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש לפי שם או קוד תחנה"
                className="pr-9"
              />
            </div>
            <select
              aria-label="סינון סוג תחנה"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">כל סוגי התחנות</option>
              {[...new Set(active.map((s) => s.station_type))]
                .sort()
                .map((t) => (
                  <option key={t} value={t}>
                    {stationTypes[t] ?? t}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((s) => {
              const added = stations.some((n) => n.id === s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={added || stations.length >= MAX_WORKFLOW_STEPS}
                  onClick={() => handleAdd(s)}
                  aria-label={`הוספת תחנה ${s.name}`}
                  className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-right transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-45"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.code} ·{" "}
                      {stationTypes[s.station_type] ?? s.station_type}
                    </span>
                  </span>
                  {added ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </button>
              );
            })}
          </div>
          {!filtered.length && (
            <p className="py-3 text-sm text-muted-foreground">
              לא נמצאו תחנות פעילות שמתאימות לחיפוש.
            </p>
          )}
          {stations.length >= MAX_WORKFLOW_STEPS && (
            <p className="text-xs text-muted-foreground">
              ניתן להוסיף עד {MAX_WORKFLOW_STEPS} תחנות לתהליך.
            </p>
          )}
        </section>
      )}
      <p className="text-xs text-muted-foreground" role="status">
        {notice ||
          (locked
            ? "תצוגת הרצף השמור"
            : "גררו את ידית התחנה או השתמשו בחצים לשינוי הסדר. השינויים נשמרים רק בשמירה.")}
      </p>
    </div>
  );
};
