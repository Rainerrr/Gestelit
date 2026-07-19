import type { SalesActivityInput } from "@/lib/data/sales-log";
import type { PendingBinaClientInput } from "@/lib/data/bina-client-onboarding";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.error === "string" ? payload.error : "REQUEST_FAILED");
  }
  return response.json();
}

function withParams(path: string, params?: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export async function loginSalesPortalApi(payload: { email: string; password: string }) {
  return handleResponse(await fetch("/api/sales/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

export async function fetchSalesPortalSessionApi() {
  return handleResponse(await fetch("/api/sales/auth/session", {
    credentials: "include",
  }));
}

export async function logoutSalesPortalApi() {
  return handleResponse(await fetch("/api/sales/auth/logout", {
    method: "POST",
    credentials: "include",
  }));
}

export async function fetchSalesPortalActivitiesApi(params?: {
  search?: string;
  limit?: number;
  offset?: number;
  eventType?: string;
  status?: string;
}) {
  return handleResponse(await fetch(withParams("/api/sales/activity", params), {
    credentials: "include",
  }));
}

export async function fetchSalesPortalClientsApi(params?: { search?: string; limit?: number }) {
  return handleResponse(await fetch(withParams("/api/sales/clients", params), {
    credentials: "include",
  }));
}

export async function fetchSalesClientIndexApi(params?: {
  search?: string;
  mine?: boolean;
  limit?: number;
  offset?: number;
}) {
  return handleResponse(await fetch(withParams("/api/sales/client-index", params), {
    credentials: "include",
  }));
}

export async function createSalesClientApi(payload: PendingBinaClientInput) {
  return handleResponse(await fetch("/api/sales/client-index", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

export async function summarizeSalesPortalNoteApi(payload: {
  rawNote: string;
  eventType?: string;
  customerName?: string;
}) {
  return handleResponse(await fetch("/api/sales/summarize", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

export async function createSalesPortalActivityApi(
  payload: Omit<SalesActivityInput, "salesperson">,
  attachments: File[],
) {
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (key === "metadata") {
      form.set(key, JSON.stringify(value));
      return;
    }
    form.set(key, String(value));
  });
  attachments.forEach((file) => form.append("attachments", file));

  return handleResponse(await fetch("/api/sales/activity", {
    method: "POST",
    credentials: "include",
    body: form,
  }));
}

export async function updateSalesPortalActivityApi(id: string, payload: Partial<SalesActivityInput>) {
  return handleResponse(await fetch(`/api/sales/activity/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}
