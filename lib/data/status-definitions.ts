import { isValidStatusColor, sortStatusDefinitions } from "@/lib/status";
import { createServiceSupabase } from "@/lib/supabase/client";
import type { MachineState, StatusDefinition, StatusScope, StatusReportType } from "@/lib/types";

type StatusDefinitionInput = {
  scope: StatusScope;
  station_id?: string | null;
  label_he: string;
  label_ru?: string | null;
  color_hex?: string;
  machine_state?: MachineState;
  report_type?: StatusReportType;
};

// Protected status definitions - these cannot be edited or deleted
// They are identified by the is_protected column in the database
type ProtectedStatusConfig = {
  label_he: string;
  label_ru: string;
  color_hex: string;
  machine_state: MachineState;
  report_type: StatusReportType;
};

const PROTECTED_STATUSES: Record<string, ProtectedStatusConfig> = {
  other: {
    label_he: "אחר",
    label_ru: "Другое",
    color_hex: "#94a3b8",
    machine_state: "stoppage",
    report_type: "none",
  },
  production: {
    label_he: "ייצור",
    label_ru: "Производство",
    color_hex: "#10b981",
    machine_state: "production",
    report_type: "none",
  },
  malfunction: {
    label_he: "תקלה",
    label_ru: "Неисправность",
    color_hex: "#ef4444",
    machine_state: "stoppage",
    report_type: "malfunction",
  },
  stop: {
    label_he: "עצירה",
    label_ru: "Остановка",
    color_hex: "#f97316",
    machine_state: "stoppage",
    report_type: "general", // Requires report when selected manually, but not when set as initial status
  },
};

const PROTECTED_LABELS_HE = Object.values(PROTECTED_STATUSES).map(s => s.label_he);

// Legacy function for backward compatibility - checks Hebrew labels
// Prefer using is_protected column from database when available
function isProtectedStatus(labelHe: string): boolean {
  return PROTECTED_LABELS_HE.includes(labelHe);
}

// Check if a status definition is protected using the database column
function isProtectedByColumn(status: StatusDefinition): boolean {
  return status.is_protected === true;
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
  report_type: StatusReportType;
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
    report_type: payload.report_type ?? "none",
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
      report_type: otherConfig.report_type,
      is_protected: true,
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
    .select("*");

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
  // Sort in code: stoppage → production → malfunction → global → station → other
  return sortStatusDefinitions((data as StatusDefinition[]) ?? []);
}

export async function fetchStatusDefinitionsByStationIds(
  stationIds: string[],
): Promise<StatusDefinition[]> {
  const supabase = createServiceSupabase();
  let query = supabase
    .from("status_definitions")
    .select("*");

  if (stationIds.length > 0) {
    query = query.or(
      `scope.eq.global,and(scope.eq.station,station_id.in.(${stationIds.join(",")}))`,
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  // Sort in code: stoppage → production → malfunction → global → station → other
  return sortStatusDefinitions((data as StatusDefinition[]) ?? []);
}

export async function createStatusDefinition(
  payload: StatusDefinitionInput,
): Promise<StatusDefinition> {
  const supabase = createServiceSupabase();
  const body = normalizePayload(payload, payload.scope === "station");

  const { data, error } = await supabase
    .from("status_definitions")
    .insert(body)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "CREATE_STATUS_FAILED");
  }

  return data as StatusDefinition;
}

export async function updateStatusDefinition(
  id: string,
  payload: Partial<StatusDefinitionInput>,
): Promise<StatusDefinition> {
  const supabase = createServiceSupabase();
  const { data: current, error: currentError } = await supabase
    .from("status_definitions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (currentError || !current) {
    throw new Error(currentError?.message ?? "STATUS_NOT_FOUND");
  }

  const currentStatus = current as StatusDefinition;

  // Protected statuses cannot be edited - check database column first, fall back to label check
  if (isProtectedByColumn(currentStatus) || isProtectedStatus(currentStatus.label_he)) {
    throw new Error("STATUS_EDIT_FORBIDDEN_PROTECTED");
  }

  const normalized = normalizePayload(
    {
      ...(current as StatusDefinition),
      ...payload,
    },
    (payload.scope ?? (current as StatusDefinition).scope) === "station",
  );

  const { data, error } = await supabase
    .from("status_definitions")
    .update(normalized)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "UPDATE_STATUS_FAILED");
  }

  return data as StatusDefinition;
}

export async function deleteStatusDefinition(id: string): Promise<void> {
  const supabase = createServiceSupabase();
  const { data: target, error: fetchTargetError } = await supabase
    .from("status_definitions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchTargetError || !target) {
    throw new Error(fetchTargetError?.message ?? "STATUS_NOT_FOUND");
  }

  const targetStatus = target as StatusDefinition;

  // Protected statuses cannot be deleted - check database column first, fall back to label check
  if (isProtectedByColumn(targetStatus) || isProtectedStatus(targetStatus.label_he)) {
    throw new Error("STATUS_DELETE_FORBIDDEN_PROTECTED");
  }

  const fallback = await ensureGlobalOtherStatus();
  const fallbackId = fallback.id;

  const { error: reassignEventsError } = await supabase
    .from("status_events")
    .update({ status_definition_id: fallbackId })
    .eq("status_definition_id", id);

  if (reassignEventsError) {
    throw new Error(reassignEventsError.message);
  }

  const { error: reassignSessionsError } = await supabase
    .from("sessions")
    .update({ current_status_id: fallbackId })
    .eq("current_status_id", id);

  if (reassignSessionsError) {
    throw new Error(reassignSessionsError.message);
  }

  const { error } = await supabase.from("status_definitions").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

// Export for UI to check if a status is protected (non-editable/non-deletable)
export { isProtectedStatus, PROTECTED_LABELS_HE };

// Stop status label for client-side checks (used as initial session status)
export const STOP_STATUS_LABEL_HE = PROTECTED_STATUSES.stop.label_he;

// Protected status keys for type-safe lookups
export type ProtectedStatusKey = keyof typeof PROTECTED_STATUSES;

/**
 * Get a protected status definition by its key.
 * Uses is_protected column for robust identification.
 */
export async function getProtectedStatusDefinition(
  key: ProtectedStatusKey,
): Promise<StatusDefinition> {
  const supabase = createServiceSupabase();
  const config = PROTECTED_STATUSES[key];

  const { data, error } = await supabase
    .from("status_definitions")
    .select("*")
    .eq("scope", "global")
    .eq("is_protected", true)
    .eq("label_he", config.label_he)
    .is("station_id", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch protected status '${key}': ${error.message}`);
  }

  if (!data) {
    throw new Error(`Protected status '${key}' not found in database`);
  }

  return data as StatusDefinition;
}
