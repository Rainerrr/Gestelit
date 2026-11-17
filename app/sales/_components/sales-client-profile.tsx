"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  MapPin,
  PackageCheck,
  RefreshCcw,
  UserRound,
} from "lucide-react";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchSalesClientProfileApi } from "@/lib/api/sales-portal";
import type { SalesClientProfile } from "@/lib/data/sales-log";
import { cn } from "@/lib/utils";
import { SalesMobileNav } from "@/components/sales/sales-mobile-nav";

const PAGE_SIZE = 30;

const eventLabels: Record<string, string> = {
  meeting: "פגישה",
  call: "שיחה",
  lead: "ליד",
  sale: "מכירה",
  follow_up: "פולואפ",
};

function formatDate(value: string | null, withTime = false) {
  if (!value) return "לא ידוע";
  return new Intl.DateTimeFormat("he-IL", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(new Date(value));
}

function formatMoney(value: number | null) {
  if (value == null) return "לא ידוע";
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
}

function dormancyTone(bucket: SalesClientProfile["touch"]["dormancyBucket"]) {
  if (bucket === "dormant") return "border-red-200 bg-red-50 text-red-700";
  if (bucket === "attention") return "border-amber-200 bg-amber-50 text-amber-800";
  if (bucket === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function SalesClientProfileView({ clientRef }: { clientRef: string }) {
  const router = useRouter();
  const [data, setData] = useState<SalesClientProfile | null>(null);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"activity" | "commercial" | "pipeline" | "details">("activity");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchSalesClientProfileApi(clientRef, {
        limit: PAGE_SIZE,
        offset,
      }) as SalesClientProfile;
      setData(result);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === "SALES_UNAUTHORIZED") {
        router.push("/sales/login");
        return;
      }
      setError("לא הצלחנו לטעון את תיק הלקוח. נסו שוב.");
    } finally {
      setIsLoading(false);
    }
  }, [clientRef, offset, router]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main dir="rtl" className="min-h-dvh bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)))] text-right text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur lg:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <GestelitLogo size="sm" className="rounded-xl" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">תיק לקוח</h1>
              <p className="truncate text-xs text-muted-foreground">מידע מסחרי ופעילות מתועדת</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push("/sales/clients")} className="h-10 gap-2 rounded-xl px-3">
            <ArrowRight className="h-4 w-4" />
            <span className="hidden sm:inline">חזרה ללקוחות</span>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-4 p-3 pb-24 lg:p-6">
        {error ? (
          <Card className="flex flex-col items-center gap-3 rounded-xl border-red-200 bg-red-50 p-6 text-red-800">
            <AlertTriangle className="h-6 w-6" />
            <span>{error}</span>
            <Button variant="outline" onClick={() => void load()} className="gap-2"><RefreshCcw className="h-4 w-4" />ניסיון נוסף</Button>
          </Card>
        ) : null}

        {isLoading && !data ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <Card key={index} className="h-36 animate-pulse rounded-xl" />)}
          </div>
        ) : data ? (
          <>
            <section className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
              <Card className="rounded-xl border-border/80 p-4 shadow-sm lg:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="break-words text-2xl font-semibold lg:text-3xl">{data.client.customer_name}</h2>
                      <Badge variant="outline">{data.client.customer_code ? `#${data.client.customer_code}` : "לקוח מקומי"}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{data.touch.wording}</p>
                  </div>
                  <Badge variant="outline" className={cn("w-fit", dormancyTone(data.touch.dormancyBucket))}>
                    {data.touch.dormancyBucket === "active" ? "בקשר" : data.touch.dormancyBucket === "attention" ? "דורש תשומת לב" : data.touch.dormancyBucket === "dormant" ? "ללא פנייה מתועדת 6 חודשים" : "כיסוי חלקי"}
                  </Badge>
                </div>
                <div className="mt-5 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                  <ProfileMeta icon={UserRound} label="מנהל לקוח" value={data.ownership.accountManager} />
                  <ProfileMeta icon={Building2} label="קבוצה" value={data.client.customer_group} />
                  <ProfileMeta icon={MapPin} label="אזור" value={data.client.area} />
                  <ProfileMeta icon={CalendarClock} label="פנייה אחרונה בגסטליט" value={formatDate(data.touch.lastHumanContactAt, true)} />
                </div>
              </Card>

              <Card className="rounded-xl border-amber-200 bg-amber-50/70 p-4 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <h3 className="font-semibold text-amber-950 dark:text-amber-100">מה אנחנו יודעים כרגע</h3>
                    <p className="mt-1 text-sm leading-6 text-amber-900/80 dark:text-amber-100/75">
                      הפעילויות בגסטליט מלאות לטווח שמותר לך לראות. היסטוריית פניות ישנה מ-BINA עדיין לא מחוברת, וחשבוניות ומשלוחים מוצגים לפי הסנכרון החלקי הקיים.
                    </p>
                  </div>
                </div>
              </Card>
            </section>

            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
              {([
                ["activity", "פעילות"],
                ["commercial", "חשבוניות ומשלוחים"],
                ["pipeline", "הצעות והזמנות"],
                ["details", "פרטי לקוח"],
              ] as const).map(([id, label]) => <Button key={id} variant={activeTab === id ? "default" : "ghost"} size="sm" onClick={() => setActiveTab(id)} className="shrink-0">{label}</Button>)}
            </div>

            {activeTab === "activity" ? <section>
              <Card className="rounded-xl border-border/80 p-4 shadow-sm lg:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">פעילות מול הלקוח</h3>
                    <p className="text-sm text-muted-foreground">{data.activities.count.toLocaleString("he-IL")} דיווחים בטווח ההרשאה שלך</p>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => void load()} disabled={isLoading} aria-label="רענון">
                    <RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                  </Button>
                </div>
                <div className="mt-4 space-y-3">
                  {data.activities.rows.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">אין עדיין פעילות מתועדת בגסטליט בטווח שמותר לך לראות.</div>
                  ) : data.activities.rows.map((activity) => (
                    <article key={activity.id} className="rounded-xl border border-border/80 bg-secondary/25 p-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge>{eventLabels[activity.event_type] ?? activity.event_type}</Badge>
                          <span className="font-medium">{activity.salesperson}</span>
                        </div>
                        <time className="text-xs text-muted-foreground">{formatDate(activity.event_at, true)}</time>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{activity.ai_summary || activity.raw_note}</p>
                      {activity.ai_next_action ? <p className="mt-2 text-sm font-medium text-primary">המשך: {activity.ai_next_action}</p> : null}
                    </article>
                  ))}
                </div>
                {data.activities.count > PAGE_SIZE ? (
                  <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3">
                    <Button variant="ghost" size="icon" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))} aria-label="עמוד קודם"><ChevronRight className="h-5 w-5" /></Button>
                    <span className="text-sm text-muted-foreground"><bdi dir="ltr">{offset + 1}-{Math.min(offset + PAGE_SIZE, data.activities.count)}</bdi> מתוך <bdi dir="ltr">{data.activities.count}</bdi></span>
                    <Button variant="ghost" size="icon" disabled={offset + PAGE_SIZE >= data.activities.count} onClick={() => setOffset((current) => current + PAGE_SIZE)} aria-label="עמוד הבא"><ChevronLeft className="h-5 w-5" /></Button>
                  </div>
                ) : null}
              </Card>
            </section> : null}

            {activeTab === "commercial" ? <section className="grid gap-4 lg:grid-cols-2">
                <CommercialCard
                  icon={CircleDollarSign}
                  title="חשבוניות אחרונות"
                  empty="אין חשבוניות בסנכרון החלקי הקיים"
                  rows={data.invoices.map((invoice) => ({
                    key: invoice.bina_id,
                    title: invoice.invoice_no ? `חשבונית ${invoice.invoice_no}` : "חשבונית",
                    meta: formatDate(invoice.invoice_at),
                    value: formatMoney(invoice.total_amount),
                  }))}
                />
                <CommercialCard
                  icon={PackageCheck}
                  title="משלוחים אחרונים"
                  empty="אין משלוחים בסנכרון החלקי הקיים"
                  rows={data.deliveries.map((delivery) => ({
                    key: delivery.bina_id,
                    title: delivery.delivery_no ? `משלוח ${delivery.delivery_no}` : "משלוח",
                    meta: `${formatDate(delivery.delivery_at)} · ${delivery.delivery_state ?? "מצב לא ידוע"}`,
                    value: delivery.tracking_no || formatMoney(delivery.total_amount),
                  }))}
                />
            </section> : null}

            {activeTab === "pipeline" ? <section className="grid gap-4 md:grid-cols-2">
              <Card className="rounded-xl border-dashed p-6"><h3 className="font-semibold">הצעות מחיר</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">הנתון עדיין לא מחובר. נדרש סנכרון DFHats ומיפוי סטטוסים לפני שנציג מספרים.</p></Card>
              <Card className="rounded-xl border-dashed p-6"><h3 className="font-semibold">הזמנות מסחריות</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">מקור ההזמנות ב-BINA עדיין לא אומת עסקית, ולכן המערכת לא מציגה פקודות ייצור כהזמנות מכירה.</p></Card>
            </section> : null}

            {activeTab === "details" ? <Card className="grid gap-4 rounded-xl p-4 sm:grid-cols-2 lg:grid-cols-3">
              <ProfileMeta icon={UserRound} label="איש קשר" value={data.client.contact_person} />
              <ProfileMeta icon={Building2} label="טלפון" value={data.client.phone || data.client.mobile} />
              <ProfileMeta icon={Building2} label="אימייל" value={data.client.email} />
              <ProfileMeta icon={Building2} label="מספר הנהלת חשבונות" value={data.client.bookkeeping_no} />
              <ProfileMeta icon={Building2} label="עוסק / ח.פ." value={data.client.tax_id} />
              <ProfileMeta icon={CalendarClock} label="נפתח בתאריך" value={formatDate(data.client.opened_at)} />
            </Card> : null}
          </>
        ) : null}
      </div>
      <SalesMobileNav />
    </main>
  );
}

function ProfileMeta({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-0.5 break-words text-sm font-medium">{value || "לא ידוע"}</div></div>
    </div>
  );
}

function CommercialCard({ icon: Icon, title, empty, rows }: {
  icon: typeof CircleDollarSign;
  title: string;
  empty: string;
  rows: Array<{ key: string; title: string; meta: string; value: string }>;
}) {
  return (
    <Card className="rounded-xl border-border/80 p-4 shadow-sm">
      <div className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary" /><h3 className="font-semibold">{title}</h3><Badge variant="outline" className="mr-auto">מדגם חלקי</Badge></div>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{empty}</p> : rows.slice(0, 6).map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-3 rounded-xl bg-secondary/40 p-3">
            <div className="min-w-0"><div className="truncate text-sm font-medium">{row.title}</div><div className="mt-0.5 text-xs text-muted-foreground">{row.meta}</div></div>
            <bdi dir="ltr" className="shrink-0 text-sm font-semibold">{row.value}</bdi>
          </div>
        ))}
      </div>
    </Card>
  );
}
