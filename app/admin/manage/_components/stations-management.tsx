"use client";

import { useMemo, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { Station } from "@/lib/types";
import type { StationWithStats } from "@/lib/data/admin-management";
import { StationFormDialog } from "./station-form-dialog";

type StationsManagementProps = {
  stations: StationWithStats[];
  isLoading: boolean;
  onAdd: (payload: Partial<Station>) => Promise<void>;
  onEdit: (id: string, payload: Partial<Station>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export const StationsManagement = ({
  stations,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
}: StationsManagementProps) => {
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setEditingStation(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (stationId: string) => {
    setIsSubmitting(true);
    try {
      await onDelete(stationId);
    } finally {
      setIsSubmitting(false);
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
          <Table className="text-right">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">שם</TableHead>
                <TableHead className="text-right">קוד</TableHead>
                <TableHead className="text-right">סוג</TableHead>
                <TableHead className="text-right">עובדים משויכים</TableHead>
                <TableHead className="text-right">מצב</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedStations.map(({ station, workerCount }) => (
                <TableRow key={station.id}>
                  <TableCell className="font-medium">{station.name}</TableCell>
                  <TableCell>{station.code}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{station.station_type}</Badge>
                  </TableCell>
                  <TableCell>{workerCount}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={station.is_active} disabled aria-readonly />
                      <span className="text-sm text-slate-600">
                        {station.is_active ? "פעיל" : "לא פעיל"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="flex flex-wrap gap-2">
                    <StationFormDialog
                      mode="edit"
                      station={station}
                      onSubmit={handleEdit}
                      trigger={
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditingStation(station)}
                          aria-label="עריכת תחנה"
                        >
                          ערוך
                        </Button>
                      }
                      open={editingStation?.id === station.id}
                      onOpenChange={(open) =>
                        setEditingStation(open ? station : null)
                      }
                      loading={isSubmitting}
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isSubmitting}
                          aria-label="מחיקת תחנה"
                        >
                          מחק
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent dir="rtl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>האם למחוק את התחנה?</AlertDialogTitle>
                          <AlertDialogDescription>
                            הפעולה תמחק את התחנה לחלוטין ותשמור היסטוריה בסשנים קיימים. לא ניתן לבטל.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="justify-start">
                          <AlertDialogAction
                            onClick={() => void handleDelete(station.id)}
                            disabled={isSubmitting}
                          >
                            מחיקה סופית
                          </AlertDialogAction>
                          <AlertDialogCancel disabled={isSubmitting}>ביטול</AlertDialogCancel>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

