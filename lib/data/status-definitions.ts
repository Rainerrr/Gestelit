import { isValidStatusColor } from "@/lib/status";
import { createServiceSupabase } from "@/lib/supabase/client";
import type { MachineState, StatusDefinition, StatusScope } from "@/lib/types";

type StatusDefinitionInput = {
  scope: StatusScope;
  station_id?: string | null;
  label_he: string;
  label_ru?: string | null;
  color_hex?: string;
  machine_state?: MachineState;
  requires_malfunction_report?: boolean;
};

// Protected status definitions - these cannot be edited or deleted
// They are identified by their Hebrew labels and have fixed configurations
type ProtectedStatusConfig = {
  label_he: string;
  label_ru: string;
  color_hex: string;
  machine_state: MachineState;
  requires_malfunction_report: boolean;
};

const PROTECTED_STATUSES: Record<string, ProtectedStatusConfig> = {
  other: {
    label_he: "אחר",
    label_ru: "Другое",
    color_hex: "#94a3b8",
    machine_state: "stoppage",
    requires_malfunction_report: false,
  },
  production: {
    label_he: "ייצור",
    label_ru: "Производство",
    color_hex: "#10b981",
    machine_state: "production",
    requires_malfunction_report: false,
  },
  malfunction: {
    label_he: "תקלה",
    label_ru: "Неисправность",
    color_hex: "#ef4444",
    machine_state: "stoppage",
    requires_malfunction_report: true,
  },
};

const PROTECTED_LABELS_HE = Object.values(PROTECTED_STATUSES).map(s => s.label_he);

function isProtectedStatus(labelHe: string): boolean {
  return PROTECTED_LABELS_HE.includes(labelHe);
}

function getProtectedStatusByLabel(labelHe: string): ProtectedStatusConfig | undefined {
  return Object.values(PROTECTED_STATUSES).find(s => s.label_he === labelHe);
}

const isValidHex = (value: string): boolean =>
  /^#([0-9a-fA-F]{6})$/.test(value.trim());

const VALID_MACHINE_STATES: MachineState[] = ["production", "setup", "stoppage"];

type NormalizedPayload = StatusDefinitionInput & {
  label_ru: string | null;
  color_hex: string;
  requires_malfunction_report: boolean;
};

const normalizePayload = (
  payload: StatusDefinitionInput,
  requireStation: boolean,
): NormalizedPayload => {
  const labelHe = payload.label_he.trim();
  if (!labelHe) {
    throw new Error("STATUS_LABEL_HE_REQUIRED");
  }
  const color = (payload.color_hex ?? "#94a3b8").trim().toLowerCase();
  if (!isValidHex(color) || !isValidStatusColor(color)) {
    throw new Error("STATUS_COLOR_INVALID_NOT_ALLOWED");
  }

  // Protected statuses can only be global, not station-scoped
  if (payload.scope === "station" && isProtectedStatus(labelHe)) {
    throw new Error("STATUS_PROTECTED_GLOBAL_ONLY");
  }

  if (requireStation && !payload.station_id) {
    throw new Error("STATUS_STATION_REQUIRED");
  }

  // Validate machine_state - default to 'production' if not set (for backward compatibility during migration)
  const machineState = payload.machine_state ?? "production";
  if (!VALID_MACHINE_STATES.includes(machineState)) {
    throw new Error("STATUS_MACHINE_STATE_INVALID");
  }

  return {
    ...payload,
    label_he: labelHe,
    label_ru: payload.label_ru?.trim() ?? null,
    color_hex: color,
    machine_state: machineState,
    requires_malfunction_report: payload.requires_malfunction_report ?? false,
  };
};

async function ensureGlobalOtherStatus(): Promise<StatusDefinition> {
  const supabase = createServiceSupabase();
  const otherConfig = PROTECTED_STATUSES.other;

  const { data: existing, error: fetchError } = await supabase
    .from("status_definitions")
    .select("*")
    .eq("scope", "global")
    .eq("label_he", otherConfig.label_he)
    .is("station_id", null)
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (existing) {
    return existing as StatusDefinition;
  }

  const { data: created, error: createError } = await supabase
    .from("status_definitions")
    .insert({
      scope: "global",
      station_id: null,
      label_he: otherConfig.label_he,
      label_ru: otherConfig.label_ru,
      color_hex: otherConfig.color_hex,
      machine_state: otherConfig.machine_state,
      requires_malfunction_report: otherConfig.requires_malfunction_report,
    })
    .select("*")
    .single();

  if (createError || !created) {
    throw new Error(createError?.message ?? "CREATE_OTHER_FAILED");
  }

  return created as StatusDefinition;
}

export async function fetchActiveStatusDefinitions(
  stationId?: string,
): Promise<StatusDefinition[]> {
  const supabase = createServiceSupabase();
  let query = supabase
    .from("status_definitions")
    .select("*")
    .order("created_at", { ascending: true });

  if (stationId) {
    query = query.or(
      `scope.eq.global,and(scope.eq.station,station_id.eq.${stationId})`,
    );
  } else {
    query = query.eq("scope", "global");
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return (data as StatusDefinition[]) ?? [];
}

export async function fetchStatusDefinitionsByStationIds(
  stationIds: string[],
): Promise<StatusDefinition[]> {
  const supabase = createServiceSupabase();
  let query = supabase
    .from("status_definitions")
    .select("*")
    .order("created_at", { ascending: true });

  if (stationIds.length > 0) {
    query = query.or(
      `scope.eq.global,and(scope.eq.station,station_id.in.(${stationIds.join(",")}))`,
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return (data as StatusDefinition[]) ?? [];
}

export async function createStatusDefinition(
  payload: StatusDefinitionInput,
): Promise<StatusDefinition> {
  const supabase = createServiceSupabase();
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "initial",
      hypothesisId: "H1",
      location: "lib/data/status-definitions.ts:createStatusDefinition:before",
      message: "create status request",
      data: { payload },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const body = normalizePayload(payload, payload.scope === "station");

  const { data, error } = await supabase
    .from("status_definitions")
    .insert(body)
    .select("*")
    .single();

  if (error || !data) {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "initial",
        hypothesisId: "H1",
        location: "lib/data/status-definitions.ts:createStatusDefinition:error",
        message: "create status failed",
        data: { error: error?.message, payload: body },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw new Error(error?.message ?? "CREATE_STATUS_FAILED");
  }

  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "initial",
      hypothesisId: "H1",
      location: "lib/data/status-definitions.ts:createStatusDefinition:success",
      message: "create status success",
      data: { id: (data as StatusDefinition).id, scope: (data as StatusDefinition).scope },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  return data as StatusDefinition;
}

export async function updateStatusDefinition(
  id: string,
  payload: Partial<StatusDefinitionInput>,
): Promise<StatusDefinition> {
  const supabase = createServiceSupabase();
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "initial",
      hypothesisId: "H2",
      location: "lib/data/status-definitions.ts:updateStatusDefinition:start",
      message: "update status request",
      data: { id, payload },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const { data: current, error: currentError } = await supabase
    .from("status_definitions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (currentError || !current) {
    throw new Error(currentError?.message ?? "STATUS_NOT_FOUND");
  }

  const currentStatus = current as StatusDefinition;

  // Protected statuses cannot be edited
  if (isProtectedStatus(currentStatus.label_he)) {
    throw new Error("STATUS_EDIT_FORBIDDEN_PROTECTED");
  }

  const normalized = normalizePayload(
    {
      ...(current as StatusDefinition),
      ...payload,
    },
    (payload.scope ?? (current as StatusDefinition).scope) === "station",
  );

  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "initial",
      hypothesisId: "H2",
      location: "lib/data/status-definitions.ts:updateStatusDefinition:normalized",
      message: "normalized payload",
      data: { id, normalized },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const { data, error } = await supabase
    .from("status_definitions")
    .update(normalized)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "initial",
        hypothesisId: "H2",
        location: "lib/data/status-definitions.ts:updateStatusDefinition:error",
        message: "update status failed",
        data: { id, error: error?.message, normalized },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw new Error(error?.message ?? "UPDATE_STATUS_FAILED");
  }

  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "initial",
      hypothesisId: "H2",
      location: "lib/data/status-definitions.ts:updateStatusDefinition:success",
      message: "update status success",
      data: { id, scope: (data as StatusDefinition).scope },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  return data as StatusDefinition;
}

export async function deleteStatusDefinition(id: string): Promise<void> {
  const supabase = createServiceSupabase();
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "initial",
      hypothesisId: "H3",
      location: "lib/data/status-definitions.ts:deleteStatusDefinition:start",
      message: "delete status request",
      data: { id },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const { data: target, error: fetchTargetError } = await supabase
    .from("status_definitions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchTargetError || !target) {
    throw new Error(fetchTargetError?.message ?? "STATUS_NOT_FOUND");
  }

  // Protected statuses cannot be deleted
  if (isProtectedStatus(target.label_he)) {
    throw new Error("STATUS_DELETE_FORBIDDEN_PROTECTED");
  }

  const fallback = await ensureGlobalOtherStatus();

  const fallbackId = fallback.id;

  const { error: reassignEventsError } = await supabase
    .from("status_events")
    .update({ status_definition_id: fallbackId })
    .eq("status_definition_id", id);

  if (reassignEventsError) {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "initial",
        hypothesisId: "H3",
        location: "lib/data/status-definitions.ts:deleteStatusDefinition:error",
        message: "delete status failed",
        data: { id, error: reassignEventsError.message, phase: "reassign_events" },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw new Error(reassignEventsError.message);
  }

  const { error: reassignSessionsError } = await supabase
    .from("sessions")
    .update({ current_status_id: fallbackId })
    .eq("current_status_id", id);

  if (reassignSessionsError) {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "initial",
        hypothesisId: "H3",
        location: "lib/data/status-definitions.ts:deleteStatusDefinition:error",
        message: "delete status failed",
        data: { id, error: reassignSessionsError.message, phase: "reassign_sessions" },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw new Error(reassignSessionsError.message);
  }

  const { error } = await supabase.from("status_definitions").delete().eq("id", id);
  if (error) {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "initial",
        hypothesisId: "H3",
        location: "lib/data/status-definitions.ts:deleteStatusDefinition:error",
        message: "delete status failed",
        data: { id, error: error.message, phase: "delete" },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw new Error(error.message);
  }
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "initial",
      hypothesisId: "H3",
      location: "lib/data/status-definitions.ts:deleteStatusDefinition:success",
      message: "delete status success",
      data: { id, reassignedTo: fallbackId },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

// Export for UI to check if a status is protected (non-editable/non-deletable)
export { isProtectedStatus, PROTECTED_LABELS_HE };
