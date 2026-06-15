import type { SalesActivityInput } from "@/lib/data/sales-log";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.error === "string" ? payload.error : "REQUEST_FAILED");
  }
  return response.json();
}

function adminInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  };
}

function withParams(path: string, params?: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export async function fetchSalesActivitiesApi(params?: {
  search?: string;
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
  salesperson?: string;
  eventType?: string;
  status?: string;
  nextActionFrom?: string;
  nextActionTo?: string;
}) {
  return handleResponse(await fetch(withParams("/api/admin/sales-daily-log", params), adminInit()));
}

export async function createSalesActivityApi(payload: SalesActivityInput) {
  return handleResponse(await fetch("/api/admin/sales-daily-log", adminInit({
    method: "POST",
    body: JSON.stringify(payload),
  })));
}

export async function updateSalesActivityApi(id: string, payload: Partial<SalesActivityInput>) {
  return handleResponse(await fetch(`/api/admin/sales-daily-log/${encodeURIComponent(id)}`, adminInit({
    method: "PATCH",
    body: JSON.stringify(payload),
  })));
}

export async function fetchSalesSummaryApi() {
  return handleResponse(await fetch("/api/admin/sales-daily-log/summary", adminInit()));
}

export async function fetchSalesClientsApi(params?: { search?: string; limit?: number }) {
  return handleResponse(await fetch(withParams("/api/admin/sales-daily-log/clients", params), adminInit()));
}

export async function summarizeSalesNoteApi(payload: {
  rawNote: string;
  eventType?: string;
  customerName?: string;
  salesperson?: string;
}) {
  return handleResponse(await fetch("/api/admin/sales-daily-log/summarize", adminInit({
    method: "POST",
    body: JSON.stringify(payload),
  })));
}
