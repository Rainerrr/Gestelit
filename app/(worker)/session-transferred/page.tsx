"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkerSession } from "@/contexts/WorkerSessionContext";
import { clearPersistedSessionState } from "@/lib/utils/session-storage";

export default function SessionTransferredPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { reset } = useWorkerSession();

  // Clear persisted session state immediately when landing on this page
  // since the session was taken over by another tab/device
  useEffect(() => {
    clearPersistedSessionState();
  }, []);

  const handleGoToLogin = () => {
    reset();
    clearPersistedSessionState(); // Defensive: ensure state is cleared
    router.replace("/login");
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <PageHeader
        title={t("sessionTransferred.title")}
        subtitle={t("sessionTransferred.subtitle")}
      />

      <Card className="mt-6 max-w-md border-amber-500/30 bg-amber-50/5">
        <CardHeader className="pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <svg
              className="h-8 w-8 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <CardTitle className="text-center text-lg text-foreground">
            {t("sessionTransferred.cardTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            {t("sessionTransferred.description")}
          </p>
          <Button
            onClick={handleGoToLogin}
            className="w-full bg-primary font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("sessionTransferred.goToLogin")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
