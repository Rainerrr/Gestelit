"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpLeft,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ContactRound,
  MapPin,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SalesActivityLog, SalesSummary } from "@/lib/data/sales-log";
import type { SalesStatus } from "@/lib/data/sales-log-utils";
import { cn } from "@/lib/utils";

type Props = {
  summary: SalesSummary | null;
  followUps: SalesActivityLog[];
  onMarkStatus: (activity: SalesActivityLog, status: SalesStatus) => Promise<void> | void;
};

const eventLabels: Record<string, string> = {
  meeting: "פגישות",
  call: "שיחות",
  lead: "לידים",
  sale: "מכירות",
  follow_up: "פולואפים",
};

const confidenceLabels = {
  reliable: "מבוסס",
  developing: "מתגבש",
  early_signal: "אות ראשוני",
};

function money(value: number, currency = "ILS") {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 100_000 ? "compact" : "standard",
  }).format(value);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" }).format(new Date(`${value}T00:00:00`));
}

function relativeDays(value: number) {
  if (value <= 0) return "היום";
  if (value === 1) return "אתמול";
  return `לפני ${value} ימים`;
}

export function SalesIntelligenceDashboard({ summary, followUps, onMarkStatus }: Props) {
  const analytics = summary?.analytics;
  const currencyOptions = analytics?.currencies.map((row) => row.currency) ?? ["ILS"];
  const [selectedCurrency, setSelectedCurrency] = useState("ILS");
  const activeCurrency = currencyOptions.includes(selectedCurrency) ? selectedCurrency : currencyOptions[0] ?? "ILS";
  const currency = analytics?.currencies.find((row) => row.currency === activeCurrency);
  const daily = (
    (analytics?.daily ?? [])
      .filter((row) => row.currency === activeCurrency)
      .slice(-30)
      .map((row) => ({ ...row, label: shortDate(row.date) }))
  );
  const icpSegments = (analytics?.icpSegments ?? []).filter((row) => row.currency === activeCurrency);
  const strongestGroup = icpSegments.find((row) => row.dimension === "customer_group" && row.segment !== "לא מסווג");
  const strongestArea = icpSegments.find((row) => row.dimension === "area" && row.segment !== "לא מסווג");
  const reps = (analytics?.reps ?? []).filter((row) => row.currency === activeCurrency);
  const opportunities = (analytics?.opportunities ?? []).filter((row) => row.currency === activeCurrency);
  const maxEventCount = Math.max(1, ...(analytics?.eventMix ?? []).map((row) => row.activityCount));
  const funnel = analytics?.funnel ?? { open: 0, won: 0, lost: 0, winRate: 0 };
  const funnelTotal = Math.max(1, funnel.open + funnel.won + funnel.lost);
  const outcomeRateReliable = (analytics?.dataQuality.lostOutcomeCount ?? 0) > 0 || funnel.won === 0;

  if (!analytics) {
    return <Card className="border-border bg-card/70 p-6 text-center text-sm text-muted-foreground">טוען ניתוח מכירות...</Card>;
  }

  return (
    <div className="space-y-4 sm:space-y-5" dir="rtl">
      <section className="rounded-lg border border-border bg-card/65 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <BriefcaseBusiness className="h-4 w-4" />
              מרכז שליטה במכירות
            </div>
            <h2 className="text-xl font-semibold sm:text-2xl">מה דורש פעולה עכשיו</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              ביצועי 90 הימים האחרונים לפי דיווחי אנשי המכירות. פרופיל ה-ICP מבוסס על תוצאות בפועל ומציג גם את חוזק הראיות.
            </p>
          </div>
          {currencyOptions.length > 1 ? (
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-background/60 p-1" aria-label="בחירת מטבע">
              {currencyOptions.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={activeCurrency === option ? "default" : "ghost"}
                  onClick={() => setSelectedCurrency(option)}
                  className="h-8 min-w-14"
                >
                  <bdi dir="ltr">{option}</bdi>
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3" aria-label="מדדי מכירות מרכזיים">
        <MetricCard icon={TrendingUp} label="פייפליין פתוח" value={money(currency?.estimatedPipeline ?? 0, activeCurrency)} detail={`${currency?.openCount ?? 0} הזדמנויות`} tone="blue" />
        <MetricCard icon={BadgeCheck} label="שיעור זכייה" value={outcomeRateReliable ? percent(funnel.winRate) : "לא אמין"} detail={outcomeRateReliable ? `${funnel.won} זכיות מתוך ${funnel.won + funnel.lost} החלטות` : "לא דווחו עסקאות שאבדו"} tone={outcomeRateReliable ? "green" : "red"} />
        <MetricCard icon={Clock3} label="פולואפים באיחור" value={summary?.overdueFollowUps ?? 0} detail={`${summary?.openFollowUps ?? 0} פולואפים פתוחים`} tone={(summary?.overdueFollowUps ?? 0) > 0 ? "red" : "green"} />
        <MetricCard icon={CircleDollarSign} label="הכנסה שנסגרה" value={money(currency?.wonRevenue ?? 0, activeCurrency)} detail={`${currency?.wonCount ?? 0} עסקאות שדווחו`} tone="violet" />
      </section>

      {analytics.dataQuality.lostOutcomeCount === 0 && funnel.won > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <div className="font-medium">שיעור הזכייה עדיין אינו אמין</div>
            <p className="mt-1 leading-5 text-amber-900/80 dark:text-amber-100/75">נרשמו זכיות אך לא נרשמו עסקאות שאבדו. יש לסגור גם הזדמנויות שלא הבשילו כדי שה-ICP וההמרה ישקפו את המציאות.</p>
          </div>
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,0.65fr)]">
        <Card className="min-w-0 border-border bg-card/70 p-4 sm:p-5">
          <SectionHeading icon={TrendingUp} title="מגמת פעילות ותוצאה" detail="30 ימים אחרונים" />
          <div className="mt-4 h-[260px] w-full sm:h-[300px]" dir="ltr">
            {daily.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
                <ComposedChart data={daily} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" minTickGap={20} />
                  <YAxis yAxisId="count" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} width={28} />
                  <YAxis yAxisId="money" orientation="right" hide />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, direction: "rtl" }}
                    formatter={(value, name) => name === "wonRevenue" ? [money(Number(value), activeCurrency), "הכנסה"] : [Number(value), "פעילויות"]}
                  />
                  <Bar yAxisId="count" dataKey="activityCount" fill="#2f80ed" radius={[4, 4, 0, 0]} maxBarSize={24} />
                  <Line yAxisId="money" type="monotone" dataKey="wonRevenue" stroke="#22c55e" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <EmptyState text="עדיין אין מספיק פעילות להצגת מגמה" />}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-[#2f80ed]" />פעילויות</span>
            <span className="flex items-center gap-2"><i className="h-0.5 w-5 bg-[#22c55e]" />הכנסה שנסגרה</span>
          </div>
        </Card>

        <Card className="border-border bg-card/70 p-4 sm:p-5">
          <SectionHeading icon={Target} title="משפך הזדמנויות" detail="לפי סטטוס מדווח" />
          <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-secondary">
            <div className="bg-blue-500" style={{ width: `${(funnel.open / funnelTotal) * 100}%` }} />
            <div className="bg-emerald-500" style={{ width: `${(funnel.won / funnelTotal) * 100}%` }} />
            <div className="bg-rose-500" style={{ width: `${(funnel.lost / funnelTotal) * 100}%` }} />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <FunnelStat label="פתוח" value={funnel.open} color="bg-blue-500" />
            <FunnelStat label="זכייה" value={funnel.won} color="bg-emerald-500" />
            <FunnelStat label="אבד" value={funnel.lost} color="bg-rose-500" />
          </div>
          <div className="mt-6 border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium text-muted-foreground">תמהיל פעילות</p>
            <div className="space-y-3">
              {analytics.eventMix.map((row) => (
                <div key={row.eventType}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{eventLabels[row.eventType] ?? row.eventType}</span>
                    <bdi dir="ltr" className="font-medium">{row.activityCount}</bdi>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(row.activityCount / maxEventCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
        <Card className="border-border bg-card/70 p-4 sm:p-5">
          <SectionHeading icon={Target} title="פרופיל ICP מתגבש" detail="לפי לקוחות שהתקדמו בפועל" />
          {strongestGroup || strongestArea ? (
            <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-4">
              <p className="text-xs font-medium text-primary">האות החזק ביותר כרגע</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {strongestGroup ? <ProfileChip icon={Building2} label={strongestGroup.segment} /> : null}
                {strongestArea ? <ProfileChip icon={MapPin} label={strongestArea.segment} /> : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                זהו כיוון לתעדוף, לא הגדרה סופית. חוזק האות נקבע לפי מספר לקוחות, כמות פעילויות, זכיות וגודל עסקה.
              </p>
            </div>
          ) : <EmptyState text="חסרים שיוך לקבוצה או אזור כדי לזהות ICP" />}

          <div className="mt-4 space-y-3">
            {icpSegments.filter((row) => row.segment !== "לא מסווג").slice(0, 6).map((segment) => (
              <div key={`${segment.dimension}-${segment.segment}`} className="rounded-lg border border-border bg-background/45 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {segment.dimension === "area" ? <MapPin className="h-4 w-4 text-muted-foreground" /> : <Building2 className="h-4 w-4 text-muted-foreground" />}
                      <span className="truncate font-medium">{segment.segment}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{segment.uniqueClients} לקוחות · {segment.activityCount} פעילויות · {segment.wonCount === 1 ? "זכייה אחת" : `${segment.wonCount} זכיות`}</p>
                  </div>
                  <Badge variant="outline" className={cn(segment.confidence === "reliable" && "border-emerald-500/40 text-emerald-400")}>{confidenceLabels[segment.confidence]}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${segment.fitScore}%` }} />
                  </div>
                  <bdi dir="ltr" className="w-10 text-left text-sm font-semibold">{segment.fitScore}</bdi>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-border bg-card/70 p-4 sm:p-5">
          <SectionHeading icon={AlertTriangle} title="תור פעולה מסחרי" detail="מדורג לפי איחור, שווי וחוסר פעילות" />
          <div className="mt-4 space-y-2">
            {opportunities.length === 0 ? <EmptyState text="אין הזדמנויות פתוחות לתעדוף" /> : opportunities.slice(0, 7).map((row, index) => (
              <div key={`${row.clientKey}-${row.currency}`} className="grid gap-3 rounded-lg border border-border bg-background/45 p-3 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-center">
                <div className="hidden h-8 w-8 items-center justify-center rounded-md bg-secondary text-xs font-semibold sm:flex">{index + 1}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-medium">{row.customerName}</h3>
                    {row.overdueFollowUps > 0 ? <Badge className="bg-rose-500/10 text-rose-400">{row.overdueFollowUps} באיחור</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{row.salesperson} · {row.customerGroup} · {row.area} · פעילות אחרונה {relativeDays(row.inactiveDays)}</p>
                  {row.latestContext ? <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{row.latestContext}</p> : null}
                </div>
                <div className="flex items-center justify-between gap-3 sm:block sm:text-left">
                  <div className="font-semibold">{money(row.estimatedPipeline, row.currency)}</div>
                  <div className="text-xs text-muted-foreground">ציון {row.priorityScore}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card className="border-border bg-card/70 p-4 sm:p-5">
          <SectionHeading icon={Users} title="ביצועי צוות" detail="90 ימים, תוצאה לצד פעילות" />
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[680px] text-right text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="pb-3 font-medium">איש מכירות</th>
                  <th className="pb-3 font-medium">פעילויות</th>
                  <th className="pb-3 font-medium">לקוחות</th>
                  <th className="pb-3 font-medium">זכיות</th>
                  <th className="pb-3 font-medium">המרה</th>
                  <th className="pb-3 font-medium">פייפליין</th>
                  <th className="pb-3 font-medium">באיחור</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reps.map((rep) => (
                  <tr key={`${rep.salesperson}-${rep.currency}`}>
                    <td className="py-3 font-medium">{rep.salesperson}</td>
                    <td className="py-3"><bdi dir="ltr">{rep.activityCount}</bdi></td>
                    <td className="py-3"><bdi dir="ltr">{rep.uniqueClients}</bdi></td>
                    <td className="py-3"><bdi dir="ltr">{rep.wonCount}</bdi></td>
                    <td className={cn("py-3", !outcomeRateReliable && rep.wonCount > 0 && "text-amber-500")}><bdi dir="ltr">{outcomeRateReliable || rep.wonCount === 0 ? percent(rep.conversionRate) : "לא אמין"}</bdi></td>
                    <td className="py-3 font-medium"><bdi dir="ltr">{money(rep.estimatedPipeline, rep.currency)}</bdi></td>
                    <td className={cn("py-3", rep.overdueFollowUps > 0 && "text-rose-400")}><bdi dir="ltr">{rep.overdueFollowUps}</bdi></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-2 md:hidden">
            {reps.map((rep) => (
              <div key={`${rep.salesperson}-${rep.currency}`} className="rounded-lg border border-border bg-background/45 p-3">
                <div className="flex items-center justify-between gap-3"><span className="font-medium">{rep.salesperson}</span><span className="font-semibold">{money(rep.estimatedPipeline, rep.currency)}</span></div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs text-muted-foreground">
                  <MiniStat label="פעילות" value={rep.activityCount} />
                  <MiniStat label="לקוחות" value={rep.uniqueClients} />
                  <MiniStat label="המרה" value={outcomeRateReliable || rep.wonCount === 0 ? percent(rep.conversionRate) : "לא אמין"} />
                  <MiniStat label="באיחור" value={rep.overdueFollowUps} danger={rep.overdueFollowUps > 0} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-border bg-card/70 p-4 sm:p-5">
          <SectionHeading icon={CheckCircle2} title="איכות הדיווח" detail={`${analytics.dataQuality.total} דיווחים שנבדקו`} />
          <div className="mt-5 space-y-5">
            <QualityBar icon={ContactRound} label="שיוך ללקוח מהאינדקס" value={analytics.dataQuality.clientLinkRate} />
            <QualityBar icon={CircleDollarSign} label="תיעוד שווי הזדמנות" value={analytics.dataQuality.valueCaptureRate} />
            <QualityBar icon={Users} label="תיעוד איש קשר" value={analytics.dataQuality.contactCaptureRate} />
            <QualityBar icon={ArrowUpLeft} label="פעולה הבאה להזדמנות פתוחה" value={analytics.dataQuality.nextActionRate} />
            <QualityBar icon={BadgeCheck} label="הזדמנויות עם תוצאה סופית" value={analytics.dataQuality.outcomeClosureRate} />
          </div>
          <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
            איכות ICP תלויה באיכות הדיווח. השלמת לקוח, סכום ופעולה הבאה משפרת את הדיוק יותר מהוספת טקסט חופשי נוסף.
          </p>
        </Card>
      </section>

      {followUps.length > 0 ? (
        <Card className="border-amber-500/25 bg-amber-500/5 p-4 sm:p-5">
          <SectionHeading icon={Clock3} title="פולואפים לביצוע" detail={`${followUps.length} משימות להשלמה`} />
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {followUps.slice(0, 6).map((activity) => (
              <div key={activity.id} className="rounded-lg border border-border bg-background/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{activity.customer_name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{activity.salesperson} · {activity.next_action_date ?? "ללא תאריך"}</div>
                  </div>
                  <Badge className="bg-amber-500/10 text-amber-400">לטיפול</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{activity.ai_next_action || activity.ai_summary || activity.raw_note}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Button size="sm" variant="outline" onClick={() => void onMarkStatus(activity, "done")}>בוצע</Button>
                  <Button size="sm" variant="outline" onClick={() => void onMarkStatus(activity, "won")}>זכייה</Button>
                  <Button size="sm" variant="outline" onClick={() => void onMarkStatus(activity, "lost")}>אבד</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone }: { icon: typeof TrendingUp; label: string; value: string | number; detail: string; tone: "blue" | "green" | "red" | "violet" }) {
  const tones = {
    blue: "bg-blue-500/10 text-blue-400",
    green: "bg-emerald-500/10 text-emerald-400",
    red: "bg-rose-500/10 text-rose-400",
    violet: "bg-violet-500/10 text-violet-400",
  };
  return (
    <Card className="min-w-0 border-border bg-card/70 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground sm:text-sm">{label}</div>
          <div className="mt-2 break-words text-lg font-semibold sm:text-2xl">{value}</div>
        </div>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md sm:h-9 sm:w-9", tones[tone])}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-2 truncate text-[11px] text-muted-foreground sm:text-xs">{detail}</div>
    </Card>
  );
}

function SectionHeading({ icon: Icon, title, detail }: { icon: typeof TrendingUp; title: string; detail: string }) {
  return <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><h2 className="font-semibold sm:text-lg">{title}</h2></div><span className="text-xs text-muted-foreground">{detail}</span></div>;
}

function FunnelStat({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="rounded-md bg-secondary/40 p-2 text-center"><div className="mb-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><i className={cn("h-2 w-2 rounded-full", color)} />{label}</div><bdi dir="ltr" className="text-lg font-semibold">{value}</bdi></div>;
}

function ProfileChip({ icon: Icon, label }: { icon: typeof Building2; label: string }) {
  return <span className="inline-flex items-center gap-2 rounded-md border border-primary/25 bg-background/70 px-3 py-2 text-sm font-medium"><Icon className="h-4 w-4 text-primary" />{label}</span>;
}

function MiniStat({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) {
  return <div><div className={cn("font-semibold text-foreground", danger && "text-rose-400")}>{value}</div><div className="mt-0.5">{label}</div></div>;
}

function QualityBar({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  const tone = value >= 80 ? "bg-emerald-500" : value >= 55 ? "bg-amber-500" : "bg-rose-500";
  return <div><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" />{label}</span><bdi dir="ltr" className="font-semibold">{value}%</bdi></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={cn("h-full rounded-full", tone)} style={{ width: `${value}%` }} /></div></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{text}</div>;
}
