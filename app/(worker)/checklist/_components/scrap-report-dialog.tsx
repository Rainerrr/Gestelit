"use client";

import { useState } from "react";
import Image from "next/image";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { createReportApi } from "@/lib/api/client";

type ScrapReportDialogProps = {
  open: boolean;
  sessionId: string;
  stationId: string;
  workerId?: string;
  scrapCount: number;
  onSubmitted: () => void;
  onCancel: () => void;
};

export const ScrapReportDialog = ({
  open,
  sessionId,
  stationId,
  workerId,
  scrapCount,
  onSubmitted,
  onCancel,
}: ScrapReportDialogProps) => {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageChange = (file: File | null) => {
    setImage(file);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    if (file) {
      setImagePreview(URL.createObjectURL(file));
    } else {
      setImagePreview(null);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await createReportApi({
        type: "scrap",
        sessionId,
        stationId,
        workerId,
        description: note || undefined,
        image: image ?? undefined,
      });

      // Clean up
      setNote("");
      handleImageChange(null);
      onSubmitted();
    } catch (err) {
      console.error("[scrap-report-dialog] Submit failed:", err);
      setError(t("work.error.report"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent dir="rtl" className="border-amber-500/40 bg-card sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="h-7 w-7 text-amber-400" />
          </div>
          <DialogTitle className="text-center text-xl text-foreground">
            {t("checklist.scrap.dialog.title")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t("checklist.scrap.dialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scrap count display */}
          <div className="flex items-center justify-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <Trash2 className="h-5 w-5 text-amber-400" />
            <span className="text-2xl font-bold text-amber-400">{scrapCount}</span>
            <span className="text-sm text-muted-foreground">{t("checklist.scrap.dialog.count")}</span>
          </div>

          {/* Note field */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              {t("work.dialog.report.note")}
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("checklist.scrap.dialog.notePlaceholder")}
              className="border-input bg-secondary text-foreground placeholder:text-muted-foreground min-h-20"
              rows={3}
            />
          </div>

          {/* Image field */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              {t("work.dialog.report.image")}
            </label>
            <div className="space-y-3">
              <Input
                type="file"
                accept="image/*"
                aria-label={t("work.dialog.report.image")}
                className="border-input bg-secondary text-foreground file:bg-muted file:text-muted-foreground"
                onChange={(event) =>
                  handleImageChange(event.target.files?.[0] ?? null)
                }
              />
              {imagePreview ? (
                <div className="overflow-hidden rounded-xl border border-input">
                  <Image
                    src={imagePreview}
                    alt={t("work.dialog.report.image")}
                    width={800}
                    height={400}
                    className="h-48 w-full object-cover"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-input p-4 text-right text-sm text-muted-foreground">
                  {t("work.dialog.report.imagePlaceholder")}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {error ? (
            <p className="w-full text-right text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="border-input text-foreground/80 hover:bg-accent hover:text-foreground"
            onClick={onCancel}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="bg-amber-600 font-medium text-white hover:bg-amber-700"
            disabled={isSubmitting}
            onClick={() => void handleSubmit()}
          >
            {isSubmitting
              ? `${t("checklist.scrap.dialog.submit")}...`
              : t("checklist.scrap.dialog.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
