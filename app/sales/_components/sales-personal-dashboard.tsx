"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, FileSpreadsheet, ListPlus, LogOut, RefreshCcw, UsersRound } from "lucide-react";
import { SalesIntelligenceDashboard } from "@/app/admin/sales-daily-log/_components/sales-intelligence-dashboard";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  exportMySalesWorkbookApi,
  fetchSalesPersonalDashboardApi,
  logoutSalesPortalApi,
  updateSalesPortalActivityApi,
} from "@/lib/api/sales-portal";
import type { SalesActivityLog, SalesSummary } from "@/lib/data/sales-log";
import type { SalesStatus } from "@/lib/data/sales-log-utils";

type DashboardResponse = {
  user: { id: string; email: string; full_name: string; phone: string | null };
  summary: SalesSummary;
  followUps: SalesActivityLog[];
  recent: SalesActivityLog[];
};

type Filters = {
  period: "7" | "30" | "90";
  client: string;
  eventType: string;
  status: string;
};

const initialFilters: Filters = { period: "30", client: "", eventType: "", status: "" };

function dateRange(period: Filters["period"]) {
  const end = new Date();
  const start = new Date(end.getTime() - (Number(period) - 1) * 86_400_000);
  start.setHours(0, 0, 0, 0);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
}

export function SalesPersonalDashboard() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const params = useMemo(() => ({
    ...dateRange(filters.period),
    client: filters.client || undefined,
    eventType: filters.eventType || undefined,
    status: filters.status || undefined,
  }), [filters]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await fetchSalesPersonalDashboardApi(params) as DashboardResponse);
    } catch {
      router.push("/sales/login");
    } finally {
      setIsLoading(false);
    }
  }, [params, router]);

  useEffect(() => { void load(); }, [load]);

  const markStatus = async (activity: SalesActivityLog, status: SalesStatus) => {
    try {
      await updateSalesPortalActivityApi(activity.id, { status });
      await load();
    } catch {
      setError("העדכון לא נשמר. נסו שוב.");
    }
  };

  const exportWorkbook = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const blob = await exportMySalesWorkbookApi(params);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `gestelit-my-sales-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("לא הצלחנו להכין את קובץ האקסל. נסו שוב.");
    } finally {
      setIsExporting(false);
    }
  };

  const logout = async () => {
    await logoutSalesPortalApi().catch(() => null);
    router.push("/sales/login");
  };

  return (
    <main dir="rtl" className="min-h-dvh bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)))] text-right text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur lg:px-6 lg:py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <GestelitLogo size="sm" className="rounded-xl" />
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">הסיכום שלי</div>
              <div className="truncate text-xs text-muted-foreground">{data?.user.full_name ?? "מכירות"}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => router.push("/sales")} className="h-10 gap-2 px-3" aria-label="דיווח חדש">
              <ListPlus className="h-4 w-4" /><span className="hidden sm:inline">דיווח חדש</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push("/sales/clients")} className="hidden h-10 gap-2 px-3 sm:inline-flex">
              <UsersRound className="h-4 w-4" />לקוחות
            </Button>
            <Button variant="ghost" size="icon" onClick={() => void logout()} className="h-10 w-10" aria-label="יציאה"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-4 p-3 pb-8 lg:space-y-5 lg:p-6">
        <section className="rounded-lg border border-border bg-card/80 p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><h1 className="font-semibold">הפעילות שלי</h1></div>
              <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
                {(["7", "30", "90"] as const).map((period) => (
                  <Button key={period} size="sm" variant={filters.period === period ? "default" : "ghost"} onClick={() => setFilters((current) => ({ ...current, period }))} className="shrink-0">
                    {period === "7" ? "שבוע" : `${period} ימים`}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-3 xl:flex xl:items-end">
              <Input value={filters.client} onChange={(event) => setFilters((current) => ({ ...current, client: event.target.value }))} placeholder="חיפוש לקוח" className="h-10 sm:min-w-48" />
              <select value={filters.eventType} onChange={(event) => setFilters((current) => ({ ...current, eventType: event.target.value }))} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">כל הפעילויות</option><option value="meeting">פגישות</option><option value="call">שיחות</option><option value="lead">לידים</option><option value="sale">מכירות</option><option value="follow_up">פולואפים</option>
              </select>
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">כל המצבים</option><option value="open">פתוח</option><option value="follow_up">צריך לחזור</option><option value="won">נסגר</option><option value="lost">לא נסגר</option><option value="done">בוצע</option>
              </select>
              <Button variant="outline" onClick={() => void load()} disabled={isLoading} className="h-10 gap-2"><RefreshCcw className="h-4 w-4" />רענון</Button>
              <Button onClick={() => void exportWorkbook()} disabled={isExporting || isLoading} className="h-10 gap-2 bg-emerald-700 text-white hover:bg-emerald-800 sm:col-span-2 xl:col-span-1">
                <FileSpreadsheet className="h-4 w-4" />{isExporting ? "מכין..." : "הורדת אקסל"}
              </Button>
            </div>
          </div>
        </section>

        {error ? <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">{error}</Card> : null}
        {isLoading && !data ? <Card className="p-8 text-center text-sm text-muted-foreground">טוען את הנתונים שלך...</Card> : null}
        {data ? <SalesIntelligenceDashboard summary={data.summary} followUps={data.followUps} onMarkStatus={markStatus} personal /> : null}
      </div>
    </main>
  );
}
