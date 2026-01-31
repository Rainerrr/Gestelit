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
import type { PipelinePresetWithSteps } from "@/lib/types";
import { Pencil, Trash2, ArrowLeft } from "lucide-react";

type PipelinePresetsManagementProps = {
  presets: PipelinePresetWithSteps[];
  isLoading: boolean;
  onEdit: (preset: PipelinePresetWithSteps) => void;
  onDelete: (id: string) => Promise<void>;
  onCheckInUse: (presetId: string) => Promise<boolean>;
  onAdd: () => void;
};

export const PipelinePresetsManagement = ({
  presets,
  isLoading,
  onEdit,
  onDelete,
  onCheckInUse,
  onAdd,
}: PipelinePresetsManagementProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null);
  const [deletePresetInUse, setDeletePresetInUse] = useState(false);
  const [isCheckingInUse, setIsCheckingInUse] = useState(false);

  const sortedPresets = useMemo(
    () => [...presets].sort((a, b) => a.name.localeCompare(b.name, "he")),
    [presets],
  );

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
          <h3 className="text-base font-semibold text-foreground">תבניות תהליך</h3>
          <p className="text-sm text-muted-foreground">ניהול תבניות תהליך ייצור לשימוש חוזר.</p>
        </div>
        <Button
          onClick={onAdd}
          className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
        >
          הוסף תבנית
        </Button>
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
          <p className="text-sm">אין תבניות תהליך להצגה.</p>
        </div>
      ) : (
        <>
        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-border">
          {sortedPresets.map((preset) => (
            <div key={preset.id} className="p-4 space-y-3">
              <span className="font-medium text-foreground">{preset.name}</span>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">{preset.steps.length} שלבים</span>
                {preset.steps.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
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
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(preset)}
                  aria-label="עריכת תבנית"
                  className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground hover:bg-muted border-input"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Dialog
                  open={deletePresetId === preset.id}
                  onOpenChange={(open) => handleDeleteDialogOpenChange(open, preset.id)}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      aria-label="מחיקת תבנית"
                      className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-red-400 hover:bg-red-500/10 border-input"
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
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
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
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedPresets.map((preset) => (
                <tr key={preset.id} className="group hover:bg-accent transition-colors">
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <span className="font-medium text-foreground block truncate">{preset.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground/80">{preset.steps.length}</span>
                      {preset.steps.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap max-w-[350px]">
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
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(preset)}
                        aria-label="עריכת תבנית"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
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
        </>
      )}
    </div>
  );
};
