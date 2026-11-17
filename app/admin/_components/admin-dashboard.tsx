"use client";

import { useMemo } from "react";
import Link from "next/link";
import { LayoutDashboard, Plus, ArrowLeft } from "lucide-react";
import {
  AdminSessionsProvider,
  useAdminSessionCount,
  useAdminSessionStats,
  useAdminSessionsLoading,
  useAdminSessionsSelector,
  useAdminStationIds,
  useAdminConnectionState,
} from "@/contexts/AdminSessionsContext";
import { JobProgressProvider } from "@/contexts/JobProgressContext";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { useIdleSessionCleanup } from "@/hooks/useIdleSessionCleanup";
import { KpiCards } from "./kpi-cards";
import { ActiveSessionsTable } from "./active-sessions-table";
import { StatusCharts } from "./status-charts";
import { ActiveReportsWidget } from "./active-reports-widget";
import {
  getStatusLabelFromDictionary,
  getStatusOrderFromDictionary,
  getStatusScopeFromDictionary,
  useStatusDictionary,
} from "./status-dictionary";
import { AdminLayout } from "./admin-layout";

export const AdminDashboard = () => (
  <AdminSessionsProvider>
    <JobProgressProvider>
      <AdminDashboardContent />
    </JobProgressProvider>
  </AdminSessionsProvider>
);

type SectionProps = {
  dictionary: ReturnType<typeof useStatusDictionary>["dictionary"];
  isLoading: boolean;
};

const KpiCardsSection = ({ dictionary, isLoading }: SectionProps) => {
  const activeCount = useAdminSessionCount();
  const stats = useAdminSessionStats();

  const productionIds = useMemo(
    () =>
      Array.from(dictionary.global.values())
        .filter((item) => item.machine_state === "production")
        .map((item) => item.id),
    [dictionary],
  );

  const productionCount = useAdminSessionsSelector((state) => {
    if (productionIds.length === 0) return 0;
    const lookup = new Set(productionIds);
    let count = 0;
    state.sessionIds.forEach((id) => {
      const session = state.sessionsMap.get(id);
      if (session?.currentStatus && lookup.has(session.currentStatus)) {
        count += 1;
      }
    });
    return count;
  });

  const stopCount = useAdminSessionsSelector((state) => {
    let count = 0;
    state.sessionIds.forEach((id) => {
      const session = state.sessionsMap.get(id);
      if (!session?.currentStatus) return;
      const definition = dictionary.station.get(session.stationId ?? "")?.get(session.currentStatus) ?? dictionary.global.get(session.currentStatus);
      if (definition?.machine_state === "stoppage") count += 1;
    });
    return count;
  });

  return (
    <KpiCards
      activeCount={activeCount}
      productionCount={productionCount}
      stopCount={stopCount}
      totalGood={stats.totalGood}
      isLoading={isLoading}
    />
  );
};

const StatusChartsSection = ({ dictionary, isLoading }: SectionProps) => {
  const statusData = useAdminSessionsSelector((state) => {
    const counts = new Map<string, number>();
    let otherCount = 0;

    state.sessionIds.forEach((id) => {
      const session = state.sessionsMap.get(id);
      if (!session?.currentStatus) return;
      const scope = getStatusScopeFromDictionary(
        session.currentStatus,
        dictionary,
      );
      if (scope === "station" || scope === "unknown") {
        otherCount += 1;
        return;
      }
      counts.set(
        session.currentStatus,
        (counts.get(session.currentStatus) ?? 0) + 1,
      );
    });

    const orderedKeys = getStatusOrderFromDictionary(
      dictionary,
      Array.from(counts.keys()),
    );

    const globals = orderedKeys
      .filter((status) => counts.has(status))
      .map((status) => ({
        key: status,
        label: getStatusLabelFromDictionary(status, dictionary),
        value: counts.get(status) ?? 0,
      }));

    const combined = [...globals];
    if (otherCount > 0) {
      combined.push({
        key: "other_station_statuses",
        label: "מצבי תחנה אחרים",
        value: otherCount,
      });
    }

    return combined;
  });

  return (
    <StatusCharts
      statusData={statusData}
      isLoading={isLoading}
      dictionary={dictionary}
    />
  );
};

const ConnectionIndicator = () => {
  const connectionState = useAdminConnectionState();

  const stateConfig = {
    connected: { color: "bg-emerald-500", pulse: true, label: "מחובר" },
    connecting: { color: "bg-amber-500", pulse: true, label: "מתחבר..." },
    disconnected: { color: "bg-amber-500", pulse: true, label: "מתחבר מחדש..." },
    error: { color: "bg-red-500", pulse: false, label: "לא מחובר" },
  };

  const config = stateConfig[connectionState];

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex h-2.5 w-2.5">
        {config.pulse && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${config.color} opacity-75`} />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${config.color}`} />
      </div>
      <span className="text-xs font-medium text-muted-foreground font-mono tracking-wide">{config.label}</span>
    </div>
  );
};

const AdminDashboardContent = () => {
  const { hasAccess } = useAdminGuard();
  const isInitialLoading = useAdminSessionsLoading();
  const stationIds = useAdminStationIds();

  const { dictionary, isLoading: isStatusesLoading } = useStatusDictionary(
    stationIds,
  );

  useIdleSessionCleanup();

  const isLoading = isInitialLoading || isStatusesLoading;

  if (hasAccess === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="font-mono text-sm text-muted-foreground tracking-wider">טוען נתונים...</p>
        </div>
      </div>
    );
  }

  if (hasAccess === false) {
    return null;
  }

  return (
    <AdminLayout
      header={
        <div className="flex items-center gap-3">
          <LayoutDashboard className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-lg font-semibold text-foreground sm:text-xl">דשבורד</h1>
          <ConnectionIndicator />
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="mb-2 text-xs font-medium text-muted-foreground">מרכז התפעול</p><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">רצפת הייצור, במבט אחד</h2><p className="mt-2 text-sm text-muted-foreground">המשמרות הפעילות והנושאים שדורשים טיפול עכשיו.</p></div>
          <Link href="/admin/jobs" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" />ניהול עבודות</Link>
        </div>
        <KpiCardsSection dictionary={dictionary} isLoading={isLoading} />
        <div className="grid items-start gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0"><ActiveSessionsTable dictionary={dictionary} isDictionaryLoading={isStatusesLoading} /></div>
          <aside className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">דורש תשומת לב</h2><Link href="/admin/reports" className="inline-flex items-center gap-1 text-xs text-primary">כל הדיווחים<ArrowLeft className="h-3 w-3" /></Link></div><ActiveReportsWidget /></aside>
        </div>
        <details className="group rounded-xl border border-border bg-card p-4 sm:p-5"><summary className="cursor-pointer text-sm font-semibold">תמונת הייצור והתקדמות העבודות</summary><div className="mt-5"><StatusChartsSection dictionary={dictionary} isLoading={isLoading} /></div></details>
      </div>
    </AdminLayout>
  );
};
