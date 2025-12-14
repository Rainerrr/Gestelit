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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-2 py-2 shadow-sm sm:gap-3 sm:rounded-lg sm:px-3 sm:py-2"
    >
      <div className="flex w-12 flex-col items-center gap-1 pt-1 sm:w-14 sm:gap-2">
        <span className="text-base font-semibold text-slate-900 sm:text-lg">
          {item.order_index + 1}
        </span>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-500 transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-primary sm:h-9 sm:w-9"
          aria-label="גרירה לשינוי סדר"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
        <div className="space-y-1">
          <label className="text-xs text-slate-600" htmlFor={`he-${item.id}`}>
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
            className="h-10 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-600" htmlFor={`ru-${item.id}`}>
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
            className="h-10 text-sm"
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
        className="self-start h-8 px-2 text-rose-600 hover:text-rose-700 disabled:opacity-60 sm:h-9"
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeList, setActiveList] = useState<ChecklistKind | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  useEffect(() => {
    if (!open) return;
    setActiveTab("start");
    setError(null);
    setSuccess(null);
    setStartItems(normalizeInitialItems(station.start_checklist));
    setEndItems(normalizeInitialItems(station.end_checklist));
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
    setActiveId(String(event.active.id));
    setActiveList(kind ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !activeList) {
      setActiveId(null);
      setActiveList(null);
      return;
    }
    const kind = active.data.current?.kind as ChecklistKind | undefined;
    const overKind = over.data.current?.kind as ChecklistKind | undefined;
    if (kind !== overKind || !kind) {
      setActiveId(null);
      setActiveList(null);
      return;
    }
    const updater = kind === "start" ? setStartItems : setEndItems;
    updater((prev) => reorderItems(prev, String(active.id), String(over.id)));
    setActiveId(null);
    setActiveList(null);
  };

  const resetStates = () => {
    setError(null);
    setSuccess(null);
    setActiveId(null);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "שמירת הצ'קליסט נכשלה.";
      setError(message || "שמירת הצ'קליסט נכשלה.");
    }
  };

  const renderTab = (kind: ChecklistKind, items: StationChecklistItem[]) => (
    <div className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="space-y-1 text-right">
            <CardTitle className="text-base">
              {kind === "start" ? "פריטי פתיחה" : "פריטי סגירה"}
            </CardTitle>
            <p className="text-xs text-slate-500">
              גררו לשינוי סדר, סמנו סעיפים חובה והוסיפו תרגומים בעברית ורוסית.
            </p>
          </div>
          <Badge variant="secondary" className="whitespace-nowrap">
            {items.length} פריטים
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2 sm:space-y-3">
          {items.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
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
            className="mt-1 w-full justify-center"
          >
            <Plus className="mr-2 h-4 w-4" />
            הוספת פריט
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-w-4xl text-right max-h-[90vh] overflow-hidden p-0 sm:max-h-[80vh] sm:p-6"
      >
        <DialogHeader className="px-4 pt-4 sm:px-0 sm:pt-0">
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>צ׳קליסטים לתחנה {station.name}</span>
            <Badge variant="outline" className="flex items-center gap-1">
              <ListChecks className="h-4 w-4" />
              {station.code}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 px-4 sm:px-0">
          {error ? (
            <Alert
              variant="destructive"
              className="border-red-200 bg-red-50 text-right text-sm text-red-700"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {success ? (
            <Alert className="border-emerald-200 bg-emerald-50 text-right text-sm text-emerald-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{success}</AlertDescription>
              </div>
            </Alert>
          ) : null}

          <div className="flex items-center gap-2">
            {tabMeta.map((tab) => (
              <Button
                key={tab.key}
                type="button"
                variant={activeTab === tab.key ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab(tab.key)}
                aria-label={tab.label}
                className="flex items-center gap-2"
              >
                {tab.label}
                <Badge
                  variant={activeTab === tab.key ? "secondary" : "outline"}
                  className="text-xs"
                >
                  {tab.count}
                </Badge>
              </Button>
            ))}
          </div>

          {activeTab === "start" ? renderTab("start", startItems) : renderTab("end", endItems)}
        </div>

        <DialogFooter className="justify-start px-4 pb-4 pt-2 sm:px-0 sm:pb-0">
          <Button onClick={() => void handleSubmit()} disabled={loading}>
            {loading ? "שומר..." : "שמור צ'קליסטים"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


