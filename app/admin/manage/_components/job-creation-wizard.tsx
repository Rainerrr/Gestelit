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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Package,
  Plus,
  Trash2,
  Briefcase,
  AlertTriangle,
  Workflow,
} from "lucide-react";
import type {
  Job,
  PipelinePresetWithSteps,
  Station,
} from "@/lib/types";
import {
  createJobAdminApi,
  createJobItemAdminApi,
  fetchPipelinePresetsAdminApi,
  fetchStationsAdminApi,
} from "@/lib/api/admin-management";
import {
  PipelineFlowEditor,
  type PipelineStation,
} from "@/components/admin/pipeline-flow-editor";

type JobCreationWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (job: Partial<Job>) => Promise<void>;
};

type WizardStep = "details" | "products" | "review";

type PendingProduct = {
  id: string;
  name: string;
  stations: PipelineStation[];
  planned_quantity: number;
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
  const [pipelinePresets, setPipelinePresets] = useState<PipelinePresetWithSteps[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // New product form
  const [newProductName, setNewProductName] = useState("");
  const [newProductQuantity, setNewProductQuantity] = useState("");
  const [pipelineStations, setPipelineStations] = useState<PipelineStation[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [selectedStationId, setSelectedStationId] = useState("");

  // Load pipeline presets and stations
  const loadData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [presetsRes, stationsRes] = await Promise.all([
        fetchPipelinePresetsAdminApi({ includeInactive: false }),
        fetchStationsAdminApi(),
      ]);
      setPipelinePresets(presetsRes.presets);
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
      setPendingProducts([]);
      setNewProductName("");
      setNewProductQuantity("");
      setPipelineStations([]);
      setSelectedPresetId("");
      setSelectedStationId("");
      setError(null);
    }
  }, [open]);

  const handleLoadPreset = useCallback(() => {
    if (!selectedPresetId) return;

    const preset = pipelinePresets.find((p) => p.id === selectedPresetId);
    if (!preset) return;

    const loadedStations = preset.steps
      .sort((a, b) => a.position - b.position)
      .map((presetStep) => ({
        id: presetStep.station_id,
        station: presetStep.station!,
        position: presetStep.position,
      }))
      .filter((item) => item.station);

    setPipelineStations(loadedStations);
    // Auto-fill name from preset if empty
    if (!newProductName.trim()) {
      setNewProductName(preset.name);
    }
  }, [selectedPresetId, pipelinePresets, newProductName]);

  const handleAddStationToPipeline = useCallback(() => {
    if (!selectedStationId) return;

    const station = stations.find((s) => s.id === selectedStationId);
    if (!station) return;

    if (pipelineStations.some((ps) => ps.id === station.id)) {
      setError("התחנה כבר קיימת בצינור");
      return;
    }

    setPipelineStations((prev) => [
      ...prev,
      {
        id: station.id,
        station,
        position: prev.length + 1,
      },
    ]);

    setSelectedStationId("");
    setError(null);
  }, [selectedStationId, stations, pipelineStations]);

  const handleAddProduct = () => {
    setError(null);

    if (!newProductName.trim()) {
      setError("יש להזין שם מוצר");
      return;
    }

    if (!newProductQuantity || parseInt(newProductQuantity) <= 0) {
      setError("יש להזין כמות מתוכננת חיובית");
      return;
    }

    if (pipelineStations.length === 0) {
      setError("יש להוסיף לפחות תחנה אחת למוצר");
      return;
    }

    const newProduct: PendingProduct = {
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: newProductName.trim(),
      stations: [...pipelineStations],
      planned_quantity: parseInt(newProductQuantity),
    };

    setPendingProducts((prev) => [...prev, newProduct]);
    setNewProductName("");
    setNewProductQuantity("");
    setPipelineStations([]);
    setSelectedPresetId("");
    setSelectedStationId("");
  };

  const handleRemoveProduct = (id: string) => {
    setPendingProducts((prev) => prev.filter((p) => p.id !== id));
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
      if (pendingProducts.length === 0) {
        setError("יש להוסיף לפחות מוצר אחד");
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
      // Create the job (planned_quantity now tracked per job_item)
      const { job } = await createJobAdminApi({
        job_number: jobNumber.trim(),
        customer_name: customerName.trim() || null,
        description: description.trim() || null,
      });

      // Create all job items (products) - Post Phase 5: pipeline-only model
      for (const product of pendingProducts) {
        await createJobItemAdminApi(job.id, {
          name: product.name,
          station_ids: product.stations.map((s) => s.id),
          planned_quantity: product.planned_quantity,
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

  const totalPlannedQuantity = pendingProducts.reduce(
    (sum, product) => sum + product.planned_quantity,
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-right sm:max-w-2xl border-border bg-card max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            יצירת עבודה חדשה
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {step === "details" && "שלב 1: פרטי העבודה הבסיסיים"}
            {step === "products" && "שלב 2: הגדרת מוצרים וצינורות הייצור שלהם"}
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
                    ? "bg-primary text-primary-foreground"
                    : idx < ["details", "products", "review"].indexOf(step)
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-secondary text-muted-foreground border border-input"
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
                      ? "bg-primary"
                      : "bg-border"
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
                <Label htmlFor="wizard_job_number" className="text-foreground/80">
                  מספר עבודה (פק&quot;ע) *
                </Label>
                <Input
                  id="wizard_job_number"
                  placeholder="הזן מספר עבודה"
                  value={jobNumber}
                  onChange={(e) => setJobNumber(e.target.value)}
                  className="border-input bg-secondary text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard_customer" className="text-foreground/80">
                  שם לקוח
                </Label>
                <Input
                  id="wizard_customer"
                  placeholder="שם הלקוח (אופציונלי)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="border-input bg-secondary text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard_description" className="text-foreground/80">
                  תיאור
                </Label>
                <Textarea
                  id="wizard_description"
                  placeholder="תיאור העבודה (אופציונלי)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="border-input bg-secondary text-foreground placeholder:text-muted-foreground min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard_planned" className="text-foreground/80">
                  כמות מתוכננת כוללת
                </Label>
                <Input
                  id="wizard_planned"
                  type="number"
                  min="0"
                  placeholder="כמות יחידות מתוכננת (אופציונלי)"
                  value={plannedQuantity}
                  onChange={(e) => setPlannedQuantity(e.target.value)}
                  className="border-input bg-secondary text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
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
                      כל מוצר מגדיר צינור ייצור - רצף תחנות שהעובדים יעברו בהן.
                    </span>
                  </p>
                </div>
              </div>

              {/* Current Products */}
              {pendingProducts.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-foreground/80">מוצרים שנוספו</Label>
                  <div className="space-y-2">
                    {pendingProducts.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-input"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                            <Workflow className="h-4 w-4 text-purple-400" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {product.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {product.stations.length} שלבים:{" "}
                              {product.stations.slice(0, 3).map((s) => s.station.name).join(" → ")}
                              {product.stations.length > 3 && " ..."}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="secondary"
                            className="bg-secondary text-foreground/70 border-input"
                          >
                            {product.planned_quantity.toLocaleString()} יח&apos;
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveProduct(product.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add New Product */}
              <div className="space-y-3 p-4 rounded-xl bg-secondary/30 border border-input">
                <Label className="text-foreground/80">הוסף מוצר</Label>

                {isLoadingData ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-transparent border-t-primary" />
                  </div>
                ) : (
                  <>
                    {/* Product Name */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-foreground/80">שם המוצר *</Label>
                      <Input
                        placeholder="הזן שם מוצר"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        className="border-input bg-secondary text-foreground placeholder:text-muted-foreground"
                      />
                    </div>

                    {/* Pipeline Flow Editor */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-foreground/80">צינור הייצור *</Label>
                      <PipelineFlowEditor
                        stations={pipelineStations}
                        onStationsChange={setPipelineStations}
                        availableStations={stations}
                        presets={pipelinePresets}
                        selectedPresetId={selectedPresetId}
                        onPresetSelect={setSelectedPresetId}
                        onLoadPreset={handleLoadPreset}
                        selectedStationId={selectedStationId}
                        onStationSelect={setSelectedStationId}
                        onAddStation={handleAddStationToPipeline}
                        variant="compact"
                      />
                    </div>

                    {/* Quantity and Add Button */}
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="1"
                        placeholder="כמות מתוכננת"
                        value={newProductQuantity}
                        onChange={(e) => setNewProductQuantity(e.target.value)}
                        className="flex-1 border-input bg-secondary text-foreground placeholder:text-muted-foreground"
                      />
                      <Button
                        onClick={handleAddProduct}
                        disabled={
                          !newProductName.trim() ||
                          pipelineStations.length === 0 ||
                          !newProductQuantity
                        }
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Plus className="h-4 w-4 ml-1" />
                        הוסף מוצר
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
              <div className="p-4 rounded-xl bg-secondary/50 border border-input space-y-3">
                <h4 className="font-semibold text-foreground flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  פרטי העבודה
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">מספר עבודה:</span>
                    <span className="mr-2 font-mono font-bold text-foreground">
                      {jobNumber}
                    </span>
                  </div>
                  {customerName && (
                    <div>
                      <span className="text-muted-foreground">לקוח:</span>
                      <span className="mr-2 text-foreground">{customerName}</span>
                    </div>
                  )}
                  {plannedQuantity && (
                    <div>
                      <span className="text-muted-foreground">כמות מתוכננת:</span>
                      <span className="mr-2 text-foreground">
                        {parseInt(plannedQuantity).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
                {description && (
                  <div className="pt-2 border-t border-input">
                    <span className="text-muted-foreground text-sm">תיאור:</span>
                    <p className="text-foreground/80 text-sm mt-1">{description}</p>
                  </div>
                )}
              </div>

              {/* Products Summary */}
              <div className="p-4 rounded-xl bg-secondary/50 border border-input space-y-3">
                <h4 className="font-semibold text-foreground flex items-center gap-2">
                  <Package className="h-4 w-4 text-purple-400" />
                  מוצרים ({pendingProducts.length})
                </h4>
                <div className="space-y-2">
                  {pendingProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between py-2 border-b border-input/50 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <Workflow className="h-4 w-4 text-purple-400" />
                        <span className="text-foreground">{product.name}</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-secondary text-muted-foreground"
                        >
                          {product.stations.length} שלבים
                        </Badge>
                      </div>
                      <span className="font-mono text-foreground/80">
                        {product.planned_quantity.toLocaleString()} יח&apos;
                      </span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-input flex justify-between">
                  <span className="text-muted-foreground">סה&quot;כ כמות מתוכננת:</span>
                  <span className="font-mono font-bold text-primary">
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
        <DialogFooter className="flex-shrink-0 flex-row-reverse justify-between border-t border-border pt-4 mt-4">
          <div className="flex gap-2">
            {step !== "details" && (
              <Button
                variant="outline"
                onClick={handlePrevStep}
                disabled={isSubmitting}
                className="border-input bg-secondary text-foreground/80 hover:bg-muted"
              >
                <ChevronRight className="h-4 w-4 ml-1" />
                חזרה
              </Button>
            )}

            {step === "review" ? (
              <Button
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
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
                className="bg-primary text-primary-foreground hover:bg-primary/90"
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
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
