"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
} from "@/contexts/AdminSessionsContext";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { useIdleSessionCleanup } from "@/hooks/useIdleSessionCleanup";
import { KpiCards } from "./kpi-cards";
import { ActiveSessionsTable } from "./active-sessions-table";
import { StatusCharts } from "./status-charts";
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

  const throughputData = useAdminSessionsSelector((state) => {
    const map = new Map<
      string,
      { name: string; label: string; good: number; scrap: number }
    >();

    state.sessionIds.forEach((id) => {
      const session = state.sessionsMap.get(id);
      if (!session) return;
      const key = session.stationName || "תחנה לא ידועה";
      const current =
        map.get(key) ?? { name: key, label: key, good: 0, scrap: 0 };
      current.good += session.totalGood ?? 0;
      current.scrap += session.totalScrap ?? 0;
      map.set(key, current);
    });

    return Array.from(map.values());
  });

  return (
    <StatusCharts
      statusData={statusData}
      throughputData={throughputData}
      isLoading={isLoading}
      dictionary={dictionary}
    />
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
      <div className="flex min-h-[60vh] items-center justify-center rounded-2xl border bg-white text-sm text-slate-500">
        טוען נתונים...
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
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1 text-right">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>לוח בקרה בזמן אמת</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </div>
                <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                  מסך ניהול - תחנות פעילות
                </h1>
                <p className="text-xs text-slate-500 sm:text-sm">
                  התמונה מתעדכנת בתדירות גבוהה, ללא ריענון מלא של העמוד.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Button
                  variant="destructive"
                  onClick={() => setResetDialogOpen(true)}
                  className="w-full sm:w-auto"
                  size="sm"
                >
                  סגירת כל התחנות הפעילות
                </Button>
                <Button variant="outline" asChild className="w-full sm:min-w-32 sm:w-auto" size="sm">
                  <Link href="/">חזרה למסך הבית</Link>
                </Button>
              </div>
            </div>
            {resetResult ? (
              <p className="text-xs text-slate-500 sm:text-sm">{resetResult}</p>
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
        <DialogContent className="text-right">
          <DialogHeader>
            <DialogTitle>לסגור את כל התחנות הפעילות?</DialogTitle>
            <DialogDescription>
              פעולה זו תסגור את כל הסשנים הפעילים ותעדכן את הדשבורד.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="justify-start gap-2">
            <Button
              variant="destructive"
              onClick={handleForceCloseSessions}
              disabled={resetting}
            >
              {resetting ? "סוגר..." : "כן, סגור הכל"}
            </Button>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
