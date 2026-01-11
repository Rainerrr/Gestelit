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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Package,
  Plus,
  Trash2,
  GitBranch,
  Cpu,
} from "lucide-react";
import type {
  Job,
  JobItemKind,
  JobItemWithDetails,
  ProductionLineWithStations,
  Station,
} from "@/lib/types";
import {
  createJobItemAdminApi,
  deleteJobItemAdminApi,
  fetchJobItemsAdminApi,
  fetchProductionLinesAdminApi,
  fetchStationsAdminApi,
  updateJobItemAdminApi,
} from "@/lib/api/admin-management";

type JobItemsDialogProps = {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const JobItemsDialog = ({
  job,
  open,
  onOpenChange,
}: JobItemsDialogProps) => {
  const [items, setItems] = useState<JobItemWithDetails[]>([]);
  const [productionLines, setProductionLines] = useState<ProductionLineWithStations[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New item form state
  const [newItemKind, setNewItemKind] = useState<JobItemKind>("station");
  const [newItemStationId, setNewItemStationId] = useState<string>("");
  const [newItemLineId, setNewItemLineId] = useState<string>("");
  const [newItemQuantity, setNewItemQuantity] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Edit quantity state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<string>("");

  const loadData = useCallback(async () => {
    if (!job) return;

    setIsLoading(true);
    setError(null);

    try {
      const [itemsRes, linesRes, stationsRes] = await Promise.all([
        fetchJobItemsAdminApi(job.id, { includeProgress: true, includeStations: true }),
        fetchProductionLinesAdminApi({ includeInactive: false }),
        fetchStationsAdminApi(),
      ]);

      setItems(itemsRes.items);
      setProductionLines(linesRes.lines);
      setStations(stationsRes.stations.map((s) => s.station));
    } catch {
      setError("שגיאה בטעינת הנתונים");
    } finally {
      setIsLoading(false);
    }
  }, [job]);

  useEffect(() => {
    if (open && job) {
      void loadData();
    }
  }, [open, job, loadData]);

  const handleAddItem = async () => {
    if (!job) return;

    if (!newItemQuantity || parseInt(newItemQuantity) <= 0) {
      setError("יש להזין כמות מתוכננת חיובית");
      return;
    }

    if (newItemKind === "station" && !newItemStationId) {
      setError("יש לבחור תחנה");
      return;
    }

    if (newItemKind === "line" && !newItemLineId) {
      setError("יש לבחור קו ייצור");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await createJobItemAdminApi(job.id, {
        kind: newItemKind,
        station_id: newItemKind === "station" ? newItemStationId : null,
        production_line_id: newItemKind === "line" ? newItemLineId : null,
        planned_quantity: parseInt(newItemQuantity),
      });

      setSuccessMessage("הפריט נוסף בהצלחה");
      setShowAddForm(false);
      setNewItemKind("station");
      setNewItemStationId("");
      setNewItemLineId("");
      setNewItemQuantity("");
      await loadData();

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בהוספת פריט";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateQuantity = async (itemId: string) => {
    if (!editQuantity || parseInt(editQuantity) <= 0) {
      setError("יש להזין כמות מתוכננת חיובית");
      return;
    }

    if (!job) return;

    setIsSaving(true);
    setError(null);

    try {
      await updateJobItemAdminApi(job.id, itemId, {
        planned_quantity: parseInt(editQuantity),
      });

      setSuccessMessage("הכמות עודכנה בהצלחה");
      setEditingItemId(null);
      setEditQuantity("");
      await loadData();

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בעדכון כמות";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!job) return;

    setIsSaving(true);
    setError(null);

    try {
      await deleteJobItemAdminApi(job.id, itemId);

      setSuccessMessage("הפריט נמחק בהצלחה");
      await loadData();

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה במחיקת פריט";
      if (message === "HAS_ACTIVE_SESSIONS") {
        setError("לא ניתן למחוק פריט עם סשנים פעילים");
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
    setShowAddForm(false);
    setEditingItemId(null);
    onOpenChange(false);
  };

  const getProgressPercent = (item: JobItemWithDetails) => {
    const completed = item.progress?.completed_good ?? 0;
    return Math.min(100, Math.round((completed / item.planned_quantity) * 100));
  };

  if (!job) return null;

  // Filter out stations that are already in production lines (for single station items)
  const lineStationIds = new Set(
    productionLines.flatMap((line) => line.stations.map((s) => s.station_id))
  );
  const availableStations = stations.filter((s) => !lineStationIds.has(s.id) && s.is_active);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="text-right sm:max-w-2xl border-border bg-card max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Package className="h-5 w-5" />
            פריטי עבודה - {job.job_number}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            הגדרת תחנות/קווי ייצור לעבודה זו. עובדים יוכלו לעבוד רק בתחנות שהוגדרו
            כאן.
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
              {/* Existing Items */}
              <div className="space-y-2 rounded-lg border border-input bg-secondary/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground/80">
                    פריטים מוגדרים ({items.length})
                  </p>
                  {!showAddForm && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddForm(true)}
                      disabled={isSaving}
                      className="h-7 border-input bg-secondary text-foreground/80 hover:bg-muted"
                    >
                      <Plus className="h-3.5 w-3.5 ml-1" />
                      הוסף פריט
                    </Button>
                  )}
                </div>

                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Package className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">לא הוגדרו פריטים לעבודה זו.</p>
                    <p className="text-xs mt-1">
                      הוסיפו פריטים כדי שעובדים יוכלו לעבוד על עבודה זו.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((item) => {
                      const isEditing = editingItemId === item.id;
                      const progressPercent = getProgressPercent(item);

                      return (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 rounded-md border border-input bg-card p-3"
                        >
                          <div className="flex-shrink-0 mt-1">
                            {item.kind === "line" ? (
                              <GitBranch className="h-4 w-4 text-blue-400" />
                            ) : (
                              <Cpu className="h-4 w-4 text-emerald-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">
                                {item.kind === "line"
                                  ? item.production_line?.name ?? "קו ייצור"
                                  : item.station?.name ?? "תחנה"}
                              </p>
                              <Badge
                                variant="secondary"
                                className="text-xs bg-secondary/50 text-foreground/70 border-input"
                              >
                                {item.kind === "line" ? "קו ייצור" : "תחנה בודדת"}
                              </Badge>
                            </div>
                            {item.kind === "line" && item.job_item_stations && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {item.job_item_stations.length} תחנות:{" "}
                                {item.job_item_stations
                                  .slice(0, 3)
                                  .map((s) => s.station?.name ?? "—")
                                  .join(" → ")}
                                {item.job_item_stations.length > 3 && " ..."}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="1"
                                    value={editQuantity}
                                    onChange={(e) => setEditQuantity(e.target.value)}
                                    className="w-24 h-7 text-xs border-input bg-secondary"
                                  />
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => void handleUpdateQuantity(item.id)}
                                    disabled={isSaving}
                                  >
                                    שמור
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      setEditingItemId(null);
                                      setEditQuantity("");
                                    }}
                                  >
                                    ביטול
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={() => {
                                      setEditingItemId(item.id);
                                      setEditQuantity(item.planned_quantity.toString());
                                    }}
                                  >
                                    מתוכנן:{" "}
                                    <span className="font-medium text-foreground">
                                      {item.planned_quantity.toLocaleString()}
                                    </span>
                                  </button>
                                  <span className="text-xs text-muted-foreground">|</span>
                                  <span className="text-xs text-muted-foreground">
                                    הושלמו:{" "}
                                    <span className="font-medium text-emerald-400">
                                      {(item.progress?.completed_good ?? 0).toLocaleString()}
                                    </span>
                                  </span>
                                </>
                              )}
                            </div>
                            {!isEditing && (
                              <div className="flex items-center gap-2 mt-2">
                                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      progressPercent >= 100 ? "bg-emerald-500" : "bg-primary"
                                    }`}
                                    style={{ width: `${progressPercent}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {progressPercent}%
                                </span>
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"
                            onClick={() => void handleDeleteItem(item.id)}
                            disabled={isSaving}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add Item Form */}
              {showAddForm && (
                <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <p className="text-sm font-medium text-foreground">הוספת פריט חדש</p>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-foreground/80">סוג</Label>
                    <div className="flex rounded-lg border border-input bg-secondary/30 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setNewItemKind("station");
                          setNewItemLineId("");
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                          newItemKind === "station"
                            ? "bg-emerald-500 text-white shadow-sm"
                            : "text-muted-foreground hover:text-foreground/80 hover:bg-muted"
                        }`}
                      >
                        <Cpu className="h-4 w-4" />
                        תחנה בודדת
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewItemKind("line");
                          setNewItemStationId("");
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                          newItemKind === "line"
                            ? "bg-blue-500 text-white shadow-sm"
                            : "text-muted-foreground hover:text-foreground/80 hover:bg-muted"
                        }`}
                      >
                        <GitBranch className="h-4 w-4" />
                        קו ייצור
                      </button>
                    </div>
                  </div>

                  {newItemKind === "station" ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-foreground/80">תחנה</Label>
                      <Select
                        value={newItemStationId}
                        onValueChange={setNewItemStationId}
                        disabled={availableStations.length === 0}
                      >
                        <SelectTrigger className="border-input bg-secondary text-foreground">
                          <SelectValue
                            placeholder={
                              availableStations.length === 0
                                ? "אין תחנות זמינות (כולן בקווי ייצור)"
                                : "בחר תחנה..."
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
                      {availableStations.length === 0 && (
                        <p className="text-xs text-amber-400">
                          כל התחנות משויכות לקווי ייצור. השתמשו בסוג &quot;קו
                          ייצור&quot;.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-foreground/80">קו ייצור</Label>
                      <Select
                        value={newItemLineId}
                        onValueChange={setNewItemLineId}
                        disabled={productionLines.length === 0}
                      >
                        <SelectTrigger className="border-input bg-secondary text-foreground">
                          <SelectValue
                            placeholder={
                              productionLines.length === 0
                                ? "אין קווי ייצור"
                                : "בחר קו ייצור..."
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {productionLines.map((line) => (
                            <SelectItem key={line.id} value={line.id}>
                              {line.name} ({line.stations.length} תחנות)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs text-foreground/80">כמות מתוכננת</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newItemQuantity}
                      onChange={(e) => setNewItemQuantity(e.target.value)}
                      placeholder="כמות יחידות"
                      className="border-input bg-secondary text-foreground"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      onClick={() => void handleAddItem()}
                      disabled={isSaving}
                      size="sm"
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {isSaving ? "מוסיף..." : "הוסף"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAddForm(false);
                        setNewItemKind("station");
                        setNewItemStationId("");
                        setNewItemLineId("");
                        setNewItemQuantity("");
                        setError(null);
                      }}
                      disabled={isSaving}
                      className="border-input bg-secondary text-foreground/80 hover:bg-muted"
                    >
                      ביטול
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="justify-start mt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
