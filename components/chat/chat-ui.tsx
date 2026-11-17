"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCheck,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import {
  createWorkerChatThreadApi,
  fetchWorkerChatMessagesApi,
  fetchWorkerChatThreadsApi,
  markWorkerChatThreadReadApi,
  sendWorkerChatMessageApi,
  fetchAdminChatMessagesApi,
  fetchAdminChatThreadsApi,
  markAdminChatThreadReadApi,
  sendAdminChatMessageApi,
  updateAdminChatThreadApi,
  createAdminChatThreadApi,
} from "@/lib/api/chat";
import { fetchActiveSessionsAdminApi } from "@/lib/api/admin-management";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatThread } from "@/lib/data/chat";
import type { ActiveSession } from "@/lib/data/admin-dashboard";

const QUICK_REPLIES = ["קיבלתי", "צריך עזרה", "בוצע", "אפשר להתקשר"];

const readableChatError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (message === "CHAT_SCHEMA_MISSING") {
    return "מודול ההודעות עדיין לא הותקן בבסיס הנתונים. יש להריץ את מיגרציית chat_threads/chat_messages לפני שימוש.";
  }
  return "לא ניתן לטעון הודעות כרגע. נסו שוב.";
};

const formatTime = (value: string | null | undefined) => {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
};

const threadTitle = (thread: ChatThread) => {
  const snapshot = thread.context_snapshot ?? {};
  return (
    thread.subject ||
    snapshot.jobNumber ||
    snapshot.jobItemName ||
    snapshot.stationName ||
    "שיחה תפעולית"
  );
};

const threadSubtitle = (thread: ChatThread) => {
  const snapshot = thread.context_snapshot ?? {};
  return [snapshot.workerName, snapshot.stationName, snapshot.jobItemName]
    .filter(Boolean)
    .join(" · ");
};

function ChatEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <MessageSquare className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function ChatErrorState({
  onRetry,
  message = "לא ניתן לטעון הודעות כרגע. נסו שוב.",
}: {
  onRetry: () => void;
  message?: string;
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" />
        <span>{message}</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="mt-3 border-destructive/30"
      >
        נסה שוב
      </Button>
    </div>
  );
}

function ConversationList({
  threads,
  selectedId,
  onSelect,
  isLoading,
  variant = "admin",
}: {
  threads: ChatThread[];
  selectedId: string | null;
  onSelect: (thread: ChatThread) => void;
  isLoading: boolean;
  variant?: "admin" | "worker";
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-xl border border-border bg-muted/30"
          />
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <ChatEmptyState
        title={variant === "worker" ? "אין הודעות כרגע" : "אין שיחות פתוחות"}
        description={
          variant === "worker"
            ? "כשתתקבל הודעה מהמנהל היא תופיע כאן. אפשר גם לפתוח שיחה חדשה מהכפתור למטה."
            : "הודעות מעובדים ומשיחות פעילות יופיעו כאן בזמן אמת."
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      {threads.map((thread) => {
        const active = selectedId === thread.id;
        return (
          <button
            key={thread.id}
            type="button"
            onClick={() => onSelect(thread)}
            className={cn(
              "w-full rounded-xl border p-3 text-right transition",
              active
                ? "border-primary/40 bg-primary/10"
                : "border-border bg-card hover:border-primary/30 hover:bg-muted/30",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {threadTitle(thread)}
                  </span>
                  {thread.priority === "urgent" ? (
                    <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-600">
                      דחוף
                    </Badge>
                  ) : null}
                  {thread.unread_count > 0 ? (
                    <Badge className="bg-primary text-primary-foreground">
                      {thread.unread_count}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {threadSubtitle(thread) || "שיחת מערכת"}
                </p>
                <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
                  {thread.last_message_preview || "אין הודעות עדיין"}
                </p>
              </div>
              <time className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {formatTime(thread.last_message_at ?? thread.created_at)}
              </time>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ContextPanel({ thread }: { thread: ChatThread | null }) {
  if (!thread) {
    return (
      <Card className="hidden min-h-[220px] border-border bg-card/60 p-4 lg:block">
        <ChatEmptyState
          title="בחר שיחה"
          description="כאן יוצג הקשר הייצורי: עובד, תחנה, עבודה, סטטוס ופירוט פק״ע אם קיים."
        />
      </Card>
    );
  }

  const snapshot = thread.context_snapshot ?? {};
  const rows = [
    ["עובד", snapshot.workerName],
    ["קוד עובד", snapshot.workerCode],
    ["תחנה", snapshot.stationName],
    ["עבודה", snapshot.jobNumber],
    ["לקוח", snapshot.customerName],
    ["פריט", snapshot.jobItemName],
    ["סטטוס", snapshot.currentStatusLabel],
  ].filter(([, value]) => Boolean(value));

  return (
    <Card className="border-border bg-card/70 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">הקשר תפעולי</h3>
          <p className="text-xs text-muted-foreground">נשמר בזמן פתיחת השיחה</p>
        </div>
        <Badge variant={thread.status === "open" ? "default" : "outline"}>
          {thread.status === "open" ? "פתוח" : "סגור"}
        </Badge>
      </div>
      <dl className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/30 p-3">
            <dt className="text-[11px] font-medium text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-foreground">
              <bdi>{value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function MessageThread({
  thread,
  messages,
  isLoading,
  mode,
}: {
  thread: ChatThread | null;
  messages: ChatMessage[];
  isLoading: boolean;
  mode: "admin" | "worker";
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thread?.id]);

  if (!thread) {
    return (
      <ChatEmptyState
        title="אין שיחה נבחרת"
        description="בחר שיחה מהרשימה כדי לראות הודעות ולהגיב."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "h-14 animate-pulse rounded-2xl bg-muted/40",
              index % 2 === 0 ? "mr-auto w-3/5" : "ml-auto w-2/3",
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[360px] flex-col overflow-hidden rounded-xl border border-border bg-background">
      <div className="border-b border-border bg-card/80 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {threadTitle(thread)}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {threadSubtitle(thread)}
            </p>
          </div>
          {thread.priority === "urgent" ? (
            <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-600">
              דחוף
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            אין הודעות בשיחה הזו עדיין.
          </p>
        ) : (
          messages.map((message) => {
            const own =
              mode === "admin"
                ? message.sender_type === "admin"
                : message.sender_type === "worker";
            return (
              <div
                key={message.id}
                className={cn("flex", own ? "justify-start" : "justify-end")}
              >
                <div
                  className={cn(
                    "max-w-[82%] rounded-2xl px-4 py-3 shadow-sm",
                    own
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  <div className="mb-1 flex items-center gap-2 text-[11px] opacity-80">
                    <UserRound className="h-3 w-3" />
                    <span>{message.sender_label}</span>
                    <time className="font-mono">{formatTime(message.created_at)}</time>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MessageComposer({
  disabled,
  placeholder,
  onSend,
  quickReplies,
}: {
  disabled?: boolean;
  placeholder: string;
  onSend: (body: string) => Promise<void>;
  quickReplies?: string[];
}) {
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const canSend = body.trim().length > 0 && !disabled && !isSending;

  const send = async (nextBody = body) => {
    const value = nextBody.trim();
    if (!value || disabled || isSending) return;
    setIsSending(true);
    try {
      await onSend(value);
      setBody("");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-border bg-card/80 p-3">
      {quickReplies?.length ? (
        <div className="flex flex-wrap gap-2">
          {quickReplies.map((reply) => (
            <Button
              key={reply}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || isSending}
              onClick={() => void send(reply)}
              className="min-h-10 rounded-full"
            >
              {reply}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={placeholder}
          maxLength={1000}
          rows={2}
          className="min-h-[52px] resize-none text-right"
          disabled={disabled || isSending}
        />
        <Button
          type="button"
          size="icon"
          className="h-12 w-12 shrink-0 rounded-xl"
          disabled={!canSend}
          onClick={() => void send()}
          aria-label="שלח הודעה"
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

export function AdminChatConsole() {
  const { hasAccess } = useAdminGuard();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [selectedThread, setSelectedThread] = useState<ChatThread | null>(null);
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [status, setStatus] = useState<"all" | "open" | "closed">("open");
  const [newSessionId, setNewSessionId] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newUrgent, setNewUrgent] = useState(false);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    setError(null);
    setIsLoadingThreads(true);
    try {
      const { threads: data } = await fetchAdminChatThreadsApi({
        q: query,
        status,
        unreadOnly,
      });
      setThreads(data);
      setSelectedThread((current) => {
        if (!current) return data[0] ?? null;
        return data.find((thread) => thread.id === current.id) ?? data[0] ?? null;
      });
    } catch (loadError) {
      setError(readableChatError(loadError));
    } finally {
      setIsLoadingThreads(false);
    }
  }, [query, status, unreadOnly]);

  const loadMessages = useCallback(async (thread: ChatThread | null) => {
    if (!thread) {
      setMessages([]);
      return;
    }
    setIsLoadingMessages(true);
    try {
      const { messages: data } = await fetchAdminChatMessagesApi(thread.id);
      setMessages(data);
      await markAdminChatThreadReadApi(thread.id);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (hasAccess !== true) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { sessions } = await fetchActiveSessionsAdminApi();
        if (!cancelled) setActiveSessions(sessions);
      } catch {
        if (!cancelled) setActiveSessions([]);
      }
    };
    void load();
    const interval = setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasAccess]);

  useEffect(() => {
    void loadMessages(selectedThread);
  }, [loadMessages, selectedThread]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadThreads();
      void loadMessages(selectedThread);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadThreads, loadMessages, selectedThread]);

  const send = async (body: string) => {
    if (!selectedThread) return;
    const { message } = await sendAdminChatMessageApi(selectedThread.id, body);
    setMessages((current) => [...current, message]);
    await loadThreads();
  };

  const toggleClosed = async () => {
    if (!selectedThread) return;
    const nextStatus = selectedThread.status === "open" ? "closed" : "open";
    const { thread } = await updateAdminChatThreadApi(selectedThread.id, {
      status: nextStatus,
    });
    setSelectedThread(thread);
    await loadThreads();
  };

  const createThread = async () => {
    if (!newSessionId || !newBody.trim()) return;
    const { thread, message } = await createAdminChatThreadApi({
      sessionId: newSessionId,
      body: newBody.trim(),
      priority: newUrgent ? "urgent" : "normal",
      subject: "הודעה מהמנהל",
    });
    setSelectedThread(thread);
    setMessages(message ? [message] : []);
    setNewSessionId("");
    setNewBody("");
    setNewUrgent(false);
    await loadThreads();
  };

  if (hasAccess === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (hasAccess === false) {
    return null;
  }

  return (
    <div className="grid min-h-[calc(100dvh-9rem)] grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)_300px]">
      <Card className="border-border bg-card/70 p-3">
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש עובד, תחנה או עבודה"
              className="pr-9 text-right"
            />
          </div>
          <Button variant="outline" size="icon" onClick={() => void loadThreads()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {[
            ["open", "פתוחות"],
            ["all", "הכל"],
            ["closed", "סגורות"],
          ].map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={status === value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatus(value as typeof status)}
            >
              {label}
            </Button>
          ))}
          <Button
            type="button"
            variant={unreadOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setUnreadOnly((value) => !value)}
          >
            לא נקרא
          </Button>
        </div>
        {error ? <ChatErrorState onRetry={loadThreads} message={error} /> : null}
        <ConversationList
          threads={threads}
          selectedId={selectedThread?.id ?? null}
          onSelect={setSelectedThread}
          isLoading={isLoadingThreads}
        />
      </Card>

      <div className="flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-border bg-card/40">
        <MessageThread
          thread={selectedThread}
          messages={messages}
          isLoading={isLoadingMessages}
          mode="admin"
        />
        <MessageComposer
          disabled={!selectedThread || selectedThread.status === "closed"}
          placeholder={
            selectedThread?.status === "closed"
              ? "השיחה סגורה. פתח אותה כדי לשלוח הודעה."
              : "כתוב הודעה לעובד..."
          }
          onSend={send}
        />
      </div>

      <div className="space-y-3">
        <Card className="border-border bg-card/70 p-4">
          <h3 className="text-sm font-semibold text-foreground">הודעה חדשה</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            שליחה לעובד בסשן ייצור פעיל בלבד.
          </p>
          <div className="mt-3 space-y-3">
            <select
              value={newSessionId}
              onChange={(event) => setNewSessionId(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">בחר עובד פעיל</option>
              {activeSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.workerName} · {session.stationName} · {session.jobNumber}
                </option>
              ))}
            </select>
            <Textarea
              value={newBody}
              onChange={(event) => setNewBody(event.target.value)}
              placeholder="כתוב הודעה קצרה לעובד..."
              className="min-h-[86px] text-right"
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant={newUrgent ? "default" : "outline"}
                size="sm"
                onClick={() => setNewUrgent((value) => !value)}
              >
                דחוף
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!newSessionId || !newBody.trim()}
                onClick={() => void createThread()}
              >
                שלח
              </Button>
            </div>
          </div>
        </Card>
        <ContextPanel thread={selectedThread} />
        {selectedThread ? (
          <Card className="border-border bg-card/70 p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">פעולות</h3>
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => void markAdminChatThreadReadApi(selectedThread.id)}
              >
                <CheckCheck className="h-4 w-4" />
                סמן כנקרא
              </Button>
              <Button
                type="button"
                variant={selectedThread.status === "open" ? "outline" : "default"}
                className="w-full justify-start"
                onClick={() => void toggleClosed()}
              >
                {selectedThread.status === "open" ? "סגור שיחה" : "פתח מחדש"}
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export function WorkerChatSheet({ sessionId }: { sessionId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedThread, setSelectedThread] = useState<ChatThread | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = useMemo(
    () => threads.reduce((sum, thread) => sum + thread.unread_count, 0),
    [threads],
  );

  const loadThreads = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    setIsLoading(true);
    try {
      const { threads: data } = await fetchWorkerChatThreadsApi({ sessionId });
      setThreads(data);
      setSelectedThread((current) => {
        if (!current) return data[0] ?? null;
        return data.find((thread) => thread.id === current.id) ?? data[0] ?? null;
      });
    } catch (loadError) {
      setError(readableChatError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  const loadMessages = useCallback(async (thread: ChatThread | null) => {
    if (!thread) {
      setMessages([]);
      return;
    }
    const { messages: data } = await fetchWorkerChatMessagesApi(thread.id);
    setMessages(data);
    await markWorkerChatThreadReadApi(thread.id);
  }, []);

  useEffect(() => {
    if (open) void loadThreads();
  }, [open, loadThreads]);

  useEffect(() => {
    if (open) void loadMessages(selectedThread);
  }, [open, selectedThread, loadMessages]);

  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(() => {
      void loadThreads();
      if (open) void loadMessages(selectedThread);
    }, 5000);
    return () => clearInterval(interval);
  }, [sessionId, open, loadThreads, loadMessages, selectedThread]);

  const startThread = async () => {
    if (!sessionId || !newMessage.trim()) return;
    const { thread, message } = await createWorkerChatThreadApi({
      sessionId,
      body: newMessage.trim(),
      subject: "פנייה מהמפעיל",
    });
    setThreads((current) => [thread, ...current]);
    setSelectedThread(thread);
    setMessages(message ? [message] : []);
    setNewMessage("");
  };

  const send = async (body: string) => {
    if (!selectedThread) return;
    const { message } = await sendWorkerChatMessageApi(selectedThread.id, body);
    setMessages((current) => [...current, message]);
    await loadThreads();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="relative min-h-11 rounded-xl"
          disabled={!sessionId}
        >
          <MessageSquare className="h-4 w-4" />
          הודעות
          {unreadCount > 0 ? (
            <span className="absolute -left-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="h-[92dvh] max-h-[92dvh] p-0 sm:mx-auto sm:max-w-2xl sm:rounded-t-2xl"
        dir="rtl"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>הודעות מנהל</SheetTitle>
          <SheetDescription>
            התכתבות קצרה עם המנהל עבור הסשן הפעיל.
          </SheetDescription>
        </SheetHeader>

        <div className="grid h-[calc(92dvh-96px)] grid-cols-1 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)]">
          <div className="border-b border-border p-3 md:border-b-0 md:border-l">
            {error ? <ChatErrorState onRetry={loadThreads} message={error} /> : null}
            <ConversationList
              threads={threads}
              selectedId={selectedThread?.id ?? null}
              onSelect={setSelectedThread}
              isLoading={isLoading}
              variant="worker"
            />
            {!selectedThread ? (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={newMessage}
                  onChange={(event) => setNewMessage(event.target.value)}
                  placeholder="כתוב הודעה למנהל..."
                  className="min-h-[80px] text-right"
                />
                <Button
                  type="button"
                  className="w-full min-h-11"
                  disabled={!newMessage.trim() || !sessionId}
                  onClick={() => void startThread()}
                >
                  פתח שיחה
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-col">
            <MessageThread
              thread={selectedThread}
              messages={messages}
              isLoading={false}
              mode="worker"
            />
            <MessageComposer
              disabled={!selectedThread || selectedThread.status === "closed"}
              placeholder="כתוב תשובה למנהל..."
              onSend={send}
              quickReplies={QUICK_REPLIES}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
