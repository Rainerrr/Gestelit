import type { Station, Worker } from "@/lib/types";
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


