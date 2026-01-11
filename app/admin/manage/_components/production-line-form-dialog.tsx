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
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import type { ProductionLineWithStations } from "@/lib/types";

type ProductionLineFormDialogProps = {
  mode: "create" | "edit";
  line?: ProductionLineWithStations | null;
  onSubmit: (payload: { name: string; code?: string | null; is_active?: boolean }) => Promise<void>;
  trigger: ReactNode;
  loading?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const ProductionLineFormDialog = ({
  mode,
  line,
  onSubmit,
  trigger,
  loading = false,
  open,
  onOpenChange,
}: ProductionLineFormDialogProps) => {
  const [localOpen, setLocalOpen] = useState(false);
  const [name, setName] = useState(line?.name ?? "");
  const [code, setCode] = useState(line?.code ?? "");
  const [isActive, setIsActive] = useState(line?.is_active ?? true);
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

  // Sync dialog fields when editing an existing line
  useEffect(() => {
    if (!line || mode !== "edit") return;
    setName(line.name);
    setCode(line.code ?? "");
    setIsActive(line.is_active);
  }, [line, mode]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("יש למלא שם קו ייצור.");
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await onSubmit({
        name: name.trim(),
        code: code.trim() || null,
        is_active: isActive,
      });

      setSuccessMessage("קו הייצור נשמר בהצלחה.");
      setError(null);

      // Keep dialog open if controlled, otherwise close for create mode
      if (mode === "create" && !open) {
        setLocalOpen(false);
        setName("");
        setCode("");
        setIsActive(true);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage === "CODE_ALREADY_EXISTS") {
        setError("קוד קו ייצור כבר קיים במערכת.");
      } else {
        setError(errorMessage || "שגיאה בשמירת קו הייצור");
      }
      setSuccessMessage(null);
    }
  };

  const dialogTitle = mode === "create" ? "הוספת קו ייצור" : "עריכת קו ייצור";

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

          {/* Line Name */}
          <div className="space-y-1.5">
            <Label htmlFor="line_name" className="text-foreground/80 text-sm">
              שם קו ייצור
            </Label>
            <Input
              id="line_name"
              aria-label="שם קו ייצור"
              placeholder="לדוגמה: קו הדפסה ראשי"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="border-input bg-secondary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Line Code */}
          <div className="space-y-1.5">
            <Label htmlFor="line_code" className="text-foreground/80 text-sm">
              קוד (אופציונלי)
            </Label>
            <Input
              id="line_code"
              aria-label="קוד קו ייצור"
              placeholder="קוד ייחודי"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="border-input bg-secondary text-foreground placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              קוד ייחודי לזיהוי קו הייצור (אם לא מוזן, יישאר ריק)
            </p>
          </div>

          {/* Active/Inactive Toggle */}
          <div className="space-y-1.5">
            <Label className="text-foreground/80 text-sm">סטטוס קו ייצור</Label>
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
