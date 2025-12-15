import type {
  ChecklistKind,
  Job,
  Malfunction,
  Station,
  StationChecklist,
  StatusDefinition,
  StatusEventState,
  Session,
  SessionAbandonReason,
  Worker,
  WorkerResumeSession,
} from "@/lib/types";
import { getWorkerCode } from "./auth-helpers";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "REQUEST_FAILED");
  }
  return response.json();
}

/**
 * Create headers with worker authentication
 */
function createWorkerHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  
  const workerCode = getWorkerCode();
  if (workerCode) {
    headers["X-Worker-Code"] = workerCode;
  }
  
  return headers;
}

export async function loginWorkerApi(workerCode: string) {
  const response = await fetch("/api/workers/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerCode }),
  });
  const data = await handleResponse<{ worker: Worker }>(response);
  return data.worker;
}

export async function fetchWorkerActiveSessionApi(workerId: string) {
  try {
    const response = await fetch(
      `/api/workers/active-session?workerId=${encodeURIComponent(workerId)}`,
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.warn(
        "[api] Failed to fetch active session for worker",
        payload?.error ?? response.statusText,
      );
      return null;
    }

    return (payload as { session: WorkerResumeSession | null } | null)
      ?.session ?? null;
  } catch (error) {
    console.error("[api] Active session request failed", error);
    return null;
  }
}

export async function fetchStationsApi(workerId: string) {
  const response = await fetch(
    `/api/stations?workerId=${encodeURIComponent(workerId)}`,
    {
      headers: createWorkerHeaders(),
    },
  );
  const data = await handleResponse<{ stations: Station[] }>(response);
  return data.stations;
}

export async function createJobSessionApi(
  workerId: string,
  stationId: string,
  jobNumber: string,
) {
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: createWorkerHeaders(),
    body: JSON.stringify({ workerId, stationId, jobNumber }),
  });
  const data = await handleResponse<{ job: Job; session: Session }>(response);
  return data;
}

export async function fetchChecklistApi(
  stationId: string,
  kind: ChecklistKind,
) {
  const response = await fetch(
    `/api/checklists?stationId=${encodeURIComponent(stationId)}&kind=${kind}`,
  );
  const data = await handleResponse<{ checklist: StationChecklist | null }>(
    response,
  );
  return data.checklist;
}

type ChecklistResponseInput = {
  item_id: string;
  value_bool?: boolean;
  value_text?: string | null;
};

export async function submitChecklistResponsesApi(
  sessionId: string,
  stationId: string,
  kind: ChecklistKind,
  responses: ChecklistResponseInput[],
) {
  const response = await fetch("/api/checklists/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, stationId, kind, responses }),
  });
  const data = await handleResponse<{ ok: boolean; session?: Session }>(
    response,
  );
  return data;
}

export async function startStatusEventApi(options: {
  sessionId: string;
  statusDefinitionId: StatusEventState;
  stationReasonId?: string | null;
  note?: string | null;
  imageUrl?: string | null;
}) {
  const response = await fetch("/api/status-events", {
    method: "POST",
    headers: createWorkerHeaders(),
    body: JSON.stringify({
      sessionId: options.sessionId,
      statusDefinitionId: options.statusDefinitionId,
      stationReasonId: options.stationReasonId,
      note: options.note,
      imageUrl: options.imageUrl,
    }),
  });
  await handleResponse(response);
}

export async function fetchStationStatusesApi(
  stationId: string,
): Promise<StatusDefinition[]> {
  const response = await fetch(
    `/api/statuses?stationId=${encodeURIComponent(stationId)}`,
  );
  const data = await handleResponse<{ statuses: StatusDefinition[] }>(response);
  return data.statuses ?? [];
}

export async function updateSessionTotalsApi(
  sessionId: string,
  totals: { total_good?: number; total_scrap?: number },
) {
  const response = await fetch("/api/sessions/quantities", {
    method: "POST",
    headers: createWorkerHeaders(),
    body: JSON.stringify({ sessionId, ...totals }),
  });
  await handleResponse(response);
}

export async function completeSessionApi(sessionId: string) {
  const response = await fetch("/api/sessions/complete", {
    method: "POST",
    headers: createWorkerHeaders(),
    body: JSON.stringify({ sessionId }),
  });
  await handleResponse(response);
}

export async function abandonSessionApi(
  sessionId: string,
  reason: SessionAbandonReason = "worker_choice",
) {
  const response = await fetch("/api/sessions/abandon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, reason }),
  });
  await handleResponse(response);
}

export async function createMalfunctionApi(input: {
  stationId: string;
  stationReasonId?: string;
  description?: string;
  image?: File | null;
}): Promise<Malfunction> {
  const formData = new FormData();
  formData.append("stationId", input.stationId);
  if (input.stationReasonId) {
    formData.append("stationReasonId", input.stationReasonId);
  }
  if (input.description) {
    formData.append("description", input.description);
  }
  if (input.image) {
    formData.append("image", input.image);
  }

  const response = await fetch("/api/malfunctions", {
    method: "POST",
    body: formData,
  });
  const data = await handleResponse<{ malfunction: Malfunction }>(response);
  return data.malfunction;
}

