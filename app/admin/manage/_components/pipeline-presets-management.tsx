"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PipelinePresetWithSteps, Station } from "@/lib/types";
import { Pencil, Trash2, Settings2, ArrowLeft } from "lucide-react";
import { PipelinePresetFormDialog } from "./pipeline-preset-form-dialog";

type PipelinePresetsManagementProps = {
  presets: PipelinePresetWithSteps[];
  isLoading: boolean;
  onAdd: (payload: { name: string; description?: string | null; is_active?: boolean }) => Promise<void>;
  onEdit: (id: string, payload: { name?: string; description?: string | null; is_active?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEditSteps: (presetId: string) => void;
  onCheckInUse: (presetId: string) => Promise<boolean>;
  onRefresh?: () => Promise<void>;
};

export const PipelinePresetsManagement = ({
  presets,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
  onEditSteps,
  onCheckInUse,
  onRefresh,
}: PipelinePresetsManagementProps) => {
  const [editingPreset, setEditingPreset] = useState<PipelinePresetWithSteps | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null);
  const [deletePresetInUse, setDeletePresetInUse] = useState(false);
  const [isCheckingInUse, setIsCheckingInUse] = useState(false);

  const sortedPresets = useMemo(
    () => [...presets].sort((a, b) => a.name.localeCompare(b.name, "he")),
    [presets],
  );

  const handleAdd = async (payload: { name: string; description?: string | null; is_active?: boolean }) => {
    setIsSubmitting(true);
    try {
      await onAdd(payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (payload: { name?: string; description?: string | null; is_active?: boolean }) => {
    if (!editingPreset) return;
    setIsSubmitting(true);
    try {
      await onEdit(editingPreset.id, payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (presetId: string) => {
    setIsSubmitting(true);
    setDeletePresetInUse(false);
    try {
      const inUse = await onCheckInUse(presetId);
      if (inUse) {
        setDeletePresetInUse(true);
        setIsSubmitting(false);
        return;
      }
      await onDelete(presetId);
      setDeletePresetId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDialogOpenChange = async (open: boolean, presetId?: string) => {
    if (open && presetId) {
      setIsCheckingInUse(true);
      try {
        const inUse = await onCheckInUse(presetId);
        setDeletePresetInUse(inUse);
      } catch {
        setDeletePresetInUse(false);
      } finally {
        setIsCheckingInUse(false);
      }
    } else {
      setDeletePresetInUse(false);
    }
    setDeletePresetId(open ? (presetId ?? null) : null);
  };

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-base font-semibold text-foreground">תבניות צינור</h3>
          <p className="text-sm text-muted-foreground">ניהול תבניות צינור ייצור לשימוש חוזר.</p>
        </div>
        <PipelinePresetFormDialog
          mode="create"
          onSubmit={handleAdd}
          trigger={
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
              הוסף תבנית
            </Button>
          }
          loading={isSubmitting}
        />
      </div>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">טוען תבניות...</p>
        </div>
      ) : sortedPresets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <p className="text-sm">אין תבניות צינור להצגה.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  שם
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  שלבים
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  מצב
                </th>
                <th className="hidden lg:table-cell px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedPresets.map((preset) => (
                <tr key={preset.id} className="group hover:bg-accent transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-medium text-foreground block truncate">{preset.name}</span>
                        {preset.description && (
                          <span className="text-xs text-muted-foreground block truncate max-w-[200px]">
                            {preset.description}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 lg:hidden">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEditSteps(preset.id)}
                          aria-label="עריכת שלבים"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <PipelinePresetFormDialog
                          mode="edit"
                          preset={preset}
                          onSubmit={handleEdit}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingPreset(preset)}
                              aria-label="עריכת תבנית"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                          open={editingPreset?.id === preset.id}
                          onOpenChange={async (open) => {
                            setEditingPreset(open ? preset : null);
                            if (!open && onRefresh) {
                              await onRefresh();
                            }
                          }}
                          loading={isSubmitting}
                        />
                        <Dialog
                          open={deletePresetId === preset.id}
                          onOpenChange={(open) => handleDeleteDialogOpenChange(open, preset.id)}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isSubmitting}
                              aria-label="מחיקת תבנית"
                              className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent dir="rtl" className="border-border bg-card">
                            <DialogHeader>
                              <DialogTitle className="text-foreground">
                                האם למחוק את התבנית?
                              </DialogTitle>
                              <DialogDescription className="text-muted-foreground">
                                הפעולה תמחק את התבנית לחלוטין. לא ניתן לבטל.
                              </DialogDescription>
                            </DialogHeader>
                            {isCheckingInUse ? (
                              <p className="text-sm text-muted-foreground">בודק שימוש...</p>
                            ) : deletePresetInUse ? (
                              <Alert
                                variant="destructive"
                                className="border-primary/30 bg-primary/10 text-right text-sm text-primary"
                              >
                                <AlertDescription>
                                  לא ניתן למחוק תבנית שבשימוש בעבודות פעילות.
                                </AlertDescription>
                              </Alert>
                            ) : null}
                            <DialogFooter className="justify-start">
                              <Button
                                onClick={() => void handleDelete(preset.id)}
                                disabled={isSubmitting || deletePresetInUse || isCheckingInUse}
                                className="bg-red-500 text-white hover:bg-red-600"
                              >
                                מחיקה סופית
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => setDeletePresetId(null)}
                                disabled={isSubmitting}
                                className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
                              >
                                ביטול
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground/80">{preset.steps.length}</span>
                      {preset.steps.length > 0 && (
                        <div className="hidden md:flex items-center gap-1 flex-wrap max-w-[350px]">
                          {preset.steps.slice(0, 4).map((step, idx) => (
                            <div key={step.id} className="flex items-center gap-1">
                              <Badge
                                variant="secondary"
                                className="text-xs bg-secondary/50 text-foreground/70 border-input"
                              >
                                {idx + 1}. {step.station?.name ?? "—"}
                              </Badge>
                              {idx < Math.min(preset.steps.length - 1, 3) && (
                                <ArrowLeft className="h-3 w-3 text-muted-foreground/50" />
                              )}
                            </div>
                          ))}
                          {preset.steps.length > 4 && (
                            <span className="text-xs text-muted-foreground">
                              +{preset.steps.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {preset.is_active ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        פעיל
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-500/10 border border-zinc-500/30 text-zinc-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                        לא פעיל
                      </span>
                    )}
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEditSteps(preset.id)}
                        aria-label="עריכת שלבים"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <PipelinePresetFormDialog
                        mode="edit"
                        preset={preset}
                        onSubmit={handleEdit}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingPreset(preset)}
                            aria-label="עריכת תבנית"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                        open={editingPreset?.id === preset.id}
                        onOpenChange={async (open) => {
                          setEditingPreset(open ? preset : null);
                          if (!open && onRefresh) {
                            await onRefresh();
                          }
                        }}
                        loading={isSubmitting}
                      />
                      <Dialog
                        open={deletePresetId === preset.id}
                        onOpenChange={(open) => handleDeleteDialogOpenChange(open, preset.id)}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isSubmitting}
                            aria-label="מחיקת תבנית"
                            className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent dir="rtl" className="border-border bg-card">
                          <DialogHeader>
                            <DialogTitle className="text-foreground">
                              האם למחוק את התבנית?
                            </DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                              הפעולה תמחק את התבנית לחלוטין. לא ניתן לבטל.
                            </DialogDescription>
                          </DialogHeader>
                          {isCheckingInUse ? (
                            <p className="text-sm text-muted-foreground">בודק שימוש...</p>
                          ) : deletePresetInUse ? (
                            <Alert
                              variant="destructive"
                              className="border-primary/30 bg-primary/10 text-right text-sm text-primary"
                            >
                              <AlertDescription>
                                לא ניתן למחוק תבנית שבשימוש בעבודות פעילות.
                              </AlertDescription>
                            </Alert>
                          ) : null}
                          <DialogFooter className="justify-start">
                            <Button
                              onClick={() => void handleDelete(preset.id)}
                              disabled={isSubmitting || deletePresetInUse || isCheckingInUse}
                              className="bg-red-500 text-white hover:bg-red-600"
                            >
                              מחיקה סופית
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => setDeletePresetId(null)}
                              disabled={isSubmitting}
                              className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
                            >
                              ביטול
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
