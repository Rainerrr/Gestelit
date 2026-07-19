"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Hash,
  Search,
  UserRound,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { NewClientDialog } from "@/components/sales/new-client-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchSalesClientIndexApi, fetchSalesPortalSessionApi } from "@/lib/api/sales-portal";
import type { BinaClientIndexRow } from "@/lib/data/sales-log";
import type { PendingBinaClient } from "@/lib/data/bina-client-onboarding";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 30;

type SalesPortalUser = {
  id: string;
  email: string;
  full_name: string;
};

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

function statusTone(status: string | null) {
  if (status?.includes("לא פעיל")) return "border-slate-300 bg-slate-100 text-slate-700";
  if (status?.includes("מועדף")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status?.includes("פעיל")) return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-border bg-secondary/60 text-muted-foreground";
}

export function SalesClientIndex() {
  const router = useRouter();
  const [user, setUser] = useState<SalesPortalUser | null>(null);
  const [rows, setRows] = useState<BinaClientIndexRow[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [mine, setMine] = useState(false);
  const [offset, setOffset] = useState(0);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNewClientOpen, setIsNewClientOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOffset(0);
      setSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [session, result] = await Promise.all([
        fetchSalesPortalSessionApi() as Promise<{ user: SalesPortalUser }>,
        fetchSalesClientIndexApi({ search, mine, limit: PAGE_SIZE, offset }) as Promise<{
          rows: BinaClientIndexRow[];
          count: number;
        }>,
      ]);
      setUser(session.user);
      setRows(result.rows);
      setCount(result.count);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === "SALES_UNAUTHORIZED") {
        router.push("/sales/login");
        return;
      }
      setError("לא הצלחנו לטעון את אינדקס הלקוחות. נסו לרענן.");
    } finally {
      setIsLoading(false);
    }
  }, [mine, offset, router, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const firstVisible = count === 0 ? 0 : offset + 1;
  const lastVisible = Math.min(offset + PAGE_SIZE, count);
  const hasPrevious = offset > 0;
  const hasNext = offset + PAGE_SIZE < count;

  return (
    <main dir="rtl" className="min-h-dvh bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)))] text-right text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 px-3 py-2.5 shadow-sm shadow-slate-900/5 backdrop-blur sm:px-6 sm:py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <GestelitLogo size="sm" className="rounded-xl" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">אינדקס לקוחות</h1>
              <p className="truncate text-xs text-muted-foreground">{user?.full_name ?? "מכירות"}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push("/sales")} className="h-10 gap-2 rounded-xl px-3">
            <ArrowRight className="h-4 w-4" />
            <span className="hidden sm:inline">חזרה ליומן</span>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-4 p-3 pb-8 sm:p-6">
        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">לקוחות</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLoading ? "טוען..." : `${count.toLocaleString("he-IL")} לקוחות נמצאו`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => setIsNewClientOpen(true)} className="h-12 gap-2 rounded-xl sm:h-auto">
              <UserPlus className="h-4 w-4" />
              לקוח חדש
            </Button>
            <div className="flex rounded-xl border border-border bg-card p-1 shadow-sm">
            <button
              type="button"
              onClick={() => { setMine(false); setOffset(0); }}
              className={cn("flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition sm:flex-none", !mine ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
            >
              <UsersRound className="h-4 w-4" />
              כל הלקוחות
            </button>
            <button
              type="button"
              onClick={() => { setMine(true); setOffset(0); }}
              className={cn("flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition sm:flex-none", mine ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
            >
              <UserRound className="h-4 w-4" />
              הלקוחות שלי
            </button>
            </div>
          </div>
        </section>

        <Card className="rounded-2xl border-border/80 bg-card p-3 shadow-sm sm:p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="חיפוש לפי שם, קוד לקוח, קבוצה או נציג"
              className="h-12 rounded-xl pr-12 text-base"
              autoFocus
            />
          </div>
        </Card>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Card key={index} className="h-44 animate-pulse rounded-2xl border-border/60 bg-card" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Card className="rounded-2xl border-dashed p-10 text-center">
            <UsersRound className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <h3 className="mt-3 font-semibold">לא נמצאו לקוחות</h3>
            <p className="mt-1 text-sm text-muted-foreground">נסו שם, קוד או נציג אחר.</p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((client) => (
              <Card key={client.client_ref} className="min-w-0 rounded-2xl border-border/80 bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-lg font-semibold leading-6">{client.customer_name}</h3>
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Hash className="h-3.5 w-3.5" />
                      {client.customer_code ? <bdi dir="ltr">{client.customer_code}</bdi> : <span>טרם הוקצה קוד BINA</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0", client.source === "local_pending" ? "border-amber-200 bg-amber-50 text-amber-700" : statusTone(client.status))}>
                    {client.source === "local_pending" ? "ממתין ל-BINA" : client.status || "ללא סיווג"}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-2 border-t border-border/70 pt-3 text-sm">
                  <ClientMeta icon={Building2} label="קבוצה" value={client.customer_group} />
                  <ClientMeta icon={UserRound} label="נציג" value={client.salesperson} />
                  {client.contact_person ? <ClientMeta icon={UserRound} label="איש קשר" value={client.contact_person} /> : null}
                  <ClientMeta icon={CalendarDays} label="נפתח" value={formatDate(client.opened_at)} />
                </div>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && count > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <Button
              variant="ghost"
              size="icon"
              disabled={!hasPrevious}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
              aria-label="עמוד קודם"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <span className="text-sm text-muted-foreground">
              <bdi dir="ltr">{firstVisible}-{lastVisible}</bdi> מתוך <bdi dir="ltr">{count}</bdi>
            </span>
            <Button
              variant="ghost"
              size="icon"
              disabled={!hasNext}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
              aria-label="עמוד הבא"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>
        ) : null}
      </div>
      <NewClientDialog
        open={isNewClientOpen}
        onOpenChange={setIsNewClientOpen}
        initialName={searchInput}
        onCreated={(client: PendingBinaClient) => {
          setSearchInput(client.customer_name);
          setSearch(client.customer_name);
          setOffset(0);
          void load();
        }}
      />
    </main>
  );
}

function ClientMeta({ icon: Icon, label, value }: {
  icon: typeof Building2;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value || "לא צוין"}</span>
    </div>
  );
}
