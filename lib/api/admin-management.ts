import type { Job, Station, StatusDefinition, Worker } from "@/lib/types";
import type { StationWithStats, WorkerWithStats } from "@/lib/data/admin-management";
import type { JobWithStats } from "@/lib/data/jobs";
import type {
  ActiveSession,
  CompletedSession,
  SessionStatusEvent,
  JobThroughput,
} from "@/lib/data/admin-dashboard";
import type { LiveJobProgress } from "@/lib/types";
import { clearAdminLoggedIn } from "./auth-helpers";

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
  machine_state: StatusDefinition["machine_state"];
  report_type?: StatusDefinition["report_type"];
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

    // On 401, clear client-side admin state and redirect
    if (response.status === 401 || payload.error === "UNAUTHORIZED") {
      if (typeof window !== "undefined") {
        clearAdminLoggedIn();
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
 * Create request options for admin API calls
 * Uses credentials: "include" to send cookies automatically
 */
function createAdminRequestInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: "include", // Include cookies in requests
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  };
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

  const response = await fetch(
    `/api/admin/workers?${query.toString()}`,
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function createWorkerAdminApi(
  payload: WorkerPayload,
): Promise<{ worker: Worker }> {
  const response = await fetch(
    "/api/admin/workers",
    createAdminRequestInit({
      method: "POST",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function updateWorkerAdminApi(
  id: string,
  payload: WorkerUpdatePayload,
): Promise<{ worker: Worker }> {
  const response = await fetch(
    `/api/admin/workers/${id}`,
    createAdminRequestInit({
      method: "PUT",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function deleteWorkerAdminApi(
  id: string,
): Promise<{ ok: boolean }> {
  const response = await fetch(
    `/api/admin/workers/${id}`,
    createAdminRequestInit({ method: "DELETE" })
  );
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
  const response = await fetch(
    `/api/admin/stations${queryString ? `?${queryString}` : ""}`,
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function createStationAdminApi(
  payload: StationPayload,
): Promise<{ station: Station }> {
  const response = await fetch(
    "/api/admin/stations",
    createAdminRequestInit({
      method: "POST",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function updateStationAdminApi(
  id: string,
  payload: StationUpdatePayload,
): Promise<{ station: Station }> {
  const response = await fetch(
    `/api/admin/stations/${id}`,
    createAdminRequestInit({
      method: "PUT",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function deleteStationAdminApi(
  id: string,
): Promise<{ ok: boolean }> {
  const response = await fetch(
    `/api/admin/stations/${id}`,
    createAdminRequestInit({ method: "DELETE" })
  );
  return handleResponse(response);
}

export async function fetchWorkerAssignmentsAdminApi(workerId: string) {
  const response = await fetch(
    `/api/admin/worker-stations?workerId=${encodeURIComponent(workerId)}`,
    createAdminRequestInit()
  );
  return handleResponse<{ stations: Station[] }>(response);
}

export async function assignWorkerStationAdminApi(
  workerId: string,
  stationId: string,
): Promise<{ ok: boolean }> {
  const response = await fetch(
    "/api/admin/worker-stations",
    createAdminRequestInit({
      method: "POST",
      body: JSON.stringify({ workerId, stationId }),
    })
  );
  return handleResponse(response);
}

export async function removeWorkerStationAdminApi(
  workerId: string,
  stationId: string,
): Promise<{ ok: boolean }> {
  const response = await fetch(
    "/api/admin/worker-stations",
    createAdminRequestInit({
      method: "DELETE",
      body: JSON.stringify({ workerId, stationId }),
    })
  );
  return handleResponse(response);
}

export async function fetchDepartmentsAdminApi(): Promise<{
  departments: string[];
}> {
  const response = await fetch(
    "/api/admin/departments",
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function clearDepartmentAdminApi(department: string): Promise<{ ok: boolean }> {
  const response = await fetch(
    "/api/admin/departments",
    createAdminRequestInit({
      method: "DELETE",
      body: JSON.stringify({ department }),
    })
  );
  return handleResponse(response);
}

export async function fetchStationTypesAdminApi(): Promise<{
  stationTypes: string[];
}> {
  const response = await fetch(
    "/api/admin/station-types",
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function clearStationTypeAdminApi(stationType: string): Promise<{ ok: boolean }> {
  const response = await fetch(
    "/api/admin/station-types",
    createAdminRequestInit({
      method: "DELETE",
      body: JSON.stringify({ station_type: stationType }),
    })
  );
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
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function createStatusDefinitionAdminApi(
  payload: StatusDefinitionPayload,
): Promise<{ status: StatusDefinition }> {
  const response = await fetch(
    "/api/admin/status-definitions",
    createAdminRequestInit({
      method: "POST",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function updateStatusDefinitionAdminApi(
  id: string,
  payload: StatusDefinitionUpdatePayload,
): Promise<{ status: StatusDefinition }> {
  if (!id) {
    throw new Error("MISSING_STATUS_ID");
  }
  const response = await fetch(
    `/api/admin/status-definitions/${id}`,
    createAdminRequestInit({
      method: "PUT",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function deleteStatusDefinitionAdminApi(
  id: string,
): Promise<{ ok: boolean }> {
  if (!id) {
    throw new Error("MISSING_STATUS_ID");
  }
  const response = await fetch(
    `/api/admin/status-definitions/${id}`,
    createAdminRequestInit({ method: "DELETE" })
  );
  return handleResponse(response);
}

export async function checkWorkerActiveSessionAdminApi(
  workerId: string,
): Promise<{ hasActiveSession: boolean }> {
  const response = await fetch(
    `/api/admin/workers/${workerId}/active-session`,
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function checkStationActiveSessionAdminApi(
  stationId: string,
): Promise<{ hasActiveSession: boolean }> {
  const response = await fetch(
    `/api/admin/stations/${stationId}/active-session`,
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function changeAdminPasswordApi(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; message?: string }> {
  const response = await fetch(
    "/api/admin/auth/change-password",
    createAdminRequestInit({
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    })
  );
  return handleResponse(response);
}

// ============================================
// ADMIN DASHBOARD API FUNCTIONS
// ============================================

export async function fetchActiveSessionsAdminApi(): Promise<{
  sessions: ActiveSession[];
}> {
  const response = await fetch(
    "/api/admin/dashboard/active-sessions",
    createAdminRequestInit()
  );
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
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function fetchStatusEventsAdminApi(
  sessionIds: string[],
): Promise<{ events: SessionStatusEvent[] }> {
  const response = await fetch(
    "/api/admin/dashboard/status-events",
    createAdminRequestInit({
      method: "POST",
      body: JSON.stringify({ sessionIds }),
    })
  );
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
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function fetchJobProgressAdminApi(): Promise<{
  jobs: LiveJobProgress[];
}> {
  const response = await fetch(
    "/api/admin/dashboard/job-progress",
    createAdminRequestInit()
  );
  return handleResponse(response);
}

// ============================================
// JOBS MANAGEMENT API FUNCTIONS
// ============================================

type JobPayload = {
  job_number: string;
  customer_name?: string | null;
  description?: string | null;
  // planned_quantity removed - now set per job_item
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
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function createJobAdminApi(
  payload: JobPayload,
): Promise<{ job: Job }> {
  const response = await fetch(
    "/api/admin/jobs",
    createAdminRequestInit({
      method: "POST",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function updateJobAdminApi(
  id: string,
  payload: JobUpdatePayload,
): Promise<{ job: Job }> {
  const response = await fetch(
    `/api/admin/jobs/${id}`,
    createAdminRequestInit({
      method: "PUT",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function deleteJobAdminApi(id: string): Promise<{ ok: boolean }> {
  const response = await fetch(
    `/api/admin/jobs/${id}`,
    createAdminRequestInit({ method: "DELETE" })
  );
  return handleResponse(response);
}

export async function checkJobActiveSessionAdminApi(
  jobId: string,
): Promise<{ hasActiveSession: boolean }> {
  const response = await fetch(
    `/api/admin/jobs/${jobId}/active-session`,
    createAdminRequestInit()
  );
  return handleResponse(response);
}

// ============================================
// REPORTS API FUNCTIONS
// ============================================

import type {
  StationWithReports,
  StationWithArchivedReports,
  StationWithScrapReports,
} from "@/lib/data/reports";
import type { Report, ReportReason, ReportStatus, ReportWithDetails, ReportType } from "@/lib/types";

export type ReportCounts = {
  malfunction: number;
  general: number;
  scrap: number;
  total: number;
};

export async function fetchReportsCountsAdminApi(): Promise<{ counts: ReportCounts }> {
  const response = await fetch(
    "/api/admin/reports?countsOnly=true",
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function fetchMalfunctionReportsAdminApi(params?: {
  includeArchived?: boolean;
}): Promise<{
  stations: StationWithReports[];
  archived?: StationWithArchivedReports[];
}> {
  const query = new URLSearchParams();
  query.set("type", "malfunction");
  if (params?.includeArchived) query.set("includeArchived", "true");

  const response = await fetch(
    `/api/admin/reports?${query.toString()}`,
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function fetchGeneralReportsAdminApi(): Promise<{
  reports: ReportWithDetails[];
}> {
  const response = await fetch(
    "/api/admin/reports?type=general",
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function fetchScrapReportsAdminApi(): Promise<{
  stations: StationWithScrapReports[];
}> {
  const response = await fetch(
    "/api/admin/reports?type=scrap",
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function updateReportStatusAdminApi(
  id: string,
  status: ReportStatus,
  adminNotes?: string
): Promise<{ report: Report }> {
  const response = await fetch(
    `/api/admin/reports/${id}`,
    createAdminRequestInit({
      method: "PATCH",
      body: JSON.stringify({ status, adminNotes }),
    })
  );
  return handleResponse(response);
}

// Report Reasons Management
export async function fetchReportReasonsAdminApi(params?: {
  activeOnly?: boolean;
}): Promise<{ reasons: ReportReason[] }> {
  const query = new URLSearchParams();
  if (params?.activeOnly) query.set("activeOnly", "true");

  const queryString = query.toString();
  const response = await fetch(
    `/api/admin/reports/reasons${queryString ? `?${queryString}` : ""}`,
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function createReportReasonAdminApi(payload: {
  label_he: string;
  label_ru?: string | null;
  sort_order?: number;
}): Promise<{ reason: ReportReason }> {
  const response = await fetch(
    "/api/admin/reports/reasons",
    createAdminRequestInit({
      method: "POST",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function updateReportReasonAdminApi(
  id: string,
  payload: {
    label_he?: string;
    label_ru?: string | null;
    sort_order?: number;
    is_active?: boolean;
  }
): Promise<{ reason: ReportReason }> {
  const response = await fetch(
    `/api/admin/reports/reasons/${id}`,
    createAdminRequestInit({
      method: "PUT",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function deleteReportReasonAdminApi(id: string): Promise<{ success: boolean }> {
  const response = await fetch(
    `/api/admin/reports/reasons/${id}`,
    createAdminRequestInit({ method: "DELETE" })
  );
  return handleResponse(response);
}

// Fetch all reports data (for SSE fallback polling)
export async function fetchAllReportsAdminApi(): Promise<{
  general: ReportWithDetails[];
  malfunction: StationWithReports[];
  scrap: StationWithScrapReports[];
}> {
  const [generalRes, malfunctionRes, scrapRes] = await Promise.all([
    fetchGeneralReportsAdminApi(),
    fetchMalfunctionReportsAdminApi(),
    fetchScrapReportsAdminApi(),
  ]);

  return {
    general: generalRes.reports,
    malfunction: malfunctionRes.stations,
    scrap: scrapRes.stations,
  };
}

// ============================================
// JOB ITEMS MANAGEMENT API FUNCTIONS
// ============================================

import type {
  JobItemWithDetails,
  JobItem,
} from "@/lib/types";

/**
 * Post Phase 5: All job items are pipeline-based.
 * Provide either pipeline_preset_id or station_ids.
 */
type JobItemPayload = {
  name: string;  // Required product name
  pipeline_preset_id?: string | null;
  station_ids?: string[];  // Pipeline stations (required if no preset)
  planned_quantity: number;
  is_active?: boolean;
};

type JobItemUpdatePayload = {
  planned_quantity?: number;
  is_active?: boolean;
};

export async function fetchJobItemsAdminApi(
  jobId: string,
  params?: {
    includeProgress?: boolean;
    includeStations?: boolean;
    includeWipBalances?: boolean;
  }
): Promise<{ items: JobItemWithDetails[] }> {
  const query = new URLSearchParams();
  if (params?.includeProgress) query.set("includeProgress", "true");
  if (params?.includeStations) query.set("includeStations", "true");
  if (params?.includeWipBalances) query.set("includeWipBalances", "true");

  const queryString = query.toString();
  const response = await fetch(
    `/api/admin/jobs/${jobId}/items${queryString ? `?${queryString}` : ""}`,
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function createJobItemAdminApi(
  jobId: string,
  payload: JobItemPayload
): Promise<{ item: JobItemWithDetails }> {
  const response = await fetch(
    `/api/admin/jobs/${jobId}/items`,
    createAdminRequestInit({
      method: "POST",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function updateJobItemAdminApi(
  jobId: string,
  itemId: string,
  payload: JobItemUpdatePayload
): Promise<{ item: JobItem }> {
  const response = await fetch(
    `/api/admin/jobs/${jobId}/items/${itemId}`,
    createAdminRequestInit({
      method: "PUT",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function deleteJobItemAdminApi(
  jobId: string,
  itemId: string
): Promise<{ success: boolean }> {
  const response = await fetch(
    `/api/admin/jobs/${jobId}/items/${itemId}`,
    createAdminRequestInit({ method: "DELETE" })
  );
  return handleResponse(response);
}

// ============================================
// PIPELINE PRESETS MANAGEMENT API FUNCTIONS
// ============================================

import type {
  PipelinePreset,
  PipelinePresetStep,
  PipelinePresetWithSteps,
} from "@/lib/types";

type PipelinePresetPayload = {
  name: string;
  description?: string | null;
  is_active?: boolean;
  station_ids?: string[];
};

type PipelinePresetUpdatePayload = Partial<Omit<PipelinePresetPayload, "station_ids">>;

export async function fetchPipelinePresetsAdminApi(params?: {
  includeInactive?: boolean;
}): Promise<{ presets: PipelinePresetWithSteps[] }> {
  const query = new URLSearchParams();
  if (params?.includeInactive) query.set("includeInactive", "true");

  const queryString = query.toString();
  const response = await fetch(
    `/api/admin/pipeline-presets${queryString ? `?${queryString}` : ""}`,
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function getPipelinePresetAdminApi(
  id: string
): Promise<{ preset: PipelinePresetWithSteps }> {
  const response = await fetch(
    `/api/admin/pipeline-presets/${id}`,
    createAdminRequestInit()
  );
  return handleResponse(response);
}

export async function createPipelinePresetAdminApi(
  payload: PipelinePresetPayload
): Promise<{ preset: PipelinePresetWithSteps }> {
  const response = await fetch(
    "/api/admin/pipeline-presets",
    createAdminRequestInit({
      method: "POST",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function updatePipelinePresetAdminApi(
  id: string,
  payload: PipelinePresetUpdatePayload
): Promise<{ preset: PipelinePreset }> {
  const response = await fetch(
    `/api/admin/pipeline-presets/${id}`,
    createAdminRequestInit({
      method: "PUT",
      body: JSON.stringify(payload),
    })
  );
  return handleResponse(response);
}

export async function deletePipelinePresetAdminApi(
  id: string
): Promise<{ success: boolean }> {
  const response = await fetch(
    `/api/admin/pipeline-presets/${id}`,
    createAdminRequestInit({ method: "DELETE" })
  );
  return handleResponse(response);
}

export async function checkPipelinePresetInUseAdminApi(
  id: string
): Promise<{ inUse: boolean }> {
  const response = await fetch(
    `/api/admin/pipeline-presets/${id}?checkOnly=true`,
    createAdminRequestInit({ method: "DELETE" })
  );
  return handleResponse(response);
}

export async function updatePipelinePresetStepsAdminApi(
  presetId: string,
  stationIds: string[]
): Promise<{ steps: PipelinePresetStep[] }> {
  const response = await fetch(
    `/api/admin/pipeline-presets/${presetId}/steps`,
    createAdminRequestInit({
      method: "PUT",
      body: JSON.stringify({ station_ids: stationIds }),
    })
  );
  return handleResponse(response);
}

export async function fetchAvailableStationsForPresetAdminApi(): Promise<{
  stations: Station[];
}> {
  const response = await fetch(
    "/api/admin/pipeline-presets/available-stations",
    createAdminRequestInit()
  );
  return handleResponse(response);
}

