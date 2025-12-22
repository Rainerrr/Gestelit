"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FormSection } from "@/components/forms/form-section";
import { LanguageSelect } from "@/components/language/language-select";
import { PageHeader } from "@/components/layout/page-header";
import { BackButton } from "@/components/navigation/back-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkerSession } from "@/contexts/WorkerSessionContext";
import { fetchWorkerActiveSessionApi, loginWorkerApi } from "@/lib/api/client";
import type { SupportedLanguage } from "@/lib/i18n/translations";

export default function LoginPage() {
  const router = useRouter();
  const { t, setLanguage } = useTranslation();
  const {
    setWorker,
    reset,
    setPendingRecovery,
  } = useWorkerSession();
  const [workerId, setWorkerId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedId = workerId.trim();

    if (!trimmedId) {
      setError(t("login.error.required"));
      return;
    }

    try {
      const worker = await loginWorkerApi(trimmedId);
      reset();
      setWorker(worker);
      // Store worker code for API authentication
      if (typeof window !== "undefined") {
        window.localStorage.setItem("workerCode", worker.worker_code);
      }
      if (worker.language && worker.language !== "auto") {
        setLanguage(worker.language as SupportedLanguage);
      }
      setError(null);
      let activeSession = null;
      try {
        activeSession = await fetchWorkerActiveSessionApi(worker.id);
      } catch (sessionError) {
        console.error("[login] Failed to fetch active session", sessionError);
      }
      if (activeSession) {
        setPendingRecovery(activeSession);
        router.push("/station");
        return;
      }
      router.push("/station");
    } catch {
      setError(t("login.error.notFound"));
    }
  };

  return (
    <>
      <BackButton href="/" />
      <PageHeader
        eyebrow={t("app.tagline")}
        title={t("login.title")}
        subtitle={t("login.subtitle")}
      />
      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        <FormSection
          title={t("login.title")}
          description={t("login.subtitle")}
          footer={
            <Button
              type="submit"
              size="lg"
              className="w-full justify-center bg-primary font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto sm:min-w-48"
            >
              {t("login.submit")}
            </Button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="worker" className="text-muted-foreground">{t("login.workerIdLabel")}</Label>
              <Input
                id="worker"
                inputMode="numeric"
                placeholder={t("login.workerIdPlaceholder")}
                value={workerId}
                onChange={(event) => setWorkerId(event.target.value)}
                className="border-border bg-white text-right text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:ring-primary/30 dark:bg-secondary"
              />
              <p className="text-xs text-muted-foreground">
                {t("login.subtitle")}
              </p>
            </div>
            <LanguageSelect
              label={t("login.languageLabel")}
              className="self-start"
            />
          </div>

          {error ? (
            <Alert variant="destructive" className="border-rose-600/30 bg-rose-50 text-right dark:border-rose-500/30 dark:bg-rose-500/10">
              <AlertTitle className="text-rose-700 dark:text-rose-400">{t("login.title")}</AlertTitle>
              <AlertDescription className="text-rose-600 dark:text-rose-300">{error}</AlertDescription>
            </Alert>
          ) : null}
        </FormSection>
      </form>

    </>
  );
}

