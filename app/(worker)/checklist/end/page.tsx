"use client";

import { FormEvent, useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";
import { ChecklistItemsList } from "@/components/checklists/checklist-items";
import { FormSection } from "@/components/forms/form-section";
import { PageHeader } from "@/components/layout/page-header";
import { BackButton } from "@/components/navigation/back-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkerSession } from "@/contexts/WorkerSessionContext";
import {
  completeSessionApi,
  fetchChecklistApi,
  submitChecklistResponsesApi,
} from "@/lib/api/client";
import { SESSION_FLAG_THRESHOLDS } from "@/lib/config/session-flags";
import type { StationChecklist, StationChecklistItem } from "@/lib/types";
import { ScrapReportDialog } from "../_components/scrap-report-dialog";

export default function ClosingChecklistPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const {
    worker,
    station,
    job,
    sessionId,
    totals,
    completeChecklist,
    reset,
    setWorker,
  } = useWorkerSession();
  const [responses, setResponses] = useState<Record<string, boolean>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [scrapReportDialogOpen, setScrapReportDialogOpen] = useState(false);
  const [scrapReportSubmitted, setScrapReportSubmitted] = useState(false);

  // Determine if scrap report is required
  const scrapCount = totals.scrap;
  const scrapReportRequired = scrapCount >= SESSION_FLAG_THRESHOLDS.maxScrap;

  type ChecklistState = {
    loading: boolean;
    checklist: StationChecklist | null;
  };

  const [state, dispatch] = useReducer(
    (
      prev: ChecklistState,
      action:
        | { type: "start" }
        | { type: "resolve"; payload: StationChecklist | null },
    ) => {
      switch (action.type) {
        case "start":
          return { ...prev, loading: true };
        case "resolve":
          return { loading: false, checklist: action.payload };
        default:
          return prev;
      }
    },
    { loading: true, checklist: null },
  );

  useEffect(() => {
    if (!worker) {
      router.replace("/login");
      return;
    }
    if (worker && !station) {
      router.replace("/station");
      return;
    }
    if (worker && station && !job) {
      router.replace("/job");
      return;
    }
  }, [worker, station, job, router]);

  useEffect(() => {
    if (!station) {
      return;
    }
    let active = true;
    dispatch({ type: "start" });
    fetchChecklistApi(station.id, "end")
      .then((result) => {
        if (!active) return;
        dispatch({ type: "resolve", payload: result });
      })
      .catch(() => {
        if (!active) return;
        dispatch({ type: "resolve", payload: null });
      });
    return () => {
      active = false;
    };
  }, [station]);

  if (!worker || !station || !job || !sessionId) {
    return null;
  }

  const checklist = state.checklist;
  const totalItems = checklist?.items.length ?? 0;
  const requiredItems =
    checklist?.items.filter((item) => item.is_required).length ?? 0;

  const toggleItem = (itemId: string, value: boolean) => {
    setResponses((prev) => ({ ...prev, [itemId]: value }));
  };

  const getLabel = (item: StationChecklistItem) =>
    language === "he" ? item.label_he : item.label_ru;

  const checklistValid =
    checklist?.items.every(
      (item) => !item.is_required || responses[item.id],
    ) ?? false;

  // Block submission if scrap report is required but not submitted
  const scrapReportBlocking = scrapReportRequired && !scrapReportSubmitted;
  const isValid = checklistValid && !scrapReportBlocking;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!checklistValid || !sessionId) {
      return;
    }

    // If scrap report is required and not submitted, show the dialog
    if (scrapReportRequired && !scrapReportSubmitted) {
      setScrapReportDialogOpen(true);
      return;
    }

    setSubmitError(null);
    try {
      const payload = Object.entries(responses).map(
        ([item_id, value_bool]) => ({
          item_id,
          value_bool,
        }),
      );
      await submitChecklistResponsesApi(
        sessionId,
        station.id,
        "end",
        payload,
      );
      await completeSessionApi(sessionId);
      completeChecklist("end");
      setIsSubmitted(true);
    } catch {
      setSubmitError(t("checklist.error.submit"));
    }
  };

  const handleScrapReportSubmitted = () => {
    setScrapReportDialogOpen(false);
    setScrapReportSubmitted(true);
  };

  const handleReturnToStations = () => {
    if (!worker) {
      router.push("/login");
      return;
    }
    const currentWorker = worker;
    reset();
    setWorker(currentWorker);
    router.push("/station");
  };

  return (
    <>
      <BackButton href="/work" />
      <PageHeader
        eyebrow={job.job_number}
        title={t("checklist.end.title")}
        subtitle={t("checklist.end.subtitle")}
      />
      <form onSubmit={handleSubmit} className="max-w-3xl space-y-4">
        <FormSection
          title={t("checklist.end.title")}
          description={t("checklist.required")}
          footer={
            <Button
              type="submit"
              size="lg"
              className="min-w-48 bg-primary font-medium text-primary-foreground hover:bg-primary/90"
              disabled={!isValid || isSubmitted}
            >
              {t("checklist.submit")}
            </Button>
          }
        >
          {state.loading ? (
            <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-right text-sm text-muted-foreground">
              {t("checklist.loading")}
            </p>
          ) : !checklist ? (
            <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-right text-sm text-muted-foreground">
              {t("checklist.empty")}
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap justify-end gap-3 text-xs text-muted-foreground">
                <Badge variant="secondary" className="border-border bg-secondary text-foreground/80">
                  {`${requiredItems}/${totalItems} ${t("checklist.item.required")}`}
                </Badge>
              </div>
              <ChecklistItemsList
                items={checklist.items}
                responses={responses}
                onToggle={toggleItem}
                getLabel={getLabel}
                requiredLabel={t("checklist.item.required")}
                disabled={isSubmitted}
              />
            </>
          )}
        </FormSection>

        {/* Scrap report section */}
        {scrapReportRequired && !isSubmitted ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-50 p-4 text-right dark:border-amber-500/30 dark:bg-amber-500/10">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 dark:bg-amber-500/20">
                <Trash2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium text-amber-700 dark:text-amber-400">
                    {t("checklist.scrap.dialog.title")}
                  </h3>
                  {scrapReportSubmitted ? (
                    <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      <CheckCircle2 className="h-3.5 w-3.5 ml-1" />
                      {t("checklist.scrap.submitted")}
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
                      {t("checklist.scrap.required")}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-amber-600/80 dark:text-amber-400/80">
                  {t("checklist.scrap.dialog.warning")}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">
                    {t("checklist.scrap.count")}: <span className="font-medium text-amber-600 dark:text-amber-400">{scrapCount}</span>
                  </span>
                </div>
                {!scrapReportSubmitted ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setScrapReportDialogOpen(true)}
                    className="mt-2 border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
                  >
                    <Trash2 className="h-4 w-4 ml-2" />
                    {t("checklist.scrap.fillReport")}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {submitError ? (
          <p className="text-right text-sm text-rose-600 dark:text-rose-400">{submitError}</p>
        ) : null}

        {isSubmitted ? (
          <Alert className="border-emerald-600/30 bg-emerald-50 text-right dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <AlertTitle className="text-emerald-700 dark:text-emerald-400">{t("summary.completed")}</AlertTitle>
            <AlertDescription className="mt-2">
              <Button onClick={handleReturnToStations} className="bg-primary font-medium text-primary-foreground hover:bg-primary/90">
                {t("summary.newSession")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </form>

      {/* Scrap report dialog */}
      <ScrapReportDialog
        open={scrapReportDialogOpen}
        sessionId={sessionId}
        stationId={station.id}
        workerId={worker?.id}
        scrapCount={scrapCount}
        onSubmitted={handleScrapReportSubmitted}
        onCancel={() => setScrapReportDialogOpen(false)}
      />
    </>
  );
}

