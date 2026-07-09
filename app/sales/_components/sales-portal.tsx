"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileUp,
  Handshake,
  LogOut,
  Mic,
  MicOff,
  Paperclip,
  PhoneCall,
  RefreshCcw,
  Search,
  Sparkles,
  Target,
  Trash2,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createSalesPortalActivityApi,
  fetchSalesPortalActivitiesApi,
  fetchSalesPortalClientsApi,
  fetchSalesPortalSessionApi,
  logoutSalesPortalApi,
  summarizeSalesPortalNoteApi,
  updateSalesPortalActivityApi,
} from "@/lib/api/sales-portal";
import type { SalesActivityInput, SalesActivityLog, SalesClientActivity } from "@/lib/data/sales-log";
import type { SalesEventType, SalesStatus } from "@/lib/data/sales-log-utils";
import { cn } from "@/lib/utils";

type SalesPortalUser = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
};

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

type OwnClient = {
  customer_code: number | null;
  customer_name: string;
  contact_person: string | null;
  activity_count: number;
  estimated_pipeline: number;
  actual_revenue: number;
  last_activity_at: string | null;
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

function formatDateInput(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

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
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function errorLabel(code: string) {
  const labels: Record<string, string> = {
    INVALID_EVENT_TYPE: "סוג הפעילות לא תקין",
    CUSTOMER_REQUIRED: "צריך למלא לקוח",
    NOTE_REQUIRED: "צריך לכתוב או להקליט תיאור פעילות",
    INVALID_ESTIMATED_REVENUE: "הכנסה מוערכת לא יכולה להיות שלילית",
    INVALID_ACTUAL_REVENUE: "הכנסה בפועל לא יכולה להיות שלילית",
    INVALID_FILE_TYPE: "אפשר לצרף תמונות, PDF או קבצי אופיס בלבד",
    FILE_TOO_LARGE: "קובץ אחד גדול מדי. המגבלה היא 10MB",
    RATE_LIMITED: "יותר מדי בקשות AI כרגע. נסו שוב בעוד דקה.",
    SALES_UNAUTHORIZED: "צריך להתחבר מחדש",
  };
  return labels[code] ?? code;
}

export function SalesPortal() {
  const router = useRouter();
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  const [user, setUser] = useState<SalesPortalUser | null>(null);
  const [activities, setActivities] = useState<SalesActivityLog[]>([]);
  const [ownClients, setOwnClients] = useState<OwnClient[]>([]);
  const [suggestedClients, setSuggestedClients] = useState<SalesClientActivity[]>([]);
  const [summary, setSummary] = useState({
    todayCount: 0,
    weekCount: 0,
    openFollowUps: 0,
    overdueFollowUps: 0,
    estimatedPipeline: 0,
    actualRevenue: 0,
  });
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [aiSummary, setAiSummary] = useState<SalesAiSummary | null>(null);
  const [form, setForm] = useState<Omit<SalesActivityInput, "salesperson">>({
    event_type: "meeting",
    event_at: formatDateInput(),
    customer_name: "",
    customer_code: null,
    contact_person: "",
    raw_note: "",
    ai_summary: "",
    ai_next_action: "",
    next_action_date: "",
    estimated_revenue: null,
    actual_revenue: null,
    currency: "ILS",
    status: "open",
    source: "manual",
  });

  const isFormReady = Boolean(form.event_type && form.customer_name?.trim() && form.raw_note?.trim());

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [sessionResult, activityResult, clientsResult] = await Promise.all([
        fetchSalesPortalSessionApi() as Promise<{ user: SalesPortalUser }>,
        fetchSalesPortalActivitiesApi({ search, limit: 50 }) as Promise<{
          rows: SalesActivityLog[];
          summary: typeof summary;
        }>,
        fetchSalesPortalClientsApi({ search: form.customer_name, limit: 12 }) as Promise<{
          ownClients: OwnClient[];
          suggestedClients: SalesClientActivity[];
        }>,
      ]);
      setUser(sessionResult.user);
      setActivities(activityResult.rows);
      setSummary(activityResult.summary);
      setOwnClients(clientsResult.ownClients);
      setSuggestedClients(clientsResult.suggestedClients);
    } catch {
      router.push("/sales/login");
    } finally {
      setIsLoading(false);
    }
  }, [form.customer_name, router, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const clientSuggestions = useMemo(() => {
    const manual = ownClients.map((client) => ({ ...client, source: "own" as const }));
    const suggested = suggestedClients.map((client) => ({
      customer_code: client.customer_code,
      customer_name: client.customer_name,
      contact_person: null,
      activity_count: client.activity_count,
      estimated_pipeline: client.estimated_pipeline,
      actual_revenue: client.invoice_revenue,
      last_activity_at: client.last_activity_at ?? client.last_invoice_at,
      source: "bina" as const,
    }));
    const seen = new Set<string>();
    return [...manual, ...suggested].filter((client) => {
      const key = `${client.customer_code ?? ""}:${client.customer_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }, [ownClients, suggestedClients]);

  const selectClient = (client: (typeof clientSuggestions)[number]) => {
    setForm((current) => ({
      ...current,
      customer_name: client.customer_name,
      customer_code: client.customer_code,
      contact_person: client.contact_person ?? current.contact_person,
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
      const result = await summarizeSalesPortalNoteApi({
        rawNote: form.raw_note,
        eventType: form.event_type,
        customerName: form.customer_name,
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
      setError("צריך למלא לקוח ותיאור פעילות לפני שמירה");
      return;
    }
    setIsSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      await createSalesPortalActivityApi(form, files);
      setSavedMessage("הדיווח נשמר ונשלח לדשבורד המנהלים");
      setAiSummary(null);
      setFiles([]);
      setForm({
        event_type: "meeting",
        event_at: formatDateInput(),
        customer_name: "",
        customer_code: null,
        contact_person: "",
        raw_note: "",
        ai_summary: "",
        ai_next_action: "",
        next_action_date: "",
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
      await updateSalesPortalActivityApi(activity.id, { status });
      await loadData();
    } catch (updateError) {
      setError(errorLabel(updateError instanceof Error ? updateError.message : "SALES_UPDATE_FAILED"));
    }
  };

  const logout = async () => {
    await logoutSalesPortalApi().catch(() => null);
    router.push("/sales/login");
  };

  if (isLoading) {
    return <main className="flex min-h-dvh items-center justify-center text-muted-foreground">טוען יומן מכירות...</main>;
  }

  return (
    <main dir="rtl" className="min-h-dvh bg-background text-right text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <GestelitLogo size="sm" className="rounded-xl" />
            <div>
              <div className="text-base font-semibold">יומן מכירות</div>
              <div className="text-xs text-muted-foreground">{user?.full_name}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadData()} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              רענון
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void logout()} className="gap-2">
              <LogOut className="h-4 w-4" />
              יציאה
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-4 p-4 sm:space-y-5 sm:p-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Kpi label="דיווחים היום" value={summary.todayCount} icon={CalendarClock} />
          <Kpi label="דיווחים השבוע" value={summary.weekCount} icon={BarChart3} />
          <Kpi label="פולואפים פתוחים" value={summary.openFollowUps} icon={Clock3} tone={summary.overdueFollowUps > 0 ? "red" : "amber"} />
          <Kpi label="פייפליין שלי" value={formatMoney(summary.estimatedPipeline)} icon={Target} />
          <Kpi label="מכירות שנסגרו" value={formatMoney(summary.actualRevenue)} icon={WalletCards} />
        </section>

        {error && <Notice tone="red">{error}</Notice>}
        {savedMessage && <Notice tone="green">{savedMessage}</Notice>}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <Card className="rounded-2xl border border-border bg-card/75 p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold">דיווח פעילות חדש</h1>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  רשמו מה קרה מול הלקוח. אפשר לצרף תמונה או מסמך, ולתת ל-AI לנסח סיכום עסקי.
                </p>
              </div>
              <Badge className="w-fit bg-primary/10 text-primary">נשלח למנהל</Badge>
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
                    className="h-10 gap-1.5 px-2 text-xs sm:px-3 sm:text-sm"
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </Button>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="לקוח">
                <Input value={form.customer_name} onChange={(event) => setForm((current) => ({ ...current, customer_name: event.target.value, customer_code: null }))} placeholder="שם לקוח" />
              </Field>
              <Field label="איש קשר">
                <Input value={String(form.contact_person ?? "")} onChange={(event) => setForm((current) => ({ ...current, contact_person: event.target.value }))} placeholder="אופציונלי" />
              </Field>
              <Field label="תאריך ושעה">
                <Input dir="ltr" type="datetime-local" value={String(form.event_at ?? "")} onChange={(event) => setForm((current) => ({ ...current, event_at: event.target.value }))} />
              </Field>
              <Field label="תאריך פעולה הבאה">
                <Input dir="ltr" type="date" value={String(form.next_action_date ?? "")} onChange={(event) => setForm((current) => ({ ...current, next_action_date: event.target.value, status: event.target.value ? "follow_up" : current.status }))} />
              </Field>
            </div>

            {clientSuggestions.length > 0 && (
              <div className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
                {clientSuggestions.map((client) => (
                  <button
                    key={`${client.source}-${client.customer_code ?? "manual"}-${client.customer_name}`}
                    type="button"
                    onClick={() => selectClient(client)}
                    className="w-56 shrink-0 snap-start rounded-xl border border-border bg-secondary/40 p-3 text-right text-sm transition hover:bg-accent"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{client.customer_name}</span>
                      <Badge variant="outline">{client.source === "own" ? "שלי" : "BINA"}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {client.activity_count} פעילויות · {formatMoney(client.estimated_pipeline || client.actual_revenue)}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label>מה קרה מול הלקוח?</Label>
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
                placeholder="לדוגמה: נפגשתי עם הלקוח, דיברנו על הזמנה חוזרת, ביקש הצעת מחיר עד ראשון..."
                className="min-h-36"
              />
            </div>

            {aiSummary && (
              <Card className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-primary">
                  <Sparkles className="h-4 w-4" />
                  <span className="font-semibold">סיכום עסקי מוצע</span>
                </div>
                <p className="text-sm leading-6">{aiSummary.summary}</p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div><span className="text-muted-foreground">כוונה: </span>{aiSummary.customerIntent}</div>
                  <div><span className="text-muted-foreground">פעולה: </span>{aiSummary.nextAction ?? "-"}</div>
                  <div><span className="text-muted-foreground">התנגדות: </span>{aiSummary.riskOrObjection ?? "-"}</div>
                  <div><span className="text-muted-foreground">אמינות: </span>{aiSummary.confidence}</div>
                </div>
              </Card>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="סכום מוערך">
                <Input dir="ltr" type="number" min="0" value={String(form.estimated_revenue ?? "")} onChange={(event) => setForm((current) => ({ ...current, estimated_revenue: event.target.value }))} placeholder="₪" />
              </Field>
              <Field label="סכום בפועל">
                <Input dir="ltr" type="number" min="0" value={String(form.actual_revenue ?? "")} onChange={(event) => setForm((current) => ({ ...current, actual_revenue: event.target.value, status: event.target.value ? "won" : current.status }))} placeholder="אם נסגר" />
              </Field>
              <Field label="סטטוס" className="col-span-2 sm:col-span-1">
                <select
                  value={String(form.status ?? "open")}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as SalesStatus }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
            </div>

            <div className="mt-4">
              <Label>פעולה הבאה / הערה למנהל</Label>
              <Input value={String(form.ai_next_action ?? "")} onChange={(event) => setForm((current) => ({ ...current, ai_next_action: event.target.value }))} placeholder="מה צריך לעשות עכשיו?" className="mt-2" />
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-border bg-secondary/25 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    <Paperclip className="h-4 w-4" />
                    קבצים ותמונות
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">עד 5 קבצים, 10MB לכל קובץ.</p>
                </div>
                <Label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
                  <FileUp className="h-4 w-4" />
                  צרף קבצים
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.docx,.xlsx"
                    className="hidden"
                    onChange={(event) => {
                      const selected = Array.from(event.target.files ?? []).slice(0, 5);
                      setFiles(selected);
                    }}
                  />
                </Label>
              </div>
              {files.length > 0 && (
                <div className="mt-3 grid gap-2">
                  {files.map((file) => (
                    <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-3 py-2 text-sm">
                      <span className="truncate">{file.name}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setFiles((current) => current.filter((item) => item !== file))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <Button onClick={() => void saveActivity()} disabled={isSaving || !isFormReady} className="h-12 w-full rounded-xl sm:w-auto sm:min-w-44">
                {isSaving ? "שומר..." : "שמור ושלח למנהל"}
              </Button>
            </div>
          </Card>

          <aside className="space-y-4">
            <Card className="rounded-2xl border border-border bg-card/75 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">ההיסטוריה שלי</h2>
                  <p className="text-sm text-muted-foreground">דיווחים אחרונים וסטטוסים.</p>
                </div>
                <div className="relative w-36 sm:w-48">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש" className="pr-9" />
                </div>
              </div>
              <div className="space-y-3">
                {activities.length === 0 ? (
                  <div className="rounded-xl bg-secondary/40 p-4 text-center text-sm text-muted-foreground">אין דיווחים עדיין</div>
                ) : activities.map((activity) => (
                  <ActivityCard key={activity.id} activity={activity} onMark={markStatus} />
                ))}
              </div>
            </Card>
          </aside>
        </section>
      </div>
    </main>
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
    <Card className="rounded-xl border border-border bg-card/75 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="break-words text-xl font-semibold">{value}</div>
    </Card>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Notice({ tone, children }: { tone: "red" | "green"; children: ReactNode }) {
  return (
    <Card className={cn(
      "flex items-center gap-2 rounded-xl p-3 text-sm",
      tone === "red"
        ? "border-red-500/30 bg-red-500/10 text-red-200"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    )}>
      {tone === "green" ? <CheckCircle2 className="h-4 w-4" /> : null}
      {children}
    </Card>
  );
}

function ActivityCard({
  activity,
  onMark,
}: {
  activity: SalesActivityLog;
  onMark: (activity: SalesActivityLog, status: SalesStatus) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{eventOptions.find((option) => option.id === activity.event_type)?.label ?? activity.event_type}</Badge>
            <Badge variant="outline">{statusLabels[activity.status]}</Badge>
          </div>
          <h3 className="mt-2 truncate font-semibold">{activity.customer_name}</h3>
          <p className="text-xs text-muted-foreground">{formatDateTime(activity.event_at)}</p>
        </div>
        <div className="shrink-0 text-left text-sm font-semibold">
          {formatMoney(activity.actual_revenue ?? activity.estimated_revenue ?? 0, activity.currency)}
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
        {activity.ai_summary || activity.raw_note}
      </p>
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
              <Paperclip className="h-3 w-3" />
              {attachment.file_name}
            </a>
          ))}
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm" onClick={() => onMark(activity, "follow_up")}>פולואפ</Button>
        <Button variant="outline" size="sm" onClick={() => onMark(activity, "won")}>זכייה</Button>
        <Button variant="outline" size="sm" onClick={() => onMark(activity, "done")}>בוצע</Button>
      </div>
    </div>
  );
}
