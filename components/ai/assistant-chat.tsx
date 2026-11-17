"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Check, Copy, History, Loader2, Maximize2, Plus, RotateCcw, Send, Sparkles, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/utils/copy-to-clipboard";

export type AssistantAnswer = {
  answer: string;
  sessionId?: string;
  confidence?: string;
  freshness?: string | null;
  sources?: string[];
  evidence?: Array<{ label: string; source?: string; freshness?: string | null }>;
  suggestedNextAction?: string | null;
  suggestedQuestions?: string[];
  couldNotVerify?: string[];
};
export type AssistantTurn = { role: "user" | "assistant"; content: string; answer?: AssistantAnswer };
export type AssistantConversation = { id: string; label: string; sessionId?: string; messages: AssistantTurn[] };
type Thread = AssistantConversation;
export type AssistantRequest = { message: string; sessionId?: string; history: Array<{ role: "user" | "assistant"; content: string }>; context: Record<string, unknown>; signal: AbortSignal };
type Props = {
  title: string;
  screen: string;
  context: Record<string, unknown>;
  prompts: string[];
  request: (input: AssistantRequest) => Promise<AssistantAnswer>;
  embedded?: boolean;
  embeddedTargetId?: string;
  storageKey?: string;
  openEvent?: string;
  loadHistory?: () => Promise<Array<{ id: string; label: string }>>;
  loadConversation?: (id: string) => Promise<AssistantConversation>;
};
type ChatSnapshot = { threads: Thread[]; activeId: string | null; input: string; open: boolean; pendingQuestion?: string };
const conversationMemory = new Map<string, ChatSnapshot>();
function freshThread(): Thread { return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label: "שיחה חדשה", messages: [] }; }
function safeError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (/CHAT_TIMEOUT/.test(code)) return "הבדיקה מתארכת. אפשר לנסות שאלה ממוקדת יותר או לנסות שוב.";
  if (/CHAT_CANCELLED/.test(code)) return "הבדיקה הופסקה. אפשר לערוך את השאלה ולהמשיך.";
  if (/UNAUTHORIZED|401|FORBIDDEN/.test(code)) return "ההרשאה לשיחה הסתיימה. התחברו מחדש כדי להמשיך.";
  if (/RATE_LIMIT|429/.test(code)) return "נשלחו כמה שאלות ברצף. המתינו רגע ונסו שוב.";
  if (/REQUEST_BLOCKED/.test(code)) return "אפשר לנתח נתונים ולהכין טיוטות. בקשה לשינוי נתונים או לחשיפת מידע מוגן אינה זמינה.";
  if (/TOO_LONG|413/.test(code)) return "השאלה ארוכה מדי. קצרו אותה ונסו שוב.";
  return "לא הצלחנו להשלים את הבדיקה כרגע. אפשר לנסות שוב; השיחה נשמרה כאן.";
}
function dateLabel(value?: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
/** Text only: never render model HTML or executable links. */
function AnswerText({ text }: { text: string }) {
  return <div className="space-y-3 text-[14px] leading-7">{text.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => {
    const lines = paragraph.split("\n");
    const list = lines.every((line) => /^\s*(?:[-•*]|\d+[.)])\s+/.test(line));
    const render = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part);
    return list ? <ul key={index} className="list-disc space-y-1 pr-5">{lines.map((line, i) => <li key={i}>{render(line.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, ""))}</li>)}</ul> : <p key={index} className="whitespace-pre-wrap break-words">{render(paragraph.replace(/^#{1,4}\s/gm, ""))}</p>;
  })}</div>;
}
function AnswerDetails({ answer, ask, disabled }: { answer: AssistantAnswer; ask: (question: string) => void; disabled: boolean }) {
  const [copied, setCopied] = useState(false);
  const freshness = dateLabel(answer.freshness);
  return <>
    {answer.suggestedNextAction && <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5"><p className="mb-1 text-[11px] font-semibold text-primary">הצעד הבא</p><p className="text-sm leading-6">{answer.suggestedNextAction}</p></div>}
    {(answer.couldNotVerify ?? []).length > 0 && <div className="mt-3 space-y-1 rounded-xl bg-amber-500/10 p-3 text-xs leading-5 text-foreground">{answer.couldNotVerify!.map((item, i) => <p key={i}>מידע חסר: {item}</p>)}</div>}
    <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span>{answer.confidence === "exact" ? "מבוסס על הנתונים שנבדקו" : answer.confidence === "missing_data" ? "המידע חלקי או חסר" : "מסקנה מהנתונים"}{freshness ? ` · ${freshness}` : ""}</span>
      <button type="button" className="rounded-md p-1.5 hover:bg-accent" aria-label={copied ? "התשובה הועתקה" : "העתקת תשובה"} onClick={async () => { setCopied(await copyTextToClipboard(answer.answer)); window.setTimeout(() => setCopied(false), 1800); }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
    </div>
    {((answer.evidence?.length ?? 0) > 0 || (answer.sources?.length ?? 0) > 0) && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer py-1.5">מקורות ועדכניות</summary><div className="mt-1 space-y-2 rounded-xl border border-border p-3">{answer.evidence?.map((item, index) => <div key={index}><p className="font-medium text-foreground">{item.label}</p>{item.source && <p className="mt-0.5 break-all" dir="ltr">{item.source}</p>}{dateLabel(item.freshness) && <p>{dateLabel(item.freshness)}</p>}</div>)}{answer.sources?.map((source) => <p key={source} className="break-all" dir="ltr">{source}</p>)}<p className="leading-5">הנתונים משקפים את המידע הזמין במערכת ואת מועד הסנכרון. מגבלות כיסוי מפורטות בתשובה.</p></div></details>}
    {(answer.suggestedQuestions ?? []).length > 0 && <div className="mt-3 flex flex-col gap-2">{answer.suggestedQuestions!.slice(0, 4).map((question) => <button key={question} disabled={disabled} type="button" onClick={() => ask(question)} className="rounded-xl border border-border px-3 py-2 text-right text-xs leading-5 transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50">{question}</button>)}</div>}
  </>;
}

export function AssistantChat({ title, screen, context, prompts, request, embedded = false, embeddedTargetId, storageKey, openEvent, loadHistory, loadConversation }: Props) {
  const initial = useRef(storageKey ? conversationMemory.get(storageKey) : undefined).current;
  const [open, setOpen] = useState(embedded || initial?.open || false);
  const [threads, setThreads] = useState<Thread[]>(() => initial?.threads ?? [freshThread()]);
  const [activeId, setActiveId] = useState<string | null>(initial?.activeId ?? null);
  const [input, setInput] = useState(initial?.input ?? initial?.pendingQuestion ?? "");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(initial?.pendingQuestion ? safeError(new Error("CHAT_CANCELLED")) : null);
  const [failedQuestion, setFailedQuestion] = useState<string | null>(initial?.pendingQuestion ?? null);
  const activeRequest = useRef<{ controller: AbortController; epoch: number; question: string } | null>(null);
  const epoch = useRef(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [remoteHistory, setRemoteHistory] = useState<Array<{ id: string; label: string }>>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [embedTarget, setEmbedTarget] = useState<HTMLElement | null>(null);
  const [mobile, setMobile] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const active = threads.find((thread) => thread.id === activeId) ?? threads[0];
  const current = useRef({ active, context, request });
  current.current = { active, context, request };
  useEffect(() => {
    if (storageKey) conversationMemory.set(storageKey, { threads, activeId, input, open, pendingQuestion: busy ? activeRequest.current?.question : failedQuestion ?? undefined });
  }, [threads, activeId, input, open, busy, failedQuestion, storageKey]);
  useEffect(() => {
    // Fast Refresh can preserve hook state while cleaning up an in-flight fetch.
    const interrupted = activeRequest.current;
    if (interrupted?.controller.signal.aborted) {
      activeRequest.current = null; busyRef.current = false; setBusy(false);
      setFailedQuestion(interrupted.question); setInput(interrupted.question); setError(safeError(new Error("CHAT_CANCELLED")));
    }
    return () => { activeRequest.current?.controller.abort(); epoch.current += 1; };
  }, []);
  useEffect(() => { setMounted(true); const query = window.matchMedia("(max-width: 639px)"); setMobile(query.matches); const update = () => setMobile(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  useEffect(() => { if (embedded) setOpen(true); setEmbedTarget(embeddedTargetId ? document.getElementById(embeddedTargetId) : null); }, [embedded, embeddedTargetId]);
  useEffect(() => { if (open) textarea.current?.focus(); }, [open, embedded]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [active.messages.length, busy]);
  const close = () => { setOpen(false); launcher.current?.focus(); };
  const ask = async (question: string, retry = false) => {
    const clean = question.trim();
    if (!clean || busyRef.current) return;
    busyRef.current = true; setBusy(true); setOpen(true); setError(null); setFailedQuestion(null); setInput(""); setHistoryOpen(false);
    const controller = new AbortController();
    const requestEpoch = ++epoch.current;
    activeRequest.current = { controller, epoch: requestEpoch, question: clean };
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 75000);
    const { active: thread, context: hints, request: execute } = current.current;
    const history = thread.messages.slice(-8).map(({ role, content }) => ({ role, content }));
    setActiveId(thread.id);
    if (!retry) setThreads((previous) => previous.map((item) => item.id === thread.id ? { ...item, label: item.messages.length ? item.label : clean.slice(0, 45), messages: [...item.messages, { role: "user", content: clean }] } : item));
    try {
      const answer = await execute({ message: clean, sessionId: thread.sessionId, history: retry ? history.slice(0, -1) : history, context: hints, signal: controller.signal });
      if (requestEpoch !== epoch.current || controller.signal.aborted) return;
      setThreads((previous) => previous.map((item) => item.id === thread.id ? { ...item, sessionId: answer.sessionId ?? item.sessionId, messages: [...item.messages, { role: "assistant", content: answer.answer, answer }] } : item));
    } catch (failure) { if (requestEpoch === epoch.current) { setError(safeError(controller.signal.aborted ? new Error(timedOut ? "CHAT_TIMEOUT" : "CHAT_CANCELLED") : failure)); setFailedQuestion(clean); setInput(clean); } }
    finally { window.clearTimeout(timeout); if (requestEpoch === epoch.current) { activeRequest.current = null; busyRef.current = false; setBusy(false); textarea.current?.focus(); } }
  };
  const stop = () => {
    const pending = activeRequest.current;
    if (!pending) return;
    ++epoch.current; pending.controller.abort(); activeRequest.current = null; busyRef.current = false; setBusy(false);
    setFailedQuestion(pending.question); setInput(pending.question); setError(safeError(new Error("CHAT_CANCELLED")));
  };
  const askRef = useRef(ask); askRef.current = ask;
  useEffect(() => {
    if (!openEvent) return;
    const show = (event: Event) => { setOpen(true); const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt; if (prompt) void askRef.current(prompt); };
    window.addEventListener(openEvent, show); return () => window.removeEventListener(openEvent, show);
  }, [openEvent]);
  const showHistory = async () => {
    const next = !historyOpen; setHistoryOpen(next); setHistoryError(null);
    if (!next || !loadHistory) return;
    setHistoryBusy(true);
    try { setRemoteHistory(await loadHistory()); } catch { setHistoryError("לא הצלחנו לטעון שיחות קודמות. אפשר להמשיך בשיחה הנוכחית."); }
    finally { setHistoryBusy(false); }
  };
  const openConversation = async (id: string) => {
    if (!loadConversation || busyRef.current) return;
    setHistoryBusy(true); setHistoryError(null);
    try { const conversation = await loadConversation(id); setThreads((previous) => [conversation, ...previous.filter((thread) => thread.id !== id && thread.sessionId !== id)].slice(0, 8)); setActiveId(conversation.id); setHistoryOpen(false); setError(null); setFailedQuestion(null); setInput(""); }
    catch { setHistoryError("לא הצלחנו לפתוח את השיחה. נסו שוב בעוד רגע."); }
    finally { setHistoryBusy(false); }
  };
  const newChat = () => { if (busyRef.current) return; const next = freshThread(); setThreads((previous) => [next, ...previous].slice(0, 8)); setActiveId(next.id); setInput(""); setError(null); setFailedQuestion(null); setHistoryOpen(false); textarea.current?.focus(); };
  const content = <>
    {!embedded && <Button ref={launcher} type="button" aria-label="פתיחת עוזר AI" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={cn("fixed bottom-20 left-4 z-[65] h-12 gap-2 rounded-full border border-primary/20 px-4 shadow-lg lg:bottom-5", open && "hidden")}><Sparkles size={18} /><span>שאלו את הנתונים</span></Button>}
    {open && <section ref={panel} role={embedded ? undefined : "dialog"} aria-modal={!embedded && mobile ? true : undefined} aria-labelledby={titleId} dir="rtl" className={cn("flex flex-col overflow-hidden border border-border bg-background text-right text-foreground shadow-2xl", embedded ? "h-[calc(100dvh-150px)] min-h-[500px] rounded-2xl" : "fixed inset-0 z-[70] sm:inset-auto sm:bottom-5 sm:left-5 sm:h-[min(680px,calc(100dvh-40px))] sm:max-w-[calc(100vw-40px)] sm:rounded-2xl", !embedded && (expanded ? "sm:w-[720px]" : "sm:w-[430px]"))} onKeyDown={(event) => {
      if (event.key === "Escape" && !embedded) { event.preventDefault(); close(); }
      if (event.key === "Tab" && mobile && !embedded) { const focusable = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, summary, [tabindex="0"]'); if (!focusable?.length) return; const first = focusable[0], last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    }}>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot size={19} /></span><div className="min-w-0"><h2 id={titleId} className="text-sm font-semibold">{title}</h2><p className="truncate text-[11px] text-muted-foreground">{screen}</p></div></div>
        <div className="flex items-center gap-0.5"><Button type="button" variant="ghost" size="icon" disabled={busy} onClick={newChat} aria-label="שיחה חדשה" title="שיחה חדשה" className="h-8 w-8"><Plus size={17} /></Button><Button type="button" variant="ghost" size="icon" disabled={busy} aria-label="שיחות אחרונות" aria-expanded={historyOpen} onClick={() => void showHistory()} className="h-8 w-8"><History size={17} /></Button>{!embedded && <><Button type="button" variant="ghost" size="icon" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "הקטנת חלון" : "הרחבת חלון"} className="hidden h-8 w-8 sm:inline-flex"><Maximize2 size={16} /></Button><Button type="button" variant="ghost" size="icon" onClick={close} aria-label="סגירת הצ׳אט" className="h-8 w-8"><X size={18} /></Button></>}</div>
      </header>
      {historyOpen && <div className="max-h-64 shrink-0 overflow-auto border-b border-border bg-secondary/40 p-3"><p className="mb-2 text-[11px] text-muted-foreground">שיחות אחרונות{loadHistory ? "" : " בחלון זה"}</p>{historyBusy && <p role="status" className="py-2 text-xs text-muted-foreground">טוען שיחות…</p>}{historyError && <p role="alert" className="py-2 text-xs text-muted-foreground">{historyError}</p>}{threads.map((thread) => <button key={thread.id} disabled={historyBusy} type="button" onClick={() => { setActiveId(thread.id); setHistoryOpen(false); setError(null); setFailedQuestion(null); }} className={cn("block w-full truncate rounded-lg px-3 py-2 text-right text-xs hover:bg-accent", active.id === thread.id && "bg-primary/10 font-semibold text-primary")}>{thread.label}</button>)}{remoteHistory.filter((item) => !threads.some((thread) => thread.id === item.id || thread.sessionId === item.id)).map((item) => <button key={item.id} type="button" disabled={historyBusy} onClick={() => void openConversation(item.id)} className="block w-full truncate rounded-lg px-3 py-2 text-right text-xs hover:bg-accent disabled:opacity-50">{item.label}</button>)}</div>}

      <div role="log" aria-label="הודעות בשיחה" aria-busy={busy} className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5">
        {!active.messages.length && <div className="space-y-5 py-4"><div><Sparkles className="mb-3 h-6 w-6 text-primary" /><h3 className="text-lg font-semibold">מה נרצה להבין היום?</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">אפשר לשאול, להשוות ולשאול שאלות המשך. המסך והמסננים הנוכחיים מצורפים לשאלה, והנתונים נבדקים לפי ההרשאה שלך.</p></div><div className="space-y-2">{prompts.slice(0, 3).map((prompt) => <button key={prompt} type="button" onClick={() => void ask(prompt)} className="flex w-full items-start justify-between gap-3 rounded-xl border border-border p-3 text-right text-sm leading-6 transition hover:border-primary/40 hover:bg-primary/5"><span>{prompt}</span><span className="mt-1 shrink-0 text-primary">↖</span></button>)}</div></div>}
        {active.messages.map((turn, index) => <article key={`${active.id}-${index}`} className={turn.role === "user" ? "mr-auto max-w-[92%] rounded-2xl rounded-tl-sm bg-secondary px-4 py-2.5" : "max-w-full"}><p className="mb-1 text-[10px] font-medium text-muted-foreground">{turn.role === "user" ? "אתם" : "Gestelit AI"}</p><AnswerText text={turn.content} />{turn.answer && <AnswerDetails answer={turn.answer} ask={(question) => void ask(question)} disabled={busy} />}</article>)}
        {busy && <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" />בודק נתונים ומחבר את התמונה…</div>}
        {error && <div role="alert" className="rounded-xl border border-border bg-secondary/50 p-3 text-sm leading-6"><p>{error}</p>{failedQuestion && <Button type="button" variant="outline" size="sm" onClick={() => void ask(failedQuestion, true)} disabled={busy} className="mt-2 gap-2"><RotateCcw size={13} />ניסיון נוסף</Button>}</div>}
        <div ref={bottom} />
      </div>
      <form className="shrink-0 border-t border-border bg-background px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3" onSubmit={(event) => { event.preventDefault(); void ask(input); }}>
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10"><Textarea ref={textarea} value={input} maxLength={3000} disabled={busy} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(input); } }} aria-label="הודעה לעוזר" placeholder="שאלו שאלה או המשיכו את השיחה…" rows={1} className="max-h-32 min-h-11 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0" />{busy ? <Button type="button" size="icon" onClick={stop} aria-label="עצירת הבדיקה" className="h-10 w-10 shrink-0 rounded-xl"><Square size={15} fill="currentColor" /></Button> : <Button type="submit" size="icon" disabled={!input.trim()} aria-label="שליחת הודעה" className="h-10 w-10 shrink-0 rounded-xl"><Send size={17} /></Button>}</div><p className="mt-2 text-center text-[10px] leading-4 text-muted-foreground">תובנות על המידע הזמין · פעולות מוצעות דורשות ביצוע ואימות</p>
      </form>
    </section>}
  </>;
  if (embedded && embeddedTargetId) return embedTarget ? createPortal(content, embedTarget) : null;
  return embedded ? content : mounted ? createPortal(content, document.body) : null;
}
