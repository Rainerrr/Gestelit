"use client";

import {
  AdminSessionsProvider,
  useAdminStationIds,
} from "@/contexts/AdminSessionsContext";
import { JobProgressProvider } from "@/contexts/JobProgressContext";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { useIdleSessionCleanup } from "@/hooks/useIdleSessionCleanup";
import { useStatusDictionary } from "./status-dictionary";
import { ManufacturingOverview } from "./manufacturing-overview";

export const AdminDashboard = () => (
  <AdminSessionsProvider>
    <JobProgressProvider>
      <AdminDashboardContent />
    </JobProgressProvider>
  </AdminSessionsProvider>
);

const AdminDashboardContent = () => {
  const { hasAccess } = useAdminGuard();
  const stationIds = useAdminStationIds();

  const {
    dictionary,
    isLoading: isStatusesLoading,
    error: statusesError,
  } = useStatusDictionary(stationIds);

  useIdleSessionCleanup();

  if (hasAccess === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="font-mono text-sm text-muted-foreground tracking-wider">
            טוען נתונים...
          </p>
        </div>
      </div>
    );
  }

  if (hasAccess === false) {
    return null;
  }

  return (
    <ManufacturingOverview
      dictionary={dictionary}
      statusesLoading={isStatusesLoading}
      statusesError={statusesError}
    />
  );
};
