"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ClipboardCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  Camera,
  X,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

export type FirstProductApprovalBannerStatus =
  | "needs_submission"
  | "pending"
  | "approved"
  | null;

export type FirstProductApprovalSubmitData = {
  description?: string;
  image?: File;
};

type FirstProductApprovalBannerProps = {
  status: FirstProductApprovalBannerStatus;
  onSubmit: (data: FirstProductApprovalSubmitData) => void;
  jobItemName?: string;
  stationName?: string;
  isSubmitting?: boolean;
  className?: string;
};

export const FirstProductApprovalBanner = ({
  status,
  onSubmit,
  jobItemName,
  stationName,
  isSubmitting = false,
  className,
}: FirstProductApprovalBannerProps) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = () => {
    onSubmit({
      description: description.trim() || undefined,
      image: image || undefined,
    });
  };

  // Don't render if no approval is required
  if (!status) {
    return null;
  }

  // Render compact approved state that auto-hides
  if (status === "approved") {
    return (
      <div
        className={cn(
          "rounded-lg border px-3 py-2 transition-all duration-300",
          "border-emerald-500/30 bg-emerald-500/10",
          className
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span className="text-sm font-medium text-emerald-400">
              {t("firstProductApproved")}
            </span>
          </div>
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]"
          >
            {t("approved")}
          </Badge>
        </div>
      </div>
    );
  }

  const isPending = status === "pending";
  const needsSubmission = status === "needs_submission";

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-200",
        needsSubmission
          ? "border-amber-500/50 bg-amber-500/10"
          : "border-blue-500/50 bg-blue-500/10",
        className
      )}
    >
      {/* Header - always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              needsSubmission
                ? "bg-amber-500/20 border border-amber-500/30"
                : "bg-blue-500/20 border border-blue-500/30"
            )}
          >
            {needsSubmission ? (
              <AlertCircle className="h-5 w-5 text-amber-400" />
            ) : (
              <Clock className="h-5 w-5 text-blue-400" />
            )}
          </div>
          <div className="text-right">
            <h3
              className={cn(
                "font-semibold",
                needsSubmission ? "text-amber-300" : "text-blue-300"
              )}
            >
              {t("firstProductApprovalRequired")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {needsSubmission
                ? t("firstProductSubmitDescription")
                : t("firstProductPendingDescription")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              needsSubmission
                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                : "border-blue-500/30 bg-blue-500/10 text-blue-400"
            )}
          >
            {needsSubmission ? t("awaiting") : t("pending")}
          </Badge>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border/30 pt-3">
          {/* Context info */}
          {(jobItemName || stationName) && (
            <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {jobItemName && (
                <span className="px-2 py-0.5 rounded bg-secondary/50 border border-input">
                  {t("product")}: <span className="text-foreground">{jobItemName}</span>
                </span>
              )}
              {stationName && (
                <span className="px-2 py-0.5 rounded bg-secondary/50 border border-input">
                  {t("station")}: <span className="text-foreground">{stationName}</span>
                </span>
              )}
            </div>
          )}

          {/* Submission form */}
          {needsSubmission && (
            <div className="space-y-3">
              {/* Description input (optional) */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  {t("descriptionOptional")}
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("firstProductDescriptionPlaceholder")}
                  className="min-h-[60px] bg-background/50 border-border/60 resize-none text-sm"
                  disabled={isSubmitting}
                />
              </div>

              {/* Image upload (optional) */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  {t("imageOptional")}
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageSelect}
                  className="hidden"
                  disabled={isSubmitting}
                />

                {imagePreview ? (
                  <div className="relative inline-block">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-20 w-auto rounded-lg border border-border/60 object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      disabled={isSubmitting}
                      className="absolute -top-2 -left-2 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting}
                    className="gap-2 border-dashed border-border/60 text-muted-foreground hover:text-foreground"
                  >
                    <Camera className="h-4 w-4" />
                    {t("addPhoto")}
                  </Button>
                )}
              </div>

              {/* Submit button */}
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-medium"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-transparent border-t-black mr-2" />
                    {t("submitting")}...
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="h-4 w-4 mr-2" />
                    {t("submitFirstProductReport")}
                  </>
                )}
              </Button>
            </div>
          )}

          {isPending && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-blue-400">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-transparent border-t-blue-400" />
              {t("waitingForApproval")}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
