"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, ChevronLeft, RefreshCcw, Search, UsersRound } from "lucide-react";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchSalesPortfolioApi } from "@/lib/api/sales-portal";
import type { SalesPortfolioClient } from "@/lib/data/sales-log";
import { SalesMobileNav } from "@/components/sales/sales-mobile-nav";

const PAGE_SIZE = 30;

function contactLabel(client: SalesPortfolioClient) {
  if (client.dormancy_bucket === "dormant") return { label: "6+ חודשים בלי דיווח קשר", tone: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-100" };
  if (client.dormancy_bucket === "attention") return { label: "3+ חודשים בלי דיווח קשר", tone: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-100" };
  if (client.dormancy_bucket === "unknown") return { label: "אין מספיק היסטוריה", tone: "border-border bg-secondary text-muted-foreground" };
  return { label: "בקשר", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100" };
}

export function SalesPortfolioList() {
  const router = useRouter();
  const requestId = useRef(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<SalesPortfolioClient[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOffset(0);
      setSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchSalesPortfolioApi({ search, limit: PAGE_SIZE, offset }) as { rows: SalesPortfolioClient[]; count: number };
      if (currentRequest !== requestId.current) return;
      setRows(result.rows);
      setCount(result.count);
    } catch (loadError) {
      if (currentRequest !== requestId.current) return;
      if (loadError instanceof Error && loadError.message === "SALES_UNAUTHORIZED") {
        router.push("/sales/login");
        return;
      }
      setError("לא הצלחנו לטעון את תיק הלקוחות. נסו שוב.");
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [offset, router, search]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main dir="rtl" className="min-h-dvh bg-background text-right text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur lg:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5"><GestelitLogo size="sm" className="rounded-xl" /><div><h1 className="font-semibold">הלקוחות שלי</h1><p className="text-xs text-muted-foreground">לקוחות שמשויכים אליי באופן קבוע</p></div></div>
          <Button variant="outline" size="sm" onClick={() => router.push("/sales/dashboard")} className="h-10 gap-2"><ArrowRight className="h-4 w-4" /><span className="hidden sm:inline">חזרה לסיכום</span></Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-4 p-3 pb-24 lg:p-6">
        <Card className="rounded-xl p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="חיפוש לקוח" className="h-11 pr-9" /></div>
            <Button variant="outline" onClick={() => void load()} disabled={isLoading} className="h-11 gap-2"><RefreshCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />רענון</Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">היסטוריית הקשר מבוססת כרגע על דיווחים בגסטליט בלבד. נתוני CRM היסטוריים מ-BINA עדיין לא מחוברים.</p>
        </Card>

        {error ? <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-100">{error}</Card> : null}
        {isLoading && rows.length === 0 ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Card key={index} className="h-44 animate-pulse rounded-xl" />)}</div> : null}
        {!isLoading && rows.length === 0 ? <Card className="border-dashed p-10 text-center"><UsersRound className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">לא נמצאו לקוחות שמשויכים אליך.</p></Card> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((client) => {
            const state = contactLabel(client);
            return (
              <button key={client.client_ref} type="button" onClick={() => router.push(`/sales/clients/${encodeURIComponent(client.client_ref)}`)} className="rounded-xl border border-border bg-card p-4 text-right shadow-sm transition hover:border-primary/40 hover:bg-accent/30">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-semibold">{client.customer_name}</h2><p className="mt-1 text-xs text-muted-foreground">{client.customer_code ? `לקוח #${client.customer_code}` : "לקוח מקומי"}</p></div><ChevronLeft className="h-4 w-4 shrink-0 text-primary" /></div>
                <Badge variant="outline" className={`mt-3 ${state.tone}`}>{state.label}</Badge>
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/70 pt-3 text-xs"><div><span className="text-muted-foreground">פעילויות</span><strong className="mt-1 block text-base">{client.activity_count}</strong></div><div><span className="text-muted-foreground">חשבוניות מסונכרנות</span><strong className="mt-1 block text-base">{client.current_invoice_row_count}</strong></div></div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="h-4 w-4" /><span>{client.next_action_date ? `הצעד הבא ב-${new Intl.DateTimeFormat("he-IL").format(new Date(client.next_action_date))}` : "לא נקבע צעד הבא"}</span></div>
              </button>
            );
          })}
        </div>

        {count > PAGE_SIZE ? <div className="flex items-center justify-center gap-2"><Button variant="outline" disabled={offset === 0 || isLoading} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>הקודם</Button><span className="text-sm text-muted-foreground">{offset + 1}-{Math.min(offset + PAGE_SIZE, count)} מתוך {count}</span><Button variant="outline" disabled={offset + PAGE_SIZE >= count || isLoading} onClick={() => setOffset((value) => value + PAGE_SIZE)}>הבא</Button></div> : null}
      </div>
      <SalesMobileNav />
    </main>
  );
}
