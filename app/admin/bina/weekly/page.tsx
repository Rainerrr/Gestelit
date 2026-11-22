"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, RefreshCw, Sparkles } from "lucide-react";
import { AdminLayout } from "../../_components/admin-layout";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { previousWeek, type WeeklySnapshot } from "@/lib/bina/weekly";

const number = (n: number) => n.toLocaleString("he-IL");
const date = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString("he-IL");
const ask = (prompt: string) => window.dispatchEvent(new CustomEvent("gestelit:admin-ai-open", { detail: { prompt } }));
export default function WeeklyBinaPage() {
  const { hasAccess } = useAdminGuard();
  const [start, setStart] = useState(() => previousWeek().start);
  const [data, setData] = useState<WeeklySnapshot | null>(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!hasAccess || !start) return;
    const controller = new AbortController();
    void fetch(`/api/admin/bina/weekly?start=${encodeURIComponent(start)}`, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [hasAccess, start, refresh]);
  if (!hasAccess) return null;
  const end = data ? new Date(new Date(`${data.end}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10) : "";
  const period = data ? `${data.start} עד ${end} כולל` : start;
  const panel = "rounded-2xl border border-border bg-card p-5 shadow-sm";
  return <AdminLayout header={<div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-primary"/><h1 className="font-semibold">סקירה שבועית · BINA</h1></div>} aiContext={{ screen: "סקירה שבועית של BINA", activeTab: "סקירה שבועית", visibleSummary: `Selected period: ${period}. Incoming jobs use receipt date, not creation date. Partial synced source.` }}>
    <div className="mx-auto max-w-[1450px] space-y-5 p-4 md:p-7" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href="/admin/bina" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowRight className="h-3.5 w-3.5"/>לכל נתוני BINA</Link><p className="text-xs font-semibold tracking-wide text-primary">GESTELIT / תמונת השבוע</p><h2 className="mt-1 text-3xl font-bold">עבודות נכנסות, רכש ותחנות</h2><p className="mt-2 text-muted-foreground">{data ? `${date(data.start)} — ${date(end)}` : "טוען את התקופה…"} · לפי תאריכים עסקיים במקור</p></div>
        <div className="flex items-end gap-2"><label className="text-xs text-muted-foreground">תחילת שבוע<input aria-label="תחילת שבוע" type="date" value={start} onChange={(e) => { if (e.target.value) { setData(null); setError(false); setStart(e.target.value); } }} className="mt-1 block rounded-lg border bg-background px-3 py-2 text-sm text-foreground"/></label><button aria-label="רענון נתוני השבוע" onClick={() => { setData(null); setError(false); setRefresh((v) => v + 1); }} className="rounded-lg border p-2.5"><RefreshCw className="h-4 w-4"/></button></div>
      </div>
      {error && <div role="alert" className={panel}>לא ניתן לאמת את נתוני השבוע כרגע. נסו לרענן; לא מוצגים נתונים חלקיים כנתונים מלאים.</div>}
      {!data && !error && <p role="status" className={panel}>קורא את כל רשומות התקופה מהעותק המסונכרן…</p>}
      {data && <>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm"><span><strong>עותק מסונכרן · כיסוי מקור חלקי</strong> — אין אישור לשלמות כל נתוני BINA</span><span className="text-muted-foreground">עדכון אחרון ברשומות: {data.latestSync ? new Date(data.latestSync).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }) : "לא זמין"}</span></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
          ["עבודות שהתקבלו", data.orderCount, "לפי תאריך קבלה ב-BINA"], ["לקוחות", data.customerCount, "בעבודות שנכנסו בתקופה"], ["רשומות רכש", data.purchaseCount, "לפי תאריך מסמך"], ["ספקים ברכש", data.supplierCount, "בעותק המסונכרן לתקופה"],
        ].map(([label, value, note]) => <div key={label} className={panel}><p className="text-sm text-muted-foreground">{label}</p><p className="my-2 text-4xl font-semibold tabular-nums">{number(Number(value))}</p><p className="text-xs text-muted-foreground">{note}</p></div>)}</div>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className={panel}><h3 className="font-semibold">קצב כניסת עבודות</h3><p className="mt-1 text-xs text-muted-foreground">ספירת פק״עות לפי יום קבלה · ללא כפל שלבי ייצור</p><div className="mt-5 flex h-32 items-end gap-3">{data.daily.map((d) => <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" key={d.date}><span className="text-sm font-semibold">{d.orders}</span><div className="w-full max-w-12 rounded-t-md bg-primary/80" style={{ height: `${Math.max(3, d.orders / Math.max(1, ...data.daily.map((v) => v.orders)) * 78)}px` }}/><span className="text-xs text-muted-foreground">{date(d.date).split(".").slice(0, 2).join(".")}</span></div>)}</div><button className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary" onClick={() => ask(`אילו עבודות התקבלו ב-BINA בתקופה ${period}? סכם מספר עבודות ולקוחות, ושלוש עבודות שכדאי להכין. ציין כמויות ותאריכי אספקה מהנתונים ואת מגבלות הכיסוי. תשובה קצרה.`)}><Sparkles className="h-4 w-4"/>מה נכנס ומה להכין?</button></section>
          <section className={panel}><h3 className="font-semibold">תחנות במסלולי העבודות החדשות</h3><p className="mt-1 text-xs text-muted-foreground">{data.ordersWithRoutes} מתוך {data.orderCount} עבודות עם שורות מסלול · זו אינה תפוקה שבועית</p><div className="mt-4 space-y-2">{data.stations.slice(0, 4).map((s) => <div className="flex items-center gap-3" key={s.name}><span className="w-24 truncate text-sm" title={s.name}>{s.name}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-teal-500" style={{ width: `${s.orderIds.length / Math.max(1, ...data.stations.map((v) => v.orderIds.length)) * 100}%` }}/></div><span className="w-20 text-left text-sm tabular-nums">{s.orderIds.length} עבודות</span></div>)}</div><button className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary" onClick={() => ask(`לגבי עבודות BINA שהתקבלו בתקופה ${period}, השווה את CD5, H 08 וקיפול 1: מספר עבודות ייחודיות, שורות מסלול, ותאריכי סיום מתועדים בתקופה. אל תציג זאת כתפוקה שבועית או כעומס נוכחי. סיים בצעד תפעולי אחד. תשובה קצרה.`)}><Sparkles className="h-4 w-4"/>השוואת תחנות עם AI</button></section>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
          <section className={panel}><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">עבודות שהתקבלו בתקופה</h3><span className="text-xs text-muted-foreground">6 אחרונות מתוך {data.orderCount}</span></div><div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-2">פק״ע / לקוח</th><th className="pb-2">כמות ב-BINA</th><th className="pb-2">אספקה</th></tr></thead><tbody>{data.orders.slice(0, 6).map((o) => <tr key={o.id} className="border-t"><td className="max-w-64 py-2"><span className="font-medium">{o.id}</span><span className="mr-2">{o.customer}</span></td><td className="py-2 tabular-nums">{o.quantity === null ? "לא צוינה" : number(o.quantity)}</td><td className="py-2 whitespace-nowrap">{o.due ? date(o.due) : "לא צוין"}</td></tr>)}</tbody></table></div></section>
          <section className={panel}><h3 className="font-semibold">רכש · מה התקבל וממי</h3><p className="mt-1 text-xs text-muted-foreground">{data.purchases.filter((p) => p.type === "goods_receipt").length} קבלות טובין · {data.missingPurchaseDateCount > 0 ? `${number(data.missingPurchaseDateCount)} רשומות ללא תאריך אינן משויכות לשבוע` : "לפי תאריך מסמך"}</p><div className="mt-4 space-y-3">{Object.entries(data.purchases.reduce<Record<string, number>>((acc, p) => { acc[p.supplier || "ספק לא צוין"] = (acc[p.supplier || "ספק לא צוין"] ?? 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => <div key={name} className="flex items-center justify-between gap-4 text-sm"><span className="truncate" title={name}>{name}</span><span className="rounded-md bg-muted px-2 py-1 tabular-nums">{count}</span></div>)}</div><button className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary" onClick={() => ask(`סכם את הרכש בתקופה ${period}: כמה קבלות טובין, כמה ספקים, שלושת הספקים עם הכי הרבה מסמכים וקישור לפק״עות כאשר קיים. מה צריך לברר לפני שמסיקים שחומר זמין לייצור? תשובה קצרה עם מגבלת הכיסוי.`)}><Sparkles className="h-4 w-4"/>שאלות רכש והכנת חומרים</button></section>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{data.scope} {data.missingReceivedDateCount > 0 && `${number(data.missingReceivedDateCount)} רשומות ללא תאריך קבלה אינן משויכות לשבוע.`}</p>
      </>}
    </div>
  </AdminLayout>;
}
