import type {
  ChecklistKind,
  Job,
  Report,
  ReportReason,
  ReportType,
  Station,
  StationChecklist,
  StatusDefinition,
  StatusEvent,
  StatusEventState,
  Session,
  SessionAbandonReason,
  Worker,
  WorkerResumeSession,
} from "@/lib/types";
import type { StationWithOccupancy } from "@/lib/data/stations";
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

export async function fetchStationsWithOccupancyApi(
  workerId: string,
): Promise<StationWithOccupancy[]> {
  const response = await fetch(
    `/api/stations/with-occupancy?workerId=${encodeURIComponent(workerId)}`,
    {
      headers: createWorkerHeaders(),
    },
  );
  return handleResponse<StationWithOccupancy[]>(response);
}

/**
 * Validate that a job exists in the database.
 * Returns the job if found, or exists: false if not.
 */
export async function validateJobApi(
  jobNumber: string,
): Promise<{ exists: boolean; job?: Job }> {
  const response = await fetch(
    `/api/jobs/validate?jobNumber=${encodeURIComponent(jobNumber)}`,
    {
      headers: createWorkerHeaders(),
    },
  );
  const data = await handleResponse<{ exists: boolean; job?: Job }>(response);
  return data;
}

/**
 * Create a new session with worker, station, and job.
 * Called after station selection when the job has already been selected.
 */
export async function createSessionApi(
  workerId: string,
  stationId: string,
  jobId: string,
  instanceId?: string,
): Promise<Session> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: createWorkerHeaders(),
    body: JSON.stringify({ workerId, stationId, jobId, instanceId }),
  });
  const data = await handleResponse<{ session: Session }>(response);
  return data.session;
}

/**
 * @deprecated Use getOrCreateJobApi + createSessionApi instead.
 * Legacy function that combines job lookup and session creation.
 */
export async function createJobSessionApi(
  workerId: string,
  stationId: string,
  jobNumber: string,
  instanceId?: string,
) {
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: createWorkerHeaders(),
    body: JSON.stringify({ workerId, stationId, jobNumber, instanceId }),
  });
  const data = await handleResponse<{ job: Job; session: Session }>(response);
  return data;
}

export async function takeoverSessionApi(
  sessionId: string,
  instanceId: string,
): Promise<{ success: boolean }> {
  const response = await fetch("/api/sessions/takeover", {
    method: "POST",
    headers: createWorkerHeaders(),
    body: JSON.stringify({ sessionId, instanceId }),
  });
  return handleResponse<{ success: boolean }>(response);
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
  reportId?: string | null;
}): Promise<StatusEvent> {
  const response = await fetch("/api/status-events", {
    method: "POST",
    headers: createWorkerHeaders(),
    body: JSON.stringify({
      sessionId: options.sessionId,
      statusDefinitionId: options.statusDefinitionId,
      stationReasonId: options.stationReasonId,
      note: options.note,
      imageUrl: options.imageUrl,
      reportId: options.reportId,
    }),
  });
  const data = await handleResponse<{ event: StatusEvent }>(response);
  return data.event;
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

export async function validateJobExistsApi(
  jobNumber: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/jobs/validate?jobNumber=${encodeURIComponent(jobNumber)}`,
    );
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return data.exists === true;
  } catch {
    return false;
  }
}

// Unified Reports API
export async function createReportApi(input: {
  type: ReportType;
  stationId?: string;
  sessionId?: string;
  stationReasonId?: string;
  reportReasonId?: string;
  description?: string;
  image?: File | null;
  workerId?: string;
  statusEventId?: string;
}): Promise<Report> {
  const formData = new FormData();
  formData.append("type", input.type);
  if (input.stationId) {
    formData.append("stationId", input.stationId);
  }
  if (input.sessionId) {
    formData.append("sessionId", input.sessionId);
  }
  if (input.stationReasonId) {
    formData.append("stationReasonId", input.stationReasonId);
  }
  if (input.reportReasonId) {
    formData.append("reportReasonId", input.reportReasonId);
  }
  if (input.description) {
    formData.append("description", input.description);
  }
  if (input.image) {
    formData.append("image", input.image);
  }
  if (input.workerId) {
    formData.append("workerId", input.workerId);
  }
  if (input.statusEventId) {
    formData.append("statusEventId", input.statusEventId);
  }

  const response = await fetch("/api/reports", {
    method: "POST",
    body: formData,
  });
  const data = await handleResponse<{ report: Report }>(response);
  return data.report;
}

export async function fetchReportReasonsApi(): Promise<ReportReason[]> {
  const response = await fetch("/api/reports/reasons");
  const data = await handleResponse<{ reasons: ReportReason[] }>(response);
  return data.reasons ?? [];
}

/**
 * Atomically creates a status event and report together.
 * If report creation fails, the status event is rolled back.
 */
export async function createStatusEventWithReportApi(input: {
  sessionId: string;
  statusDefinitionId: string;
  reportType: ReportType;
  stationId?: string;
  stationReasonId?: string;
  reportReasonId?: string;
  description?: string;
  image?: File | null;
  workerId?: string;
}): Promise<{ event: StatusEvent; report: Report }> {
  const formData = new FormData();
  formData.append("sessionId", input.sessionId);
  formData.append("statusDefinitionId", input.statusDefinitionId);
  formData.append("reportType", input.reportType);

  if (input.stationId) {
    formData.append("stationId", input.stationId);
  }
  if (input.stationReasonId) {
    formData.append("stationReasonId", input.stationReasonId);
  }
  if (input.reportReasonId) {
    formData.append("reportReasonId", input.reportReasonId);
  }
  if (input.description) {
    formData.append("description", input.description);
  }
  if (input.image) {
    formData.append("image", input.image);
  }
  if (input.workerId) {
    formData.append("workerId", input.workerId);
  }

  const response = await fetch("/api/status-events/with-report", {
    method: "POST",
    headers: {
      "X-Worker-Code": getWorkerCode() ?? "",
    },
    body: formData,
  });
  return handleResponse<{ event: StatusEvent; report: Report }>(response);
}

