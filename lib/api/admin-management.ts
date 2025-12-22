import type { Job, Station, StatusDefinition, Worker } from "@/lib/types";
import type { StationWithStats, WorkerWithStats } from "@/lib/data/admin-management";
import type { JobWithStats } from "@/lib/data/jobs";
import type {
  ActiveSession,
  CompletedSession,
  SessionStatusEvent,
  JobThroughput,
} from "@/lib/data/admin-dashboard";
import { getAdminPassword } from "./auth-helpers";

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
    
    // If unauthorized, clear admin credentials
    if (response.status === 401 || payload.error === "UNAUTHORIZED") {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("adminPassword");
        window.localStorage.removeItem("isAdmin");
        // Redirect to home if we're on an admin page
        if (window.location.pathname.startsWith("/admin")) {
          window.location.href = "/";
        }
      }
    }
    
    throw new Error(message);
  }
  return response.json();
}

/**
 * Create headers with admin password
 */
function createAdminHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  
  const adminPassword = getAdminPassword();
  if (adminPassword) {
    headers["X-Admin-Password"] = adminPassword;
  }
  
  return headers;
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

  const response = await fetch(`/api/admin/workers?${query.toString()}`, {
    headers: createAdminHeaders(),
  });
  return handleResponse(response);
}

export async function createWorkerAdminApi(
  payload: WorkerPayload,
): Promise<{ worker: Worker }> {
  const response = await fetch("/api/admin/workers", {
    method: "POST",
    headers: createAdminHeaders(),
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
    headers: createAdminHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function deleteWorkerAdminApi(
  id: string,
): Promise<{ ok: boolean }> {
  const response = await fetch(`/api/admin/workers/${id}`, {
    method: "DELETE",
    headers: createAdminHeaders(),
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
  const response = await fetch(`/api/admin/stations${queryString ? `?${queryString}` : ""}`, {
    headers: createAdminHeaders(),
  });
  return handleResponse(response);
}

export async function createStationAdminApi(
  payload: StationPayload,
): Promise<{ station: Station }> {
  const response = await fetch("/api/admin/stations", {
    method: "POST",
    headers: createAdminHeaders(),
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
    headers: createAdminHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function deleteStationAdminApi(
  id: string,
): Promise<{ ok: boolean }> {
  const response = await fetch(`/api/admin/stations/${id}`, {
    method: "DELETE",
    headers: createAdminHeaders(),
  });
  return handleResponse(response);
}

export async function fetchWorkerAssignmentsAdminApi(workerId: string) {
  const response = await fetch(
    `/api/admin/worker-stations?workerId=${encodeURIComponent(workerId)}`,
    {
      headers: createAdminHeaders(),
    },
  );
  return handleResponse<{ stations: Station[] }>(response);
}

export async function assignWorkerStationAdminApi(
  workerId: string,
  stationId: string,
): Promise<{ ok: boolean }> {
  const response = await fetch("/api/admin/worker-stations", {
    method: "POST",
    headers: createAdminHeaders(),
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
    headers: createAdminHeaders(),
    body: JSON.stringify({ workerId, stationId }),
  });
  return handleResponse(response);
}

export async function fetchDepartmentsAdminApi(): Promise<{
  departments: string[];
}> {
  const response = await fetch("/api/admin/departments", {
    headers: createAdminHeaders(),
  });
  return handleResponse(response);
}

export async function clearDepartmentAdminApi(department: string): Promise<{ ok: boolean }> {
  const response = await fetch("/api/admin/departments", {
    method: "DELETE",
    headers: createAdminHeaders(),
    body: JSON.stringify({ department }),
  });
  return handleResponse(response);
}

export async function fetchStationTypesAdminApi(): Promise<{
  stationTypes: string[];
}> {
  const response = await fetch("/api/admin/station-types", {
    headers: createAdminHeaders(),
  });
  return handleResponse(response);
}

export async function clearStationTypeAdminApi(stationType: string): Promise<{ ok: boolean }> {
  const response = await fetch("/api/admin/station-types", {
    method: "DELETE",
    headers: createAdminHeaders(),
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
    {
      headers: createAdminHeaders(),
    },
  );
  return handleResponse(response);
}

export async function createStatusDefinitionAdminApi(
  payload: StatusDefinitionPayload,
): Promise<{ status: StatusDefinition }> {
  const response = await fetch("/api/admin/status-definitions", {
    method: "POST",
    headers: createAdminHeaders(),
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
    headers: createAdminHeaders(),
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
    headers: createAdminHeaders(),
  });
  return handleResponse(response);
}

export async function checkWorkerActiveSessionAdminApi(
  workerId: string,
): Promise<{ hasActiveSession: boolean }> {
  const response = await fetch(
    `/api/admin/workers/${workerId}/active-session`,
    {
      headers: createAdminHeaders(),
    },
  );
  return handleResponse(response);
}

export async function checkStationActiveSessionAdminApi(
  stationId: string,
): Promise<{ hasActiveSession: boolean }> {
  const response = await fetch(
    `/api/admin/stations/${stationId}/active-session`,
    {
      headers: createAdminHeaders(),
    },
  );
  return handleResponse(response);
}

export async function changeAdminPasswordApi(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; message?: string }> {
  const response = await fetch("/api/admin/auth/change-password", {
    method: "POST",
    headers: createAdminHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return handleResponse(response);
}

// ============================================
// ADMIN DASHBOARD API FUNCTIONS
// ============================================

export async function fetchActiveSessionsAdminApi(): Promise<{
  sessions: ActiveSession[];
}> {
  const response = await fetch("/api/admin/dashboard/active-sessions", {
    headers: createAdminHeaders(),
  });
  return handleResponse(response);
}

export async function fetchRecentSessionsAdminApi(params?: {
  workerId?: string;
  stationId?: string;
  jobNumber?: string;
  limit?: number;
}): Promise<{ sessions: CompletedSession[] }> {
  const query = new URLSearchParams();
  if (params?.workerId) query.set("workerId", params.workerId);
  if (params?.stationId) query.set("stationId", params.stationId);
  if (params?.jobNumber) query.set("jobNumber", params.jobNumber);
  if (params?.limit) query.set("limit", params.limit.toString());

  const response = await fetch(
    `/api/admin/dashboard/recent-sessions?${query.toString()}`,
    {
      headers: createAdminHeaders(),
    },
  );
  return handleResponse(response);
}

export async function fetchStatusEventsAdminApi(
  sessionIds: string[],
): Promise<{ events: SessionStatusEvent[] }> {
  const response = await fetch("/api/admin/dashboard/status-events", {
    method: "POST",
    headers: createAdminHeaders(),
    body: JSON.stringify({ sessionIds }),
  });
  return handleResponse(response);
}

export async function fetchMonthlyJobThroughputAdminApi(params: {
  year: number;
  month: number;
  workerId?: string;
  stationId?: string;
  jobNumber?: string;
}): Promise<{ throughput: JobThroughput[] }> {
  const query = new URLSearchParams();
  query.set("year", params.year.toString());
  query.set("month", params.month.toString());
  if (params.workerId) query.set("workerId", params.workerId);
  if (params.stationId) query.set("stationId", params.stationId);
  if (params.jobNumber) query.set("jobNumber", params.jobNumber);

  const response = await fetch(
    `/api/admin/dashboard/monthly-throughput?${query.toString()}`,
    {
      headers: createAdminHeaders(),
    },
  );
  return handleResponse(response);
}

// ============================================
// MALFUNCTIONS API FUNCTIONS
// ============================================

import type { StationWithMalfunctions } from "@/lib/data/malfunctions";
import type { Malfunction, MalfunctionStatus } from "@/lib/types";

export async function fetchMalfunctionsAdminApi(): Promise<{
  stations: StationWithMalfunctions[];
}> {
  const response = await fetch("/api/admin/malfunctions", {
    headers: createAdminHeaders(),
  });
  return handleResponse(response);
}

export async function updateMalfunctionStatusAdminApi(
  id: string,
  status: MalfunctionStatus,
  adminNotes?: string,
): Promise<{ malfunction: Malfunction }> {
  const response = await fetch(`/api/admin/malfunctions/${id}`, {
    method: "PATCH",
    headers: createAdminHeaders(),
    body: JSON.stringify({ status, adminNotes }),
  });
  return handleResponse(response);
}

export async function fetchOpenMalfunctionsCountApi(): Promise<{ count: number }> {
  const response = await fetch("/api/admin/malfunctions/count", {
    headers: createAdminHeaders(),
  });
  return handleResponse(response);
}

// ============================================
// JOBS MANAGEMENT API FUNCTIONS
// ============================================

type JobPayload = {
  job_number: string;
  customer_name?: string | null;
  description?: string | null;
  planned_quantity?: number | null;
};

type JobUpdatePayload = Partial<Omit<JobPayload, "job_number">>;

export async function fetchJobsAdminApi(params?: {
  search?: string;
  status?: "active" | "completed" | "all";
}): Promise<{ jobs: JobWithStats[] }> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.status) query.set("status", params.status);

  const queryString = query.toString();
  const response = await fetch(
    `/api/admin/jobs${queryString ? `?${queryString}` : ""}`,
    {
      headers: createAdminHeaders(),
    },
  );
  return handleResponse(response);
}

export async function createJobAdminApi(
  payload: JobPayload,
): Promise<{ job: Job }> {
  const response = await fetch("/api/admin/jobs", {
    method: "POST",
    headers: createAdminHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function updateJobAdminApi(
  id: string,
  payload: JobUpdatePayload,
): Promise<{ job: Job }> {
  const response = await fetch(`/api/admin/jobs/${id}`, {
    method: "PUT",
    headers: createAdminHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function deleteJobAdminApi(id: string): Promise<{ ok: boolean }> {
  const response = await fetch(`/api/admin/jobs/${id}`, {
    method: "DELETE",
    headers: createAdminHeaders(),
  });
  return handleResponse(response);
}

export async function checkJobActiveSessionAdminApi(
  jobId: string,
): Promise<{ hasActiveSession: boolean }> {
  const response = await fetch(`/api/admin/jobs/${jobId}/active-session`, {
    headers: createAdminHeaders(),
  });
  return handleResponse(response);
}


