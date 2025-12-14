import type { Station, StatusDefinition, Worker } from "@/lib/types";
import type { StationWithStats, WorkerWithStats } from "@/lib/data/admin-management";

type WorkerPayload = {
  worker_code: string;
  full_name: string;
  language?: string | null;
  role?: "worker" | "admin";
  department?: string | null;
  is_active?: boolean;
};

type StationPayload = {
  name: string;
  code: string;
  station_type: Station["station_type"];
  is_active?: boolean;
  station_reasons?: Station["station_reasons"];
  start_checklist?: Station["start_checklist"];
  end_checklist?: Station["end_checklist"];
};

type WorkerUpdatePayload = Partial<WorkerPayload>;
type StationUpdatePayload = Partial<StationPayload>;
type StatusDefinitionPayload = {
  scope: StatusDefinition["scope"];
  station_id?: string | null;
  label_he: string;
  label_ru?: string | null;
  color_hex: string;
};
type StatusDefinitionUpdatePayload = Partial<StatusDefinitionPayload>;

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.message === "string"
          ? payload.message
          : "REQUEST_FAILED";
    throw new Error(message);
  }
  return response.json();
}

export async function fetchWorkersAdminApi(params?: {
  department?: string | null;
  search?: string;
  startsWith?: string;
}): Promise<{ workers: WorkerWithStats[] }> {
  const query = new URLSearchParams();
  if (params?.department) query.set("department", params.department);
  if (params?.search) query.set("search", params.search);
  if (params?.startsWith) query.set("startsWith", params.startsWith);

  const response = await fetch(`/api/admin/workers?${query.toString()}`);
  return handleResponse(response);
}

export async function createWorkerAdminApi(
  payload: WorkerPayload,
): Promise<{ worker: Worker }> {
  const response = await fetch("/api/admin/workers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function updateWorkerAdminApi(
  id: string,
  payload: WorkerUpdatePayload,
): Promise<{ worker: Worker }> {
  const response = await fetch(`/api/admin/workers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function deleteWorkerAdminApi(
  id: string,
): Promise<{ ok: boolean }> {
  const response = await fetch(`/api/admin/workers/${id}`, {
    method: "DELETE",
  });
  return handleResponse(response);
}

export async function fetchStationsAdminApi(params?: {
  search?: string;
  stationType?: string | null;
  startsWith?: string;
}): Promise<{
  stations: StationWithStats[];
}> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.stationType) query.set("stationType", params.stationType);
  if (params?.startsWith) query.set("startsWith", params.startsWith);

  const queryString = query.toString();
  const response = await fetch(`/api/admin/stations${queryString ? `?${queryString}` : ""}`);
  return handleResponse(response);
}

export async function createStationAdminApi(
  payload: StationPayload,
): Promise<{ station: Station }> {
  const response = await fetch("/api/admin/stations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function updateStationAdminApi(
  id: string,
  payload: StationUpdatePayload,
): Promise<{ station: Station }> {
  const response = await fetch(`/api/admin/stations/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function deleteStationAdminApi(
  id: string,
): Promise<{ ok: boolean }> {
  const response = await fetch(`/api/admin/stations/${id}`, {
    method: "DELETE",
  });
  return handleResponse(response);
}

export async function fetchWorkerAssignmentsAdminApi(workerId: string) {
  const response = await fetch(
    `/api/admin/worker-stations?workerId=${encodeURIComponent(workerId)}`,
  );
  return handleResponse<{ stations: Station[] }>(response);
}

export async function assignWorkerStationAdminApi(
  workerId: string,
  stationId: string,
): Promise<{ ok: boolean }> {
  const response = await fetch("/api/admin/worker-stations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId, stationId }),
  });
  return handleResponse(response);
}

export async function removeWorkerStationAdminApi(
  workerId: string,
  stationId: string,
): Promise<{ ok: boolean }> {
  const response = await fetch("/api/admin/worker-stations", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId, stationId }),
  });
  return handleResponse(response);
}

export async function fetchDepartmentsAdminApi(): Promise<{
  departments: string[];
}> {
  const response = await fetch("/api/admin/departments");
  return handleResponse(response);
}

export async function clearDepartmentAdminApi(department: string): Promise<{ ok: boolean }> {
  const response = await fetch("/api/admin/departments", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ department }),
  });
  return handleResponse(response);
}

export async function fetchStationTypesAdminApi(): Promise<{
  stationTypes: string[];
}> {
  const response = await fetch("/api/admin/station-types");
  return handleResponse(response);
}

export async function clearStationTypeAdminApi(stationType: string): Promise<{ ok: boolean }> {
  const response = await fetch("/api/admin/station-types", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ station_type: stationType }),
  });
  return handleResponse(response);
}

export async function fetchStatusDefinitionsAdminApi(params?: {
  stationId?: string;
  stationIds?: string[];
  includeInactive?: boolean;
}): Promise<{ statuses: StatusDefinition[] }> {
  const query = new URLSearchParams();
  if (params?.stationId) query.set("stationId", params.stationId);
  if (params?.stationIds?.length) query.set("stationIds", params.stationIds.join(","));
  if (params?.includeInactive) query.set("includeInactive", "true");
  const qs = query.toString();
  const response = await fetch(
    `/api/admin/status-definitions${qs ? `?${qs}` : ""}`,
  );
  return handleResponse(response);
}

export async function createStatusDefinitionAdminApi(
  payload: StatusDefinitionPayload,
): Promise<{ status: StatusDefinition }> {
  const response = await fetch("/api/admin/status-definitions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function updateStatusDefinitionAdminApi(
  id: string,
  payload: StatusDefinitionUpdatePayload,
): Promise<{ status: StatusDefinition }> {
  if (!id) {
    throw new Error("MISSING_STATUS_ID");
  }
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "initial",
      hypothesisId: "H2",
      location: "lib/api/admin-management.ts:updateStatusDefinitionAdminApi:start",
      message: "api update status",
      data: { id, payload, url: `/api/admin/status-definitions/${id}` },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const response = await fetch(`/api/admin/status-definitions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function deleteStatusDefinitionAdminApi(
  id: string,
): Promise<{ ok: boolean }> {
  if (!id) {
    throw new Error("MISSING_STATUS_ID");
  }
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "initial",
      hypothesisId: "H3",
      location: "lib/api/admin-management.ts:deleteStatusDefinitionAdminApi:start",
      message: "api delete status",
      data: { id, url: `/api/admin/status-definitions/${id}` },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const response = await fetch(`/api/admin/status-definitions/${id}`, {
    method: "DELETE",
  });
  return handleResponse(response);
}


