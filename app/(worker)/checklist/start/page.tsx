"use client";

import { FormEvent, useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { ChecklistItemsList } from "@/components/checklists/checklist-items";
import { FormSection } from "@/components/forms/form-section";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkerSession } from "@/contexts/WorkerSessionContext";
import {
  fetchChecklistApi,
  startStatusEventApi,
  submitChecklistResponsesApi,
} from "@/lib/api/client";
import type { StationChecklist, StationChecklistItem } from "@/lib/types";

export default function OpeningChecklistPage() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const {
    worker,
    station,
    job,
    sessionId,
    completeChecklist,
    setCurrentStatus,
  } = useWorkerSession();

  const [responses, setResponses] = useState<Record<string, boolean>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

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
    fetchChecklistApi(station.id, "start")
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

  const isValid =
    checklist?.items.every(
      (item) => !item.is_required || responses[item.id],
    ) ?? false;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) {
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
        "start",
        payload,
      );
      await startStatusEventApi({
        sessionId,
        status: "setup",
      });
      completeChecklist("start");
      setCurrentStatus("setup");
      router.push("/work");
    } catch {
      setSubmitError(t("checklist.error.submit"));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={job.job_number}
        title={t("checklist.start.title")}
        subtitle={t("checklist.start.subtitle")}
      />
      <form onSubmit={handleSubmit} className="max-w-3xl">
        <FormSection
          title={t("checklist.start.title")}
          description={t("checklist.required")}
          footer={
            <Button
              type="submit"
              size="lg"
              className="min-w-48"
              disabled={!isValid}
            >
              {t("checklist.submit")}
            </Button>
          }
        >
          {state.loading ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-right text-sm text-slate-600">
              {t("checklist.loading")}
            </p>
          ) : !checklist ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-right text-sm text-slate-600">
              {t("checklist.empty")}
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap justify-end gap-3 text-xs text-slate-600">
                <Badge variant="secondary">
                  {`${requiredItems}/${totalItems} ${t("checklist.item.required")}`}
                </Badge>
              </div>
              <ChecklistItemsList
                items={checklist.items}
                responses={responses}
                onToggle={toggleItem}
                getLabel={getLabel}
                requiredLabel={t("checklist.item.required")}
              />
            </>
          )}
        </FormSection>
        {submitError ? (
          <p className="text-right text-sm text-rose-600">{submitError}</p>
        ) : null}
      </form>
    </>
  );
}

