"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, RefreshCw, Sparkles } from "lucide-react";
import { AdminLayout } from "../../_components/admin-layout";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { DatePicker } from "@/components/ui/date-picker";
import { dateKey } from "@/components/ui/hebrew-calendar";
import { BidiText } from "@/components/ai/answer-text";
import { hebrewDate, hebrewDateRange, hebrewTimestamp } from "@/lib/format/hebrew";
import { previousWeek, type WeeklySnapshot } from "@/lib/bina/weekly";

const number = (n: number) => n.toLocaleString("he-IL");
const date = hebrewDate;
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
  const period = data ? `${hebrewDateRange(data.start, end)} כולל` : start;
  const panel = "rounded-2xl border border-border bg-card p-5 shadow-sm";
  return <AdminLayout header={<div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-primary"/><h1 className="font-semibold">סקירה שבועית · BINA</h1></div>} aiContext={{ screen: "סקירה שבועית של BINA", activeTab: "סקירה שבועית", visibleSummary: `Selected period: ${period}. Incoming jobs use receipt date, not creation date. Partial synced source.` }}>
    <div className="mx-auto max-w-[1450px] space-y-5 p-4 md:p-7" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href="/admin/bina" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowRight className="h-3.5 w-3.5"/>לכל נתוני BINA</Link><p className="text-xs font-semibold tracking-wide text-primary">GESTELIT / תמונת השבוע</p><h2 className="mt-1 text-3xl font-bold">עבודות נכנסות, רכש ותחנות</h2><p className="mt-2 text-muted-foreground"><BidiText text={data ? hebrewDateRange(data.start, end) : "טוען את התקופה…"}/> · לפי תאריכים עסקיים במקור</p></div>
        <div className="flex w-full items-end gap-2 sm:w-auto"><div className="min-w-0 flex-1"><p className="mb-1.5 text-xs text-muted-foreground">תחילת התקופה · שבעה ימים</p><DatePicker id="weekly-start" label="תחילת התקופה" clearable={false} value={new Date(`${start}T12:00:00`)} onChange={(value) => { if (value) { setData(null); setError(false); setStart(dateKey(value)); } }}/></div><button aria-label="רענון נתוני השבוע" onClick={() => { setData(null); setError(false); setRefresh((v) => v + 1); }} className="rounded-xl border bg-card p-3"><RefreshCw className="h-4 w-4"/></button></div>
      </div>
      {error && <div role="alert" className={panel}>לא ניתן לאמת את נתוני השבוע כרגע. נסו לרענן; לא מוצגים נתונים חלקיים כנתונים מלאים.</div>}
      {!data && !error && <p role="status" className={panel}>קורא את כל רשומות התקופה מהעותק המסונכרן…</p>}
      {data && <>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm"><span><strong>עותק מסונכרן · כיסוי מקור חלקי</strong> — אין אישור לשלמות כל נתוני BINA</span><span className="text-muted-foreground"><BidiText text={`עדכון אחרון: ${hebrewTimestamp(data.latestSync) ?? "לא זמין"}`}/></span></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
          ["עבודות שהתקבלו", data.orderCount, "לפי תאריך קבלה ב-BINA"], ["לקוחות", data.customerCount, "בעבודות שנכנסו בתקופה"], ["רשומות רכש", data.purchaseCount, "לפי תאריך מסמך"], ["ספקים ברכש", data.supplierCount, "בעותק המסונכרן לתקופה"],
        ].map(([label, value, note]) => <div key={label} className={panel}><p className="text-sm text-muted-foreground">{label}</p><p className="my-2 text-4xl font-semibold tabular-nums">{number(Number(value))}</p><p className="text-xs text-muted-foreground">{note}</p></div>)}</div>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className={panel}><h3 className="font-semibold">קצב כניסת עבודות</h3><p className="mt-1 text-xs text-muted-foreground">ספירת פק״עות לפי יום בחודש · ללא כפל שלבי ייצור</p><div className="mt-5 flex h-32 items-end gap-3">{data.daily.map((d) => <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" key={d.date}><span className="text-sm font-semibold">{d.orders}</span><div className="w-full max-w-12 rounded-t-md bg-primary/80" style={{ height: `${Math.max(3, d.orders / Math.max(1, ...data.daily.map((v) => v.orders)) * 78)}px` }}/><span className="text-xs text-muted-foreground"><bdi dir="ltr">{d.date.slice(8, 10)}</bdi></span></div>)}</div><button className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary" onClick={() => ask(`אילו עבודות התקבלו ב-BINA בתקופה ${period}? סכם מספר עבודות ולקוחות, ושלוש עבודות שכדאי להכין. ציין כמויות ותאריכי אספקה מהנתונים ואת מגבלות הכיסוי. תשובה קצרה.`)}><Sparkles className="h-4 w-4"/>מה נכנס ומה להכין?</button></section>
          <section className={panel}><h3 className="font-semibold">תחנות במסלולי העבודות החדשות</h3><p className="mt-1 text-xs text-muted-foreground">{data.ordersWithRoutes} מתוך {data.orderCount} עבודות עם שורות מסלול · זו אינה תפוקה שבועית</p><div className="mt-4 space-y-2">{data.stations.slice(0, 4).map((s) => <div className="flex items-center gap-3" key={s.name}><span className="w-24 truncate text-sm" title={s.name}><BidiText text={s.name}/></span><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-teal-500" style={{ width: `${s.orderIds.length / Math.max(1, ...data.stations.map((v) => v.orderIds.length)) * 100}%` }}/></div><span className="w-20 text-left text-sm tabular-nums"><bdi dir="ltr">{s.orderIds.length}</bdi> עבודות</span></div>)}</div><button className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary" onClick={() => ask(`לגבי עבודות BINA שהתקבלו בתקופה ${period}, השווה את CD5, H 08 וקיפול 1: מספר עבודות ייחודיות, שורות מסלול, ותאריכי סיום מתועדים בתקופה. אל תציג זאת כתפוקה שבועית או כעומס נוכחי. סיים בצעד תפעולי אחד. תשובה קצרה.`)}><Sparkles className="h-4 w-4"/>השוואת תחנות עם AI</button></section>
        </div>
        <div className="grid gap-4 2xl:grid-cols-[1.6fr_1fr]">
          <section className={panel}><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">עבודות שהתקבלו בתקופה</h3><span className="text-xs text-muted-foreground">6 אחרונות מתוך {data.orderCount}</span></div><div className="hidden overflow-x-auto sm:block"><table className="w-full text-start text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-3 text-start">פק״ע / לקוח</th><th className="pb-3 text-start">כמות BINA</th><th className="pb-3 text-start">תאריך קבלה</th><th className="pb-3 text-start">תאריך אספקה</th></tr></thead><tbody>{data.orders.slice(0, 6).map((o) => <tr key={o.id} className="border-t"><td className="max-w-64 py-3 pe-4"><bdi dir="ltr" className="block font-semibold text-primary">{o.id}</bdi><span className="mt-1 block text-xs text-muted-foreground"><BidiText text={o.customer}/></span></td><td className="py-3 pe-4 tabular-nums"><bdi dir="ltr">{o.quantity === null ? "לא צוינה" : number(o.quantity)}</bdi></td><td className="py-3 pe-4"><BidiText text={date(o.received)}/></td><td className="py-3"><BidiText text={o.due ? date(o.due) : "לא צוין"}/></td></tr>)}</tbody></table></div>
          <div className="space-y-3 sm:hidden">{data.orders.slice(0, 6).map((o) => <article key={o.id} className="rounded-xl border p-3"><bdi dir="ltr" className="font-semibold text-primary">{o.id}</bdi><p className="mt-1 text-sm"><BidiText text={o.customer}/></p><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">כמות BINA</dt><dd className="mt-1 font-medium"><bdi dir="ltr">{o.quantity === null ? "לא צוינה" : number(o.quantity)}</bdi></dd></div><div><dt className="text-muted-foreground">תאריך קבלה</dt><dd className="mt-1"><BidiText text={date(o.received)}/></dd></div><div className="col-span-2"><dt className="text-muted-foreground">תאריך אספקה</dt><dd className="mt-1"><BidiText text={o.due ? date(o.due) : "לא צוין"}/></dd></div></dl></article>)}</div></section>
          <section className={panel}><h3 className="font-semibold">רכש · מסמכים וספקים</h3><p className="mt-1 text-xs text-muted-foreground">{data.purchases.filter((p) => p.type === "goods_receipt").length} מסמכי קבלת טובין · {data.missingPurchaseDateCount > 0 ? `${number(data.missingPurchaseDateCount)} רשומות ללא תאריך אינן משויכות לשבוע` : "לפי תאריך מסמך"}</p><div className="mt-4 space-y-3">{data.purchaseSuppliers.slice(0, 4).map(({ name, documents: count }) => <div key={name} className="flex items-center justify-between gap-4 text-sm"><span className="truncate" title={name}><BidiText text={name}/></span><span className="rounded-md bg-muted px-2 py-1 tabular-nums">{count}</span></div>)}</div><button className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary" onClick={() => ask(`סכם את הרכש בתקופה ${period}: כמה קבלות טובין, כמה ספקים, שלושת הספקים עם הכי הרבה מסמכים וקישור לפק״עות כאשר קיים. מה צריך לברר לפני שמסיקים שחומר זמין לייצור? תשובה קצרה עם מגבלת הכיסוי.`)}><Sparkles className="h-4 w-4"/>שאלות רכש והכנת חומרים</button></section>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{data.scope} {data.missingReceivedDateCount > 0 && `${number(data.missingReceivedDateCount)} רשומות ללא תאריך קבלה אינן משויכות לשבוע.`}</p>
      </>}
    </div>
  </AdminLayout>;
}
