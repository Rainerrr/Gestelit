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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">תחנות</CardTitle>
          <p className="text-sm text-slate-500">ניהול מכונות והרשאות.</p>
        </div>
        <StationFormDialog
          mode="create"
          stationTypes={normalizedStationTypes}
          onSubmit={handleAdd}
          trigger={<Button>הוסף תחנה</Button>}
          loading={isSubmitting}
        />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-slate-500">טוען תחנות...</p>
        ) : sortedStations.length === 0 ? (
          <p className="text-sm text-slate-500">אין תחנות להצגה.</p>
        ) : (
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[880px] text-right [&_td]:px-3 [&_td]:py-3 [&_th]:px-3 [&_th]:py-3">
              <TableHeader>
                <TableRow className="h-12">
                  <TableHead className="whitespace-nowrap text-right">שם</TableHead>
                  <TableHead className="whitespace-nowrap text-right">קוד</TableHead>
                  <TableHead className="whitespace-nowrap text-right">סוג</TableHead>
                  <TableHead className="whitespace-nowrap text-right">עובדים משויכים</TableHead>
                  <TableHead className="whitespace-nowrap text-right">מצב</TableHead>
                  <TableHead className="hidden whitespace-nowrap text-right lg:table-cell">
                    פעולות
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedStations.map(({ station, workerCount }) => (
                  <TableRow key={station.id} className="h-14">
                    <TableCell className="whitespace-nowrap font-medium">
                      <div className="flex items-center justify-between gap-3">
                        <span>{station.name}</span>
                        <div className="flex items-center gap-2 lg:hidden">
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => setChecklistStation(station)}
                            aria-label="ניהול צ'קליסטים"
                            disabled={isChecklistSubmitting}
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
                                variant="secondary"
                                size="icon"
                                onClick={() => setEditingStation(station)}
                                aria-label="עריכת תחנה"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            }
                            open={editingStation?.id === station.id}
                            onOpenChange={(open) =>
                              setEditingStation(open ? station : null)
                            }
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
                                variant="destructive"
                                size="icon"
                                disabled={isSubmitting}
                                aria-label="מחיקת תחנה"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent dir="rtl">
                              <DialogHeader>
                                <DialogTitle>האם למחוק את התחנה?</DialogTitle>
                                <DialogDescription>
                                  הפעולה תמחק את התחנה לחלוטין ותשמור היסטוריה בסשנים קיימים. לא ניתן לבטל.
                                </DialogDescription>
                              </DialogHeader>
                              {isCheckingDeleteSession ? (
                                <p className="text-sm text-slate-500">בודק סשנים פעילים...</p>
                              ) : deleteStationHasActiveSession ? (
                                <Alert
                                  variant="destructive"
                                  className="border-amber-200 bg-amber-50 text-right text-sm text-amber-800"
                                >
                                  <AlertDescription>
                                    לא ניתן למחוק תחנה עם סשן פעיל. יש לסיים את הסשן הפעיל לפני מחיקה.
                                  </AlertDescription>
                                </Alert>
                              ) : null}
                              <DialogFooter className="justify-start">
                                <Button
                                  variant="destructive"
                                  onClick={() => void handleDelete(station.id)}
                                  disabled={isSubmitting || deleteStationHasActiveSession || isCheckingDeleteSession}
                                >
                                  מחיקה סופית
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => setDeleteStationId(null)}
                                  disabled={isSubmitting}
                                >
                                  ביטול
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{station.code}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="secondary">{station.station_type}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{workerCount}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex flex-row-reverse items-center justify-end gap-2">
                        <span className="text-sm text-slate-600">
                          {station.is_active ? "פעיל" : "לא פעיל"}
                        </span>
                        <Switch checked={station.is_active} disabled aria-readonly />
                      </div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap lg:table-cell">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setChecklistStation(station)}
                          aria-label="ניהול צ'קליסטים"
                          disabled={isChecklistSubmitting}
                        >
                          <ListChecks className="h-4 w-4" />
                          <span className="sr-only">צ׳קליסטים</span>
                        </Button>
                        <StationFormDialog
                          mode="edit"
                          station={station}
                          stationTypes={normalizedStationTypes}
                          onSubmit={handleEdit}
                          trigger={
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setEditingStation(station)}
                              aria-label="עריכת תחנה"
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">עריכה</span>
                            </Button>
                          }
                          open={editingStation?.id === station.id}
                          onOpenChange={async (open) => {
                            setEditingStation(open ? station : null);
                            // Refresh when dialog closes to update the list
                            if (!open && onRefresh) {
                              await onRefresh();
                            }
                          }}
                          loading={isSubmitting}
                        />
                        <Dialog open={deleteStationId === station.id} onOpenChange={(open) => handleDeleteDialogOpenChange(open, station.id)}>
                          <DialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={isSubmitting}
                              aria-label="מחיקת תחנה"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">מחיקה</span>
                            </Button>
                          </DialogTrigger>
                          <DialogContent dir="rtl">
                            <DialogHeader>
                              <DialogTitle>האם למחוק את התחנה?</DialogTitle>
                              <DialogDescription>
                                הפעולה תמחק את התחנה לחלוטין ותשמור היסטוריה בסשנים קיימים. לא ניתן לבטל.
                              </DialogDescription>
                            </DialogHeader>
                            {isCheckingDeleteSession ? (
                              <p className="text-sm text-slate-500">בודק סשנים פעילים...</p>
                            ) : deleteStationHasActiveSession ? (
                              <Alert
                                variant="destructive"
                                className="border-amber-200 bg-amber-50 text-right text-sm text-amber-800"
                              >
                                <AlertDescription>
                                  לא ניתן למחוק תחנה עם סשן פעיל. יש לסיים את הסשן הפעיל לפני מחיקה.
                                </AlertDescription>
                              </Alert>
                            ) : null}
                            <DialogFooter className="justify-start">
                              <Button
                                variant="destructive"
                                onClick={() => void handleDelete(station.id)}
                                disabled={isSubmitting || deleteStationHasActiveSession || isCheckingDeleteSession}
                              >
                                מחיקה סופית
                              </Button>
                              <Button variant="outline" onClick={() => setDeleteStationId(null)} disabled={isSubmitting}>
                                ביטול
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {checklistStation ? (
        <StationChecklistDialog
          station={checklistStation}
          open={Boolean(checklistStation)}
          onOpenChange={async (open) => {
            setChecklistStation(open ? checklistStation : null);
            // Refresh when dialog closes to update the list
            if (!open && onRefresh) {
              await onRefresh();
            }
          }}
          onSubmit={handleChecklistsSubmit}
          loading={isChecklistSubmitting}
        />
      ) : null}
    </Card>
  );
};

