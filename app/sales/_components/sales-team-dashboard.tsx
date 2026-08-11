"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Download, Filter, RefreshCcw, Search, Sparkles } from "lucide-react";
import { SalesIntelligenceDashboard } from "@/app/admin/sales-daily-log/_components/sales-intelligence-dashboard";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  exportSalesTeamWorkbookApi,
  fetchSalesTeamActivitiesApi,
  fetchSalesTeamDashboardApi,
} from "@/lib/api/sales-portal";
import type { SalesActivityLog, SalesSummary } from "@/lib/data/sales-log";
import type { SalesEventType } from "@/lib/data/sales-log-utils";
import { cn } from "@/lib/utils";

type TeamResponse = {
  user: { full_name: string };
  summary: SalesSummary;
  followUps: SalesActivityLog[];
};

type Filters = {
  days: "7" | "30" | "90" | "365";
  salesperson: string;
  client: string;
  eventType: string;
  status: string;
};

const eventLabels: Record<string, string> = {
  meeting: "פגישה",
  call: "שיחה",
  lead: "ליד",
  sale: "מכירה",
  follow_up: "פולואפ",
};

function rangeForDays(days: string) {
  const to = new Date();
  const from = new Date(to.getTime() - (Number(days) - 1) * 86_400_000);
  from.setHours(0, 0, 0, 0);
  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
}

function activityTime(value: string) {
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function SalesTeamDashboard() {
  const router = useRouter();
  const [draft, setDraft] = useState<Filters>({ days: "90", salesperson: "", client: "", eventType: "", status: "" });
  const [filters, setFilters] = useState(draft);
  const [data, setData] = useState<TeamResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drilldownType, setDrilldownType] = useState<SalesEventType | null>(null);
  const [drilldownRows, setDrilldownRows] = useState<SalesActivityLog[]>([]);
  const [drilldownCount, setDrilldownCount] = useState(0);

  const params = useMemo(() => ({
    ...rangeForDays(filters.days),
    salesperson: filters.salesperson || undefined,
    client: filters.client || undefined,
    eventType: filters.eventType || undefined,
    status: filters.status || undefined,
  }), [filters]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await fetchSalesTeamDashboardApi(params) as TeamResponse);
    } catch (loadError) {
      const code = loadError instanceof Error ? loadError.message : "SALES_TEAM_DASHBOARD_FAILED";
      if (code === "SALES_UNAUTHORIZED") router.push("/sales/login");
      else if (code === "SALES_FORBIDDEN") router.push("/sales/dashboard");
      else setError("לא הצלחנו לטעון את נתוני הצוות. נסו לרענן.");
    } finally {
      setIsLoading(false);
    }
  }, [params, router]);

  useEffect(() => { void load(); }, [load]);

  const exportWorkbook = async () => {
    setIsExporting(true);
    try {
      const blob = await exportSalesTeamWorkbookApi(params);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `gestelit-sales-team-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("לא הצלחנו להכין את קובץ האקסל. נסו שוב.");
    } finally {
      setIsExporting(false);
    }
  };

  const openDrilldown = async (eventType: SalesEventType) => {
    setDrilldownType(eventType);
    setDrilldownRows([]);
    try {
      const result = await fetchSalesTeamActivitiesApi({ ...params, eventType, limit: 200 }) as { rows: SalesActivityLog[]; count: number };
      setDrilldownRows(result.rows);
      setDrilldownCount(result.count);
    } catch {
      setError("לא הצלחנו לפתוח את הדיווחים שמאחורי המדד.");
      setDrilldownType(null);
    }
  };

  const salespeople = Array.from(new Set(data?.summary.analytics.reps.map((row) => row.salesperson) ?? [])).filter(Boolean);
  const activeCount = [filters.salesperson, filters.client, filters.eventType, filters.status].filter(Boolean).length;

  return (
    <main dir="rtl" className="min-h-dvh bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)))] text-right text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur lg:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5"><GestelitLogo size="sm" className="rounded-xl" /><div className="min-w-0"><h1 className="truncate font-semibold">ניהול מכירות</h1><p className="truncate text-xs text-muted-foreground">{data?.user.full_name ?? "נתוני הצוות"}</p></div></div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => router.push("/sales/ai?scope=team")} className="h-10 gap-2"><Sparkles className="h-4 w-4" /><span className="hidden sm:inline">שאל על הצוות</span></Button>
            <Button variant="outline" size="sm" onClick={() => router.push("/sales/dashboard")} className="h-10 gap-2"><ArrowRight className="h-4 w-4" /><span className="hidden sm:inline">הסיכום שלי</span></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-4 p-3 pb-10 lg:p-6">
        <section className="rounded-xl border border-border bg-card p-3 shadow-sm lg:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><h2 className="font-semibold">סינון הדוח</h2>{activeCount ? <Badge>{activeCount} פעילים</Badge> : null}</div>
            <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading} className="gap-2"><RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />רענון</Button><Button variant="outline" size="sm" onClick={() => void exportWorkbook()} disabled={isExporting} className="gap-2"><Download className="h-4 w-4" />Excel</Button></div>
          </div>
          <div className="mt-3 flex max-w-full gap-1.5 overflow-x-auto pb-1">{(["7", "30", "90", "365"] as const).map((days) => <Button key={days} size="sm" variant={draft.days === days ? "default" : "outline"} onClick={() => setDraft((current) => ({ ...current, days }))} className="shrink-0">{days === "365" ? "שנה" : `${days} ימים`}</Button>)}</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <select value={draft.salesperson} onChange={(event) => setDraft((current) => ({ ...current, salesperson: event.target.value }))} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">כל אנשי המכירות</option>{salespeople.map((person) => <option key={person} value={person}>{person}</option>)}</select>
            <div className="relative lg:col-span-2"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={draft.client} onChange={(event) => setDraft((current) => ({ ...current, client: event.target.value }))} placeholder="שם או קוד לקוח" className="h-11 pr-10" /></div>
            <select value={draft.eventType} onChange={(event) => setDraft((current) => ({ ...current, eventType: event.target.value }))} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">כל הפעילויות</option>{Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">כל המצבים</option><option value="open">פתוח</option><option value="follow_up">צריך לחזור</option><option value="won">נסגר</option><option value="lost">לא נסגר</option></select>
          </div>
          <Button onClick={() => setFilters(draft)} className="mt-3 h-11 w-full sm:w-auto">הצגת תוצאות</Button>
        </section>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
          נתוני הפעילות בגסטליט מלאים לטווח שנבחר. היסטוריית CRM, הצעות והזמנות מ-BINA עדיין לא מחוברות במלואן ולכן אינן מוצגות כאמת ניהולית.
        </div>
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {isLoading && !data ? <Card className="h-72 animate-pulse rounded-xl" /> : (
          <SalesIntelligenceDashboard
            summary={data?.summary ?? null}
            followUps={data?.followUps ?? []}
            onMarkStatus={() => undefined}
            onEventMixSelect={(eventType) => void openDrilldown(eventType)}
            canEditFollowUps={false}
          />
        )}
      </div>

      <Dialog open={drilldownType !== null} onOpenChange={(open) => { if (!open) setDrilldownType(null); }}>
        <DialogContent dir="rtl" className="max-h-[90dvh] max-w-3xl overflow-y-auto text-right sm:rounded-xl">
          <DialogHeader><DialogTitle>{drilldownType ? eventLabels[drilldownType] : "פעילות"} · {drilldownCount.toLocaleString("he-IL")} דיווחים</DialogTitle></DialogHeader>
          <div className="space-y-2">{drilldownRows.map((activity) => <article key={activity.id} className="rounded-xl border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-semibold">{activity.customer_name}</div><div className="text-xs text-muted-foreground">{activity.salesperson}</div></div><time className="text-xs text-muted-foreground">{activityTime(activity.event_at)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{activity.ai_summary || activity.raw_note}</p></article>)}</div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
