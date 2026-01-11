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
import type { ProductionLineWithStations, Station } from "@/lib/types";
import { Pencil, Trash2, Settings2 } from "lucide-react";
import { ProductionLineFormDialog } from "./production-line-form-dialog";

type ProductionLinesManagementProps = {
  lines: ProductionLineWithStations[];
  isLoading: boolean;
  onAdd: (payload: { name: string; code?: string | null; is_active?: boolean }) => Promise<void>;
  onEdit: (id: string, payload: { name?: string; code?: string | null; is_active?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEditStations: (lineId: string) => void;
  onCheckLocked: (lineId: string) => Promise<boolean>;
  onRefresh?: () => Promise<void>;
};

export const ProductionLinesManagement = ({
  lines,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
  onEditStations,
  onCheckLocked,
  onRefresh,
}: ProductionLinesManagementProps) => {
  const [editingLine, setEditingLine] = useState<ProductionLineWithStations | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteLineId, setDeleteLineId] = useState<string | null>(null);
  const [deleteLineIsLocked, setDeleteLineIsLocked] = useState(false);
  const [isCheckingLocked, setIsCheckingLocked] = useState(false);

  const sortedLines = useMemo(
    () => [...lines].sort((a, b) => a.name.localeCompare(b.name, "he")),
    [lines],
  );

  const handleAdd = async (payload: { name: string; code?: string | null; is_active?: boolean }) => {
    setIsSubmitting(true);
    try {
      await onAdd(payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (payload: { name?: string; code?: string | null; is_active?: boolean }) => {
    if (!editingLine) return;
    setIsSubmitting(true);
    try {
      await onEdit(editingLine.id, payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (lineId: string) => {
    setIsSubmitting(true);
    setDeleteLineIsLocked(false);
    try {
      const isLocked = await onCheckLocked(lineId);
      if (isLocked) {
        setDeleteLineIsLocked(true);
        setIsSubmitting(false);
        return;
      }
      await onDelete(lineId);
      setDeleteLineId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDialogOpenChange = async (open: boolean, lineId?: string) => {
    if (open && lineId) {
      setIsCheckingLocked(true);
      try {
        const isLocked = await onCheckLocked(lineId);
        setDeleteLineIsLocked(isLocked);
      } catch {
        setDeleteLineIsLocked(false);
      } finally {
        setIsCheckingLocked(false);
      }
    } else {
      setDeleteLineIsLocked(false);
    }
    setDeleteLineId(open ? (lineId ?? null) : null);
  };

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-base font-semibold text-foreground">קווי ייצור</h3>
          <p className="text-sm text-muted-foreground">ניהול קווי ייצור ותחנות.</p>
        </div>
        <ProductionLineFormDialog
          mode="create"
          onSubmit={handleAdd}
          trigger={
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
              הוסף קו ייצור
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
          <p className="text-sm text-muted-foreground">טוען קווי ייצור...</p>
        </div>
      ) : sortedLines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <p className="text-sm">אין קווי ייצור להצגה.</p>
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
                  קוד
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  תחנות
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
              {sortedLines.map((line) => (
                <tr key={line.id} className="group hover:bg-accent transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{line.name}</span>
                      <div className="flex items-center gap-2 lg:hidden">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEditStations(line.id)}
                          aria-label="עריכת תחנות"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <ProductionLineFormDialog
                          mode="edit"
                          line={line}
                          onSubmit={handleEdit}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingLine(line)}
                              aria-label="עריכת קו ייצור"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                          open={editingLine?.id === line.id}
                          onOpenChange={async (open) => {
                            setEditingLine(open ? line : null);
                            if (!open && onRefresh) {
                              await onRefresh();
                            }
                          }}
                          loading={isSubmitting}
                        />
                        <Dialog
                          open={deleteLineId === line.id}
                          onOpenChange={(open) => handleDeleteDialogOpenChange(open, line.id)}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isSubmitting}
                              aria-label="מחיקת קו ייצור"
                              className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent dir="rtl" className="border-border bg-card">
                            <DialogHeader>
                              <DialogTitle className="text-foreground">
                                האם למחוק את קו הייצור?
                              </DialogTitle>
                              <DialogDescription className="text-muted-foreground">
                                הפעולה תמחק את קו הייצור לחלוטין. לא ניתן לבטל.
                              </DialogDescription>
                            </DialogHeader>
                            {isCheckingLocked ? (
                              <p className="text-sm text-muted-foreground">בודק עבודות פעילות...</p>
                            ) : deleteLineIsLocked ? (
                              <Alert
                                variant="destructive"
                                className="border-primary/30 bg-primary/10 text-right text-sm text-primary"
                              >
                                <AlertDescription>
                                  לא ניתן למחוק קו ייצור עם עבודות פעילות. יש לסיים את העבודות הפעילות לפני מחיקה.
                                </AlertDescription>
                              </Alert>
                            ) : null}
                            <DialogFooter className="justify-start">
                              <Button
                                onClick={() => void handleDelete(line.id)}
                                disabled={isSubmitting || deleteLineIsLocked || isCheckingLocked}
                                className="bg-red-500 text-white hover:bg-red-600"
                              >
                                מחיקה סופית
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => setDeleteLineId(null)}
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
                    {line.code ? (
                      <span className="font-mono text-foreground/80">{line.code}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground/80">{line.stations.length}</span>
                      {line.stations.length > 0 && (
                        <div className="hidden md:flex items-center gap-1 flex-wrap max-w-[300px]">
                          {line.stations.slice(0, 3).map((pls, idx) => (
                            <Badge
                              key={pls.id}
                              variant="secondary"
                              className="text-xs bg-secondary/50 text-foreground/70 border-input"
                            >
                              {idx + 1}. {pls.station?.name ?? "—"}
                            </Badge>
                          ))}
                          {line.stations.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{line.stations.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {line.is_active ? (
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
                        onClick={() => onEditStations(line.id)}
                        aria-label="עריכת תחנות"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <ProductionLineFormDialog
                        mode="edit"
                        line={line}
                        onSubmit={handleEdit}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingLine(line)}
                            aria-label="עריכת קו ייצור"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                        open={editingLine?.id === line.id}
                        onOpenChange={async (open) => {
                          setEditingLine(open ? line : null);
                          if (!open && onRefresh) {
                            await onRefresh();
                          }
                        }}
                        loading={isSubmitting}
                      />
                      <Dialog
                        open={deleteLineId === line.id}
                        onOpenChange={(open) => handleDeleteDialogOpenChange(open, line.id)}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isSubmitting}
                            aria-label="מחיקת קו ייצור"
                            className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent dir="rtl" className="border-border bg-card">
                          <DialogHeader>
                            <DialogTitle className="text-foreground">
                              האם למחוק את קו הייצור?
                            </DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                              הפעולה תמחק את קו הייצור לחלוטין. לא ניתן לבטל.
                            </DialogDescription>
                          </DialogHeader>
                          {isCheckingLocked ? (
                            <p className="text-sm text-muted-foreground">בודק עבודות פעילות...</p>
                          ) : deleteLineIsLocked ? (
                            <Alert
                              variant="destructive"
                              className="border-primary/30 bg-primary/10 text-right text-sm text-primary"
                            >
                              <AlertDescription>
                                לא ניתן למחוק קו ייצור עם עבודות פעילות. יש לסיים את העבודות הפעילות לפני מחיקה.
                              </AlertDescription>
                            </Alert>
                          ) : null}
                          <DialogFooter className="justify-start">
                            <Button
                              onClick={() => void handleDelete(line.id)}
                              disabled={isSubmitting || deleteLineIsLocked || isCheckingLocked}
                              className="bg-red-500 text-white hover:bg-red-600"
                            >
                              מחיקה סופית
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => setDeleteLineId(null)}
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
