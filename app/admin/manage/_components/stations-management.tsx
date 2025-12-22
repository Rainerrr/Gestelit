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
import type { Station, StationChecklistItem } from "@/lib/types";
import type { StationWithStats } from "@/lib/data/admin-management";
import { ListChecks, Pencil, Trash2 } from "lucide-react";
import { StationFormDialog } from "./station-form-dialog";
import { StationChecklistDialog } from "./station-checklist-dialog";
import { checkStationActiveSessionAdminApi } from "@/lib/api/admin-management";
import { Alert, AlertDescription } from "@/components/ui/alert";

type StationsManagementProps = {
  stations: StationWithStats[];
  isLoading: boolean;
  stationTypes: string[];
  onAdd: (payload: Partial<Station>) => Promise<void>;
  onEdit: (id: string, payload: Partial<Station>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEditChecklists: (
    id: string,
    payload: {
      start_checklist: StationChecklistItem[];
      end_checklist: StationChecklistItem[];
    },
  ) => Promise<void>;
  onRefresh?: () => Promise<void>;
};

export const StationsManagement = ({
  stations,
  isLoading,
  stationTypes,
  onAdd,
  onEdit,
  onDelete,
  onEditChecklists,
  onRefresh,
}: StationsManagementProps) => {
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteStationId, setDeleteStationId] = useState<string | null>(null);
  const [deleteStationHasActiveSession, setDeleteStationHasActiveSession] = useState(false);
  const [isCheckingDeleteSession, setIsCheckingDeleteSession] = useState(false);
  const [checklistStation, setChecklistStation] = useState<Station | null>(null);
  const [isChecklistSubmitting, setIsChecklistSubmitting] = useState(false);

  const normalizedStationTypes = useMemo(
    () => (stationTypes.includes("other") ? stationTypes : ["other", ...stationTypes]),
    [stationTypes],
  );

  const sortedStations = useMemo(
    () =>
      [...stations].sort((a, b) =>
        a.station.name.localeCompare(b.station.name, "he"),
      ),
    [stations],
  );

  const handleAdd = async (payload: Partial<Station>) => {
    setIsSubmitting(true);
    try {
      await onAdd(payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (payload: Partial<Station>) => {
    if (!editingStation) return;
    setIsSubmitting(true);
    try {
      await onEdit(editingStation.id, payload);
      // Don't close dialog - let the form dialog show success message and stay open
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (stationId: string) => {
    setIsSubmitting(true);
    setDeleteStationHasActiveSession(false);
    try {
      // Check for active session before attempting delete
      const { hasActiveSession } = await checkStationActiveSessionAdminApi(stationId);
      if (hasActiveSession) {
        setDeleteStationHasActiveSession(true);
        setIsSubmitting(false);
        return;
      }
      await onDelete(stationId);
      setDeleteStationId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDialogOpenChange = async (open: boolean, stationId?: string) => {
    if (open && stationId) {
      setIsCheckingDeleteSession(true);
      try {
        const { hasActiveSession } = await checkStationActiveSessionAdminApi(stationId);
        setDeleteStationHasActiveSession(hasActiveSession);
      } catch (err) {
        console.error("[stations-management] Failed to check active session", err);
        setDeleteStationHasActiveSession(false);
      } finally {
        setIsCheckingDeleteSession(false);
      }
    } else {
      setDeleteStationHasActiveSession(false);
    }
    setDeleteStationId(open ? (stationId ?? null) : null);
  };

  const handleChecklistsSubmit = async (
    stationId: string,
    payload: {
    start_checklist: StationChecklistItem[];
    end_checklist: StationChecklistItem[];
    },
  ) => {
    setIsChecklistSubmitting(true);
    try {
      await onEditChecklists(stationId, payload);
      // Keep dialog open to show success message
    } finally {
      setIsChecklistSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-base font-semibold text-foreground">תחנות</h3>
          <p className="text-sm text-muted-foreground">ניהול מכונות והרשאות.</p>
        </div>
        <StationFormDialog
          mode="create"
          stationTypes={normalizedStationTypes}
          onSubmit={handleAdd}
          trigger={<Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">הוסף תחנה</Button>}
          loading={isSubmitting}
        />
      </div>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">טוען תחנות...</p>
        </div>
      ) : sortedStations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <p className="text-sm">אין תחנות להצגה.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">שם</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">קוד</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">סוג</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">עובדים</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">מצב</th>
                <th className="hidden lg:table-cell px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedStations.map(({ station, workerCount }) => (
                <tr key={station.id} className="group hover:bg-accent transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{station.name}</span>
                      <div className="flex items-center gap-2 lg:hidden">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setChecklistStation(station)}
                          aria-label="ניהול צ'קליסטים"
                          disabled={isChecklistSubmitting}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <ListChecks className="h-4 w-4" />
                        </Button>
                        <StationFormDialog
                          mode="edit"
                          station={station}
                          stationTypes={normalizedStationTypes}
                          onSubmit={handleEdit}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingStation(station)}
                              aria-label="עריכת תחנה"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                          open={editingStation?.id === station.id}
                          onOpenChange={async (open) => {
                            setEditingStation(open ? station : null);
                            if (!open && onRefresh) {
                              await onRefresh();
                            }
                          }}
                          loading={isSubmitting}
                        />
                        <Dialog
                          open={deleteStationId === station.id}
                          onOpenChange={(open) =>
                            handleDeleteDialogOpenChange(open, station.id)
                          }
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isSubmitting}
                              aria-label="מחיקת תחנה"
                              className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent dir="rtl" className="border-border bg-card">
                            <DialogHeader>
                              <DialogTitle className="text-foreground">האם למחוק את התחנה?</DialogTitle>
                              <DialogDescription className="text-muted-foreground">
                                הפעולה תמחק את התחנה לחלוטין ותשמור היסטוריה בסשנים קיימים. לא ניתן לבטל.
                              </DialogDescription>
                            </DialogHeader>
                            {isCheckingDeleteSession ? (
                              <p className="text-sm text-muted-foreground">בודק סשנים פעילים...</p>
                            ) : deleteStationHasActiveSession ? (
                              <Alert
                                variant="destructive"
                                className="border-primary/30 bg-primary/10 text-right text-sm text-primary"
                              >
                                <AlertDescription>
                                  לא ניתן למחוק תחנה עם סשן פעיל. יש לסיים את הסשן הפעיל לפני מחיקה.
                                </AlertDescription>
                              </Alert>
                            ) : null}
                            <DialogFooter className="justify-start">
                              <Button
                                onClick={() => void handleDelete(station.id)}
                                disabled={isSubmitting || deleteStationHasActiveSession || isCheckingDeleteSession}
                                className="bg-red-500 text-white hover:bg-red-600"
                              >
                                מחיקה סופית
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => setDeleteStationId(null)}
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
                    <span className="font-mono text-foreground/80">{station.code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="bg-secondary text-foreground/80 border-input">{station.station_type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{workerCount}</td>
                  <td className="px-4 py-3">
                    {station.is_active ? (
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
                        onClick={() => setChecklistStation(station)}
                        aria-label="ניהול צ'קליסטים"
                        disabled={isChecklistSubmitting}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <ListChecks className="h-4 w-4" />
                      </Button>
                      <StationFormDialog
                        mode="edit"
                        station={station}
                        stationTypes={normalizedStationTypes}
                        onSubmit={handleEdit}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingStation(station)}
                            aria-label="עריכת תחנה"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                        open={editingStation?.id === station.id}
                        onOpenChange={async (open) => {
                          setEditingStation(open ? station : null);
                          if (!open && onRefresh) {
                            await onRefresh();
                          }
                        }}
                        loading={isSubmitting}
                      />
                      <Dialog open={deleteStationId === station.id} onOpenChange={(open) => handleDeleteDialogOpenChange(open, station.id)}>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isSubmitting}
                            aria-label="מחיקת תחנה"
                            className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent dir="rtl" className="border-border bg-card">
                          <DialogHeader>
                            <DialogTitle className="text-foreground">האם למחוק את התחנה?</DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                              הפעולה תמחק את התחנה לחלוטין ותשמור היסטוריה בסשנים קיימים. לא ניתן לבטל.
                            </DialogDescription>
                          </DialogHeader>
                          {isCheckingDeleteSession ? (
                            <p className="text-sm text-muted-foreground">בודק סשנים פעילים...</p>
                          ) : deleteStationHasActiveSession ? (
                            <Alert
                              variant="destructive"
                              className="border-primary/30 bg-primary/10 text-right text-sm text-primary"
                            >
                              <AlertDescription>
                                לא ניתן למחוק תחנה עם סשן פעיל. יש לסיים את הסשן הפעיל לפני מחיקה.
                              </AlertDescription>
                            </Alert>
                          ) : null}
                          <DialogFooter className="justify-start">
                            <Button
                              onClick={() => void handleDelete(station.id)}
                              disabled={isSubmitting || deleteStationHasActiveSession || isCheckingDeleteSession}
                              className="bg-red-500 text-white hover:bg-red-600"
                            >
                              מחיקה סופית
                            </Button>
                            <Button variant="outline" onClick={() => setDeleteStationId(null)} disabled={isSubmitting} className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground">
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
      {checklistStation ? (
        <StationChecklistDialog
          station={checklistStation}
          open={Boolean(checklistStation)}
          onOpenChange={async (open) => {
            setChecklistStation(open ? checklistStation : null);
            if (!open && onRefresh) {
              await onRefresh();
            }
          }}
          onSubmit={handleChecklistsSubmit}
          loading={isChecklistSubmitting}
        />
      ) : null}
    </div>
  );
};

