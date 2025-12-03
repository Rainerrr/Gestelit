"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { useIdleSessionCleanup } from "@/hooks/useIdleSessionCleanup";
import {
  fetchActiveSessions,
  fetchRecentSessions,
  subscribeToActiveSessions,
  type ActiveSession,
  type CompletedSession,
} from "@/lib/data/admin-dashboard";
import { KpiCards } from "./kpi-cards";
import { ActiveSessionsTable } from "./active-sessions-table";
import { StatusCharts } from "./status-charts";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  STOPPAGE_STATUSES,
} from "./status-dictionary";
import { RecentSessionsTable } from "./recent-sessions-table";

const NAV_ITEMS = [
  { label: "דשבורד", href: "/admin", isActive: true },
  { label: "דוחות", href: "#", disabled: true },
  { label: "ניהול", href: "#", disabled: true },
];

export const AdminDashboard = () => {
  const { hasAccess } = useAdminGuard();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [recentSessions, setRecentSessions] = useState<CompletedSession[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  const refreshDashboardData = useCallback(async () => {
    const [active, recent] = await Promise.all([
      fetchActiveSessions(),
      fetchRecentSessions(),
    ]);
    setSessions(active);
    setRecentSessions(recent);
    setIsInitialLoading(false);
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

  useEffect(() => {
    const unsubscribe = subscribeToActiveSessions(async () => {
      await refreshDashboardData();
    });
    return () => unsubscribe();
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

  const statusData = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        key: status,
        label: STATUS_LABELS[status],
        value: sessions.filter(
          (session) => (session.currentStatus ?? "setup") === status,
        ).length,
      })),
    [sessions],
  );

  const throughputData = useMemo(() => {
    const map = new Map<string, { name: string; label: string; value: number }>();

    sessions.forEach((session) => {
      const key = session.stationName || "לא משויך";
      const current = map.get(key) ?? { name: key, label: key, value: 0 };
      current.value += session.totalGood ?? 0;
      map.set(key, current);
    });

    return Array.from(map.values());
  }, [sessions]);

  const kpis = useMemo(() => {
    const productionCount = sessions.filter(
      (session) => session.currentStatus === "production",
    ).length;
    const stopCount = sessions.filter((session) =>
      STOPPAGE_STATUSES.includes(session.currentStatus ?? "setup"),
    ).length;
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
  }, [sessions]);

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
    <section className="w-full space-y-6" dir="rtl">
      <div className="flex min-h-[70vh] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <aside className="hidden w-64 border-l border-slate-200 bg-white p-6 lg:block">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">
              Gestelit
            </span>
            <span className="text-xs text-slate-500">
              ניהול רצפת ייצור בזמן אמת
            </span>
          </div>
          <nav className="mt-10 space-y-1">
            {NAV_ITEMS.map((item) =>
              item.isActive ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-900"
                  aria-current="page"
                >
                  {item.label}
                  <Badge variant="secondary" className="text-[0.65rem]">
                    חי
                  </Badge>
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  disabled
                  className="flex w-full items-center justify-between rounded-xl px-4 py-2 text-sm text-slate-400"
                >
                  {item.label}
                  <Badge variant="outline" className="text-[0.65rem]">
                    בקרוב
                  </Badge>
                </button>
              ),
            )}
          </nav>
        </aside>

        <div className="flex flex-1 flex-col bg-slate-50">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 text-right">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>גרסת הדגמה</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  דשבורד מנהלים - רצפת ייצור
                </h1>
                <p className="text-sm text-slate-500">
                  מבט מרוכז על עבודות פעילות ומצב המכונות.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="destructive"
                  onClick={() => setResetDialogOpen(true)}
                >
                  סגירת כל העבודות הפעילות
                </Button>
                <Button variant="outline" asChild className="min-w-32">
                  <Link href="/">מסך עובד</Link>
                </Button>
              </div>
            </div>
            {resetResult ? (
              <p className="text-sm text-slate-500">{resetResult}</p>
            ) : null}
          </header>

          <div className="flex-1 space-y-6 p-6">
            <KpiCards
              activeCount={kpis.activeCount}
              productionCount={kpis.productionCount}
              stopCount={kpis.stopCount}
              totalGood={kpis.totalGood}
              isLoading={isInitialLoading}
            />

            <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
              <ActiveSessionsTable
                sessions={sessions}
                now={now}
                isLoading={isInitialLoading}
              />
              <StatusCharts
                statusData={statusData}
                throughputData={throughputData}
                isLoading={isInitialLoading}
              />
            </div>

            <RecentSessionsTable
              sessions={recentSessions}
              isLoading={isInitialLoading}
            />
          </div>
        </div>
      </div>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="text-right">
          <h2 className="text-lg font-semibold text-slate-900">
            לאפס את העבודות הפעילות?
          </h2>
          <p className="text-sm text-slate-500">
            פעולה זו תסגור את כל העבודות הפעילות ותעביר אותן למעקב העבודות
            שהושלמו. השתמש בזה לצרכי בדיקות בלבד.
          </p>
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
    </section>
  );
};


