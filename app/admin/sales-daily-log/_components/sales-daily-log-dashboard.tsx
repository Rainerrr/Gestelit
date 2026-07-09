"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Handshake,
  Mic,
  MicOff,
  PhoneCall,
  RefreshCcw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createSalesActivityApi,
  fetchSalesActivitiesApi,
  fetchSalesClientsApi,
  fetchSalesSummaryApi,
  summarizeSalesNoteApi,
  updateSalesActivityApi,
} from "@/lib/api/sales-daily-log";
import type { SalesActivityInput, SalesActivityLog, SalesClientActivity, SalesSummary } from "@/lib/data/sales-log";
import type { SalesEventType, SalesStatus } from "@/lib/data/sales-log-utils";
import { cn } from "@/lib/utils";

type SalesAiSummary = {
  summary: string;
  customerIntent: string;
  revenueSignal: number | null;
  nextAction: string | null;
  nextActionDate: string | null;
  riskOrObjection: string | null;
  productsDiscussed: string[];
  suggestedStatus: SalesStatus;
  confidence: "low" | "medium" | "high";
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
};

const eventOptions: Array<{ id: SalesEventType; label: string; icon: LucideIcon }> = [
  { id: "meeting", label: "פגישה", icon: Handshake },
  { id: "call", label: "שיחה", icon: PhoneCall },
  { id: "lead", label: "ליד", icon: Target },
  { id: "sale", label: "מכירה", icon: WalletCards },
  { id: "follow_up", label: "פולואפ", icon: Clock3 },
];

const statusLabels: Record<SalesStatus, string> = {
  new: "חדש",
  open: "פתוח",
  follow_up: "להמשך טיפול",
  won: "נסגר",
  lost: "אבד",
  done: "בוצע",
};

function formatMoney(value: unknown, currency = "ILS") {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: currency || "ILS",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
}

function formatDateInput(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function valueLabel(value: unknown) {
  if (typeof value !== "string") return "-";
  return statusLabels[value as SalesStatus] ?? value;
}

function errorLabel(code: string) {
  const labels: Record<string, string> = {
    INVALID_EVENT_TYPE: "סוג הפעילות לא תקין",
    SALESPERSON_REQUIRED: "צריך למלא איש מכירות",
    CUSTOMER_REQUIRED: "צריך למלא לקוח",
    NOTE_REQUIRED: "צריך לכתוב או להקליט תיאור פעילות",
    INVALID_ESTIMATED_REVENUE: "הכנסה מוערכת לא יכולה להיות שלילית",
    INVALID_ACTUAL_REVENUE: "הכנסה בפועל לא יכולה להיות שלילית",
    INVALID_STATUS: "סטטוס לא תקין",
    RATE_LIMITED: "יותר מדי בקשות AI כרגע. נסה שוב עוד דקה.",
  };
  return labels[code] ?? code;
}

function todayIsoDate() {
  return formatDateInput().slice(0, 10);
}

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function SalesDailyLogDashboard() {
  const { hasAccess } = useAdminGuard();
  const [activities, setActivities] = useState<SalesActivityLog[]>([]);
  const [followUps, setFollowUps] = useState<SalesActivityLog[]>([]);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [clients, setClients] = useState<SalesClientActivity[]>([]);
  const [search, setSearch] = useState("");
  const [salespersonFilter, setSalespersonFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<SalesAiSummary | null>(null);
  const [selectedClient, setSelectedClient] = useState<SalesClientActivity | null>(null);
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  const [form, setForm] = useState<SalesActivityInput>({
    event_type: "call",
    event_at: formatDateInput(),
    salesperson: "",
    customer_name: "",
    customer_code: null,
    contact_person: "",
    raw_note: "",
    estimated_revenue: null,
    actual_revenue: null,
    currency: "ILS",
    status: "open",
    source: "manual",
  });
  const isFormReady = Boolean(
    form.event_type
    && form.salesperson?.trim()
    && form.customer_name?.trim()
    && form.raw_note?.trim(),
  );

  const loadData = useCallback(async () => {
    if (hasAccess !== true) return;
    setIsLoading(true);
    setError(null);
    try {
      const range = todayRange();
      const [activityResult, followUpResult, summaryResult, clientResult] = await Promise.all([
        fetchSalesActivitiesApi({ search, salesperson: salespersonFilter, dateFrom: range.start, dateTo: range.end, limit: 100 }) as Promise<{ rows: SalesActivityLog[] }>,
        fetchSalesActivitiesApi({ status: "follow_up", nextActionTo: todayIsoDate(), limit: 30 }) as Promise<{ rows: SalesActivityLog[] }>,
        fetchSalesSummaryApi() as Promise<SalesSummary>,
        fetchSalesClientsApi({ limit: 8 }) as Promise<{ rows: SalesClientActivity[] }>,
      ]);
      setActivities(activityResult.rows);
      setFollowUps(followUpResult.rows);
      setSummary(summaryResult);
      setClients(clientResult.rows);
    } catch (loadError) {
      setError(errorLabel(loadError instanceof Error ? loadError.message : "SALES_LOAD_FAILED"));
    } finally {
      setIsLoading(false);
    }
  }, [hasAccess, salespersonFilter, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (hasAccess !== true) return;
    const timeout = window.setTimeout(async () => {
      setIsLoadingClients(true);
      try {
        const result = await fetchSalesClientsApi({ search: form.customer_name, limit: 8 }) as { rows: SalesClientActivity[] };
        setClients(result.rows);
      } catch {
        // Suggestions are non-critical; the full dashboard error state should not flicker while typing.
      } finally {
        setIsLoadingClients(false);
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [form.customer_name, hasAccess]);

  const visibleClients = useMemo(() => {
    if (!form.customer_name.trim()) return clients;
    const needle = form.customer_name.trim().toLowerCase();
    return clients.filter((client) => client.customer_name?.toLowerCase().includes(needle)).slice(0, 6);
  }, [clients, form.customer_name]);

  const applyClient = (client: SalesClientActivity) => {
    setSelectedClient(client);
    setForm((current) => ({
      ...current,
      customer_name: client.customer_name,
      customer_code: client.customer_code,
      salesperson: current.salesperson || client.salesperson || "",
    }));
  };

  const summarizeNote = async () => {
    if (!form.raw_note?.trim()) {
      setError("צריך לכתוב או להקליט תוכן לפני סיכום AI");
      return;
    }
    setIsSummarizing(true);
    setError(null);
    try {
      const result = await summarizeSalesNoteApi({
        rawNote: form.raw_note,
        eventType: form.event_type,
        customerName: form.customer_name,
        salesperson: form.salesperson,
      }) as SalesAiSummary;
      setAiSummary(result);
      setForm((current) => ({
        ...current,
        ai_summary: result.summary,
        ai_next_action: result.nextAction ?? "",
        next_action_date: result.nextActionDate ?? "",
        estimated_revenue: result.revenueSignal ?? current.estimated_revenue ?? null,
        status: result.suggestedStatus,
        ai_confidence: result.confidence,
        source: current.source === "voice" ? "voice" : "ai_assisted",
        metadata: {
          customerIntent: result.customerIntent,
          riskOrObjection: result.riskOrObjection,
          productsDiscussed: result.productsDiscussed,
        },
      }));
    } catch (summarizeError) {
      setError(errorLabel(summarizeError instanceof Error ? summarizeError.message : "SALES_SUMMARY_FAILED"));
    } finally {
      setIsSummarizing(false);
    }
  };

  const toggleSpeech = () => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setError("הדפדפן הזה לא תומך בזיהוי דיבור מובנה. אפשר להקליד ידנית.");
      return;
    }

    if (isListening) {
      speechRef.current?.stop();
      speechRef.current = null;
      setIsListening(false);
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "he-IL";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .filter((result) => result.isFinal !== false)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        setForm((current) => ({
          ...current,
          raw_note: `${current.raw_note ? `${current.raw_note}\n` : ""}${transcript}`,
          source: "voice",
        }));
      }
    };
    recognition.onend = () => {
      speechRef.current = null;
      setIsListening(false);
    };
    recognition.onerror = () => {
      speechRef.current = null;
      setIsListening(false);
      setError("לא הצלחתי לקלוט דיבור. אפשר להמשיך בכתיבה.");
    };
    speechRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const saveActivity = async () => {
    if (!isFormReady) {
      setError("צריך למלא איש מכירות, לקוח ותיאור פעילות לפני שמירה");
      return;
    }
    setIsSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      await createSalesActivityApi(form);
      setSavedMessage("האירוע נשמר ביומן המכירות");
      setAiSummary(null);
      setSelectedClient(null);
      setForm({
        event_type: "call",
        event_at: formatDateInput(),
        salesperson: form.salesperson,
        customer_name: "",
        customer_code: null,
        contact_person: "",
        raw_note: "",
        estimated_revenue: null,
        actual_revenue: null,
        currency: "ILS",
        status: "open",
        source: "manual",
      });
      await loadData();
    } catch (saveError) {
      setError(errorLabel(saveError instanceof Error ? saveError.message : "SALES_SAVE_FAILED"));
    } finally {
      setIsSaving(false);
    }
  };

  const markStatus = async (activity: SalesActivityLog, status: SalesStatus) => {
    try {
      await updateSalesActivityApi(activity.id, { status });
      await loadData();
    } catch (updateError) {
      setError(errorLabel(updateError instanceof Error ? updateError.message : "SALES_UPDATE_FAILED"));
    }
  };

  if (hasAccess === null) {
    return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">טוען הרשאות...</div>;
  }

  if (hasAccess === false) return null;

  return (
    <AdminLayout
      aiContext={{
        screen: "sales-daily-log",
        search,
        visibleSummary: `יומן מכירות: ${summary?.todayCount ?? 0} אירועים היום, ${summary?.openFollowUps ?? 0} פולואפים פתוחים`,
      }}
      header={
        <AdminPageHeader
          icon={Handshake}
          title="יומן מכירות"
          statusElement={<Badge variant="outline" className="hidden sm:inline-flex">שכבת פעילות מעל נתוני BINA</Badge>}
          actions={
            <Button variant="outline" size="sm" onClick={() => void loadData()} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              רענון
            </Button>
          }
        />
      }
    >
      <div className="space-y-4 sm:space-y-5">
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-5">
          <Kpi label="אירועים היום" value={summary?.todayCount ?? 0} icon={CalendarClock} />
          <Kpi label="אירועים השבוע" value={summary?.weekCount ?? 0} icon={BarChart3} />
          <Kpi label="פולואפים פתוחים" value={summary?.openFollowUps ?? 0} icon={Clock3} tone={(summary?.overdueFollowUps ?? 0) > 0 ? "red" : "amber"} />
          <Kpi label="פייפליין מוערך" value={formatMoney(summary?.estimatedPipeline ?? 0)} icon={TrendingUp} />
          <Kpi label="מכירות BINA החודש" value={formatMoney(summary?.binaMonthRevenue ?? 0)} icon={WalletCards} />
        </div>

        {error && (
          <Card className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </Card>
        )}
        {savedMessage && (
          <Card className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            {savedMessage}
          </Card>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)] xl:gap-5">
          <Card className="rounded-xl border border-border bg-card/70 p-3 sm:p-4">
            <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
              <div>
                <h2 className="text-base font-semibold sm:text-lg">רישום פעילות מהיר</h2>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">הקלדה או דיבור, ואז סיכום עסקי נקי לפני שמירה.</p>
              </div>
              <Badge className="bg-primary/10 text-primary">יומי</Badge>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              {eventOptions.map((option) => {
                const Icon = option.icon;
                const active = form.event_type === option.id;
                return (
                  <Button
                    key={option.id}
                    type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  onClick={() => setForm((current) => ({ ...current, event_type: option.id }))}
                  className="h-10 gap-1.5 px-2 text-xs sm:h-9 sm:gap-2 sm:px-3 sm:text-sm"
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                  </Button>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              <Field label="איש מכירות">
                <Input value={form.salesperson} onChange={(event) => setForm((current) => ({ ...current, salesperson: event.target.value }))} placeholder="שם איש המכירות" />
              </Field>
              <Field label="תאריך ושעה">
                <Input dir="ltr" type="datetime-local" value={String(form.event_at ?? "")} onChange={(event) => setForm((current) => ({ ...current, event_at: event.target.value }))} />
              </Field>
              <Field label="לקוח">
                <Input value={form.customer_name} onChange={(event) => {
                  setSelectedClient(null);
                  setForm((current) => ({ ...current, customer_name: event.target.value, customer_code: null }));
                }} placeholder="שם לקוח או בחירה מהצעות BINA" />
              </Field>
              <Field label="איש קשר">
                <Input value={String(form.contact_person ?? "")} onChange={(event) => setForm((current) => ({ ...current, contact_person: event.target.value }))} placeholder="אופציונלי" />
              </Field>
            </div>

            {visibleClients.length > 0 && (
              <div className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
                {visibleClients.map((client) => (
                  <button
                    key={`${client.customer_code ?? "manual"}-${client.customer_name}`}
                    type="button"
                    onClick={() => applyClient(client)}
                    className={cn(
                      "w-48 shrink-0 snap-start rounded-lg border px-3 py-2 text-right text-xs transition-colors sm:w-auto sm:max-w-64",
                      selectedClient?.customer_name === client.customer_name
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <div className="truncate font-medium">{client.customer_name}</div>
                    <div className="truncate">{formatMoney(client.invoice_revenue)} ב-BINA</div>
                  </button>
                ))}
              </div>
            )}
            {isLoadingClients && (
              <div className="mt-2 text-xs text-muted-foreground">מחפש לקוחות...</div>
            )}

            <div className="mt-4">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label>תיאור חופשי</Label>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button type="button" variant="outline" size="sm" onClick={toggleSpeech} className="gap-2">
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {isListening ? "עצור" : "דיבור"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void summarizeNote()} disabled={isSummarizing || !form.raw_note?.trim()} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    {isSummarizing ? "מסכם..." : "סיכום AI"}
                  </Button>
                </div>
              </div>
              <Textarea
                value={form.raw_note}
                onChange={(event) => setForm((current) => ({ ...current, raw_note: event.target.value }))}
                placeholder="לדוגמה: דיברתי עם הלקוח על חידוש הזמנה, ביקש הצעת מחיר עד מחר, רגיש למחיר אבל צריך אספקה מהירה..."
                className="min-h-28 sm:min-h-36"
              />
            </div>

            {aiSummary && (
              <Card className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3 sm:p-4">
                <div className="mb-2 flex items-center gap-2 text-primary">
                  <Sparkles className="h-4 w-4" />
                  <span className="font-semibold">סיכום עסקי מוצע</span>
                </div>
                <p className="text-sm leading-6">{aiSummary.summary}</p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div><span className="text-muted-foreground">כוונת לקוח: </span>{aiSummary.customerIntent}</div>
                  <div><span className="text-muted-foreground">פעולה הבאה: </span>{aiSummary.nextAction ?? "-"}</div>
                  <div><span className="text-muted-foreground">סיכון/התנגדות: </span>{aiSummary.riskOrObjection ?? "-"}</div>
                  <div><span className="text-muted-foreground">אמינות: </span>{aiSummary.confidence}</div>
                </div>
              </Card>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              <Field label="הכנסה מוערכת">
                <Input dir="ltr" type="number" min="0" value={String(form.estimated_revenue ?? "")} onChange={(event) => setForm((current) => ({ ...current, estimated_revenue: event.target.value }))} placeholder="₪" />
              </Field>
              <Field label="הכנסה בפועל">
                <Input dir="ltr" type="number" min="0" value={String(form.actual_revenue ?? "")} onChange={(event) => setForm((current) => ({ ...current, actual_revenue: event.target.value }))} placeholder="רק אם נסגר" />
              </Field>
              <Field label="תאריך פעולה הבאה" className="col-span-2 sm:col-span-1">
                <Input dir="ltr" type="date" value={String(form.next_action_date ?? "")} onChange={(event) => setForm((current) => ({ ...current, next_action_date: event.target.value }))} />
              </Field>
            </div>

            <div className="mt-4">
              <Label>סיכום / פעולה הבאה</Label>
              <Input
                value={String(form.ai_next_action ?? "")}
                onChange={(event) => setForm((current) => ({ ...current, ai_next_action: event.target.value }))}
                placeholder="מה עושים עכשיו?"
                className="mt-2"
              />
            </div>

            <div className="mt-5 flex justify-end">
              <Button onClick={() => void saveActivity()} disabled={isSaving || !isFormReady} className="w-full sm:w-auto sm:min-w-40">
                {isSaving ? "שומר..." : "שמור ביומן"}
              </Button>
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="rounded-xl border border-border bg-card/70 p-3 sm:p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">יומן היום</h2>
                  <p className="text-sm text-muted-foreground">פעילויות שנרשמו היום לפי זמן אירוע.</p>
                </div>
                <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[160px_210px]">
                  <Input
                    value={salespersonFilter}
                    onChange={(event) => setSalespersonFilter(event.target.value)}
                    placeholder="איש מכירות"
                  />
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="לקוח / תוכן" className="pr-9" />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {isLoading ? (
                  <div className="rounded-lg bg-secondary/40 p-4 text-center text-sm text-muted-foreground">טוען...</div>
                ) : activities.length === 0 ? (
                  <div className="rounded-lg bg-secondary/40 p-4 text-center text-sm text-muted-foreground">אין אירועים היום עדיין</div>
                ) : activities.map((activity) => (
                  <div key={activity.id} className="rounded-xl border border-border bg-background/60 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{eventOptions.find((option) => option.id === activity.event_type)?.label ?? activity.event_type}</Badge>
                          <Badge variant="outline">{valueLabel(activity.status)}</Badge>
                          {activity.sales_user_id ? <Badge className="bg-primary/10 text-primary">פורטל מכירות</Badge> : null}
                        </div>
                        <h3 className="mt-2 truncate font-semibold">{activity.customer_name}</h3>
                        <p className="text-xs text-muted-foreground">{activity.salesperson} · {formatDateTime(activity.event_at)}</p>
                      </div>
                      <div className="text-left text-sm font-semibold sm:shrink-0">
                        {formatMoney(activity.estimated_revenue ?? activity.actual_revenue ?? 0, activity.currency)}
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                      {activity.ai_summary || activity.raw_note}
                    </p>
                    {activity.ai_next_action && (
                      <div className="mt-3 rounded-lg bg-secondary/45 p-2 text-sm">
                        <span className="font-medium">המשך: </span>{activity.ai_next_action}
                        {activity.next_action_date ? <span className="text-muted-foreground"> · {activity.next_action_date}</span> : null}
                      </div>
                    )}
                    {activity.attachments && activity.attachments.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {activity.attachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            href={attachment.public_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            {attachment.file_name}
                          </a>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                      {activity.status !== "follow_up" && (
                        <Button variant="outline" size="sm" onClick={() => void markStatus(activity, "follow_up")} className="w-full sm:w-auto">להמשך טיפול</Button>
                      )}
                      {activity.status !== "won" && (
                        <Button variant="outline" size="sm" onClick={() => void markStatus(activity, "won")} className="w-full sm:w-auto">זכייה</Button>
                      )}
                      {activity.status !== "lost" && (
                        <Button variant="outline" size="sm" onClick={() => void markStatus(activity, "lost")} className="w-full sm:w-auto">אבד</Button>
                      )}
                      {activity.status !== "done" && (
                        <Button variant="outline" size="sm" onClick={() => void markStatus(activity, "done")} className="w-full sm:w-auto">פעילות בוצעה</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">לטיפול היום / באיחור</h2>
                  <p className="text-sm text-muted-foreground">פולואפים פתוחים שהגיע תאריך הטיפול שלהם.</p>
                </div>
                <Badge variant="outline">{followUps.length}</Badge>
              </div>
              <div className="space-y-3">
                {followUps.length === 0 ? (
                  <div className="rounded-lg bg-secondary/40 p-4 text-center text-sm text-muted-foreground">אין פולואפים באיחור כרגע</div>
                ) : followUps.map((activity) => (
                  <div key={activity.id} className="rounded-xl border border-border bg-background/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{activity.customer_name}</h3>
                        <p className="text-xs text-muted-foreground">{activity.salesperson} · יעד: {formatDateOnly(activity.next_action_date)}</p>
                      </div>
                      <Badge className="bg-amber-500/10 text-amber-300">פולואפ</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{activity.ai_next_action || activity.ai_summary || activity.raw_note}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                      <Button variant="outline" size="sm" onClick={() => void markStatus(activity, "done")} className="w-full sm:w-auto">בוצע</Button>
                      <Button variant="outline" size="sm" onClick={() => void markStatus(activity, "won")} className="w-full sm:w-auto">זכייה</Button>
                      <Button variant="outline" size="sm" onClick={() => void markStatus(activity, "lost")} className="w-full sm:w-auto">אבד</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-xl border border-border bg-card/70 p-3 sm:p-4">
              <h2 className="text-base font-semibold sm:text-lg">לקוחות בולטים מ-BINA</h2>
              <p className="mt-1 text-sm text-muted-foreground">מבוסס על חשבוניות BINA ופעילות ידנית שנרשמה בגסטליט.</p>
              <div className="mt-4 space-y-3">
                {(summary?.topClients ?? []).slice(0, 5).map((client) => (
                  <button
                    key={`${client.customer_code ?? "manual"}-${client.customer_name}`}
                    type="button"
                    onClick={() => applyClient(client)}
                    className="grid w-full gap-2 rounded-xl border border-border bg-background/60 p-3 text-right transition-colors hover:bg-accent sm:grid-cols-[1fr_auto]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{client.customer_name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {client.invoice_count} חשבוניות · פעילות ידנית {client.activity_count}
                      </div>
                    </div>
                    <div className="font-mono text-sm">{formatMoney(client.invoice_revenue)}</div>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "blue" | "amber" | "red";
}) {
  const toneClass = {
    blue: "text-primary bg-primary/10",
    amber: "text-amber-400 bg-amber-500/10",
    red: "text-red-400 bg-red-500/10",
  }[tone];
  return (
    <Card className="min-w-36 snap-start rounded-xl border border-border bg-card/70 p-3 sm:min-w-0 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2 sm:mb-3 sm:gap-3">
        <span className="text-xs text-muted-foreground sm:text-sm">{label}</span>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9", toneClass)}>
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </span>
      </div>
      <div className="break-words text-lg font-semibold sm:text-2xl">{value}</div>
    </Card>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5 sm:space-y-2", className)}>
      <Label className="text-xs sm:text-sm">{label}</Label>
      {children}
    </div>
  );
}
