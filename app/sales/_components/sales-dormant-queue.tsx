"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarClock, ChevronLeft, ChevronRight, RefreshCcw, UserRound } from "lucide-react";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchSalesDormantClientsApi } from "@/lib/api/sales-portal";
import type { SalesDormantClient } from "@/lib/data/sales-log";
import { cn } from "@/lib/utils";
import { SalesMobileNav } from "@/components/sales/sales-mobile-nav";

type Bucket = "attention" | "dormant" | "unknown";
const PAGE_SIZE = 30;

export function SalesDormantQueue() {
  const router = useRouter();
  const [bucket, setBucket] = useState<Bucket>("attention");
  const [rows, setRows] = useState<SalesDormantClient[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchSalesDormantClientsApi({ bucket, limit: PAGE_SIZE, offset }) as { rows: SalesDormantClient[]; count: number };
      setRows(result.rows);
      setCount(result.count);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === "SALES_UNAUTHORIZED") router.push("/sales/login");
      else setError("לא הצלחנו לטעון את רשימת הלקוחות. נסו שוב.");
    } finally {
      setIsLoading(false);
    }
  }, [bucket, offset, router]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("bucket");
    if (requested === "attention" || requested === "dormant" || requested === "unknown") {
      setBucket(requested);
    }
  }, []);

  return (
    <main dir="rtl" className="min-h-dvh bg-background text-right text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur lg:px-6"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3"><div className="flex items-center gap-2.5"><GestelitLogo size="sm" className="rounded-xl" /><div><h1 className="font-semibold">לקוחות שכדאי לחזור אליהם</h1><p className="text-xs text-muted-foreground">לפי דיווחי גסטליט</p></div></div><Button variant="outline" size="sm" onClick={() => router.push("/sales/dashboard")} className="h-10 gap-2"><ArrowRight className="h-4 w-4" /><span className="hidden sm:inline">הסיכום שלי</span></Button></div></header>
      <div className="mx-auto max-w-6xl space-y-4 p-3 pb-24 lg:p-6">
        <Card className="rounded-xl border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>חשוב:</strong> הרשימה אומרת שלא תועדה פנייה בגסטליט. היא לא כוללת עדיין את היסטוריית ה-CRM הישנה מ-BINA.</p></div></Card>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"><div className="flex gap-1.5">{([{ id: "attention", label: "3 חודשים" }, { id: "dormant", label: "6 חודשים" }, { id: "unknown", label: "אין היסטוריה" }] as const).map((option) => <Button key={option.id} size="sm" variant={bucket === option.id ? "default" : "outline"} onClick={() => { setBucket(option.id); setOffset(0); }}>{option.label}</Button>)}</div><Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading} className="gap-2"><RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />רענון</Button></div>
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{bucket === "attention" ? "לא תועדה פנייה 3-6 חודשים" : bucket === "dormant" ? "לא תועדה פנייה מעל 6 חודשים" : "אין היסטוריית פנייה מספקת"}</h2><Badge variant="outline">{count.toLocaleString("he-IL")} לקוחות</Badge></div>
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Card key={index} className="h-36 animate-pulse rounded-xl" />)}</div> : rows.length === 0 ? <Card className="rounded-xl border-dashed p-10 text-center text-sm text-muted-foreground">אין לקוחות בקבוצה הזו כרגע.</Card> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map((client) => <Card key={client.client_ref} role="button" tabIndex={0} onClick={() => router.push(`/sales/clients/${encodeURIComponent(client.client_ref)}`)} className="cursor-pointer rounded-xl border-border/80 p-4 shadow-sm transition hover:border-primary/40"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{client.customer_name}</h3><p className="mt-1 text-xs text-muted-foreground">{client.customer_code ? `לקוח #${client.customer_code}` : "לקוח מקומי"}</p></div><ChevronLeft className="h-4 w-4 shrink-0 text-primary" /></div><div className="mt-4 space-y-2 border-t border-border/70 pt-3 text-sm"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-muted-foreground" /><span>{client.account_manager || "ללא מנהל לקוח"}</span></div><div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground" /><span>{client.days_since_last_human_contact == null ? "אין תאריך פנייה" : `${client.days_since_last_human_contact} ימים מהפנייה המתועדת האחרונה`}</span></div></div></Card>)}</div>}
        {count > PAGE_SIZE ? <div className="flex items-center justify-between rounded-xl border border-border bg-card p-2"><Button variant="ghost" size="icon" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))} aria-label="עמוד קודם"><ChevronRight className="h-4 w-4" /></Button><span className="text-sm text-muted-foreground"><bdi dir="ltr">{offset + 1}-{Math.min(offset + PAGE_SIZE, count)}</bdi> מתוך {count}</span><Button variant="ghost" size="icon" disabled={offset + PAGE_SIZE >= count} onClick={() => setOffset((current) => current + PAGE_SIZE)} aria-label="עמוד הבא"><ChevronLeft className="h-4 w-4" /></Button></div> : null}
      </div>
      <SalesMobileNav />
    </main>
  );
}
