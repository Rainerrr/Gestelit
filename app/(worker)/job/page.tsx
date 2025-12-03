"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FormSection } from "@/components/forms/form-section";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkerSession } from "@/contexts/WorkerSessionContext";
import { createJobSessionApi } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export default function JobPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { worker, station, setJob, setSessionId, setSessionStartedAt, setCurrentStatus } =
    useWorkerSession();
  const [jobNumber, setJobNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!worker) {
      router.replace("/login");
      return;
    }
    if (worker && !station) {
      router.replace("/station");
    }
  }, [worker, station, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = jobNumber.trim();
    if (!trimmed) {
      setError(t("job.error.required"));
      return;
    }

    if (!worker || !station) {
      return;
    }

    setIsSubmitting(true);
    try {
      const { job, session } = await createJobSessionApi(
        worker.id,
        station.id,
        trimmed,
      );
      setJob(job);
      setSessionId(session.id);
      setSessionStartedAt(session.started_at ?? null);
      setCurrentStatus(undefined);
      setError(null);
      router.push("/checklist/start");
    } catch {
      setError(t("job.error.generic"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!worker || !station) {
    return null;
  }

  return (
    <>
      <PageHeader
        eyebrow={worker.full_name}
        title={t("job.title")}
        subtitle={t("job.subtitle")}
        actions={
          <Badge variant="secondary">
            {`${t("common.station")}: ${station.name}`}
          </Badge>
        }
      />
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <FormSection
          title={t("job.title")}
          description={t("job.subtitle")}
          footer={
            <Button
              type="submit"
              size="lg"
              className="w-full justify-center sm:w-auto sm:min-w-48"
              disabled={isSubmitting}
            >
              {t("job.submit")}
            </Button>
          }
        >
          <div className="space-y-2">
            <Label htmlFor="jobNumber">{t("job.numberLabel")}</Label>
            <Input
              id="jobNumber"
              placeholder={t("job.numberPlaceholder")}
              value={jobNumber}
              onChange={(event) => setJobNumber(event.target.value)}
              className={cn(
                "text-right",
                error ? "border-rose-500 focus-visible:ring-rose-500" : "",
              )}
            />
            <div className="flex items-center justify-between text-xs">
              <p className="text-slate-500">{t("job.subtitle")}</p>
              {error ? (
                <span className="text-rose-600">{error}</span>
              ) : null}
            </div>
          </div>
        </FormSection>
      </form>
    </>
  );
}

