"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Station, StationChecklistItem } from "@/lib/types";
import {
  CheckCircle2,
  GripVertical,
  ListChecks,
  Plus,
  Trash2,
} from "lucide-react";

type SortableRowProps = {
  kind: ChecklistKind;
  item: StationChecklistItem;
  listLength: number;
  loading: boolean;
  onChangeLabel: (kind: ChecklistKind, id: string, key: "label_he" | "label_ru", value: string) => void;
  onRemove: (kind: ChecklistKind, id: string) => void;
};

const SortableRow = ({
  kind,
  item,
  listLength,
  loading,
  onChangeLabel,
  onRemove,
}: SortableRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
    data: { kind },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-2 shadow-sm sm:gap-3 sm:rounded-lg sm:px-3 sm:py-2"
    >
      <div className="flex w-12 flex-col items-center gap-1 pt-1 sm:w-14 sm:gap-2">
        <span className="text-base font-semibold text-zinc-100 sm:text-lg">
          {item.order_index + 1}
        </span>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-zinc-600 text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 sm:h-9 sm:w-9"
          aria-label="גרירה לשינוי סדר"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
        <div className="space-y-1">
          <label className="text-xs text-zinc-400" htmlFor={`he-${item.id}`}>
            תווית בעברית
          </label>
          <Input
            id={`he-${item.id}`}
            aria-label="תווית בעברית"
            value={item.label_he}
            onChange={(event) =>
              onChangeLabel(kind, item.id, "label_he", event.target.value)
            }
            disabled={loading}
            placeholder="לדוגמה: בדיקת ניקיון"
            className="h-10 text-sm border-zinc-600 bg-zinc-700/80 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-400" htmlFor={`ru-${item.id}`}>
            תווית ברוסית
          </label>
          <Input
            id={`ru-${item.id}`}
            aria-label="תווית ברוסית"
            value={item.label_ru}
            onChange={(event) =>
              onChangeLabel(kind, item.id, "label_ru", event.target.value)
            }
            disabled={loading}
            placeholder="Например: проверка чистоты"
            className="h-10 text-sm border-zinc-600 bg-zinc-700/80 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onRemove(kind, item.id)}
        disabled={loading || listLength <= 1}
        aria-label="מחיקת פריט"
        className="self-start h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-60 sm:h-9"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};

type ChecklistKind = "start" | "end";

type StationChecklistDialogProps = {
  station: Station;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    stationId: string,
    payload: {
      start_checklist: StationChecklistItem[];
      end_checklist: StationChecklistItem[];
    },
  ) => Promise<void>;
  loading?: boolean;
};

const createItem = (orderIndex: number): StationChecklistItem => {
  const generateId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `check-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  return {
    id: generateId(),
    order_index: orderIndex,
    label_he: "",
    label_ru: "",
    is_required: true,
  };
};

const normalizeInitialItems = (
  items?: StationChecklistItem[] | null,
): StationChecklistItem[] => {
  if (!items || items.length === 0) {
    return [createItem(0)];
  }

  return items
    .map((item, index) => ({
      id: item.id?.trim() || createItem(index).id,
      order_index: index,
      label_he: item.label_he ?? "",
      label_ru: item.label_ru ?? "",
      is_required: true,
    }))
    .sort((a, b) => a.order_index - b.order_index)
    .map((item, index) => ({ ...item, order_index: index }));
};

const reorderItems = (items: StationChecklistItem[], sourceId: string, targetId: string) => {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next.map((item, index) => ({ ...item, order_index: index }));
};

export const StationChecklistDialog = ({
  station,
  open,
  onOpenChange,
  onSubmit,
  loading = false,
}: StationChecklistDialogProps) => {
  const [activeTab, setActiveTab] = useState<ChecklistKind>("start");
  const [startItems, setStartItems] = useState<StationChecklistItem[]>(() =>
    normalizeInitialItems(station.start_checklist),
  );
  const [endItems, setEndItems] = useState<StationChecklistItem[]>(() =>
    normalizeInitialItems(station.end_checklist),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeList, setActiveList] = useState<ChecklistKind | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  useEffect(() => {
    if (!open) return;
    const nextStart = normalizeInitialItems(station.start_checklist);
    const nextEnd = normalizeInitialItems(station.end_checklist);
    const timer = window.setTimeout(() => {
      setActiveTab("start");
      setError(null);
      setSuccess(null);
      setStartItems(nextStart);
      setEndItems(nextEnd);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, station]);

  const tabMeta = useMemo(
    () => [
      { key: "start" as const, label: "צ'קליסט פתיחה", count: startItems.length },
      { key: "end" as const, label: "צ'קליסט סגירה", count: endItems.length },
    ],
    [startItems.length, endItems.length],
  );

  const handleAddItem = (kind: ChecklistKind) => {
    const updater =
      kind === "start" ? setStartItems : setEndItems;
    updater((prev) => [...prev, createItem(prev.length)].map((item, index) => ({ ...item, order_index: index })));
  };

  const handleRemoveItem = (kind: ChecklistKind, id: string) => {
    const updater =
      kind === "start" ? setStartItems : setEndItems;
    updater((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((item) => item.id !== id);
      return next.map((item, index) => ({ ...item, order_index: index }));
    });
  };

  const handleUpdateItem = (
    kind: ChecklistKind,
    id: string,
    key: "label_he" | "label_ru",
    value: string,
  ) => {
    const updater =
      kind === "start" ? setStartItems : setEndItems;
    updater((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, [key]: value }
          : item,
      ),
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    const kind = event.active.data.current?.kind as ChecklistKind | undefined;
    setActiveList(kind ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !activeList) {
      setActiveList(null);
      return;
    }
    const kind = active.data.current?.kind as ChecklistKind | undefined;
    const overKind = over.data.current?.kind as ChecklistKind | undefined;
    if (kind !== overKind || !kind) {
      setActiveList(null);
      return;
    }
    const updater = kind === "start" ? setStartItems : setEndItems;
    updater((prev) => reorderItems(prev, String(active.id), String(over.id)));
    setActiveList(null);
  };

  const resetStates = () => {
    setError(null);
    setSuccess(null);
    setActiveList(null);
  };

  const validateLists = (
    startList: StationChecklistItem[],
    endList: StationChecklistItem[],
  ) => {
    if (startList.length === 0) {
      setActiveTab("start");
      setError("יש להשאיר לפחות פריט אחד בצ'קליסט פתיחה.");
      return false;
    }
    if (endList.length === 0) {
      setActiveTab("end");
      setError("יש להשאיר לפחות פריט אחד בצ'קליסט סגירה.");
      return false;
    }
    const hasEmptyStart = startList.some(
      (item) => !item.label_he.trim() || !item.label_ru.trim(),
    );
    const hasEmptyEnd = endList.some(
      (item) => !item.label_he.trim() || !item.label_ru.trim(),
    );
    if (hasEmptyStart || hasEmptyEnd) {
      setError("יש למלא תוויות בעברית וברוסית לכל הפריטים.");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    const trimmedStart = startItems.map((item, index) => ({
      ...item,
      order_index: index,
      label_he: item.label_he.trim(),
      label_ru: item.label_ru.trim(),
      is_required: true,
    }));
    const trimmedEnd = endItems.map((item, index) => ({
      ...item,
      order_index: index,
      label_he: item.label_he.trim(),
      label_ru: item.label_ru.trim(),
      is_required: true,
    }));

    resetStates();

    if (!validateLists(trimmedStart, trimmedEnd)) {
      return;
    }

    try {
      await onSubmit(station.id, {
        start_checklist: trimmedStart,
        end_checklist: trimmedEnd,
      });
      setSuccess("הצ'קליסט נשמר בהצלחה.");
      setError(null);
      // Keep dialog open to show success message
    } catch (err) {
      const message = err instanceof Error ? err.message : "שמירת הצ'קליסט נכשלה.";
      setError(message || "שמירת הצ'קליסט נכשלה.");
      setSuccess(null);
    }
  };

  const renderTab = (kind: ChecklistKind, items: StationChecklistItem[]) => (
    <div className="space-y-3">
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm overflow-hidden">
        <div className="flex flex-row items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800/60">
          <div className="space-y-1 text-right">
            <h4 className="text-base font-semibold text-zinc-100">
              {kind === "start" ? "פריטי פתיחה" : "פריטי סגירה"}
            </h4>
            <p className="text-xs text-zinc-500">
              גררו לשינוי סדר, סמנו סעיפים חובה והוסיפו תרגומים בעברית ורוסית.
            </p>
          </div>
          <Badge variant="secondary" className="whitespace-nowrap bg-zinc-800 text-zinc-300 border-zinc-700">
            {items.length} פריטים
          </Badge>
        </div>
        <div className="p-4 space-y-2 sm:space-y-3">
          {items.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-700 bg-zinc-800/30 px-3 py-2 text-sm text-zinc-500">
              לא הוגדרו פריטים. הוסיפו פריט חדש כדי להתחיל.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 pr-1 sm:space-y-3">
                  {items.map((item) => (
                    <SortableRow
                      key={item.id}
                      kind={kind}
                      item={item}
                      listLength={items.length}
                      loading={loading}
                      onChangeLabel={handleUpdateItem}
                      onRemove={handleRemoveItem}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleAddItem(kind)}
            disabled={loading}
            className="mt-1 w-full justify-center border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
          >
            <Plus className="mr-2 h-4 w-4" />
            הוספת פריט
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-w-4xl text-right max-h-[90vh] overflow-hidden p-0 sm:max-h-[80vh] sm:p-6 border-zinc-800 bg-zinc-900"
      >
        <DialogHeader className="px-4 pt-4 sm:px-0 sm:pt-0">
          <DialogTitle className="flex items-center justify-between gap-2 text-zinc-100">
            <span>צ׳קליסטים לתחנה {station.name}</span>
            <Badge variant="outline" className="flex items-center gap-1 border-zinc-700 text-zinc-400">
              <ListChecks className="h-4 w-4" />
              {station.code}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 px-4 sm:px-0 overflow-y-auto max-h-[calc(90vh-180px)] sm:max-h-[calc(80vh-160px)]">
          {error ? (
            <Alert
              variant="destructive"
              className="border-red-500/30 bg-red-500/10 text-right text-sm text-red-400"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {success ? (
            <Alert className="border-emerald-500/30 bg-emerald-500/10 text-right text-sm text-emerald-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <AlertDescription>{success}</AlertDescription>
              </div>
            </Alert>
          ) : null}

          <div className="flex items-center gap-2">
            {tabMeta.map((tab) => (
              <Button
                key={tab.key}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab(tab.key)}
                aria-label={tab.label}
                className={`flex items-center gap-2 ${
                  activeTab === tab.key
                    ? "bg-amber-500 text-zinc-900 border-amber-500 hover:bg-amber-400 hover:border-amber-400 font-medium"
                    : "border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
                }`}
              >
                {tab.label}
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    activeTab === tab.key
                      ? "border-amber-600/50 bg-amber-600/20 text-amber-100"
                      : "border-zinc-600 text-zinc-400"
                  }`}
                >
                  {tab.count}
                </Badge>
              </Button>
            ))}
          </div>

          {activeTab === "start" ? renderTab("start", startItems) : renderTab("end", endItems)}
        </div>

        <DialogFooter className="justify-start px-4 pb-4 pt-2 sm:px-0 sm:pb-0">
          <Button onClick={() => void handleSubmit()} disabled={loading} className="bg-amber-500 text-zinc-900 hover:bg-amber-400 font-medium">
            {loading ? "שומר..." : "שמור צ'קליסטים"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

