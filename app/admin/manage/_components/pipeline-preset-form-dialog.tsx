"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import type { PipelinePresetWithSteps } from "@/lib/types";

type PipelinePresetFormDialogProps = {
  mode: "create" | "edit";
  preset?: PipelinePresetWithSteps | null;
  onSubmit: (payload: { name: string; description?: string | null; is_active?: boolean }) => Promise<void>;
  trigger: ReactNode;
  loading?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const PipelinePresetFormDialog = ({
  mode,
  preset,
  onSubmit,
  trigger,
  loading = false,
  open,
  onOpenChange,
}: PipelinePresetFormDialogProps) => {
  const [localOpen, setLocalOpen] = useState(false);
  const [name, setName] = useState(preset?.name ?? "");
  const [description, setDescription] = useState(preset?.description ?? "");
  const [isActive, setIsActive] = useState(preset?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const controlledOpen = open ?? localOpen;

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setError(null);
      setSuccessMessage(null);
    }
    (onOpenChange ?? setLocalOpen)(open);
  };

  // Sync dialog fields when editing an existing preset
  useEffect(() => {
    if (!preset || mode !== "edit") return;
    setName(preset.name);
    setDescription(preset.description ?? "");
    setIsActive(preset.is_active);
  }, [preset, mode]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("יש למלא שם תבנית.");
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        is_active: isActive,
      });

      setSuccessMessage("התבנית נשמרה בהצלחה.");
      setError(null);

      // Keep dialog open if controlled, otherwise close for create mode
      if (mode === "create" && !open) {
        setLocalOpen(false);
        setName("");
        setDescription("");
        setIsActive(true);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || "שגיאה בשמירת התבנית");
      setSuccessMessage(null);
    }
  };

  const dialogTitle = mode === "create" ? "הוספת תבנית צינור" : "עריכת תבנית צינור";

  return (
    <Dialog open={controlledOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="text-right sm:max-w-lg border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">{dialogTitle}</DialogTitle>
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

          {/* Preset Name */}
          <div className="space-y-1.5">
            <Label htmlFor="preset_name" className="text-foreground/80 text-sm">
              שם תבנית
            </Label>
            <Input
              id="preset_name"
              aria-label="שם תבנית"
              placeholder="לדוגמה: צינור הדפסה מלא"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="border-input bg-secondary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Preset Description */}
          <div className="space-y-1.5">
            <Label htmlFor="preset_description" className="text-foreground/80 text-sm">
              תיאור (אופציונלי)
            </Label>
            <Textarea
              id="preset_description"
              aria-label="תיאור תבנית"
              placeholder="תיאור קצר של התבנית"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="border-input bg-secondary text-foreground placeholder:text-muted-foreground resize-none"
              rows={3}
            />
          </div>

          {/* Active/Inactive Toggle */}
          <div className="space-y-1.5">
            <Label className="text-foreground/80 text-sm">סטטוס תבנית</Label>
            <div className="flex rounded-lg border border-input bg-secondary/30 p-1">
              <button
                type="button"
                onClick={() => setIsActive(true)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground/80 hover:bg-muted"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-white" : "bg-muted-foreground"}`}
                />
                פעיל
              </button>
              <button
                type="button"
                onClick={() => setIsActive(false)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  !isActive
                    ? "bg-muted text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground/80 hover:bg-muted"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${!isActive ? "bg-white" : "bg-muted-foreground"}`}
                />
                לא פעיל
              </button>
            </div>
          </div>
        </div>
        <DialogFooter className="justify-start gap-2 mt-4">
          <Button
            onClick={() => void handleSubmit()}
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            {loading ? "שומר..." : "שמור"}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleDialogOpenChange(false)}
            disabled={loading}
            className="border-input bg-secondary text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
