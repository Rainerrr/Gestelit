"use client";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { WorkerSessionProvider } from "@/contexts/WorkerSessionContext";
import type { ReactNode } from "react";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <LanguageProvider>
        <WorkerSessionProvider>{children}</WorkerSessionProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

