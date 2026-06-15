"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Clock3,
  IdCard,
  LogIn,
  MonitorCheck,
} from "lucide-react";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { Spinner } from "@/components/ui/spinner";
import { useWorkerSession } from "@/contexts/WorkerSessionContext";
import { fetchWorkerActiveSessionApi, loginWorkerApi } from "@/lib/api/client";
import {
  getPersistedSessionState,
  clearPersistedSessionState,
} from "@/lib/utils/session-storage";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    setWorker,
    reset,
    setPendingRecovery,
  } = useWorkerSession();
  const formRef = useRef<HTMLFormElement>(null);
  const [workerId, setWorkerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoLogging, setIsAutoLogging] = useState(false);
  const autoLoginAttempted = useRef(false);

  // Auto-login on refresh: check sessionStorage for persisted session state
  // and automatically trigger login flow to show recovery dialog
  useEffect(() => {
    if (autoLoginAttempted.current) return;
    autoLoginAttempted.current = true;

    const persisted = getPersistedSessionState();
    if (persisted?.workerCode) {
      setWorkerId(persisted.workerCode);
      setIsAutoLogging(true);
      // Use requestAnimationFrame to ensure state is updated before submit
      requestAnimationFrame(() => {
        formRef.current?.requestSubmit();
      });
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedId = workerId.trim();

    if (!trimmedId) {
      setError(t("login.error.required"));
      return;
    }

    setIsSubmitting(true);
    try {
      const worker = await loginWorkerApi(trimmedId);
      reset();
      setWorker(worker);
      // Store worker code for API authentication
      if (typeof window !== "undefined") {
        window.localStorage.setItem("workerCode", worker.worker_code);
      }
      setError(null);
      let activeSession = null;
      try {
        activeSession = await fetchWorkerActiveSessionApi(worker.id);
      } catch (sessionError) {
        console.error("[login] Failed to fetch active session", sessionError);
      }
      if (activeSession) {
        // Session recovery still goes to station page where the recovery dialog is shown
        setPendingRecovery(activeSession);
        router.push("/station");
        return;
      }
      // New flow: station selection first, job selection deferred to production entry
      router.push("/station");
    } catch {
      setError(t("login.error.notFound"));
      // Clear persisted state if auto-login fails (worker code no longer valid)
      if (isAutoLogging) {
        clearPersistedSessionState();
      }
    } finally {
      setIsSubmitting(false);
      setIsAutoLogging(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-2rem)] items-center justify-center">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/10 dark:shadow-black/30 lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="hidden border-l border-border bg-secondary/45 p-8 lg:flex lg:flex-col lg:justify-between">
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="mb-8 gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="h-4 w-4" />
              {t("common.back")}
            </Button>

            <GestelitLogo size="lg" className="rounded-xl" />
            <p className="mt-5 text-sm font-semibold text-primary">{t("app.tagline")}</p>
            <h1 className="mt-3 max-w-md text-4xl font-semibold leading-tight text-foreground">
              Gestelit
            </h1>
            <p className="mt-3 max-w-sm text-base leading-7 text-muted-foreground">
              {t("login.panelDescription")}
            </p>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background/70 p-4">
              <BadgeCheck className="h-5 w-5 text-emerald-500" />
              <div>
                <div className="text-sm font-medium text-foreground">{t("login.context.workerTitle")}</div>
                <div className="text-xs text-muted-foreground">{t("login.context.workerDescription")}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background/70 p-4">
              <MonitorCheck className="h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-medium text-foreground">{t("login.context.stationTitle")}</div>
                <div className="text-xs text-muted-foreground">{t("login.context.stationDescription")}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background/70 p-4">
              <Clock3 className="h-5 w-5 text-amber-500" />
              <div>
                <div className="text-sm font-medium text-foreground">{t("login.context.recoveryTitle")}</div>
                <div className="text-xs text-muted-foreground">{t("login.context.recoveryDescription")}</div>
              </div>
            </div>
          </div>
        </aside>

        <main className="bg-background p-5 sm:p-8 lg:p-10">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="h-4 w-4" />
              {t("common.back")}
            </Button>
            <GestelitLogo size="sm" className="h-10 w-10 rounded-xl" />
          </div>

          <div className="mx-auto flex min-h-[560px] max-w-md flex-col justify-center">
            <div className="mb-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary lg:hidden">
                <IdCard className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-primary lg:hidden">{t("app.tagline")}</p>
              <h2 className="mt-2 text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
                {t("login.title")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                {t("login.subtitle")}
              </p>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="worker" className="text-sm font-medium text-foreground">
                  {t("login.workerIdLabel")}
                </Label>
                <div className="relative">
                  <IdCard className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="worker"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    placeholder="4582"
                    value={workerId}
                    onChange={(event) => {
                      setWorkerId(event.target.value);
                      if (error) setError(null);
                    }}
                    className="h-14 rounded-xl border-border bg-card pr-12 text-left text-xl font-semibold tracking-wide text-foreground placeholder:text-base placeholder:font-normal placeholder:tracking-normal focus-visible:ring-primary/40 md:h-14 md:text-xl"
                  />
                </div>
              </div>

              {error ? (
                <Alert variant="destructive" className="rounded-xl border-rose-600/30 bg-rose-50 text-right dark:border-rose-500/30 dark:bg-rose-500/10">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-rose-700 dark:text-rose-400">{t("login.title")}</AlertTitle>
                  <AlertDescription className="text-rose-600 dark:text-rose-300">{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting || isAutoLogging}
                className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {(isSubmitting || isAutoLogging) ? (
                  <span className="flex items-center gap-2">
                    <Spinner size="sm" className="flex-row gap-0 [&>div]:border-primary-foreground [&>div]:border-t-transparent" />
                    {t("login.loading")}
                  </span>
                ) : (
                  <>
                    <LogIn className="h-5 w-5" />
                    {t("login.submit")}
                  </>
                )}
              </Button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
