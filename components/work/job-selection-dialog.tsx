"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import {
  fetchAvailableJobsForStationApi,
  fetchJobItemsForStationJobApi,
  type AvailableJob,
  type AvailableJobItem,
} from "@/lib/api/client";

// ============================================
// TYPES
// ============================================

export type JobSelectionResult = {
  job: AvailableJob;
  jobItem: AvailableJobItem;
};

export type JobSelectionDialogProps = {
  /** Whether the dialog is open */
  open: boolean;
  /** Station ID to find available jobs for */
  stationId: string;
  /** Callback when a job item is selected */
  onSelect: (result: JobSelectionResult) => void;
  /** Callback when dialog is cancelled */
  onCancel: () => void;
  /** If true, dialog cannot be dismissed without selection */
  required?: boolean;
  /** If true, show loading state */
  isSubmitting?: boolean;
};

// ============================================
// COMPONENT
// ============================================

export const JobSelectionDialog = ({
  open,
  stationId,
  onSelect,
  onCancel,
  required = false,
  isSubmitting = false,
}: JobSelectionDialogProps) => {
  const { t } = useTranslation();

  // State
  const [availableJobs, setAvailableJobs] = useState<AvailableJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<AvailableJob | null>(null);
  const [availableJobItems, setAvailableJobItems] = useState<AvailableJobItem[]>([]);
  const [selectedJobItem, setSelectedJobItem] = useState<AvailableJobItem | null>(null);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isLoadingJobItems, setIsLoadingJobItems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available jobs when dialog opens
  useEffect(() => {
    if (!open || !stationId) {
      return;
    }

    const loadJobs = async () => {
      setIsLoadingJobs(true);
      setError(null);
      try {
        const jobs = await fetchAvailableJobsForStationApi(stationId);
        setAvailableJobs(jobs);
        // Auto-select if only one job
        if (jobs.length === 1) {
          setSelectedJob(jobs[0]);
        }
      } catch (err) {
        console.error("[JobSelectionDialog] Failed to load jobs:", err);
        setError("שגיאה בטעינת עבודות");
      } finally {
        setIsLoadingJobs(false);
      }
    };

    void loadJobs();
  }, [open, stationId]);

  // Load job items when job is selected
  useEffect(() => {
    if (!selectedJob || !stationId) {
      setAvailableJobItems([]);
      setSelectedJobItem(null);
      return;
    }

    const loadJobItems = async () => {
      setIsLoadingJobItems(true);
      setError(null);
      try {
        const items = await fetchJobItemsForStationJobApi(stationId, selectedJob.id);
        setAvailableJobItems(items);
        // Auto-select if only one item
        if (items.length === 1) {
          setSelectedJobItem(items[0]);
        }
      } catch (err) {
        console.error("[JobSelectionDialog] Failed to load job items:", err);
        setError("שגיאה בטעינת פריטי עבודה");
      } finally {
        setIsLoadingJobItems(false);
      }
    };

    void loadJobItems();
  }, [selectedJob, stationId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setAvailableJobs([]);
      setSelectedJob(null);
      setAvailableJobItems([]);
      setSelectedJobItem(null);
      setError(null);
    }
  }, [open]);

  // Handlers
  const handleJobChange = useCallback((jobId: string) => {
    const job = availableJobs.find((j) => j.id === jobId);
    setSelectedJob(job ?? null);
    setSelectedJobItem(null);
  }, [availableJobs]);

  const handleJobItemChange = useCallback((jobItemId: string) => {
    const item = availableJobItems.find((i) => i.id === jobItemId);
    setSelectedJobItem(item ?? null);
  }, [availableJobItems]);

  const handleConfirm = useCallback(() => {
    if (selectedJob && selectedJobItem) {
      onSelect({ job: selectedJob, jobItem: selectedJobItem });
    }
  }, [selectedJob, selectedJobItem, onSelect]);

  const handleDialogChange = useCallback((isOpen: boolean) => {
    if (!isOpen && !required) {
      onCancel();
    }
  }, [required, onCancel]);

  // Computed
  const canConfirm = selectedJob && selectedJobItem && !isSubmitting;
  const isLoading = isLoadingJobs || isLoadingJobItems;

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-md text-right">
        <DialogHeader>
          <DialogTitle>בחר עבודה לייצור</DialogTitle>
          <DialogDescription>
            בחר עבודה ופריט עבודה לפני תחילת הייצור
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Job Selection */}
          <div className="space-y-2">
            <Label htmlFor="job-select">עבודה</Label>
            <Select
              value={selectedJob?.id ?? ""}
              onValueChange={handleJobChange}
              disabled={isLoadingJobs || availableJobs.length === 0}
            >
              <SelectTrigger id="job-select">
                <SelectValue
                  placeholder={
                    isLoadingJobs
                      ? "טוען..."
                      : availableJobs.length === 0
                        ? "אין עבודות זמינות"
                        : "בחר עבודה"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableJobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    <span className="font-medium">{job.jobNumber}</span>
                    {job.clientName ? (
                      <span className="text-muted-foreground mr-2">
                        - {job.clientName}
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Job Item Selection */}
          <div className="space-y-2">
            <Label htmlFor="job-item-select">פריט עבודה</Label>
            <Select
              value={selectedJobItem?.id ?? ""}
              onValueChange={handleJobItemChange}
              disabled={!selectedJob || isLoadingJobItems || availableJobItems.length === 0}
            >
              <SelectTrigger id="job-item-select">
                <SelectValue
                  placeholder={
                    !selectedJob
                      ? "בחר עבודה תחילה"
                      : isLoadingJobItems
                        ? "טוען..."
                        : availableJobItems.length === 0
                          ? "אין פריטי עבודה"
                          : "בחר פריט עבודה"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableJobItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        מתוכנן: {item.plannedQuantity} | בוצע: {item.completedGood} | נותר: {item.remaining}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selected Job Item Summary */}
          {selectedJobItem ? (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">מתוכנן</div>
                  <div className="font-semibold">{selectedJobItem.plannedQuantity}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">בוצע</div>
                  <div className="font-semibold text-green-600">
                    {selectedJobItem.completedGood}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">נותר</div>
                  <div className="font-semibold text-blue-600">
                    {selectedJobItem.remaining}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Error Message */}
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
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
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="min-w-32"
          >
            {isSubmitting || isLoading ? "טוען..." : "התחל ייצור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
