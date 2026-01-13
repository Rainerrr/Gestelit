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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Package,
  Plus,
  Trash2,
  GitBranch,
  Cpu,
  Briefcase,
  AlertTriangle,
} from "lucide-react";
import type {
  Job,
  JobItemKind,
  ProductionLineWithStations,
  Station,
} from "@/lib/types";
import {
  createJobAdminApi,
  createJobItemAdminApi,
  fetchProductionLinesAdminApi,
  fetchStationsAdminApi,
} from "@/lib/api/admin-management";

type JobCreationWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (job: Partial<Job>) => Promise<void>;
};

type WizardStep = "details" | "products" | "review";

type PendingJobItem = {
  id: string;
  kind: JobItemKind;
  station_id?: string | null;
  production_line_id?: string | null;
  planned_quantity: number;
  // Display fields
  displayName: string;
  displayType: string;
};

export const JobCreationWizard = ({
  open,
  onOpenChange,
}: JobCreationWizardProps) => {
  const [step, setStep] = useState<WizardStep>("details");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Job Details
  const [jobNumber, setJobNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [description, setDescription] = useState("");
  const [plannedQuantity, setPlannedQuantity] = useState("");

  // Step 2: Products
  const [productionLines, setProductionLines] = useState<ProductionLineWithStations[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingJobItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // New item form
  const [newItemKind, setNewItemKind] = useState<JobItemKind>("line");
  const [newItemStationId, setNewItemStationId] = useState("");
  const [newItemLineId, setNewItemLineId] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("");

  // Load production lines and stations
  const loadData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [linesRes, stationsRes] = await Promise.all([
        fetchProductionLinesAdminApi({ includeInactive: false }),
        fetchStationsAdminApi(),
      ]);
      setProductionLines(linesRes.lines);
      setStations(stationsRes.stations.map((s) => s.station));
    } catch {
      setError("שגיאה בטעינת הנתונים");
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadData();
    }
  }, [open, loadData]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setStep("details");
      setJobNumber("");
      setCustomerName("");
      setDescription("");
      setPlannedQuantity("");
      setPendingItems([]);
      setNewItemKind("line");
      setNewItemStationId("");
      setNewItemLineId("");
      setNewItemQuantity("");
      setError(null);
    }
  }, [open]);

  // Filter available stations (not in any production line)
  const lineStationIds = new Set(
    productionLines.flatMap((line) => line.stations.map((s) => s.station_id))
  );
  const availableStations = stations.filter(
    (s) => !lineStationIds.has(s.id) && s.is_active
  );

  // Already added items
  const addedLineIds = new Set(
    pendingItems.filter((i) => i.kind === "line").map((i) => i.production_line_id)
  );
  const addedStationIds = new Set(
    pendingItems.filter((i) => i.kind === "station").map((i) => i.station_id)
  );

  const availableLines = productionLines.filter((l) => !addedLineIds.has(l.id));
  const availableStationsForAdd = availableStations.filter(
    (s) => !addedStationIds.has(s.id)
  );

  const handleAddItem = () => {
    setError(null);

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

    let displayName = "";
    let displayType = "";

    if (newItemKind === "line") {
      const line = productionLines.find((l) => l.id === newItemLineId);
      displayName = line?.name ?? "קו ייצור";
      displayType = `קו ייצור (${line?.stations.length ?? 0} תחנות)`;
    } else {
      const station = stations.find((s) => s.id === newItemStationId);
      displayName = station?.name ?? "תחנה";
      displayType = "תחנה בודדת";
    }

    const newItem: PendingJobItem = {
      id: crypto.randomUUID(),
      kind: newItemKind,
      station_id: newItemKind === "station" ? newItemStationId : null,
      production_line_id: newItemKind === "line" ? newItemLineId : null,
      planned_quantity: parseInt(newItemQuantity),
      displayName,
      displayType,
    };

    setPendingItems((prev) => [...prev, newItem]);
    setNewItemStationId("");
    setNewItemLineId("");
    setNewItemQuantity("");
  };

  const handleRemoveItem = (id: string) => {
    setPendingItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleNextStep = () => {
    setError(null);

    if (step === "details") {
      if (!jobNumber.trim()) {
        setError("מספר עבודה (פק\"ע) הוא שדה חובה");
        return;
      }
      setStep("products");
    } else if (step === "products") {
      if (pendingItems.length === 0) {
        setError("יש להוסיף לפחות מוצר אחד (קו ייצור או תחנה)");
        return;
      }
      setStep("review");
    }
  };

  const handlePrevStep = () => {
    setError(null);
    if (step === "products") {
      setStep("details");
    } else if (step === "review") {
      setStep("products");
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Create the job
      const parsedQuantity = plannedQuantity.trim()
        ? parseInt(plannedQuantity.trim(), 10)
        : null;

      const { job } = await createJobAdminApi({
        job_number: jobNumber.trim(),
        customer_name: customerName.trim() || null,
        description: description.trim() || null,
        planned_quantity:
          parsedQuantity && !isNaN(parsedQuantity) ? parsedQuantity : null,
      });

      // Create all job items
      for (const item of pendingItems) {
        await createJobItemAdminApi(job.id, {
          kind: item.kind,
          station_id: item.station_id,
          production_line_id: item.production_line_id,
          planned_quantity: item.planned_quantity,
        });
      }

      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה ביצירת העבודה";
      if (message === "JOB_NUMBER_EXISTS") {
        setError("מספר עבודה כבר קיים במערכת");
        setStep("details");
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalPlannedQuantity = pendingItems.reduce(
    (sum, item) => sum + item.planned_quantity,
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-right sm:max-w-2xl border-zinc-800 bg-zinc-900 max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-zinc-100 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-emerald-500" />
            יצירת עבודה חדשה
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            {step === "details" && "שלב 1: פרטי העבודה הבסיסיים"}
            {step === "products" && "שלב 2: הגדרת מוצרים (קווי ייצור / תחנות)"}
            {step === "review" && "שלב 3: סקירה ואישור"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex-shrink-0 flex items-center justify-center gap-2 py-4">
          {(["details", "products", "review"] as WizardStep[]).map((s, idx) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  step === s
                    ? "bg-emerald-500 text-white"
                    : idx < ["details", "products", "review"].indexOf(step)
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                }`}
              >
                {idx < ["details", "products", "review"].indexOf(step) ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  idx + 1
                )}
              </div>
              {idx < 2 && (
                <div
                  className={`w-12 h-0.5 mx-1 ${
                    idx < ["details", "products", "review"].indexOf(step)
                      ? "bg-emerald-500"
                      : "bg-zinc-700"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-1">
          {error && (
            <Alert
              variant="destructive"
              className="mb-4 border-red-500/30 bg-red-500/10 text-right text-sm text-red-400"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Step 1: Job Details */}
          {step === "details" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wizard_job_number" className="text-zinc-300">
                  מספר עבודה (פק&quot;ע) *
                </Label>
                <Input
                  id="wizard_job_number"
                  placeholder="הזן מספר עבודה"
                  value={jobNumber}
                  onChange={(e) => setJobNumber(e.target.value)}
                  className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-emerald-500/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard_customer" className="text-zinc-300">
                  שם לקוח
                </Label>
                <Input
                  id="wizard_customer"
                  placeholder="שם הלקוח (אופציונלי)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-600"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard_description" className="text-zinc-300">
                  תיאור
                </Label>
                <Textarea
                  id="wizard_description"
                  placeholder="תיאור העבודה (אופציונלי)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-600 min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard_planned" className="text-zinc-300">
                  כמות מתוכננת כוללת
                </Label>
                <Input
                  id="wizard_planned"
                  type="number"
                  min="0"
                  placeholder="כמות יחידות מתוכננת (אופציונלי)"
                  value={plannedQuantity}
                  onChange={(e) => setPlannedQuantity(e.target.value)}
                  className="border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-600"
                />
                <p className="text-xs text-zinc-500">
                  כאשר סה&quot;כ הטובים יגיע לכמות המתוכננת, העבודה תסומן כהושלמה
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Products */}
          {step === "products" && (
            <div className="space-y-4">
              {/* Explanation */}
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-blue-300">
                    <strong>חובה להוסיף לפחות מוצר אחד.</strong>
                    <br />
                    <span className="text-blue-400/80">
                      עובדים יוכלו לעבוד רק בתחנות ששייכות למוצרים שהוגדרו כאן.
                    </span>
                  </p>
                </div>
              </div>

              {/* Current Items */}
              {pendingItems.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-zinc-300">מוצרים שנוספו</Label>
                  <div className="space-y-2">
                    {pendingItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-700"
                      >
                        <div className="flex items-center gap-3">
                          {item.kind === "line" ? (
                            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                              <GitBranch className="h-4 w-4 text-blue-400" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                              <Cpu className="h-4 w-4 text-emerald-400" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-zinc-200">
                              {item.displayName}
                            </p>
                            <p className="text-xs text-zinc-500">{item.displayType}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="secondary"
                            className="bg-zinc-700 text-zinc-300 border-zinc-600"
                          >
                            {item.planned_quantity.toLocaleString()} יח&apos;
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(item.id)}
                            className="h-7 w-7 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add New Item */}
              <div className="space-y-3 p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50">
                <Label className="text-zinc-300">הוסף מוצר</Label>

                {/* Type Toggle */}
                <div className="flex rounded-lg border border-zinc-700 bg-zinc-800/50 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setNewItemKind("line");
                      setNewItemStationId("");
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      newItemKind === "line"
                        ? "bg-blue-500 text-white shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                    }`}
                  >
                    <GitBranch className="h-4 w-4" />
                    קו ייצור
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewItemKind("station");
                      setNewItemLineId("");
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      newItemKind === "station"
                        ? "bg-emerald-500 text-white shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                    }`}
                  >
                    <Cpu className="h-4 w-4" />
                    תחנה בודדת
                  </button>
                </div>

                {isLoadingData ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-transparent border-t-emerald-500" />
                  </div>
                ) : (
                  <>
                    {newItemKind === "line" ? (
                      <Select
                        value={newItemLineId}
                        onValueChange={setNewItemLineId}
                        disabled={availableLines.length === 0}
                      >
                        <SelectTrigger className="border-zinc-700 bg-zinc-800 text-zinc-100">
                          <SelectValue
                            placeholder={
                              availableLines.length === 0
                                ? "כל קווי הייצור כבר נוספו"
                                : "בחר קו ייצור..."
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="border-zinc-700 bg-zinc-800">
                          {availableLines.map((line) => (
                            <SelectItem
                              key={line.id}
                              value={line.id}
                              className="text-zinc-100"
                            >
                              {line.name} ({line.stations.length} תחנות)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={newItemStationId}
                        onValueChange={setNewItemStationId}
                        disabled={availableStationsForAdd.length === 0}
                      >
                        <SelectTrigger className="border-zinc-700 bg-zinc-800 text-zinc-100">
                          <SelectValue
                            placeholder={
                              availableStationsForAdd.length === 0
                                ? "אין תחנות בודדות זמינות"
                                : "בחר תחנה..."
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="border-zinc-700 bg-zinc-800">
                          {availableStationsForAdd.map((station) => (
                            <SelectItem
                              key={station.id}
                              value={station.id}
                              className="text-zinc-100"
                            >
                              {station.name} ({station.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="1"
                        placeholder="כמות מתוכננת"
                        value={newItemQuantity}
                        onChange={(e) => setNewItemQuantity(e.target.value)}
                        className="flex-1 border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-600"
                      />
                      <Button
                        onClick={handleAddItem}
                        disabled={
                          (newItemKind === "line" && !newItemLineId) ||
                          (newItemKind === "station" && !newItemStationId) ||
                          !newItemQuantity
                        }
                        className="bg-emerald-600 text-white hover:bg-emerald-500"
                      >
                        <Plus className="h-4 w-4 ml-1" />
                        הוסף
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === "review" && (
            <div className="space-y-4">
              {/* Job Summary */}
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 space-y-3">
                <h4 className="font-semibold text-zinc-200 flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-emerald-500" />
                  פרטי העבודה
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-zinc-500">מספר עבודה:</span>
                    <span className="mr-2 font-mono font-bold text-zinc-100">
                      {jobNumber}
                    </span>
                  </div>
                  {customerName && (
                    <div>
                      <span className="text-zinc-500">לקוח:</span>
                      <span className="mr-2 text-zinc-200">{customerName}</span>
                    </div>
                  )}
                  {plannedQuantity && (
                    <div>
                      <span className="text-zinc-500">כמות מתוכננת:</span>
                      <span className="mr-2 text-zinc-200">
                        {parseInt(plannedQuantity).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
                {description && (
                  <div className="pt-2 border-t border-zinc-700">
                    <span className="text-zinc-500 text-sm">תיאור:</span>
                    <p className="text-zinc-300 text-sm mt-1">{description}</p>
                  </div>
                )}
              </div>

              {/* Products Summary */}
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 space-y-3">
                <h4 className="font-semibold text-zinc-200 flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-400" />
                  מוצרים ({pendingItems.length})
                </h4>
                <div className="space-y-2">
                  {pendingItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2 border-b border-zinc-700/50 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        {item.kind === "line" ? (
                          <GitBranch className="h-4 w-4 text-blue-400" />
                        ) : (
                          <Cpu className="h-4 w-4 text-emerald-400" />
                        )}
                        <span className="text-zinc-200">{item.displayName}</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-zinc-700 text-zinc-400"
                        >
                          {item.displayType}
                        </Badge>
                      </div>
                      <span className="font-mono text-zinc-300">
                        {item.planned_quantity.toLocaleString()} יח&apos;
                      </span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-zinc-700 flex justify-between">
                  <span className="text-zinc-400">סה&quot;כ כמות מתוכננת:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {totalPlannedQuantity.toLocaleString()} יח&apos;
                  </span>
                </div>
              </div>

              {/* Confirmation */}
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-emerald-300">
                    העבודה מוכנה ליצירה.
                    <br />
                    <span className="text-emerald-400/80">
                      לאחר היצירה, עובדים יוכלו להתחיל לעבוד על המוצרים שהוגדרו.
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 flex-row-reverse justify-between border-t border-zinc-800 pt-4 mt-4">
          <div className="flex gap-2">
            {step !== "details" && (
              <Button
                variant="outline"
                onClick={handlePrevStep}
                disabled={isSubmitting}
                className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              >
                <ChevronRight className="h-4 w-4 ml-1" />
                חזרה
              </Button>
            )}

            {step === "review" ? (
              <Button
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
                className="bg-emerald-600 text-white hover:bg-emerald-500"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-transparent border-t-white ml-2" />
                    יוצר...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 ml-2" />
                    צור עבודה
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleNextStep}
                className="bg-emerald-600 text-white hover:bg-emerald-500"
              >
                המשך
                <ChevronLeft className="h-4 w-4 mr-1" />
              </Button>
            )}
          </div>

          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
