import { createServiceSupabase } from "@/lib/supabase/client";
import { ForbiddenError, NotFoundError } from "@/lib/auth/permissions";
import type { Worker } from "@/lib/types";

export type ChatSenderType = "admin" | "worker" | "system";
export type ChatThreadStatus = "open" | "closed";
export type ChatPriority = "normal" | "urgent";
export type ChatReaderType = "admin" | "worker";

export type ChatContextSnapshot = {
  workerName?: string | null;
  workerCode?: string | null;
  stationName?: string | null;
  stationCode?: string | null;
  jobNumber?: string | null;
  customerName?: string | null;
  jobItemName?: string | null;
  jobItemStepPosition?: number | null;
  currentStatusId?: string | null;
  currentStatusLabel?: string | null;
  sessionStartedAt?: string | null;
};

export type ChatThread = {
  id: string;
  worker_id: string;
  session_id: string | null;
  station_id: string | null;
  job_id: string | null;
  job_item_id: string | null;
  job_item_step_id: string | null;
  status: ChatThreadStatus;
  priority: ChatPriority;
  subject: string | null;
  context_snapshot: ChatContextSnapshot;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_type: ChatSenderType | null;
  created_by_type: ChatSenderType;
  created_by_worker_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  unread_count: number;
};

export type ChatMessage = {
  id: string;
  thread_id: string;
  sender_type: ChatSenderType;
  sender_worker_id: string | null;
  sender_label: string;
  body: string;
  message_kind: "text" | "system";
  client_message_id: string | null;
  created_at: string;
};

type ThreadRow = Omit<ChatThread, "unread_count">;

const ADMIN_READER_KEY = "admin";
const MAX_MESSAGE_LENGTH = 1000;
const DEFAULT_THREAD_LIMIT = 50;
const DEFAULT_MESSAGE_LIMIT = 80;

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
};

const throwChatStorageError = (operation: string, error: SupabaseLikeError): never => {
  console.error(`[chat] ${operation}`, error);
  if (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.message?.includes("Could not find the table") ||
    error.message?.includes("does not exist")
  ) {
    throw new Error("CHAT_SCHEMA_MISSING");
  }
  throw new Error("CHAT_STORAGE_FAILED");
};

const normalizeBody = (body: unknown): string => {
  if (typeof body !== "string") {
    throw new Error("CHAT_BODY_REQUIRED");
  }
  const value = body.trim();
  if (!value) {
    throw new Error("CHAT_BODY_REQUIRED");
  }
  if (value.length > MAX_MESSAGE_LENGTH) {
    throw new Error("CHAT_BODY_TOO_LONG");
  }
  return value;
};

const adminReader = () => ({
  readerKey: ADMIN_READER_KEY,
  readerType: "admin" as const,
  workerId: null,
});

const workerReader = (workerId: string) => ({
  readerKey: `worker:${workerId}`,
  readerType: "worker" as const,
  workerId,
});

async function enrichThreadsWithUnread(
  rows: ThreadRow[],
  readerKey: string,
): Promise<ChatThread[]> {
  if (rows.length === 0) return [];

  const supabase = createServiceSupabase();
  const ids = rows.map((row) => row.id);

  const [{ data: reads, error: readsError }, { data: messages, error: messagesError }] =
    await Promise.all([
      supabase
        .from("chat_thread_reads")
        .select("thread_id, last_read_at")
        .eq("reader_key", readerKey)
        .in("thread_id", ids),
      supabase
        .from("chat_messages")
        .select("thread_id, sender_type, created_at")
        .in("thread_id", ids)
        .is("deleted_at", null),
    ]);

  if (readsError) {
    throwChatStorageError("Failed to fetch read markers", readsError);
  }
  if (messagesError) {
    throwChatStorageError("Failed to fetch unread messages", messagesError);
  }

  const readMap = new Map<string, string>();
  for (const read of reads ?? []) {
    readMap.set(read.thread_id as string, read.last_read_at as string);
  }

  const unreadMap = new Map<string, number>();
  for (const message of messages ?? []) {
    const threadId = message.thread_id as string;
    const lastReadAt = readMap.get(threadId);
    const senderType = message.sender_type as ChatSenderType;
    const isOwnSender =
      readerKey === ADMIN_READER_KEY
        ? senderType === "admin"
        : senderType === "worker";
    if (isOwnSender) continue;
    if (lastReadAt && new Date(message.created_at as string) <= new Date(lastReadAt)) {
      continue;
    }
    unreadMap.set(threadId, (unreadMap.get(threadId) ?? 0) + 1);
  }

  return rows.map((row) => ({
    ...row,
    context_snapshot: (row.context_snapshot ?? {}) as ChatContextSnapshot,
    unread_count: unreadMap.get(row.id) ?? 0,
  }));
}

export async function listAdminChatThreads(options?: {
  q?: string | null;
  status?: ChatThreadStatus | "all" | null;
  unreadOnly?: boolean;
  limit?: number;
}): Promise<ChatThread[]> {
  const supabase = createServiceSupabase();
  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_THREAD_LIMIT, 1), 100);

  let query = supabase
    .from("chat_threads")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) {
    throwChatStorageError("Failed to list admin threads", error);
  }

  let threads = await enrichThreadsWithUnread((data ?? []) as ThreadRow[], ADMIN_READER_KEY);
  const q = options?.q?.trim().toLowerCase();
  if (q) {
    threads = threads.filter((thread) => {
      const snapshot = thread.context_snapshot;
      return [
        thread.subject,
        thread.last_message_preview,
        snapshot.workerName,
        snapshot.workerCode,
        snapshot.stationName,
        snapshot.stationCode,
        snapshot.jobNumber,
        snapshot.jobItemName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }
  if (options?.unreadOnly) {
    threads = threads.filter((thread) => thread.unread_count > 0);
  }
  return threads;
}

export async function listWorkerChatThreads(
  workerId: string,
  options?: { sessionId?: string | null; limit?: number },
): Promise<ChatThread[]> {
  const supabase = createServiceSupabase();
  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_THREAD_LIMIT, 1), 100);
  const reader = workerReader(workerId);

  let query = supabase
    .from("chat_threads")
    .select("*")
    .eq("worker_id", workerId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options?.sessionId) {
    query = query.eq("session_id", options.sessionId);
  }

  const { data, error } = await query;
  if (error) {
    throwChatStorageError("Failed to list worker threads", error);
  }

  return enrichThreadsWithUnread((data ?? []) as ThreadRow[], reader.readerKey);
}

export async function getChatThread(threadId: string): Promise<ChatThread> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("chat_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();

  if (error) {
    throwChatStorageError("Failed to fetch thread", error);
  }
  if (!data) {
    throw new NotFoundError("Chat thread not found");
  }

  const [thread] = await enrichThreadsWithUnread([data as ThreadRow], ADMIN_READER_KEY);
  return thread;
}

export async function assertWorkerThreadAccess(
  threadId: string,
  workerId: string,
): Promise<ChatThread> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("chat_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();

  if (error) {
    throwChatStorageError("Failed to assert worker thread access", error);
  }
  if (!data) {
    throw new NotFoundError("Chat thread not found");
  }
  if ((data as ThreadRow).worker_id !== workerId) {
    throw new ForbiddenError("Chat thread does not belong to worker");
  }

  const reader = workerReader(workerId);
  const [thread] = await enrichThreadsWithUnread([data as ThreadRow], reader.readerKey);
  return thread;
}

async function buildContextFromSession(sessionId: string): Promise<{
  workerId: string;
  sessionId: string;
  stationId: string | null;
  jobId: string | null;
  jobItemId: string | null;
  jobItemStepId: string | null;
  snapshot: ChatContextSnapshot;
}> {
  const supabase = createServiceSupabase();
  const { data: session, error } = await supabase
    .from("sessions")
    .select(`
      id,
      worker_id,
      station_id,
      job_id,
      job_item_id,
      job_item_step_id,
      current_status_id,
      started_at,
      workers:worker_id(id, full_name, worker_code),
      stations:station_id(id, name, code),
      jobs:job_id(id, job_number, customer_name),
      job_items:job_item_id(id, name),
      job_item_steps:job_item_step_id(id, position)
    `)
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    console.error("[chat] Failed to resolve session context", error);
    throw new Error("CHAT_CONTEXT_FAILED");
  }
  if (!session) {
    throw new NotFoundError("Session not found");
  }

  const row = session as unknown as {
    id: string;
    worker_id: string;
    station_id: string | null;
    job_id: string | null;
    job_item_id: string | null;
    job_item_step_id: string | null;
    current_status_id: string | null;
    started_at: string | null;
    workers: { full_name: string; worker_code: string } | { full_name: string; worker_code: string }[] | null;
    stations: { name: string; code: string } | { name: string; code: string }[] | null;
    jobs: { job_number: string; customer_name: string | null } | { job_number: string; customer_name: string | null }[] | null;
    job_items: { name: string } | { name: string }[] | null;
    job_item_steps: { position: number | null } | { position: number | null }[] | null;
  };

  const worker = Array.isArray(row.workers) ? row.workers[0] : row.workers;
  const station = Array.isArray(row.stations) ? row.stations[0] : row.stations;
  const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
  const jobItem = Array.isArray(row.job_items) ? row.job_items[0] : row.job_items;
  const jobItemStep = Array.isArray(row.job_item_steps) ? row.job_item_steps[0] : row.job_item_steps;

  let currentStatusLabel: string | null = null;
  if (row.current_status_id) {
    const { data: status } = await supabase
      .from("status_definitions")
      .select("label_he")
      .eq("id", row.current_status_id)
      .maybeSingle();
    currentStatusLabel = (status as { label_he?: string | null } | null)?.label_he ?? null;
  }

  return {
      workerId: row.worker_id,
    sessionId: row.id,
    stationId: row.station_id,
    jobId: row.job_id,
    jobItemId: row.job_item_id,
    jobItemStepId: row.job_item_step_id,
    snapshot: {
      workerName: worker?.full_name ?? null,
      workerCode: worker?.worker_code ?? null,
      stationName: station?.name ?? null,
      stationCode: station?.code ?? null,
      jobNumber: job?.job_number ?? null,
      customerName: job?.customer_name ?? null,
      jobItemName: jobItem?.name ?? null,
      jobItemStepPosition: jobItemStep?.position ?? null,
      currentStatusId: row.current_status_id,
      currentStatusLabel,
      sessionStartedAt: row.started_at,
    },
  };
}

async function createThreadFromSession(options: {
  sessionId: string;
  createdByType: ChatSenderType;
  createdByWorkerId?: string | null;
  subject?: string | null;
  priority?: ChatPriority;
  initialBody?: string | null;
  senderLabel: string;
  clientMessageId?: string | null;
}): Promise<{ thread: ChatThread; message: ChatMessage | null }> {
  const supabase = createServiceSupabase();
  const context = await buildContextFromSession(options.sessionId);

  if (options.createdByType === "worker" && options.createdByWorkerId !== context.workerId) {
    throw new ForbiddenError("Worker cannot create chat for another session");
  }

  const { data: threadRow, error: threadError } = await supabase
    .from("chat_threads")
    .insert({
      worker_id: context.workerId,
      session_id: context.sessionId,
      station_id: context.stationId,
      job_id: context.jobId,
      job_item_id: context.jobItemId,
      job_item_step_id: context.jobItemStepId,
      priority: options.priority ?? "normal",
      subject: options.subject?.trim() ? options.subject.trim().slice(0, 140) : null,
      context_snapshot: context.snapshot,
      created_by_type: options.createdByType,
      created_by_worker_id: options.createdByWorkerId ?? null,
    })
    .select("*")
    .single();

  if (threadError) {
    throwChatStorageError("Failed to create thread", threadError);
  }

  let message: ChatMessage | null = null;
  if (options.initialBody) {
    message = await createChatMessage({
      threadId: (threadRow as ThreadRow).id,
      senderType: options.createdByType,
      senderWorkerId: options.createdByWorkerId ?? null,
      senderLabel: options.senderLabel,
      body: options.initialBody,
      clientMessageId: options.clientMessageId ?? null,
    });
  }

  const [thread] = await enrichThreadsWithUnread(
    [threadRow as ThreadRow],
    options.createdByType === "worker"
      ? workerReader(context.workerId).readerKey
      : ADMIN_READER_KEY,
  );

  await markChatThreadRead({
    threadId: thread.id,
    readerType: options.createdByType === "worker" ? "worker" : "admin",
    workerId: options.createdByType === "worker" ? context.workerId : null,
  });

  return { thread, message };
}

export async function createAdminChatThread(payload: {
  sessionId: string;
  subject?: string | null;
  priority?: ChatPriority;
  body?: unknown;
  clientMessageId?: string | null;
}): Promise<{ thread: ChatThread; message: ChatMessage | null }> {
  return createThreadFromSession({
    sessionId: payload.sessionId,
    createdByType: "admin",
    senderLabel: "מנהל",
    subject: payload.subject ?? null,
    priority: payload.priority ?? "normal",
    initialBody: payload.body == null ? null : normalizeBody(payload.body),
    clientMessageId: payload.clientMessageId ?? null,
  });
}

export async function createWorkerChatThread(
  worker: Worker,
  payload: {
    sessionId: string;
    subject?: string | null;
    priority?: ChatPriority;
    body?: unknown;
    clientMessageId?: string | null;
  },
): Promise<{ thread: ChatThread; message: ChatMessage | null }> {
  return createThreadFromSession({
    sessionId: payload.sessionId,
    createdByType: "worker",
    createdByWorkerId: worker.id,
    senderLabel: worker.full_name,
    subject: payload.subject ?? null,
    priority: payload.priority ?? "normal",
    initialBody: payload.body == null ? null : normalizeBody(payload.body),
    clientMessageId: payload.clientMessageId ?? null,
  });
}

export async function listChatMessages(
  threadId: string,
  options?: { limit?: number; after?: string | null },
): Promise<ChatMessage[]> {
  const supabase = createServiceSupabase();
  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_MESSAGE_LIMIT, 1), 150);

  let query = supabase
    .from("chat_messages")
    .select("id, thread_id, sender_type, sender_worker_id, sender_label, body, message_kind, client_message_id, created_at")
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);

  if (options?.after) {
    query = query.gt("created_at", options.after);
  }

  const { data, error } = await query;
  if (error) {
    throwChatStorageError("Failed to list messages", error);
  }

  return (data ?? []) as ChatMessage[];
}

export async function createChatMessage(payload: {
  threadId: string;
  senderType: ChatSenderType;
  senderWorkerId?: string | null;
  senderLabel: string;
  body: unknown;
  clientMessageId?: string | null;
}): Promise<ChatMessage> {
  const supabase = createServiceSupabase();
  const body = normalizeBody(payload.body);

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: payload.threadId,
      sender_type: payload.senderType,
      sender_worker_id: payload.senderWorkerId ?? null,
      sender_label: payload.senderLabel,
      body,
      client_message_id: payload.clientMessageId ?? null,
    })
    .select("id, thread_id, sender_type, sender_worker_id, sender_label, body, message_kind, client_message_id, created_at")
    .single();

  if (error) {
    if (error.code === "23505" && payload.clientMessageId) {
      const { data: existing } = await supabase
        .from("chat_messages")
        .select("id, thread_id, sender_type, sender_worker_id, sender_label, body, message_kind, client_message_id, created_at")
        .eq("thread_id", payload.threadId)
        .eq("client_message_id", payload.clientMessageId)
        .maybeSingle();
      if (existing) return existing as ChatMessage;
    }
    throwChatStorageError("Failed to create message", error);
  }

  return data as ChatMessage;
}

export async function markChatThreadRead(payload: {
  threadId: string;
  readerType: ChatReaderType;
  workerId?: string | null;
}): Promise<void> {
  const supabase = createServiceSupabase();
  const reader =
    payload.readerType === "admin"
      ? adminReader()
      : workerReader(payload.workerId ?? "");

  if (payload.readerType === "worker" && !payload.workerId) {
    throw new Error("CHAT_WORKER_READER_REQUIRED");
  }

  const { error } = await supabase
    .from("chat_thread_reads")
    .upsert({
      thread_id: payload.threadId,
      reader_key: reader.readerKey,
      reader_type: reader.readerType,
      reader_worker_id: reader.workerId,
      last_read_at: new Date().toISOString(),
    }, {
      onConflict: "thread_id,reader_key",
    });

  if (error) {
    if (error.code === "23503") {
      return;
    }
    throwChatStorageError("Failed to mark read", error);
  }
}

export async function updateChatThread(
  threadId: string,
  updates: { status?: ChatThreadStatus; priority?: ChatPriority },
): Promise<ChatThread> {
  const supabase = createServiceSupabase();
  const patch: Record<string, unknown> = {};

  if (updates.status) {
    patch.status = updates.status;
    patch.closed_at = updates.status === "closed" ? new Date().toISOString() : null;
  }
  if (updates.priority) {
    patch.priority = updates.priority;
  }

  const { data, error } = await supabase
    .from("chat_threads")
    .update(patch)
    .eq("id", threadId)
    .select("*")
    .single();

  if (error) {
    throwChatStorageError("Failed to update thread", error);
  }

  const [thread] = await enrichThreadsWithUnread([data as ThreadRow], ADMIN_READER_KEY);
  return thread;
}
