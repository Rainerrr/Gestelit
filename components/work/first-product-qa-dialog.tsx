"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { Camera, Upload, X, Clock, CheckCircle2 } from "lucide-react";
import type { Report } from "@/lib/types";

// ============================================
// TYPES
// ============================================

export type FirstProductQADialogMode = "request" | "waiting" | "approved";

export type FirstProductQADialogProps = {
  /** Whether the dialog is open */
  open: boolean;
  /** Current mode of the dialog */
  mode: FirstProductQADialogMode;
  /** Job item name for context */
  jobItemName?: string;
  /** Job number for context */
  jobNumber?: string;
  /** Pending report (for waiting mode) */
  pendingReport?: Report | null;
  /** Callback when QA request is submitted */
  onSubmit: (data: { description?: string; image?: File | null }) => void;
  /** Callback when dialog is cancelled/closed */
  onCancel: () => void;
  /** If true, dialog cannot be dismissed (request mode only) */
  required?: boolean;
  /** If true, show loading state */
  isSubmitting?: boolean;
};

// ============================================
// COMPONENT
// ============================================

export function FirstProductQADialog({
  open,
  mode,
  jobItemName,
  jobNumber,
  pendingReport,
  onSubmit,
  onCancel,
  required = false,
  isSubmitting = false,
}: FirstProductQADialogProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State for request mode
  const [description, setDescription] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setDescription("");
      setSelectedImage(null);
      setImagePreview(null);
    }
  }, [open]);

  // Create image preview when file is selected
  useEffect(() => {
    if (!selectedImage) {
      setImagePreview(null);
      return;
    }

    const url = URL.createObjectURL(selectedImage);
    setImagePreview(url);

    return () => URL.revokeObjectURL(url);
  }, [selectedImage]);

  // Handlers
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedImage(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  }, []);

  const handleRemoveImage = useCallback(() => {
    setSelectedImage(null);
    setImagePreview(null);
  }, []);

  const handleSubmit = useCallback(() => {
    onSubmit({
      description: description.trim() || undefined,
      image: selectedImage,
    });
  }, [description, selectedImage, onSubmit]);

  const handleDialogChange = useCallback((isOpen: boolean) => {
    if (!isOpen && !required) {
      onCancel();
    }
  }, [required, onCancel]);

  // Render based on mode
  const renderContent = () => {
    switch (mode) {
      case "waiting":
        return renderWaitingContent();
      case "approved":
        return renderApprovedContent();
      case "request":
      default:
        return renderRequestContent();
    }
  };

  const renderRequestContent = () => (
    <>
      <DialogHeader>
        <DialogTitle>בדיקת מוצר ראשון</DialogTitle>
        <DialogDescription>
          {jobNumber && jobItemName
            ? `נדרש אישור QA לפני תחילת ייצור - עבודה ${jobNumber}, ${jobItemName}`
            : "נדרש אישור QA לפני תחילת ייצור בתחנה זו"}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        {/* Info banner */}
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <p>
            צלם תמונה של המוצר הראשון והוסף הערות (אופציונלי).
            <br />
            הבקשה תישלח לאישור מנהל לפני שתוכל להתחיל לייצר.
          </p>
        </div>

        {/* Image upload */}
        <div className="space-y-2">
          <Label>תמונה (אופציונלי)</Label>
          <div className="flex flex-col gap-2">
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="תצוגה מקדימה"
                  className="max-h-48 w-full rounded-lg object-contain border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 left-2 h-8 w-8"
                  onClick={handleRemoveImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-24 border-dashed"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center gap-1">
                  <Camera className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">לחץ לצילום/העלאת תמונה</span>
                </div>
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="qa-description">הערות (אופציונלי)</Label>
          <Textarea
            id="qa-description"
            placeholder="הוסף הערות על המוצר הראשון..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        {!required ? (
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {t("common.cancel")}
          </Button>
        ) : null}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="min-w-32"
        >
          {isSubmitting ? "שולח..." : "שלח לאישור"}
        </Button>
      </DialogFooter>
    </>
  );

  const renderWaitingContent = () => (
    <>
      <DialogHeader>
        <DialogTitle>ממתין לאישור QA</DialogTitle>
        <DialogDescription>
          {jobNumber && jobItemName
            ? `עבודה ${jobNumber}, ${jobItemName}`
            : "בקשת אישור מוצר ראשון נשלחה"}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="font-medium text-lg">הבקשה נשלחה לאישור</p>
            <p className="text-sm text-muted-foreground mt-1">
              ממתין לאישור מנהל לפני תחילת הייצור
            </p>
          </div>
          {pendingReport?.created_at ? (
            <p className="text-xs text-muted-foreground">
              נשלח ב: {new Date(pendingReport.created_at).toLocaleString("he-IL")}
            </p>
          ) : null}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          סגור
        </Button>
      </DialogFooter>
    </>
  );

  const renderApprovedContent = () => (
    <>
      <DialogHeader>
        <DialogTitle>QA אושר</DialogTitle>
        <DialogDescription>
          {jobNumber && jobItemName
            ? `עבודה ${jobNumber}, ${jobItemName}`
            : "אישור מוצר ראשון התקבל"}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="font-medium text-lg">בדיקת מוצר ראשון אושרה</p>
            <p className="text-sm text-muted-foreground mt-1">
              ניתן להתחיל בייצור
            </p>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button onClick={onCancel}>
          המשך לייצור
        </Button>
      </DialogFooter>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-md text-right">
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
