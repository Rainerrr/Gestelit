"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
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
  Pencil,
  PhoneCall,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UserPlus,
  UsersRound,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { GestelitLogo } from "@/components/brand/gestelit-logo";
import { AddToCalendarButton } from "@/components/sales/add-to-calendar-button";
import { NewClientDialog } from "@/components/sales/new-client-dialog";
import { ThemeToggle } from "@/components/theme/theme-toggle";
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
import { validateAdminSession } from "@/lib/api/auth-helpers";
import type { SalesActivityInput, SalesActivityLog, SalesClientActivity } from "@/lib/data/sales-log";
import type { PendingBinaClient } from "@/lib/data/bina-client-onboarding";
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
  local_client_id: string | null;
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
  follow_up: "צריך לחזור",
  won: "נסגר",
  lost: "לא נסגר",
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
    INVALID_ESTIMATED_REVENUE: "הסכום המשוער לא יכול להיות שלילי",
    INVALID_ACTUAL_REVENUE: "הסכום שנסגר לא יכול להיות שלילי",
    INVALID_FILE_TYPE: "אפשר לצרף תמונות, PDF או קבצי אופיס בלבד",
    FILE_TOO_LARGE: "קובץ אחד גדול מדי. המגבלה היא 10MB",
    RATE_LIMITED: "ה-AI עמוס כרגע. נסו שוב בעוד דקה.",
    SALES_UNAUTHORIZED: "החיבור הסתיים. היכנסו שוב.",
  };
  return labels[code] ?? code;
}

export function SalesPortal() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  const clientSearchRequestRef = useRef(0);
  const formCardRef = useRef<HTMLDivElement | null>(null);
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
  const [isNewClientOpen, setIsNewClientOpen] = useState(false);
  const [canViewTeamDashboard, setCanViewTeamDashboard] = useState(false);
  const [aiSummary, setAiSummary] = useState<SalesAiSummary | null>(null);
  const [calendarNote, setCalendarNote] = useState("");
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [eventTimeTouched, setEventTimeTouched] = useState(false);
  const [form, setForm] = useState<Omit<SalesActivityInput, "salesperson">>({
    event_type: "meeting",
    event_at: formatDateInput(),
    customer_name: "",
    customer_code: null,
    local_client_id: null,
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
  const isDraftPristine = useMemo(() => (
    !form.customer_name?.trim()
    && !form.contact_person?.trim()
    && !form.raw_note?.trim()
    && !form.ai_summary?.trim()
    && !form.ai_next_action?.trim()
    && !form.next_action_date
    && !Number(form.estimated_revenue ?? 0)
    && !Number(form.actual_revenue ?? 0)
    && !calendarNote.trim()
    && files.length === 0
  ), [calendarNote, files.length, form]);

  useEffect(() => {
    setTheme("light");
  }, [setTheme]);

  useEffect(() => {
    let active = true;
    void validateAdminSession().then((isAdmin) => {
      if (active) setCanViewTeamDashboard(isAdmin);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (editingActivityId || eventTimeTouched || !isDraftPristine) return;

    const refreshDraftTime = () => {
      setForm((current) => ({ ...current, event_at: formatDateInput() }));
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshDraftTime();
    };

    refreshDraftTime();
    const interval = window.setInterval(refreshDraftTime, 60_000);
    window.addEventListener("focus", refreshDraftTime);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshDraftTime);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [editingActivityId, eventTimeTouched, isDraftPristine]);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [sessionResult, activityResult] = await Promise.all([
        fetchSalesPortalSessionApi() as Promise<{ user: SalesPortalUser }>,
        fetchSalesPortalActivitiesApi({ search, limit: 50 }) as Promise<{
          rows: SalesActivityLog[];
          summary: typeof summary;
        }>,
      ]);
      setUser(sessionResult.user);
      setActivities(activityResult.rows);
      setSummary(activityResult.summary);
    } catch {
      router.push("/sales/login");
    } finally {
      setIsLoading(false);
    }
  }, [router, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshClientSuggestions = useCallback(async (
    clientSearch: string,
    requestId = ++clientSearchRequestRef.current,
  ) => {
    const result = await fetchSalesPortalClientsApi({
      search: clientSearch,
      limit: 12,
    }) as {
      ownClients: OwnClient[];
      suggestedClients: SalesClientActivity[];
    };
    if (clientSearchRequestRef.current !== requestId) return;
    setOwnClients(result.ownClients);
    setSuggestedClients(result.suggestedClients);
  }, []);

  useEffect(() => {
    const requestId = ++clientSearchRequestRef.current;
    const timeout = window.setTimeout(async () => {
      try {
        await refreshClientSuggestions(form.customer_name, requestId);
      } catch {
        // Keep the last usable suggestions; the main session loader owns auth errors.
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [form.customer_name, refreshClientSuggestions]);

  const clientSuggestions = useMemo(() => {
    const manual = ownClients.map((client) => ({ ...client, source: "own" as const }));
    const suggested = suggestedClients.map((client) => ({
      local_client_id: client.local_client_id,
      customer_code: client.customer_code,
      customer_name: client.customer_name,
      contact_person: client.contact_person,
      activity_count: client.activity_count,
      estimated_pipeline: client.estimated_pipeline,
      actual_revenue: client.invoice_revenue,
      last_activity_at: client.last_activity_at ?? client.last_invoice_at,
      source: client.name_source === "local_pending" ? "pending" as const : "index" as const,
    }));
    const seen = new Set<string>();
    return [...manual, ...suggested].filter((client) => {
      const key = `${client.customer_code ?? client.local_client_id ?? ""}:${client.customer_name}`;
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
      local_client_id: client.local_client_id,
      contact_person: client.contact_person ?? current.contact_person,
    }));
  };

  const hasExactClientMatch = useMemo(() => {
    const typedName = form.customer_name?.replace(/\s+/g, " ").trim().toLocaleLowerCase("he");
    if (!typedName) return false;
    return clientSuggestions.some((client) => (
      client.customer_name.replace(/\s+/g, " ").trim().toLocaleLowerCase("he") === typedName
    ));
  }, [clientSuggestions, form.customer_name]);

  const useCreatedClient = (client: PendingBinaClient) => {
    setForm((current) => ({
      ...current,
      customer_name: client.customer_name,
      customer_code: client.bina_customer_code,
      local_client_id: client.id,
      contact_person: client.contact_person ?? current.contact_person,
    }));
    setSavedMessage("הלקוח נשמר ויופיע גם בחיפושים הבאים");
    void refreshClientSuggestions(client.customer_name);
    void loadData();
  };

  const summarizeNote = async () => {
    if (!form.raw_note?.trim()) {
      setError("כתבו או הקליטו כמה מילים לפני שמפעילים את ה-AI");
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
      setCalendarNote((current) => current || result.nextAction || "");
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
      setError("הדפדפן הזה לא תומך בהקלטה. אפשר להקליד במקום.");
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
      setError("לא הצלחנו לקלוט את ההקלטה. אפשר לנסות שוב או להקליד.");
    };
    speechRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const resetActivityDraft = useCallback(() => {
    setEditingActivityId(null);
    setEventTimeTouched(false);
    setAiSummary(null);
    setCalendarNote("");
    setFiles([]);
    setForm({
      event_type: "meeting",
      event_at: formatDateInput(),
      customer_name: "",
      customer_code: null,
      local_client_id: null,
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
  }, []);

  const editActivity = (activity: SalesActivityLog) => {
    setEditingActivityId(activity.id);
    setEventTimeTouched(true);
    setAiSummary(null);
    setFiles([]);
    setCalendarNote(typeof activity.metadata?.calendar_event_note === "string" ? activity.metadata.calendar_event_note : "");
    setForm({
      event_type: activity.event_type,
      event_at: formatDateInput(new Date(activity.event_at)),
      customer_name: activity.customer_name,
      customer_code: activity.customer_code,
      local_client_id: activity.local_client_id,
      contact_person: activity.contact_person ?? "",
      raw_note: activity.raw_note,
      ai_summary: activity.ai_summary ?? "",
      ai_next_action: activity.ai_next_action ?? "",
      next_action_date: activity.next_action_date ?? "",
      estimated_revenue: activity.estimated_revenue,
      actual_revenue: activity.actual_revenue,
      currency: activity.currency,
      status: activity.status,
      source: activity.source,
      linked_bina_invoice_no: activity.linked_bina_invoice_no,
      linked_bina_order_no: activity.linked_bina_order_no,
      linked_bina_delivery_no: activity.linked_bina_delivery_no,
      ai_confidence: activity.ai_confidence,
      metadata: activity.metadata,
    });
    setError(null);
    setSavedMessage(null);
    window.requestAnimationFrame(() => formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const saveActivity = async () => {
    if (!isFormReady) {
      setError("לפני השמירה צריך לבחור לקוח ולכתוב מה היה");
      return;
    }
    setIsSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const payload = {
        ...form,
        metadata: {
          ...form.metadata,
          calendar_event_note: calendarNote.trim() || null,
        },
      };
      if (editingActivityId) {
        await updateSalesPortalActivityApi(editingActivityId, payload);
        setSavedMessage("השינויים נשמרו");
      } else {
        await createSalesPortalActivityApi(payload, files);
        setSavedMessage("הדיווח נשמר ומופיע אצל המנהל");
      }
      resetActivityDraft();
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
    return (
      <main
        dir="rtl"
        className="flex min-h-dvh items-center justify-center bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)))] text-muted-foreground"
      >
        טוען יומן מכירות...
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-dvh bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)))] text-right text-foreground"
    >
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 px-3 py-2.5 shadow-sm shadow-slate-900/5 backdrop-blur lg:px-6 lg:py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2.5 lg:gap-3">
            <GestelitLogo size="sm" className="rounded-xl" />
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">יומן מכירות</div>
              <div className="truncate text-xs text-muted-foreground">{user?.full_name}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 lg:gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => router.push("/sales/dashboard")} className="h-10 gap-2 px-3">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden lg:inline">הסיכום שלי</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push("/sales/clients")} className="h-10 gap-2 px-3">
              <UsersRound className="h-4 w-4" />
              <span className="hidden lg:inline">לקוחות</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void loadData()} className="h-10 gap-2 px-3">
              <RefreshCcw className="h-4 w-4" />
              <span className="hidden lg:inline">רענון</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void logout()} className="h-10 gap-2 px-3">
              <LogOut className="h-4 w-4" />
              <span className="hidden lg:inline">יציאה</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-3 p-3 pb-6 lg:gap-5 lg:p-6">
        {canViewTeamDashboard ? (
          <section className="order-1 flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-semibold">דשבורד צוות המכירות</h2>
                <p className="text-sm text-muted-foreground">כל אנשי המכירות, הלקוחות, הפעילויות וההכנסות במקום אחד.</p>
              </div>
            </div>
            <Button onClick={() => router.push("/admin/sales-daily-log")} className="h-11 w-full gap-2 sm:w-auto">
              <BarChart3 className="h-4 w-4" />
              פתיחת דשבורד הצוות
            </Button>
          </section>
        ) : null}
        <section className="order-3 grid grid-cols-2 gap-2 lg:order-1 lg:gap-3 xl:grid-cols-5">
          <Kpi label="דיווחים היום" value={summary.todayCount} icon={CalendarClock} />
          <Kpi label="דיווחים השבוע" value={summary.weekCount} icon={BarChart3} />
          <Kpi label="לקוחות שצריך לחזור אליהם" value={summary.openFollowUps} icon={Clock3} tone={summary.overdueFollowUps > 0 ? "red" : "amber"} />
          <Kpi label="שווי עסקאות פתוחות" value={formatMoney(summary.estimatedPipeline)} icon={Target} />
          <Kpi label="עסקאות שנסגרו" value={formatMoney(summary.actualRevenue)} icon={WalletCards} />
        </section>

        <div className="order-1 space-y-3 lg:order-2">
          {error && <Notice tone="red">{error}</Notice>}
          {savedMessage && <Notice tone="green">{savedMessage}</Notice>}
        </div>

        <section className="order-2 grid min-w-0 gap-4 lg:order-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <Card ref={formCardRef} className="min-w-0 scroll-mt-20 overflow-hidden rounded-2xl border border-border/80 bg-card p-3 shadow-sm shadow-slate-900/5 lg:p-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold lg:text-2xl">{editingActivityId ? "תיקון דיווח" : "דיווח חדש"}</h1>
                <p className="mt-1 hidden text-sm leading-6 text-muted-foreground lg:block">
                  {editingActivityId
                    ? "תקנו מה שצריך ושמרו. אפשר לערוך רק דיווחים שלכם."
                    : "מה היה מול הלקוח? אפשר גם לצרף קובץ או לתת ל-AI לסדר את הניסוח."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="w-fit bg-primary/10 text-primary">{editingActivityId ? "עורכים דיווח" : "מופיע אצל המנהל"}</Badge>
                {editingActivityId ? (
                  <Button type="button" variant="ghost" size="sm" onClick={resetActivityDraft} className="h-9 gap-1.5">
                    <X className="h-4 w-4" />
                    ביטול
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
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
                    className="h-11 min-w-0 gap-1.5 px-2 text-sm lg:h-10 lg:px-3 [&_svg]:shrink-0"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="truncate">{option.label}</span>
                  </Button>
                );
              })}
            </div>

            <div className="grid min-w-0 gap-3 lg:grid-cols-2">
              <Field label="לקוח">
                <Input
                  value={form.customer_name}
                  onChange={(event) => setForm((current) => ({ ...current, customer_name: event.target.value, customer_code: null, local_client_id: null }))}
                  placeholder="שם לקוח"
                  className="h-12 min-w-0 rounded-xl text-base lg:h-10 lg:text-sm"
                />
              </Field>
              <Field label="איש קשר">
                <Input
                  value={String(form.contact_person ?? "")}
                  onChange={(event) => setForm((current) => ({ ...current, contact_person: event.target.value }))}
                  placeholder="אופציונלי"
                  className="h-12 min-w-0 rounded-xl text-base lg:h-10 lg:text-sm"
                />
              </Field>
              <Field label="תאריך ושעה">
                <Input
                  dir="ltr"
                  type="datetime-local"
                  value={String(form.event_at ?? "")}
                  onChange={(event) => {
                    setEventTimeTouched(true);
                    setForm((current) => ({ ...current, event_at: event.target.value }));
                  }}
                  className="h-12 min-w-0 rounded-xl text-base lg:h-10 lg:text-sm"
                />
              </Field>
              <Field
                label="מתי לחזור ללקוח?"
                action={(
                  <AddToCalendarButton
                    date={String(form.next_action_date ?? "")}
                    customerName={form.customer_name}
                    customerCode={form.customer_code}
                    nextAction={form.ai_next_action}
                    calendarNote={calendarNote}
                    eventTypeLabel={eventOptions.find((option) => option.id === form.event_type)?.label}
                    contactPerson={form.contact_person}
                    salesperson={user?.full_name}
                    estimatedRevenue={form.estimated_revenue}
                    currency={form.currency}
                  />
                )}
              >
                <Input
                  dir="ltr"
                  type="date"
                  value={String(form.next_action_date ?? "")}
                  onChange={(event) => setForm((current) => ({ ...current, next_action_date: event.target.value, status: event.target.value ? "follow_up" : current.status }))}
                  className="h-12 min-w-0 rounded-xl text-base lg:h-10 lg:text-sm"
                />
              </Field>
              <Field label="מה לרשום ביומן?" className="lg:col-span-2">
                <Input
                  value={calendarNote}
                  onChange={(event) => setCalendarNote(event.target.value)}
                  placeholder="למשל: לחזור ללקוח עם הצעת המחיר החדשה"
                  className="h-12 min-w-0 rounded-xl text-base lg:h-10 lg:text-sm"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  שם הלקוח, איש הקשר והסכום ייכנסו ליומן אוטומטית.
                </p>
              </Field>
            </div>

            {clientSuggestions.length > 0 && (
              <div className="-mx-1 mt-3 flex max-w-full snap-x gap-2 overflow-x-auto px-1 pb-1">
                {clientSuggestions.map((client) => (
                  <button
                    key={`${client.source}-${client.customer_code ?? client.local_client_id ?? "manual"}-${client.customer_name}`}
                    type="button"
                    onClick={() => selectClient(client)}
                    className="w-[min(14rem,82vw)] shrink-0 snap-start rounded-xl border border-border bg-secondary/40 p-3 text-right text-sm transition hover:bg-accent"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{client.customer_name}</span>
                      <Badge variant="outline">{client.source === "own" ? "לקוח שלי" : client.source === "pending" ? "עדיין לא ב-BINA" : "רשימת לקוחות"}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {client.activity_count} פעילויות · {formatMoney(client.estimated_pipeline || client.actual_revenue)}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {form.customer_name.trim().length >= 2 && !hasExactClientMatch ? (
              <button
                type="button"
                onClick={() => setIsNewClientOpen(true)}
                className="mt-3 flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-right transition hover:bg-primary/10"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-primary">
                    {clientSuggestions.length > 0 ? "לא מצאתם את הלקוח? הוסיפו אותו" : "הוספת לקוח חדש"}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">{form.customer_name.trim()}</span>
                </span>
                <UserPlus className="h-5 w-5 shrink-0 text-primary" />
              </button>
            ) : null}

            <div className="mt-4">
              <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <Label>מה היה מול הלקוח?</Label>
                <div className="grid min-w-0 grid-cols-2 gap-2 lg:flex">
                  <Button type="button" variant="outline" size="sm" onClick={toggleSpeech} className="h-11 gap-2 lg:h-9">
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {isListening ? "עצור הקלטה" : "הקלטה"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void summarizeNote()} disabled={isSummarizing || !form.raw_note?.trim()} className="h-11 gap-2 lg:h-9">
                    <Sparkles className="h-4 w-4" />
                    {isSummarizing ? "מסדר ניסוח..." : "סדר עם AI"}
                  </Button>
                </div>
              </div>
              <Textarea
                value={form.raw_note}
                onChange={(event) => setForm((current) => ({ ...current, raw_note: event.target.value }))}
                placeholder="למשל: נפגשתי עם הלקוח, דיברנו על הזמנה חוזרת והוא ביקש הצעה עד יום ראשון..."
                className="min-h-32 min-w-0 rounded-xl text-base lg:text-sm"
              />
            </div>

            {aiSummary && (
              <Card className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-primary">
                  <Sparkles className="h-4 w-4" />
                  <span className="font-semibold">הסיכום של ה-AI</span>
                </div>
                <p className="text-sm leading-6">{aiSummary.summary}</p>
                <div className="mt-3 grid gap-2 text-sm lg:grid-cols-2">
                  <div><span className="text-muted-foreground">מה הלקוח רוצה: </span>{aiSummary.customerIntent}</div>
                  <div><span className="text-muted-foreground">מה עושים עכשיו: </span>{aiSummary.nextAction ?? "-"}</div>
                  <div><span className="text-muted-foreground">מה מעכב: </span>{aiSummary.riskOrObjection ?? "-"}</div>
                  <div><span className="text-muted-foreground">רמת ביטחון: </span>{aiSummary.confidence}</div>
                </div>
              </Card>
            )}

            <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-3">
              <Field label="שווי משוער">
                <Input
                  dir="ltr"
                  type="number"
                  min="0"
                  value={String(form.estimated_revenue ?? "")}
                  onChange={(event) => setForm((current) => ({ ...current, estimated_revenue: event.target.value }))}
                  placeholder="₪"
                  className="h-12 min-w-0 rounded-xl text-base lg:h-10 lg:text-sm"
                />
              </Field>
              <Field label="כמה נסגר?">
                <Input
                  dir="ltr"
                  type="number"
                  min="0"
                  value={String(form.actual_revenue ?? "")}
                  onChange={(event) => setForm((current) => ({ ...current, actual_revenue: event.target.value, status: event.target.value ? "won" : current.status }))}
                  placeholder="אם נסגר"
                  className="h-12 min-w-0 rounded-xl text-base lg:h-10 lg:text-sm"
                />
              </Field>
              <Field label="מצב">
                <select
                  value={String(form.status ?? "open")}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as SalesStatus }))}
                  className="flex h-12 min-w-0 w-full rounded-xl border border-input bg-background px-3 py-2 text-base lg:h-10 lg:text-sm"
                >
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
            </div>

            <div className="mt-4">
              <Label>מה הצעד הבא?</Label>
              <Input
                value={String(form.ai_next_action ?? "")}
                onChange={(event) => setForm((current) => ({ ...current, ai_next_action: event.target.value }))}
                placeholder="למשל: לשלוח הצעה ולחזור ביום ראשון"
                className="mt-2 h-12 min-w-0 rounded-xl text-base lg:h-10 lg:text-sm"
              />
            </div>

            <div className="mt-4 min-w-0 rounded-xl border border-dashed border-border bg-secondary/25 p-3 lg:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    <Paperclip className="h-4 w-4" />
                    קבצים ותמונות
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {editingActivityId ? "הקבצים הקיימים יישארו כמו שהם." : "אפשר לצרף עד 5 קבצים, עד 10MB לקובץ."}
                  </p>
                </div>
                {!editingActivityId ? (
                  <Label className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent lg:w-auto">
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
                ) : null}
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

            <div className="sticky bottom-0 z-20 -mx-3 mt-5 flex justify-end border-t border-border/70 bg-card/95 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
              <Button onClick={() => void saveActivity()} disabled={isSaving || !isFormReady} className="h-12 w-full rounded-xl text-base lg:w-auto lg:min-w-44 lg:text-sm">
                {isSaving ? "שומר..." : editingActivityId ? "שמור שינויים" : "שמור דיווח"}
              </Button>
            </div>
          </Card>

          <aside className="min-w-0 space-y-4">
            <Card className="min-w-0 overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm shadow-slate-900/5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">הדיווחים שלי</h2>
                  <p className="text-sm text-muted-foreground">מה דיווחתי ומה עדיין פתוח.</p>
                </div>
                <div className="relative w-32 lg:w-48">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש" className="h-11 rounded-xl pr-9" />
                </div>
              </div>
              <div className="space-y-3">
                {activities.length === 0 ? (
                  <div className="rounded-xl bg-secondary/40 p-4 text-center text-sm text-muted-foreground">עוד לא הוספתם דיווחים</div>
                ) : activities.map((activity) => (
                  <ActivityCard key={activity.id} activity={activity} onMark={markStatus} onEdit={editActivity} />
                ))}
              </div>
            </Card>
          </aside>
        </section>
      </div>
      <NewClientDialog
        open={isNewClientOpen}
        onOpenChange={setIsNewClientOpen}
        initialName={form.customer_name}
        onCreated={useCreatedClient}
      />
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
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    red: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  }[tone];
  return (
    <Card className="rounded-xl border border-border/80 bg-card p-3 shadow-sm shadow-slate-900/5 lg:p-4">
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

function Field({
  label,
  children,
  className,
  action,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {action ? (
        <div className="flex min-h-8 items-center justify-between gap-2">
          <Label>{label}</Label>
          {action}
        </div>
      ) : <Label>{label}</Label>}
      {children}
    </div>
  );
}

function Notice({ tone, children }: { tone: "red" | "green"; children: ReactNode }) {
  return (
    <Card className={cn(
      "flex items-center gap-2 rounded-xl p-3 text-sm",
      tone === "red"
        ? "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200"
        : "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200",
    )}>
      {tone === "green" ? <CheckCircle2 className="h-4 w-4" /> : null}
      {children}
    </Card>
  );
}

function ActivityCard({
  activity,
  onMark,
  onEdit,
}: {
  activity: SalesActivityLog;
  onMark: (activity: SalesActivityLog, status: SalesStatus) => void;
  onEdit: (activity: SalesActivityLog) => void;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-background/70 p-3 shadow-sm shadow-slate-900/5">
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
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant="outline" size="sm" className="h-10 gap-1 px-2" onClick={() => onEdit(activity)}>
          <Pencil className="h-3.5 w-3.5" />
          עריכה
        </Button>
        <Button variant="outline" size="sm" className="h-10 px-2" onClick={() => onMark(activity, "follow_up")}>לחזור אליו</Button>
        <Button variant="outline" size="sm" className="h-10 px-2" onClick={() => onMark(activity, "won")}>נסגר</Button>
        <Button variant="outline" size="sm" className="h-10 px-2" onClick={() => onMark(activity, "done")}>בוצע</Button>
      </div>
    </div>
  );
}
