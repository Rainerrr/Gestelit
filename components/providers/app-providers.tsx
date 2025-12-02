"use client";

import { LanguageProvider } from "@/contexts/LanguageContext";
import { WorkerSessionProvider } from "@/contexts/WorkerSessionContext";
import type { ReactNode } from "react";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <LanguageProvider>
      <WorkerSessionProvider>{children}</WorkerSessionProvider>
    </LanguageProvider>
  );
}

