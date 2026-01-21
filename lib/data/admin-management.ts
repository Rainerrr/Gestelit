import {
  GENERAL_STATION_REASON_ID,
  mergeStationReasonsWithDefault,
  validateUniqueLabels,
} from "@/lib/data/station-reasons";
import { createServiceSupabase } from "@/lib/supabase/client";
import type {
  Station,
  StationChecklistItem,
  StationReason,
  StationType,
  Worker,
} from "@/lib/types";

type WorkerRow = Worker & {
  worker_stations?: { count: number }[] | null;
  sessions?: { count: number }[] | null;
};

type StationRow = Station & {
  worker_stations?: { count: number }[] | null;
  sessions?: { count: number }[] | null;
};

export type WorkerWithStats = {
  worker: Worker;
  stationCount: number;
  sessionCount: number;
};

export type StationWithStats = {
  station: Station;
  workerCount: number;
  sessionCount: number;
};

export type AdminErrorCode =
  | "WORKER_NOT_FOUND"
  | "WORKER_CODE_EXISTS"
  | "WORKER_HAS_ACTIVE_SESSIONS"
  | "WORKER_CREATE_FAILED"
  | "WORKER_UPDATE_FAILED"
  | "WORKER_DELETE_FAILED"
  | "STATION_NOT_FOUND"
  | "STATION_CODE_EXISTS"
  | "STATION_HAS_ACTIVE_SESSIONS"
  | "STATION_DELETE_FAILED"
  | "ASSIGNMENT_EXISTS"
  | "ASSIGNMENT_CREATE_FAILED"
  | "ASSIGNMENT_DELETE_FAILED"
  | "ASSIGNMENT_NOT_FOUND"
  | "INVALID_PAYLOAD"
  | "UNKNOWN_ERROR";

export class AdminActionError extends Error {
  code: AdminErrorCode;
  status: number;
  details?: unknown;

  constructor(code: AdminErrorCode, status: number, message?: string, details?: unknown) {
    super(message ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type WorkerInput = {
  worker_code: string;
  full_name: string;
  role?: Worker["role"];
  department?: string | null;
  is_active?: boolean;
};

type WorkerUpdateInput = Partial<WorkerInput>;

type StationInput = {
  name: string;
  code: string;
  station_type: StationType;
  is_active?: boolean;
  station_reasons?: StationReason[] | null;
  start_checklist?: StationChecklistItem[] | null;
  end_checklist?: StationChecklistItem[] | null;
};

type StationUpdateInput = Partial<StationInput>;

const normalizeDepartment = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const prepareStationReasons = (
  reasons?: StationReason[] | null,
): StationReason[] => {
  const cleaned =
    reasons
      ?.map((reason) => ({
        ...reason,
        id: (reason.id ?? "").trim(),
        label_he: (reason.label_he ?? "").trim(),
        label_ru: (reason.label_ru ?? "").trim(),
        is_active: reason.is_active ?? true,
      }))
      .filter((reason) => reason.label_he && reason.label_ru) ?? [];

  const merged = mergeStationReasonsWithDefault(cleaned);
  validateUniqueLabels(
    merged.filter((reason) => reason.id !== GENERAL_STATION_REASON_ID),
  );
  return merged;
};

const generateChecklistId = () =>
  `chk-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const prepareChecklistItems = (
  list: StationChecklistItem[] | null | undefined,
  field: "start_checklist" | "end_checklist",
): StationChecklistItem[] | null | undefined => {
  if (list === undefined) return undefined;
  if (list === null) return null;
  if (!Array.isArray(list) || list.length === 0) {
    throwAdminError("INVALID_PAYLOAD", 400, `${field.toUpperCase()}_REQUIRED`);
  }
  const sorted = [...list].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  );

  const normalized = sorted.map((item, index) => ({
    id: (item.id ?? "").trim() || generateChecklistId(),
    order_index: index,
    label_he: (item.label_he ?? "").trim(),
    label_ru: (item.label_ru ?? "").trim(),
    is_required: true,
  }));

  const hasEmpty = normalized.some((item) => !item.label_he || !item.label_ru);
  if (hasEmpty) {
    throwAdminError("INVALID_PAYLOAD", 400, `${field.toUpperCase()}_LABELS_REQUIRED`);
  }

  return normalized.map((item, index) => ({ ...item, order_index: index }));
};

const throwAdminError = (
  code: AdminErrorCode,
  status: number,
  message?: string,
  details?: unknown,
): never => {
  throw new AdminActionError(code, status, message, details);
};

const ensureWorkerExists = async (id: string) => {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase.from("workers").select("*").eq("id", id).maybeSingle();
  if (error) {
    throwAdminError("UNKNOWN_ERROR", 500, error.message);
  }
  if (!data) {
    throwAdminError("WORKER_NOT_FOUND", 404);
  }
  return data as Worker;
};

const ensureStationExists = async (id: string) => {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase.from("stations").select("*").eq("id", id).maybeSingle();
  if (error) {
    throwAdminError("UNKNOWN_ERROR", 500, error.message);
  }
  if (!data) {
    throwAdminError("STATION_NOT_FOUND", 404);
  }
  const station = data as Station;
  return {
    ...station,
    station_reasons: mergeStationReasonsWithDefault(station.station_reasons),
  };
};

export async function fetchAllWorkers(options?: {
  department?: string | null;
  search?: string;
  startsWith?: string;
}): Promise<WorkerWithStats[]> {
  const supabase = createServiceSupabase();
  let query = supabase
    .from("workers")
    .select(
      "id, worker_code, full_name, role, department, is_active, created_at, updated_at, worker_stations(count), sessions(count)",
    )
    .order("full_name", { ascending: true });

  if (options?.department) {
    query = query.eq("department", options.department);
  }

  if (options?.search) {
    const term = options.search.trim();
    if (term.length > 0) {
      query = query.or(`full_name.ilike.%${term}%,worker_code.ilike.%${term}%`);
    }
  }

  if (options?.startsWith) {
    query = query.ilike("full_name", `${options.startsWith}%`);
  }

  const { data, error } = await query;

  if (error) {
    throwAdminError("UNKNOWN_ERROR", 500, error.message);
  }

  const rows = (data as WorkerRow[]) ?? [];

  return rows.map((row) => ({
    worker: {
      id: row.id,
      worker_code: row.worker_code,
      full_name: row.full_name,
      role: row.role,
      department: row.department ?? null,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    stationCount: row.worker_stations?.[0]?.count ?? 0,
    sessionCount: row.sessions?.[0]?.count ?? 0,
  }));
}

export async function fetchAllStations(options?: {
  stationType?: string | null;
  search?: string;
  startsWith?: string;
}): Promise<StationWithStats[]> {
  const supabase = createServiceSupabase();
  let query = supabase
    .from("stations")
    .select(
      "id, name, code, station_type, is_active, start_checklist, end_checklist, station_reasons, created_at, updated_at, worker_stations(count), sessions(count)",
    )
    .order("name", { ascending: true });

  if (options?.stationType) {
    query = query.eq("station_type", options.stationType);
  }

  if (options?.search) {
    const term = options.search.trim();
    if (term.length > 0) {
      query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
    }
  }

  if (options?.startsWith) {
    query = query.ilike("name", `${options.startsWith}%`);
  }

  const { data, error } = await query;

  if (error) {
    throwAdminError("UNKNOWN_ERROR", 500, error.message);
  }

  const rows = (data as StationRow[]) ?? [];

  return rows.map((row) => ({
    station: {
      id: row.id,
      name: row.name,
      code: row.code,
      station_type: row.station_type,
      is_active: row.is_active,
      start_checklist: row.start_checklist,
      end_checklist: row.end_checklist,
      station_reasons: mergeStationReasonsWithDefault(row.station_reasons),
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    workerCount: row.worker_stations?.[0]?.count ?? 0,
    sessionCount: row.sessions?.[0]?.count ?? 0,
  }));
}

export async function createWorker(payload: WorkerInput): Promise<Worker> {
  const supabase = createServiceSupabase();
  const workerCode = payload.worker_code.trim();
  const fullName = payload.full_name.trim();

  const { data: existing, error: uniqueError } = await supabase
    .from("workers")
    .select("id")
    .eq("worker_code", workerCode)
    .maybeSingle();

  if (uniqueError) {
    throwAdminError("UNKNOWN_ERROR", 500, uniqueError.message);
  }

  if (existing) {
    throwAdminError("WORKER_CODE_EXISTS", 409);
  }

  const { data, error } = await supabase
    .from("workers")
    .insert({
      worker_code: workerCode,
      full_name: fullName,
      role: payload.role ?? "worker",
      department: normalizeDepartment(payload.department),
      is_active: payload.is_active ?? true,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throwAdminError("WORKER_CREATE_FAILED", 500, error?.message);
  }

  return data as Worker;
}

export async function updateWorker(id: string, payload: WorkerUpdateInput): Promise<Worker> {
  const supabase = createServiceSupabase();
  const current = await ensureWorkerExists(id);

  if (payload.worker_code && payload.worker_code.trim() !== current.worker_code) {
    const { data: existing, error: uniqueError } = await supabase
      .from("workers")
      .select("id")
      .eq("worker_code", payload.worker_code.trim())
      .maybeSingle();

    if (uniqueError) {
      throwAdminError("UNKNOWN_ERROR", 500, uniqueError.message);
    }

    if (existing) {
      throwAdminError("WORKER_CODE_EXISTS", 409);
    }
  }

  const { data, error } = await supabase
    .from("workers")
    .update({
      worker_code: payload.worker_code?.trim() ?? current.worker_code,
      full_name: payload.full_name?.trim() ?? current.full_name,
      role: payload.role ?? current.role,
      department: normalizeDepartment(payload.department ?? current.department ?? null),
      is_active: payload.is_active ?? current.is_active,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throwAdminError("WORKER_UPDATE_FAILED", 500, error?.message);
  }

  return data as Worker;
}

export async function deleteWorker(id: string): Promise<void> {
  const supabase = createServiceSupabase();
  const worker = await ensureWorkerExists(id);

  const { count, error: sessionsError } = await supabase
    .from("sessions")
    .select("id", { head: true, count: "exact" })
    .eq("worker_id", id)
    .eq("status", "active");

  if (sessionsError) {
    throwAdminError("UNKNOWN_ERROR", 500, sessionsError.message);
  }

  if ((count ?? 0) > 0) {
    throwAdminError("WORKER_HAS_ACTIVE_SESSIONS", 409);
  }

  const { error: snapshotError } = await supabase
    .from("sessions")
    .update({
      worker_full_name_snapshot: worker.full_name,
      worker_code_snapshot: worker.worker_code,
    })
    .eq("worker_id", id)
    .is("worker_full_name_snapshot", null);

  if (snapshotError) {
    throwAdminError("UNKNOWN_ERROR", 500, snapshotError.message);
  }

  const { error: nullifyError } = await supabase.from("sessions").update({ worker_id: null }).eq("worker_id", id);
  if (nullifyError) {
    throwAdminError("UNKNOWN_ERROR", 500, nullifyError.message);
  }

  const { error: removeAssignmentsError } = await supabase.from("worker_stations").delete().eq("worker_id", id);
  if (removeAssignmentsError) {
    throwAdminError("WORKER_DELETE_FAILED", 500, removeAssignmentsError.message);
  }

  const { error } = await supabase.from("workers").delete().eq("id", id);
  if (error) {
    throwAdminError("WORKER_DELETE_FAILED", 500, error.message);
  }
}

export async function createStation(payload: StationInput): Promise<Station> {
  const supabase = createServiceSupabase();
  const code = payload.code.trim();
  const stationType = (payload.station_type ?? "other").trim() || "other";
  let stationReasons: StationReason[] = [];
  try {
    stationReasons = prepareStationReasons(payload.station_reasons);
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_REASONS";
    throwAdminError("INVALID_PAYLOAD", 400, message);
  }
  let startChecklist: StationChecklistItem[] | null | undefined;
  let endChecklist: StationChecklistItem[] | null | undefined;
  try {
    startChecklist = prepareChecklistItems(payload.start_checklist, "start_checklist");
    endChecklist = prepareChecklistItems(payload.end_checklist, "end_checklist");
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_CHECKLIST";
    throwAdminError("INVALID_PAYLOAD", 400, message);
  }

  const { data: existing, error: uniqueError } = await supabase
    .from("stations")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (uniqueError) {
    throwAdminError("UNKNOWN_ERROR", 500, uniqueError.message);
  }

  if (existing) {
    throwAdminError("STATION_CODE_EXISTS", 409);
  }

  const { data, error } = await supabase
    .from("stations")
    .insert({
      name: payload.name.trim(),
      code,
      station_type: stationType,
      is_active: payload.is_active ?? true,
      station_reasons: stationReasons,
      start_checklist: startChecklist ?? null,
      end_checklist: endChecklist ?? null,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throwAdminError("UNKNOWN_ERROR", 500, error?.message);
  }

  return data as Station;
}

export async function updateStation(id: string, payload: StationUpdateInput): Promise<Station> {
  const supabase = createServiceSupabase();
  const current = await ensureStationExists(id);
  const stationType =
    payload.station_type !== undefined
      ? (payload.station_type ?? "").trim() || "other"
      : current.station_type;
  let stationReasons =
    payload.station_reasons !== undefined
      ? payload.station_reasons
      : current.station_reasons;

  if (payload.station_reasons !== undefined) {
    try {
      stationReasons = prepareStationReasons(payload.station_reasons);
    } catch (error) {
      const message = error instanceof Error ? error.message : "INVALID_REASONS";
      throwAdminError("INVALID_PAYLOAD", 400, message);
    }
  }

  let startChecklist =
    payload.start_checklist !== undefined
      ? payload.start_checklist
      : current.start_checklist ?? null;
  let endChecklist =
    payload.end_checklist !== undefined ? payload.end_checklist : current.end_checklist ?? null;

  if (payload.start_checklist !== undefined) {
    startChecklist = prepareChecklistItems(payload.start_checklist, "start_checklist") ?? null;
  }

  if (payload.end_checklist !== undefined) {
    endChecklist = prepareChecklistItems(payload.end_checklist, "end_checklist") ?? null;
  }

  if (payload.code && payload.code.trim() !== current.code) {
    const { data: existing, error: uniqueError } = await supabase
      .from("stations")
      .select("id")
      .eq("code", payload.code.trim())
      .maybeSingle();

    if (uniqueError) {
      throwAdminError("UNKNOWN_ERROR", 500, uniqueError.message);
    }

    if (existing) {
      throwAdminError("STATION_CODE_EXISTS", 409);
    }
  }

  const { data, error } = await supabase
    .from("stations")
    .update({
      name: payload.name?.trim() ?? current.name,
      code: payload.code?.trim() ?? current.code,
      station_type: stationType,
      is_active: payload.is_active ?? current.is_active,
      station_reasons: stationReasons ?? [],
      start_checklist: startChecklist ?? null,
      end_checklist: endChecklist ?? null,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throwAdminError("UNKNOWN_ERROR", 500, error?.message);
  }

  return data as Station;
}

export async function deleteStation(id: string): Promise<void> {
  const supabase = createServiceSupabase();
  const station = await ensureStationExists(id);

  const { count, error: sessionsError } = await supabase
    .from("sessions")
    .select("id", { head: true, count: "exact" })
    .eq("station_id", id)
    .eq("status", "active");

  if (sessionsError) {
    throwAdminError("UNKNOWN_ERROR", 500, sessionsError.message);
  }

  if ((count ?? 0) > 0) {
    throwAdminError("STATION_HAS_ACTIVE_SESSIONS", 409);
  }

  const { error: snapshotError } = await supabase
    .from("sessions")
    .update({
      station_name_snapshot: station.name,
      station_code_snapshot: station.code,
    })
    .eq("station_id", id)
    .is("station_name_snapshot", null);

  if (snapshotError) {
    throwAdminError("UNKNOWN_ERROR", 500, snapshotError.message);
  }

  const { error: nullifyError } = await supabase.from("sessions").update({ station_id: null }).eq("station_id", id);
  if (nullifyError) {
    throwAdminError("UNKNOWN_ERROR", 500, nullifyError.message);
  }

  const { error: removeAssignmentsError } = await supabase.from("worker_stations").delete().eq("station_id", id);
  if (removeAssignmentsError) {
    throwAdminError("STATION_DELETE_FAILED", 500, removeAssignmentsError.message);
  }

  const { error } = await supabase.from("stations").delete().eq("id", id);
  if (error) {
    throwAdminError("STATION_DELETE_FAILED", 500, error.message);
  }
}

export async function fetchWorkerStationAssignments(workerId: string): Promise<Station[]> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("worker_stations")
    .select("station_id, stations(id, name, code, station_type, is_active)")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: true });

  if (error) {
    throwAdminError("UNKNOWN_ERROR", 500, error.message);
  }

  const rows = Array.isArray(data)
    ? ((data as unknown) as { stations: Station | null; station_id: string }[])
    : [];

  return rows
    .map((row) => row.stations)
    .filter(Boolean)
    .map((station) => station as Station);
}

export async function assignWorkerToStation(workerId: string, stationId: string): Promise<void> {
  const supabase = createServiceSupabase();
  const worker = await ensureWorkerExists(workerId);
  const station = await ensureStationExists(stationId);

  if (!worker.is_active) {
    throwAdminError("WORKER_NOT_FOUND", 404);
  }

  if (!station.is_active) {
    throwAdminError("STATION_NOT_FOUND", 404);
  }

  const { data: existing, error: existingError } = await supabase
    .from("worker_stations")
    .select("id")
    .eq("worker_id", workerId)
    .eq("station_id", stationId)
    .maybeSingle();

  if (existingError) {
    throwAdminError("UNKNOWN_ERROR", 500, existingError.message);
  }

  if (existing) {
    throwAdminError("ASSIGNMENT_EXISTS", 409);
  }

  const { error } = await supabase.from("worker_stations").insert({
    worker_id: workerId,
    station_id: stationId,
  });

  if (error) {
    throwAdminError("ASSIGNMENT_CREATE_FAILED", 500, error.message);
  }
}

export async function removeWorkerStation(workerId: string, stationId: string): Promise<void> {
  const supabase = createServiceSupabase();
  const { data: existing, error: lookupError } = await supabase
    .from("worker_stations")
    .select("id")
    .eq("worker_id", workerId)
    .eq("station_id", stationId)
    .maybeSingle();

  if (lookupError) {
    throwAdminError("UNKNOWN_ERROR", 500, lookupError.message);
  }

  if (!existing) {
    throwAdminError("ASSIGNMENT_NOT_FOUND", 404);
  }

  const { error } = await supabase
    .from("worker_stations")
    .delete()
    .eq("worker_id", workerId)
    .eq("station_id", stationId);

  if (error) {
    throwAdminError("ASSIGNMENT_DELETE_FAILED", 500, error.message);
  }
}

export async function fetchDepartmentList(): Promise<string[]> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("workers")
    .select("department")
    .not("department", "is", null)
    .order("department", { ascending: true });

  if (error) {
    throwAdminError("UNKNOWN_ERROR", 500, error.message);
  }

  const rows = (data as { department: string | null }[]) ?? [];
  const unique = Array.from(
    new Set(
      rows
        .map((row) => (row.department ? row.department.trim() : null))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  return unique;
}

export async function clearDepartment(department: string): Promise<void> {
  const supabase = createServiceSupabase();
  const { error } = await supabase.from("workers").update({ department: null }).eq("department", department);
  if (error) {
    throwAdminError("UNKNOWN_ERROR", 500, error.message);
  }
}

export async function fetchStationTypeList(): Promise<string[]> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("stations")
    .select("station_type")
    .not("station_type", "is", null)
    .order("station_type", { ascending: true });

  if (error) {
    throwAdminError("UNKNOWN_ERROR", 500, error.message);
  }

  const rows = (data as { station_type: string | null }[]) ?? [];
  const unique = Array.from(
    new Set(
      rows
        .map((row) => (row.station_type ? row.station_type.trim() : null))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  return unique;
}

export async function clearStationType(stationType: string): Promise<void> {
  const supabase = createServiceSupabase();
  const trimmed = stationType.trim();
  if (!trimmed) {
    throwAdminError("INVALID_PAYLOAD", 400, "INVALID_STATION_TYPE");
  }
  const { error } = await supabase
    .from("stations")
    .update({ station_type: "other" })
    .eq("station_type", trimmed);

  if (error) {
    throwAdminError("UNKNOWN_ERROR", 500, error.message);
  }
}
