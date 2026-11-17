import { getWorkerCode } from "@/lib/api/auth-helpers";
import type { ChatMessage, ChatPriority, ChatThread, ChatThreadStatus } from "@/lib/data/chat";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload.message === "string"
          ? payload.message
          : typeof payload.error === "string"
        ? payload.error
          : "REQUEST_FAILED",
    );
  }
  return response.json();
}

const adminInit = (init?: RequestInit): RequestInit => ({
  ...init,
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    ...init?.headers,
  },
});

const workerInit = (init?: RequestInit): RequestInit => {
  const workerCode = getWorkerCode();
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(workerCode ? { "X-Worker-Code": workerCode } : {}),
      ...init?.headers,
    },
  };
};

export async function fetchAdminChatThreadsApi(params?: {
  q?: string;
  status?: ChatThreadStatus | "all";
  unreadOnly?: boolean;
}): Promise<{ threads: ChatThread[] }> {
  const query = new URLSearchParams();
  if (params?.q) query.set("q", params.q);
  if (params?.status) query.set("status", params.status);
  if (params?.unreadOnly) query.set("unread_only", "true");
  return handleResponse(
    await fetch(`/api/admin/chat/threads?${query.toString()}`, adminInit()),
  );
}

export async function createAdminChatThreadApi(payload: {
  sessionId: string;
  subject?: string | null;
  body?: string | null;
  priority?: ChatPriority;
}): Promise<{ thread: ChatThread; message: ChatMessage | null }> {
  return handleResponse(
    await fetch(
      "/api/admin/chat/threads",
      adminInit({ method: "POST", body: JSON.stringify(payload) }),
    ),
  );
}

export async function fetchAdminChatMessagesApi(
  threadId: string,
): Promise<{ messages: ChatMessage[] }> {
  return handleResponse(
    await fetch(`/api/admin/chat/threads/${threadId}/messages`, adminInit()),
  );
}

export async function sendAdminChatMessageApi(
  threadId: string,
  body: string,
): Promise<{ message: ChatMessage }> {
  return handleResponse(
    await fetch(
      `/api/admin/chat/threads/${threadId}/messages`,
      adminInit({
        method: "POST",
        body: JSON.stringify({
          body,
          clientMessageId: `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }),
      }),
    ),
  );
}

export async function markAdminChatThreadReadApi(threadId: string): Promise<{ ok: true }> {
  return handleResponse(
    await fetch(
      `/api/admin/chat/threads/${threadId}/read`,
      adminInit({ method: "PATCH", body: "{}" }),
    ),
  );
}

export async function updateAdminChatThreadApi(
  threadId: string,
  updates: { status?: ChatThreadStatus; priority?: ChatPriority },
): Promise<{ thread: ChatThread }> {
  return handleResponse(
    await fetch(
      `/api/admin/chat/threads/${threadId}`,
      adminInit({ method: "PATCH", body: JSON.stringify(updates) }),
    ),
  );
}

export async function fetchWorkerChatThreadsApi(params?: {
  sessionId?: string | null;
}): Promise<{ threads: ChatThread[] }> {
  const query = new URLSearchParams();
  if (params?.sessionId) query.set("sessionId", params.sessionId);
  return handleResponse(await fetch(`/api/chat/threads?${query.toString()}`, workerInit()));
}

export async function createWorkerChatThreadApi(payload: {
  sessionId: string;
  body: string;
  subject?: string | null;
}): Promise<{ thread: ChatThread; message: ChatMessage | null }> {
  return handleResponse(
    await fetch(
      "/api/chat/threads",
      workerInit({ method: "POST", body: JSON.stringify(payload) }),
    ),
  );
}

export async function fetchWorkerChatMessagesApi(
  threadId: string,
): Promise<{ messages: ChatMessage[] }> {
  return handleResponse(
    await fetch(`/api/chat/threads/${threadId}/messages`, workerInit()),
  );
}

export async function sendWorkerChatMessageApi(
  threadId: string,
  body: string,
): Promise<{ message: ChatMessage }> {
  return handleResponse(
    await fetch(
      `/api/chat/threads/${threadId}/messages`,
      workerInit({
        method: "POST",
        body: JSON.stringify({
          body,
          clientMessageId: `worker-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }),
      }),
    ),
  );
}

export async function markWorkerChatThreadReadApi(threadId: string): Promise<{ ok: true }> {
  return handleResponse(
    await fetch(
      `/api/chat/threads/${threadId}/read`,
      workerInit({ method: "PATCH", body: "{}" }),
    ),
  );
}
