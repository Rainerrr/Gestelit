import type {
  ChecklistKind,
  Job,
  Reason,
  Station,
  StationChecklist,
  StatusEventState,
  Worker,
} from "@/lib/types";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "REQUEST_FAILED");
  }
  return response.json();
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

export async function fetchStationsApi(workerId: string) {
  const response = await fetch(
    `/api/stations?workerId=${encodeURIComponent(workerId)}`,
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId, stationId, jobNumber }),
  });
  const data = await handleResponse<{ job: Job; session: { id: string } }>(
    response,
  );
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
  await handleResponse<{ ok: boolean }>(response);
}

export async function startStatusEventApi(options: {
  sessionId: string;
  status: StatusEventState;
  reasonId?: string | null;
  note?: string | null;
  imageUrl?: string | null;
}) {
  const response = await fetch("/api/status-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: options.sessionId,
      status: options.status,
      reasonId: options.reasonId,
      note: options.note,
      imageUrl: options.imageUrl,
    }),
  });
  await handleResponse(response);
}

export async function updateSessionTotalsApi(
  sessionId: string,
  totals: { total_good?: number; total_scrap?: number },
) {
  const response = await fetch("/api/sessions/quantities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, ...totals }),
  });
  await handleResponse(response);
}

export async function completeSessionApi(sessionId: string) {
  const response = await fetch("/api/sessions/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  await handleResponse(response);
}

export async function fetchReasonsApi(type: string) {
  const response = await fetch(`/api/reasons?type=${type}`);
  const data = await handleResponse<{ reasons: Reason[] }>(response);
  return data.reasons;
}

