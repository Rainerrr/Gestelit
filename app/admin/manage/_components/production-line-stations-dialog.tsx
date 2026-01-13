"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  GripVertical,
  Plus,
  Lock,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { ProductionLineWithStations, Station } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StationItem = {
  id: string;
  station: Station;
  position: number;
};

type ProductionLineStationsDialogProps = {
  line: ProductionLineWithStations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (lineId: string, stationIds: string[]) => Promise<void>;
  onFetchAvailableStations: (lineId?: string) => Promise<Station[]>;
  onCheckLocked: (lineId: string) => Promise<boolean>;
};

export const ProductionLineStationsDialog = ({
  line,
  open,
  onOpenChange,
  onSave,
  onFetchAvailableStations,
  onCheckLocked,
}: ProductionLineStationsDialogProps) => {
  const [stations, setStations] = useState<StationItem[]>([]);
  const [availableStations, setAvailableStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load available stations and check lock status when dialog opens
  useEffect(() => {
    if (!open || !line) return;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        // Check if line is locked
        const locked = await onCheckLocked(line.id);
        setIsLocked(locked);

        // Load available stations
        const available = await onFetchAvailableStations(line.id);
        setAvailableStations(available);

        // Set initial stations from line
        const initialStations = line.stations
          .sort((a, b) => a.position - b.position)
          .map((pls) => ({
            id: pls.station_id,
            station: pls.station!,
            position: pls.position,
          }))
          .filter((item) => item.station);

        setStations(initialStations);
      } catch {
        setError("שגיאה בטעינת הנתונים");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [open, line, onFetchAvailableStations, onCheckLocked]);

  const handleAddStation = () => {
    if (!selectedStationId) return;

    const station = availableStations.find((s) => s.id === selectedStationId);
    if (!station) return;

    // Add to stations list
    setStations((prev) => [
      ...prev,
      {
        id: station.id,
        station,
        position: prev.length + 1,
      },
    ]);

    // Remove from available
    setAvailableStations((prev) => prev.filter((s) => s.id !== selectedStationId));
    setSelectedStationId("");
  };

  const handleRemoveStation = (stationId: string) => {
    const removed = stations.find((s) => s.id === stationId);
    if (!removed) return;

    // Remove from list
    setStations((prev) =>
      prev
        .filter((s) => s.id !== stationId)
        .map((s, idx) => ({ ...s, position: idx + 1 }))
    );

    // Add back to available
    setAvailableStations((prev) =>
      [...prev, removed.station].sort((a, b) => a.name.localeCompare(b.name, "he"))
    );
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setStations((prev) => {
      const newStations = [...prev];
      [newStations[index - 1], newStations[index]] = [newStations[index], newStations[index - 1]];
      return newStations.map((s, idx) => ({ ...s, position: idx + 1 }));
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= stations.length - 1) return;
    setStations((prev) => {
      const newStations = [...prev];
      [newStations[index], newStations[index + 1]] = [newStations[index + 1], newStations[index]];
      return newStations.map((s, idx) => ({ ...s, position: idx + 1 }));
    });
  };

  const handleSave = async () => {
    if (!line) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const stationIds = stations.map((s) => s.id);
      await onSave(line.id, stationIds);
      setSuccessMessage("התחנות נשמרו בהצלחה");
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בשמירה";
      if (message === "HAS_ACTIVE_JOBS") {
        setError("לא ניתן לערוך תחנות - לקו יש עבודות פעילות");
        setIsLocked(true);
      } else if (message === "STATION_ALREADY_IN_LINE") {
        setError("אחת או יותר מהתחנות כבר משויכת לקו אחר");
      } else {
        setError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccessMessage(null);
    setSelectedStationId("");
    onOpenChange(false);
  };

  if (!line) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="text-right sm:max-w-xl border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            עריכת תחנות - {line.name}
            {isLocked && (
              <Badge
                variant="secondary"
                className="text-xs bg-amber-500/10 border-amber-500/30 text-amber-400"
              >
                <Lock className="h-3 w-3 ml-1" />
                נעול
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isLocked
              ? "לא ניתן לערוך את סדר התחנות כאשר יש עבודות פעילות בקו."
              : "סדרו את התחנות לפי סדר הייצור. התחנה הראשונה היא תחילת הקו."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert
              variant="destructive"
              className="border-red-500/30 bg-red-500/10 text-right text-sm text-red-400"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {successMessage && (
            <Alert className="border-emerald-500/30 bg-emerald-500/10 text-right text-sm text-emerald-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <AlertDescription>{successMessage}</AlertDescription>
              </div>
            </Alert>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="relative h-8 w-8">
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
              </div>
              <p className="text-sm text-muted-foreground">טוען...</p>
            </div>
          ) : (
            <>
              {/* Add Station */}
              {!isLocked && (
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedStationId}
                    onValueChange={setSelectedStationId}
                    disabled={availableStations.length === 0}
                  >
                    <SelectTrigger className="flex-1 border-input bg-secondary text-foreground">
                      <SelectValue
                        placeholder={
                          availableStations.length === 0
                            ? "אין תחנות זמינות"
                            : "בחר תחנה להוספה..."
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStations.map((station) => (
                        <SelectItem key={station.id} value={station.id}>
                          {station.name} ({station.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAddStation}
                    disabled={!selectedStationId || isSaving}
                    size="icon"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Stations List */}
              <div className="space-y-2 rounded-lg border border-input bg-secondary/30 p-3 min-h-[200px]">
                <p className="text-xs text-muted-foreground mb-2">
                  {stations.length === 0
                    ? "לא הוגדרו תחנות לקו זה."
                    : `${stations.length} תחנות בקו`}
                </p>
                {stations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <p className="text-sm">הוסיפו תחנות לקו הייצור</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {stations.map((item, index) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-md border border-input bg-card p-2 group"
                      >
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <GripVertical className="h-4 w-4" />
                          <Badge
                            variant="outline"
                            className="h-6 w-6 p-0 flex items-center justify-center text-xs font-mono border-input"
                          >
                            {item.position}
                          </Badge>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {item.station.name}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {item.station.code}
                          </p>
                        </div>
                        {!isLocked && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => handleMoveUp(index)}
                              disabled={index === 0 || isSaving}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => handleMoveDown(index)}
                              disabled={index === stations.length - 1 || isSaving}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                              onClick={() => handleRemoveStation(item.id)}
                              disabled={isSaving}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                        {index === stations.length - 1 && (
                          <Badge
                            variant="secondary"
                            className="text-xs bg-blue-500/10 border-blue-500/30 text-blue-400"
                          >
                            סיום
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="justify-start gap-2 mt-4">
          {!isLocked && (
            <Button
              onClick={() => void handleSave()}
              disabled={isLoading || isSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
            >
              {isSaving ? "שומר..." : "שמור"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
            className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            {isLocked ? "סגור" : "ביטול"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
