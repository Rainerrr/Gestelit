"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { useIdleSessionCleanup } from "@/hooks/useIdleSessionCleanup";
import {
  fetchActiveSessionsAdminApi,
  type ActiveSession,
} from "@/lib/api/admin-management";
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

export const AdminDashboard = () => {
  const { hasAccess } = useAdminGuard();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const stationIds = useMemo(
    () =>
      Array.from(
        new Set(
          sessions
            .map((session) => session.stationId)
            .filter((id): id is string => Boolean(id)),
        ),
      ),
    [sessions],
  );
  const { dictionary, isLoading: isStatusesLoading } = useStatusDictionary(
    stationIds,
  );

  const refreshDashboardData = useCallback(async () => {
    try {
      const { sessions: active } = await fetchActiveSessionsAdminApi();
      setSessions(active);
    } catch (error) {
      console.error("[admin-dashboard] failed to fetch active sessions", error);
      setSessions([]);
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  useIdleSessionCleanup(refreshDashboardData);

  useEffect(() => {
    let isMounted = true;

    const loadInitial = async () => {
      await refreshDashboardData();
      if (!isMounted) {
        return;
      }
    };

    void loadInitial();

    return () => {
      isMounted = false;
    };
  }, [refreshDashboardData]);

  // Poll for updates every 5 seconds instead of using realtime (which requires browser client)
  useEffect(() => {
    const interval = setInterval(() => {
      void refreshDashboardData();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshDashboardData]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

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
          ? "לא נמצאו עבודות פעילות לסגירה."
          : `נסגרו ${result.closed} עבודות פעילות.`,
      );
      await refreshDashboardData();
      setResetDialogOpen(false);
    } catch (error) {
      setResetResult("הסגירה נכשלה, נסה שוב.");
      console.error(error);
    } finally {
      setResetting(false);
    }
  };

  const statusData = useMemo(() => {
    const counts = new Map<string, number>();
    let otherCount = 0;

    sessions.forEach((session) => {
      const statusId = session.currentStatus;
      if (!statusId) return;
      const scope = getStatusScopeFromDictionary(statusId, dictionary);
      if (scope === "station" || scope === "unknown") {
        otherCount += 1;
        return;
      }
      counts.set(statusId, (counts.get(statusId) ?? 0) + 1);
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
        label: "אחר",
        value: otherCount,
      });
    }

    return combined;
  }, [dictionary, sessions]);

  const throughputData = useMemo(() => {
    const map = new Map<
      string,
      { name: string; label: string; good: number; scrap: number }
    >();

    sessions.forEach((session) => {
      const key = session.stationName || "לא משויך";
      const current =
        map.get(key) ?? { name: key, label: key, good: 0, scrap: 0 };
      current.good += session.totalGood ?? 0;
      current.scrap += session.totalScrap ?? 0;
      map.set(key, current);
    });

    return Array.from(map.values());
  }, [sessions]);

  const kpis = useMemo(() => {
    const productionIds = Array.from(dictionary.global.values())
      .filter((item) => item.label_he.includes("ייצור"))
      .map((item) => item.id);
    const productionCount = sessions.filter((session) =>
      session.currentStatus ? productionIds.includes(session.currentStatus) : false,
    ).length;
    const stopCount = 0;
    const totalGood = sessions.reduce(
      (acc, session) => acc + (session.totalGood ?? 0),
      0,
    );

    return {
      activeCount: sessions.length,
      productionCount,
      stopCount,
      totalGood,
    };
  }, [dictionary, sessions]);

  if (hasAccess === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-2xl border bg-white text-sm text-slate-500">
        טוען נתוני מנהלים...
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
                  <span>גרסת הדגמה</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </div>
                <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                  דשבורד מנהלים - רצפת ייצור
                </h1>
                <p className="text-xs text-slate-500 sm:text-sm">
                  מבט מרוכז על עבודות פעילות ומצב המכונות.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Button
                  variant="destructive"
                  onClick={() => setResetDialogOpen(true)}
                  className="w-full sm:w-auto"
                  size="sm"
                >
                  סגירת כל העבודות הפעילות
                </Button>
                <Button variant="outline" asChild className="w-full sm:min-w-32 sm:w-auto" size="sm">
                  <Link href="/">מסך עובד</Link>
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
            <KpiCards
              activeCount={kpis.activeCount}
              productionCount={kpis.productionCount}
              stopCount={kpis.stopCount}
              totalGood={kpis.totalGood}
              isLoading={isInitialLoading}
            />

            <ActiveSessionsTable
              sessions={sessions}
              now={now}
              isLoading={isInitialLoading || isStatusesLoading}
              dictionary={dictionary}
            />

            <StatusCharts
              statusData={statusData}
              throughputData={throughputData}
              isLoading={isInitialLoading || isStatusesLoading}
              dictionary={dictionary}
            />
        </div>
      </AdminLayout>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="text-right">
          <DialogHeader>
            <DialogTitle>לאפס את העבודות הפעילות?</DialogTitle>
            <DialogDescription>
              פעולה זו תסגור את כל העבודות הפעילות ותעביר אותן למעקב העבודות
              שהושלמו. השתמש בזה לצרכי בדיקות בלבד.
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


