"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarRange, FileSpreadsheet, ListPlus, LogOut, RefreshCcw, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { SalesIntelligenceDashboard } from "@/app/admin/sales-daily-log/_components/sales-intelligence-dashboard";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SalesMobileNav } from "@/components/sales/sales-mobile-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  exportMySalesWorkbookApi,
  fetchSalesPortalActivitiesApi,
  fetchSalesPersonalDashboardApi,
  logoutSalesPortalApi,
  updateSalesPortalActivityApi,
} from "@/lib/api/sales-portal";
import type { SalesActivityLog, SalesPortfolioClient, SalesSummary } from "@/lib/data/sales-log";
import type { SalesEventType, SalesStatus } from "@/lib/data/sales-log-utils";

type DashboardResponse = {
  user: { id: string; email: string; full_name: string; phone: string | null; scopes: string[] };
  summary: SalesSummary;
  followUps: SalesActivityLog[];
  recent: SalesActivityLog[];
  portfolio: SalesPortfolioClient[];
  portfolioCount: number;
  portfolioCoverage: "gestelit_only";
};

type Filters = {
  period: "7" | "30" | "90" | "custom";
  dateFrom: string;
  dateTo: string;
  client: string;
  eventType: string;
  status: string;
};

const eventLabels: Record<SalesEventType, string> = {
  meeting: "פגישות",
  call: "שיחות",
  lead: "לידים",
  sale: "מכירות",
  follow_up: "פולואפים",
};

const statusLabels: Record<SalesStatus, string> = {
  new: "חדש",
  open: "פתוח",
  follow_up: "צריך לחזור",
  won: "נסגר",
  lost: "לא נסגר",
  done: "בוצע",
};

function localDateInput(date: Date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
}

function createInitialFilters(): Filters {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 86_400_000);
  return {
    period: "30",
    dateFrom: localDateInput(start),
    dateTo: localDateInput(end),
    client: "",
    eventType: "",
    status: "",
  };
}

function dateRange(filters: Filters) {
  if (filters.period === "custom") {
    if (!filters.dateFrom || !filters.dateTo || filters.dateFrom > filters.dateTo) return null;
    return {
      dateFrom: new Date(`${filters.dateFrom}T00:00:00`).toISOString(),
      dateTo: new Date(`${filters.dateTo}T23:59:59.999`).toISOString(),
    };
  }
  const end = new Date();
  const start = new Date(end.getTime() - (Number(filters.period) - 1) * 86_400_000);
  start.setHours(0, 0, 0, 0);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatMoney(value: number | null, currency: string) {
  if (value == null) return null;
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: currency || "ILS", maximumFractionDigits: 0 }).format(value);
}

export function SalesPersonalDashboard() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(() => createInitialFilters());
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drilldownType, setDrilldownType] = useState<SalesEventType | null>(null);
  const [drilldownRows, setDrilldownRows] = useState<SalesActivityLog[]>([]);
  const [drilldownCount, setDrilldownCount] = useState(0);
  const [isDrilldownLoading, setIsDrilldownLoading] = useState(false);
  const [canViewTeamDashboard, setCanViewTeamDashboard] = useState(false);
  const loadRequestId = useRef(0);
  const params = useMemo(() => {
    const range = dateRange(filters);
    if (!range) return null;
    return {
      ...range,
      client: filters.client || undefined,
      eventType: filters.eventType || undefined,
      status: filters.status || undefined,
    };
  }, [filters]);

  const load = useCallback(async () => {
    if (!params) {
      setError("בחרו טווח תאריכים תקין");
      setIsLoading(false);
      return;
    }
    const requestId = ++loadRequestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchSalesPersonalDashboardApi(params) as DashboardResponse;
      if (requestId === loadRequestId.current) setData(result);
    } catch (loadError) {
      if (requestId !== loadRequestId.current) return;
      const code = loadError instanceof Error ? loadError.message : "SALES_DASHBOARD_FAILED";
      if (code === "SALES_UNAUTHORIZED") router.push("/sales/login");
      else setError("לא הצלחנו לרענן כרגע. הנתונים שכבר נטענו נשארו על המסך.");
    } finally {
      if (requestId === loadRequestId.current) setIsLoading(false);
    }
  }, [params, router]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setCanViewTeamDashboard(data?.user.scopes.includes("sales_team_view") ?? false);
  }, [data?.user.scopes]);

  const markStatus = async (activity: SalesActivityLog, status: SalesStatus) => {
    try {
      await updateSalesPortalActivityApi(activity.id, { status });
      await load();
    } catch {
      setError("העדכון לא נשמר. נסו שוב.");
    }
  };

  const exportWorkbook = async () => {
    if (!params) {
      setError("בחרו טווח תאריכים תקין");
      return;
    }
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

  const openActivityDrilldown = async (eventType: SalesEventType) => {
    if (!params) return;
    setDrilldownType(eventType);
    setDrilldownRows([]);
    setDrilldownCount(0);
    setIsDrilldownLoading(true);
    try {
      const result = await fetchSalesPortalActivitiesApi({
        ...params,
        eventType,
        limit: 200,
      }) as { rows: SalesActivityLog[]; count: number };
      setDrilldownRows(result.rows);
      setDrilldownCount(result.count);
    } catch {
      setError("לא הצלחנו לפתוח את הדיווחים. נסו שוב.");
      setDrilldownType(null);
    } finally {
      setIsDrilldownLoading(false);
    }
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
            <Button variant="outline" size="sm" onClick={() => router.push("/sales/ai")} className="h-10 gap-2 px-3" aria-label="עוזר המכירות">
              <Sparkles className="h-4 w-4" /><span className="hidden md:inline">שאל את הנתונים</span>
            </Button>
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

      <div className="mx-auto max-w-7xl space-y-4 p-3 pb-24 lg:space-y-5 lg:p-6">
        {canViewTeamDashboard ? (
          <section className="flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-semibold">דשבורד צוות המכירות</h2>
                <p className="text-sm text-muted-foreground">צפייה בנתונים של כל אנשי המכירות והלקוחות.</p>
              </div>
            </div>
            <Button onClick={() => router.push("/sales/team")} className="h-11 w-full gap-2 sm:w-auto">
              <BarChart3 className="h-4 w-4" />
              צפייה בנתוני הצוות
            </Button>
          </section>
        ) : null}
        <section className="grid grid-cols-2 gap-2" aria-label="לקוחות שכדאי לחזור אליהם">
          <Button variant="outline" onClick={() => router.push("/sales/dormant?bucket=attention")} className="h-auto min-h-14 justify-between gap-2 px-3 py-2 text-right">
            <span><span className="block text-sm font-semibold">לא דיברתי 3 חודשים</span><span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">לפי דיווחי גסטליט</span></span>
            <CalendarRange className="h-4 w-4 shrink-0 text-amber-600" />
          </Button>
          <Button variant="outline" onClick={() => router.push("/sales/dormant?bucket=dormant")} className="h-auto min-h-14 justify-between gap-2 px-3 py-2 text-right">
            <span><span className="block text-sm font-semibold">לא דיברתי 6 חודשים</span><span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">לפי דיווחי גסטליט</span></span>
            <CalendarRange className="h-4 w-4 shrink-0 text-red-600" />
          </Button>
        </section>
        <section className="rounded-lg border border-border bg-card/80 p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><h1 className="font-semibold">הפעילות שלי</h1></div>
              <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
                {(["7", "30", "90", "custom"] as const).map((period) => (
                  <Button key={period} size="sm" variant={filters.period === period ? "default" : "ghost"} onClick={() => setFilters((current) => ({ ...current, period }))} className="shrink-0">
                    {period === "7" ? "שבוע" : period === "custom" ? "טווח אחר" : `${period} ימים`}
                  </Button>
                ))}
              </div>
              {filters.period === "custom" ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>מתאריך</span>
                    <Input
                      type="date"
                      dir="ltr"
                      value={filters.dateFrom}
                      onInput={(event) => {
                        const dateFrom = event.currentTarget.value;
                        setFilters((current) => ({ ...current, dateFrom }));
                      }}
                      className="h-10 bg-background text-foreground"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>עד תאריך</span>
                    <Input
                      type="date"
                      dir="ltr"
                      value={filters.dateTo}
                      onInput={(event) => {
                        const dateTo = event.currentTarget.value;
                        setFilters((current) => ({ ...current, dateTo }));
                      }}
                      className="h-10 bg-background text-foreground"
                    />
                  </label>
                </div>
              ) : null}
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
        {data ? <SalesIntelligenceDashboard summary={data.summary} followUps={data.followUps} onMarkStatus={markStatus} onEventMixSelect={openActivityDrilldown} personal /> : null}

        {data ? (
          <section className="space-y-3" aria-labelledby="portfolio-title">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="portfolio-title" className="text-lg font-semibold">הלקוחות שלי</h2>
                <p className="mt-1 text-sm text-muted-foreground">השיוך הקבוע ללקוח, הפעילות האחרונה והצעד הבא.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => router.push("/sales/portfolio")} className="gap-1.5">
                לכל הלקוחות <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {data.portfolio.length === 0 ? (
                <Card className="border-dashed p-6 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">עדיין אין לקוחות שמשויכים אליך. מנהל המכירות יכול לעדכן שיוך קבוע.</Card>
              ) : data.portfolio.map((client) => (
                <button
                  key={client.client_ref}
                  type="button"
                  onClick={() => router.push(`/sales/clients/${encodeURIComponent(client.client_ref)}`)}
                  className="rounded-lg border border-border bg-card p-4 text-right shadow-sm transition hover:border-primary/40 hover:bg-accent/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{client.customer_name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{client.customer_group || "ללא קבוצה"}{client.area ? ` · ${client.area}` : ""}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${client.dormancy_bucket === "dormant" ? "bg-red-500/10 text-red-700 dark:text-red-200" : client.dormancy_bucket === "attention" ? "bg-amber-500/10 text-amber-800 dark:text-amber-100" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"}`}>
                      {client.dormancy_bucket === "dormant" ? "6+ חודשים" : client.dormancy_bucket === "attention" ? "3+ חודשים" : client.dormancy_bucket === "unknown" ? "אין מספיק מידע" : "בקשר"}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/70 pt-3 text-xs">
                    <div><span className="block text-muted-foreground">פעילויות בגסטליט</span><strong className="mt-1 block text-sm">{client.activity_count}</strong></div>
                    <div><span className="block text-muted-foreground">צעד הבא</span><strong className="mt-1 block text-sm">{client.next_action_date ? new Intl.DateTimeFormat("he-IL").format(new Date(client.next_action_date)) : "לא נקבע"}</strong></div>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">מוצגים {data.portfolio.length} מתוך {data.portfolioCount}. מדדי הקשר מבוססים כרגע על דיווחים בגסטליט בלבד.</p>
          </section>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2" aria-label="נתוני BINA שיתווספו בהמשך">
          <Card className="border-dashed p-4">
            <h2 className="font-semibold">הצעות מחיר פתוחות</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">יופיעו כאן אחרי חיבור היסטוריית ההצעות והסטטוסים מ-BINA. עד אז לא מוצג מספר חלקי כאילו הוא מלא.</p>
          </Card>
          <Card className="border-dashed p-4">
            <h2 className="font-semibold">הזמנות שנכנסו</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">יופיעו כאן אחרי אימות מקור ההזמנה המסחרית והשלמת נתוני הרטרו מ-BINA.</p>
          </Card>
        </section>
      </div>

      <Dialog open={drilldownType !== null} onOpenChange={(open) => { if (!open) setDrilldownType(null); }}>
        <DialogContent dir="rtl" desktopBreakpoint="lg" className="max-h-[92dvh] lg:max-w-2xl">
          <DialogHeader className="pl-10 pr-0">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarRange className="h-5 w-5" />
            </div>
            <DialogTitle>{drilldownType ? eventLabels[drilldownType] : "פירוט הפעילות"}</DialogTitle>
            <DialogDescription>
              {isDrilldownLoading
                ? "טוען את הדיווחים..."
                : drilldownCount === 1
                  ? "דיווח אחד לפי הסינון שבחרתם"
                  : `${drilldownCount} דיווחים לפי הסינון שבחרתם`}
            </DialogDescription>
          </DialogHeader>

          {isDrilldownLoading ? (
            <div className="rounded-lg bg-secondary/40 p-8 text-center text-sm text-muted-foreground">טוען...</div>
          ) : drilldownRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">לא נמצאו דיווחים</div>
          ) : (
            <div className="space-y-2">
              {drilldownCount > drilldownRows.length ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
                  מוצגים 200 הדיווחים האחרונים מתוך {drilldownCount}.
                </div>
              ) : null}
              {drilldownRows.map((activity) => {
                const amount = formatMoney(activity.actual_revenue ?? activity.estimated_revenue, activity.currency);
                return (
                  <article key={activity.id} className="rounded-lg border border-border bg-card/65 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{activity.customer_name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{formatActivityDate(activity.event_at)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-secondary px-2 py-1 text-xs">{statusLabels[activity.status]}</span>
                        {amount ? <bdi dir="ltr" className="text-sm font-semibold">{amount}</bdi> : null}
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{activity.ai_summary || activity.raw_note}</p>
                    {activity.ai_next_action ? <p className="mt-2 rounded-md bg-secondary/45 p-2 text-sm"><strong>הצעד הבא: </strong>{activity.ai_next_action}</p> : null}
                  </article>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <SalesMobileNav />
    </main>
  );
}
