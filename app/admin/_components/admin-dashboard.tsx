"use client";

import { useMemo, useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AdminSessionsProvider,
  useAdminSessionCount,
  useAdminSessionStats,
  useAdminSessionsLoading,
  useAdminSessionsRefresh,
  useAdminSessionsSelector,
  useAdminStationIds,
  useAdminConnectionState,
} from "@/contexts/AdminSessionsContext";
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
    <AdminDashboardContent />
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
        .filter((item) => item.label_he.includes("ייצור"))
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

  const stopCount = 0;

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
      sideWidget={<ActiveReportsWidget />}
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
  const refresh = useAdminSessionsRefresh();
  const isInitialLoading = useAdminSessionsLoading();
  const stationIds = useAdminStationIds();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  const { dictionary, isLoading: isStatusesLoading } = useStatusDictionary(
    stationIds,
  );

  useIdleSessionCleanup(refresh);

  const handleForceCloseSessions = async () => {
    setResetting(true);
    setResetResult(null);
    try {
      const response = await fetch("/api/admin/sessions/close-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": window.localStorage.getItem("adminPassword") || "",
        },
      });
      if (!response.ok) {
        throw new Error("close_failed");
      }
      const result = (await response.json()) as { closed: number };
      setResetResult(
        result.closed === 0
          ? "לא נמצאו תחנות פעילות לסגירה."
          : `נסגרו ${result.closed} תחנות פעילות.`,
      );
      await refresh();
      setResetDialogOpen(false);
    } catch (error) {
      setResetResult("הסגירה נכשלה.");
      console.error(error);
    } finally {
      setResetting(false);
    }
  };

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
    <>
      <AdminLayout
        header={
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <LayoutDashboard className="h-5 w-5 text-primary shrink-0" />
                <h1 className="text-lg font-semibold text-foreground sm:text-xl">דשבורד</h1>
                <ConnectionIndicator />
              </div>
              <Button
                variant="destructive"
                onClick={() => setResetDialogOpen(true)}
                className="bg-red-600 hover:bg-red-700 border-0 font-medium"
                size="sm"
              >
                <span className="hidden sm:inline">סגירת כל התחנות</span>
                <span className="sm:hidden">סגירה</span>
              </Button>
            </div>
            {resetResult ? (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <p className="text-sm font-medium text-primary">{resetResult}</p>
              </div>
            ) : null}
          </div>
        }
      >
        <div className="space-y-6">
          <KpiCardsSection dictionary={dictionary} isLoading={isLoading} />
          <ActiveSessionsTable
            dictionary={dictionary}
            isDictionaryLoading={isStatusesLoading}
          />
          <StatusChartsSection dictionary={dictionary} isLoading={isLoading} />
        </div>
      </AdminLayout>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="border-border bg-card text-right sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">לסגור את כל התחנות הפעילות?</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              פעולה זו תסגור את כל הסשנים הפעילים ותעדכן את הדשבורד.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse justify-start gap-2 sm:flex-row-reverse">
            <Button
              variant="destructive"
              onClick={handleForceCloseSessions}
              disabled={resetting}
              className="bg-red-600 hover:bg-red-700 border-0 font-medium"
            >
              {resetting ? "סוגר..." : "כן, סגור הכל"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setResetDialogOpen(false)}
              className="border-input bg-secondary text-foreground/80 hover:bg-accent hover:text-foreground"
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
