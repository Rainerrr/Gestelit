"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronLeft, ChevronRight, Download, Filter, RefreshCcw, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { SalesIntelligenceDashboard } from "@/app/admin/sales-daily-log/_components/sales-intelligence-dashboard";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  filterOptions: {
    salespeople: string[];
    accountManagers: string[];
    customerGroups: string[];
    areas: string[];
    gestelitCoverageStartAt: string | null;
  };
};

type Filters = {
  period: "7" | "30" | "90" | "365" | "custom";
  dateFrom: string;
  dateTo: string;
  salesperson: string;
  client: string;
  eventType: string;
  status: string;
  accountManager: string;
  customerGroup: string;
  area: string;
  dormancyBucket: string;
  coverage: string;
};

const eventLabels: Record<string, string> = {
  meeting: "פגישה",
  call: "שיחה",
  lead: "ליד",
  sale: "מכירה",
  follow_up: "פולואפ",
};

function localDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function initialFilters(): Filters {
  const to = new Date();
  const from = new Date(to.getTime() - 89 * 86_400_000);
  return { period: "90", dateFrom: localDate(from), dateTo: localDate(to), salesperson: "", client: "", eventType: "", status: "", accountManager: "", customerGroup: "", area: "", dormancyBucket: "", coverage: "" };
}

function rangeForFilters(filters: Filters) {
  if (filters.period === "custom") {
    if (!filters.dateFrom || !filters.dateTo || filters.dateFrom > filters.dateTo) return null;
    return { dateFrom: new Date(`${filters.dateFrom}T00:00:00`).toISOString(), dateTo: new Date(`${filters.dateTo}T23:59:59.999`).toISOString() };
  }
  const to = new Date();
  const from = new Date(to.getTime() - (Number(filters.period) - 1) * 86_400_000);
  from.setHours(0, 0, 0, 0);
  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
}

function activityTime(value: string) {
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function SalesTeamDashboard() {
  const router = useRouter();
  const [draft, setDraft] = useState<Filters>(() => initialFilters());
  const [filters, setFilters] = useState(draft);
  const [data, setData] = useState<TeamResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drilldownType, setDrilldownType] = useState<SalesEventType | null>(null);
  const [drilldownRows, setDrilldownRows] = useState<SalesActivityLog[]>([]);
  const [drilldownCount, setDrilldownCount] = useState(0);
  const [drilldownOffset, setDrilldownOffset] = useState(0);
  const [isDrilldownLoading, setIsDrilldownLoading] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [lastSuccessfulRefreshAt, setLastSuccessfulRefreshAt] = useState<Date | null>(null);
  const requestIdRef = useRef(0);

  const params = useMemo(() => ({
    ...rangeForFilters(filters),
    salesperson: filters.salesperson || undefined,
    client: filters.client || undefined,
    eventType: filters.eventType || undefined,
    status: filters.status || undefined,
    accountManager: filters.accountManager || undefined,
    customerGroup: filters.customerGroup || undefined,
    area: filters.area || undefined,
    dormancyBucket: filters.dormancyBucket || undefined,
    coverage: filters.coverage || undefined,
  }), [filters]);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!rangeForFilters(filters)) {
      setError("בחרו טווח תאריכים תקין");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchSalesTeamDashboardApi(params) as TeamResponse;
      if (requestId !== requestIdRef.current) return;
      setData(result);
      setLastSuccessfulRefreshAt(new Date());
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      const code = loadError instanceof Error ? loadError.message : "SALES_TEAM_DASHBOARD_FAILED";
      if (code === "SALES_UNAUTHORIZED") router.push("/sales/login");
      else if (code === "SALES_FORBIDDEN") router.push("/sales/dashboard");
      else setError("לא הצלחנו לטעון את נתוני הצוות. נסו לרענן.");
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [filters, params, router]);

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

  const loadDrilldown = useCallback(async (eventType: SalesEventType, offset: number) => {
    setDrilldownType(eventType);
    setDrilldownRows([]);
    setIsDrilldownLoading(true);
    try {
      const result = await fetchSalesTeamActivitiesApi({ ...params, eventType, limit: 50, offset }) as { rows: SalesActivityLog[]; count: number };
      setDrilldownRows(result.rows);
      setDrilldownCount(result.count);
    } catch {
      setError("לא הצלחנו לפתוח את הדיווחים שמאחורי המדד.");
      setDrilldownType(null);
    } finally {
      setIsDrilldownLoading(false);
    }
  }, [params]);

  const openDrilldown = (eventType: SalesEventType) => {
    setDrilldownOffset(0);
    void loadDrilldown(eventType, 0);
  };

  const salespeople = data?.filterOptions.salespeople ?? [];
  const activeCount = [filters.salesperson, filters.client, filters.eventType, filters.status, filters.accountManager, filters.customerGroup, filters.area, filters.dormancyBucket, filters.coverage].filter(Boolean).length + (filters.period === "custom" ? 1 : 0);

  const applyFilters = () => {
    setFilters(draft);
    setIsMobileFiltersOpen(false);
  };

  const filterControls = (mobile = false) => (
    <div className="space-y-3">
      <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">{(["7", "30", "90", "365", "custom"] as const).map((period) => <Button key={period} size="sm" variant={draft.period === period ? "default" : "outline"} onClick={() => setDraft((current) => ({ ...current, period }))} className="shrink-0">{period === "365" ? "שנה" : period === "custom" ? "טווח אחר" : `${period} ימים`}</Button>)}</div>
      {draft.period === "custom" ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><label className="space-y-1 text-sm font-medium"><span>מתאריך</span><Input type="date" dir="ltr" value={draft.dateFrom} onChange={(event) => setDraft((current) => ({ ...current, period: "custom", dateFrom: event.target.value }))} className="h-11 bg-card text-foreground opacity-100 [color-scheme:light] dark:[color-scheme:dark]" /></label><label className="space-y-1 text-sm font-medium"><span>עד תאריך</span><Input type="date" dir="ltr" value={draft.dateTo} onChange={(event) => setDraft((current) => ({ ...current, period: "custom", dateTo: event.target.value }))} className="h-11 bg-card text-foreground opacity-100 [color-scheme:light] dark:[color-scheme:dark]" /></label></div> : null}
      <div className={cn("grid gap-2 sm:grid-cols-2", !mobile && "lg:grid-cols-4")}>
        <select value={draft.salesperson} onChange={(event) => setDraft((current) => ({ ...current, salesperson: event.target.value }))} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">כל המדווחים</option>{salespeople.map((person) => <option key={person} value={person}>{person}</option>)}</select>
        <select value={draft.accountManager} onChange={(event) => setDraft((current) => ({ ...current, accountManager: event.target.value }))} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">כל מנהלי הלקוחות</option>{(data?.filterOptions.accountManagers ?? []).map((person) => <option key={person} value={person}>{person}</option>)}</select>
        <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={draft.client} onChange={(event) => setDraft((current) => ({ ...current, client: event.target.value }))} placeholder="שם או קוד לקוח" className="h-11 pr-10" /></div>
        <select value={draft.eventType} onChange={(event) => setDraft((current) => ({ ...current, eventType: event.target.value }))} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">כל הפעילויות</option>{Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">כל המצבים</option><option value="open">פתוח</option><option value="follow_up">צריך לחזור</option><option value="won">נסגר</option><option value="lost">לא נסגר</option></select>
        <select value={draft.customerGroup} onChange={(event) => setDraft((current) => ({ ...current, customerGroup: event.target.value }))} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">כל הקבוצות</option>{(data?.filterOptions.customerGroups ?? []).map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select value={draft.area} onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">כל האזורים</option>{(data?.filterOptions.areas ?? []).map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select value={draft.dormancyBucket} onChange={(event) => setDraft((current) => ({ ...current, dormancyBucket: event.target.value }))} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">כל מצבי הקשר</option><option value="active">בקשר</option><option value="attention">3+ חודשים</option><option value="dormant">6+ חודשים</option><option value="unknown">אין מספיק מידע</option></select>
        <select value={draft.coverage} onChange={(event) => setDraft((current) => ({ ...current, coverage: event.target.value }))} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">כל רמות הכיסוי</option><option value="gestelit_only">דיווחי Gestelit בלבד</option></select>
      </div>
      <Button onClick={applyFilters} className="h-11 w-full sm:w-auto">הצגת תוצאות</Button>
    </div>
  );

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
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <Button variant="outline" onClick={() => setIsMobileFiltersOpen(true)} className="h-11 flex-1 gap-2"><SlidersHorizontal className="h-4 w-4" />סינון{activeCount ? ` (${activeCount})` : ""}</Button>
          <Button variant="outline" onClick={() => void load()} disabled={isLoading} className="h-11 gap-2"><RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />רענון</Button>
        </div>
        <section className="hidden rounded-xl border border-border bg-card p-3 shadow-sm lg:block lg:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><h2 className="font-semibold">סינון הדוח</h2>{activeCount ? <Badge>{activeCount} פעילים</Badge> : null}</div>
            <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading} className="gap-2"><RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />רענון</Button><Button variant="outline" size="sm" onClick={() => void exportWorkbook()} disabled={isExporting} className="gap-2"><Download className="h-4 w-4" />Excel</Button></div>
          </div>
          <div className="mt-3">{filterControls()}</div>
        </section>

        <div className="flex items-center justify-between gap-3 lg:hidden">
          <Button onClick={() => void exportWorkbook()} disabled={isExporting} className="h-11 flex-1 gap-2"><Download className="h-4 w-4" />{isExporting ? "מכין אקסל..." : "הורדת Excel"}</Button>
          {lastSuccessfulRefreshAt ? <span className="text-xs text-muted-foreground">עודכן {lastSuccessfulRefreshAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span> : null}
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
          נתוני הפעילות בגסטליט מלאים החל מ-{data?.filterOptions.gestelitCoverageStartAt ? new Intl.DateTimeFormat("he-IL").format(new Date(data.filterOptions.gestelitCoverageStartAt)) : "תחילת השימוש ביומן"}. היסטוריית CRM, הצעות והזמנות מ-BINA עדיין לא מחוברות במלואן ולכן אינן מוצגות כאמת ניהולית.
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
          <DialogHeader><DialogTitle>{drilldownType ? eventLabels[drilldownType] : "פעילות"} · {drilldownCount.toLocaleString("he-IL")} דיווחים</DialogTitle><DialogDescription>הנתונים מחולקים לעמודים ואינם נחתכים.</DialogDescription></DialogHeader>
          {isDrilldownLoading ? <Card className="h-36 animate-pulse" /> : <div className="space-y-2">{drilldownRows.map((activity) => <article key={activity.id} className="rounded-xl border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-semibold">{activity.customer_name}</div><div className="text-xs text-muted-foreground">{activity.salesperson}</div></div><time className="text-xs text-muted-foreground">{activityTime(activity.event_at)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{activity.ai_summary || activity.raw_note}</p></article>)}</div>}
          {drilldownCount > 50 ? <div className="flex items-center justify-between border-t pt-3"><Button variant="outline" size="icon" disabled={drilldownOffset === 0 || isDrilldownLoading} onClick={() => { const next = Math.max(0, drilldownOffset - 50); setDrilldownOffset(next); if (drilldownType) void loadDrilldown(drilldownType, next); }} aria-label="עמוד קודם"><ChevronRight className="h-4 w-4" /></Button><span className="text-sm text-muted-foreground"><bdi dir="ltr">{drilldownOffset + 1}-{Math.min(drilldownOffset + 50, drilldownCount)}</bdi> מתוך {drilldownCount}</span><Button variant="outline" size="icon" disabled={drilldownOffset + 50 >= drilldownCount || isDrilldownLoading} onClick={() => { const next = drilldownOffset + 50; setDrilldownOffset(next); if (drilldownType) void loadDrilldown(drilldownType, next); }} aria-label="עמוד הבא"><ChevronLeft className="h-4 w-4" /></Button></div> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={isMobileFiltersOpen} onOpenChange={setIsMobileFiltersOpen}>
        <DialogContent dir="rtl" desktopBreakpoint="lg" className="max-h-[92dvh] overflow-y-auto text-right">
          <DialogHeader><DialogTitle>סינון דשבורד הצוות</DialogTitle><DialogDescription>בחרו טווח, איש מכירות וחתכי לקוח.</DialogDescription></DialogHeader>
          {filterControls(true)}
        </DialogContent>
      </Dialog>
    </main>
  );
}
