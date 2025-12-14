import { isValidStatusColor } from "@/lib/status";
import { createServiceSupabase } from "@/lib/supabase/client";
import type { StatusDefinition, StatusScope } from "@/lib/types";

type StatusDefinitionInput = {
  scope: StatusScope;
  station_id?: string | null;
  label_he: string;
  label_ru?: string | null;
  color_hex?: string;
};

const RESERVED_OTHER_LABEL_HE = "אחר";
const RESERVED_OTHER_LABEL_RU = "Другое";
const RESERVED_OTHER_COLOR = "#94a3b8";

const isValidHex = (value: string): boolean =>
  /^#([0-9a-fA-F]{6})$/.test(value.trim());

const normalizePayload = (
  payload: StatusDefinitionInput,
  requireStation: boolean,
): StatusDefinitionInput => {
  const labelHe = payload.label_he.trim();
  if (!labelHe) {
    throw new Error("STATUS_LABEL_HE_REQUIRED");
  }
  const color = (payload.color_hex ?? "#94a3b8").trim().toLowerCase();
  if (!isValidHex(color) || !isValidStatusColor(color)) {
    throw new Error("STATUS_COLOR_INVALID_NOT_ALLOWED");
  }

  if (payload.scope === "station" && payload.label_he.trim() === RESERVED_OTHER_LABEL_HE) {
    throw new Error("STATUS_OTHER_RESERVED_GLOBAL_ONLY");
  }

  if (requireStation && !payload.station_id) {
    throw new Error("STATUS_STATION_REQUIRED");
  }

  return {
    ...payload,
    label_he: labelHe,
    label_ru: payload.label_ru?.trim() ?? null,
    color_hex: color,
  };
};

async function ensureGlobalOtherStatus(): Promise<StatusDefinition> {
  const supabase = createServiceSupabase();
  const { data: existing, error: fetchError } = await supabase
    .from("status_definitions")
    .select("*")
    .eq("scope", "global")
    .eq("label_he", RESERVED_OTHER_LABEL_HE)
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
      label_he: RESERVED_OTHER_LABEL_HE,
      label_ru: RESERVED_OTHER_LABEL_RU,
      color_hex: RESERVED_OTHER_COLOR,
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

  if (target.label_he === RESERVED_OTHER_LABEL_HE) {
    throw new Error("STATUS_DELETE_FORBIDDEN_RESERVED");
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

