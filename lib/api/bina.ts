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

function withParams(path: string, params?: Record<string, string | number | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export async function fetchBinaOverviewApi() {
  return handleResponse(await fetch("/api/admin/bina/overview", adminInit()));
}

export async function fetchBinaWorkOrdersApi(params?: { search?: string; limit?: number; offset?: number }) {
  return handleResponse(await fetch(withParams("/api/admin/bina/work-orders", params), adminInit()));
}

export async function fetchBinaWorkOrderDetailApi(binaId: string) {
  return handleResponse(await fetch(`/api/admin/bina/work-orders/${encodeURIComponent(binaId)}`, adminInit()));
}

export async function importBinaWorkOrderApi(
  binaId: string,
  payload: {
    pipeline_preset_id?: string | null;
    station_ids?: string[];
    allowQuantityFallback?: boolean;
  },
) {
  return handleResponse(await fetch(`/api/admin/bina/work-orders/${encodeURIComponent(binaId)}/import`, adminInit({
    method: "POST",
    body: JSON.stringify(payload),
  })));
}

export async function fetchBinaPurchasingApi(params?: { search?: string; limit?: number; offset?: number }) {
  return handleResponse(await fetch(withParams("/api/admin/bina/purchasing", params), adminInit()));
}

export async function fetchBinaSuppliersApi(params?: { search?: string; limit?: number; offset?: number }) {
  return handleResponse(await fetch(withParams("/api/admin/bina/suppliers", params), adminInit()));
}

export async function fetchBinaFinanceApi(params?: { search?: string; limit?: number; offset?: number }) {
  return handleResponse(await fetch(withParams("/api/admin/bina/finance", params), adminInit()));
}

export async function fetchBinaSalesApi(params?: { search?: string; limit?: number; offset?: number }) {
  return handleResponse(await fetch(withParams("/api/admin/bina/sales", params), adminInit()));
}

export async function fetchBinaDeliveriesApi(params?: { search?: string; limit?: number; offset?: number }) {
  return handleResponse(await fetch(withParams("/api/admin/bina/deliveries", params), adminInit()));
}

export async function fetchBinaSyncStatusApi() {
  return handleResponse(await fetch("/api/admin/bina/sync-status", adminInit()));
}

export async function fetchBinaSavedQuestionsApi() {
  return handleResponse(await fetch("/api/admin/ai/saved-questions", adminInit()));
}

export async function sendBinaAiChatApi(payload: { message: string; sessionId?: string | null; context?: Record<string, unknown> }) {
  return handleResponse(await fetch("/api/admin/ai/chat", adminInit({
    method: "POST",
    body: JSON.stringify(payload),
  })));
}

export async function fetchBinaAiSessionsApi() {
  return handleResponse(await fetch("/api/admin/ai/sessions", adminInit()));
}

export async function fetchBinaAiSessionApi(id: string) {
  return handleResponse(await fetch(`/api/admin/ai/sessions/${encodeURIComponent(id)}`, adminInit()));
}
