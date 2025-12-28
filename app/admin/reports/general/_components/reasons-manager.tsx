"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, GripVertical, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ReportReason } from "@/lib/types";
import {
  createReportReasonAdminApi,
  updateReportReasonAdminApi,
  deleteReportReasonAdminApi,
} from "@/lib/api/admin-management";

type ReasonsManagerProps = {
  reasons: ReportReason[];
  onUpdate: () => void;
};

export const ReasonsManager = ({ reasons, onUpdate }: ReasonsManagerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newReason, setNewReason] = useState({ label_he: "", label_ru: "" });
  const [editReason, setEditReason] = useState({ label_he: "", label_ru: "" });

  const handleCreate = async () => {
    if (!newReason.label_he.trim()) return;
    setIsSubmitting(true);
    try {
      await createReportReasonAdminApi({
        label_he: newReason.label_he.trim(),
        label_ru: newReason.label_ru.trim() || undefined,
      });
      setNewReason({ label_he: "", label_ru: "" });
      onUpdate();
    } catch (err) {
      console.error("Failed to create reason:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editReason.label_he.trim()) return;
    setIsSubmitting(true);
    try {
      await updateReportReasonAdminApi(id, {
        label_he: editReason.label_he.trim(),
        label_ru: editReason.label_ru.trim() || null,
      });
      setEditingId(null);
      onUpdate();
    } catch (err) {
      console.error("Failed to update reason:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("האם למחוק סיבה זו?")) return;
    setIsSubmitting(true);
    try {
      await deleteReportReasonAdminApi(id);
      onUpdate();
    } catch (err) {
      console.error("Failed to delete reason:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (reason: ReportReason) => {
    setIsSubmitting(true);
    try {
      await updateReportReasonAdminApi(reason.id, {
        is_active: !reason.is_active,
      });
      onUpdate();
    } catch (err) {
      console.error("Failed to toggle reason:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (reason: ReportReason) => {
    setEditingId(reason.id);
    setEditReason({
      label_he: reason.label_he,
      label_ru: reason.label_ru ?? "",
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditReason({ label_he: "", label_ru: "" });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <Plus className="h-4 w-4" />
        ניהול סיבות
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ניהול סיבות דיווח</DialogTitle>
            <DialogDescription>
              הוסף, ערוך או מחק סיבות לדיווחים כלליים
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Add new reason */}
            <div className="space-y-2 p-4 rounded-lg border border-dashed border-primary/30 bg-primary/5">
              <p className="text-sm font-medium text-foreground">הוסף סיבה חדשה</p>
              <div className="flex gap-2">
                <Input
                  placeholder="תווית בעברית *"
                  value={newReason.label_he}
                  onChange={(e) =>
                    setNewReason((prev) => ({ ...prev, label_he: e.target.value }))
                  }
                  className="flex-1"
                  dir="rtl"
                />
                <Input
                  placeholder="תווית ברוסית"
                  value={newReason.label_ru}
                  onChange={(e) =>
                    setNewReason((prev) => ({ ...prev, label_ru: e.target.value }))
                  }
                  className="flex-1"
                  dir="ltr"
                />
                <Button
                  size="sm"
                  onClick={() => void handleCreate()}
                  disabled={isSubmitting || !newReason.label_he.trim()}
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* List of reasons */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {reasons.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  אין סיבות מוגדרות
                </p>
              ) : (
                reasons.map((reason) => (
                  <div
                    key={reason.id}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg border transition-colors",
                      reason.is_active
                        ? "border-border bg-card/50"
                        : "border-border/40 bg-muted/30 opacity-60"
                    )}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0 cursor-grab" />

                    {editingId === reason.id ? (
                      <>
                        <Input
                          value={editReason.label_he}
                          onChange={(e) =>
                            setEditReason((prev) => ({
                              ...prev,
                              label_he: e.target.value,
                            }))
                          }
                          className="flex-1 h-8"
                          dir="rtl"
                        />
                        <Input
                          value={editReason.label_ru}
                          onChange={(e) =>
                            setEditReason((prev) => ({
                              ...prev,
                              label_ru: e.target.value,
                            }))
                          }
                          className="flex-1 h-8"
                          dir="ltr"
                          placeholder="רוסית"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleUpdate(reason.id)}
                          disabled={isSubmitting}
                          className="h-8 w-8 p-0 text-emerald-500"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEditing}
                          className="h-8 w-8 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {reason.label_he}
                          </p>
                          {reason.label_ru ? (
                            <p className="text-xs text-muted-foreground truncate" dir="ltr">
                              {reason.label_ru}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditing(reason)}
                          className="h-8 w-8 p-0"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleToggleActive(reason)}
                          disabled={isSubmitting}
                          className={cn(
                            "h-8 w-8 p-0",
                            reason.is_active
                              ? "text-muted-foreground"
                              : "text-emerald-500"
                          )}
                          title={reason.is_active ? "השבת" : "הפעל"}
                        >
                          {reason.is_active ? (
                            <X className="h-4 w-4" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDelete(reason.id)}
                          disabled={isSubmitting}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
