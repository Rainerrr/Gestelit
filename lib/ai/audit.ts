import { createServiceSupabase } from "@/lib/supabase/client";

export async function createAiSession(params: {
  sessionId?: string | null;
  model: string;
  adminIdentity?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (params.sessionId) {
    return params.sessionId;
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .insert({
      model: params.model,
      admin_identity: params.adminIdentity ?? null,
      metadata: params.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) throw new Error(`AI_SESSION_CREATE_FAILED: ${error.message}`);
  return String(data.id);
}

export async function logAiMessage(params: {
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("ai_chat_messages")
    .insert({
      session_id: params.sessionId,
      role: params.role,
      content: params.content,
      metadata: params.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) throw new Error(`AI_MESSAGE_LOG_FAILED: ${error.message}`);
  return String(data.id);
}

export async function logAiToolCall(params: {
  sessionId: string;
  messageId?: string | null;
  toolName: string;
  params: Record<string, unknown>;
  rowCount?: number;
  durationMs?: number;
  errorCode?: string | null;
}) {
  const supabase = createServiceSupabase();
  await supabase.from("ai_tool_calls").insert({
    session_id: params.sessionId,
    message_id: params.messageId ?? null,
    tool_name: params.toolName,
    params: params.params,
    row_count: params.rowCount ?? 0,
    duration_ms: params.durationMs ?? null,
    error_code: params.errorCode ?? null,
  });
}

export async function logAiUsage(params: {
  sessionId: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}) {
  const supabase = createServiceSupabase();
  await supabase.from("ai_usage").insert({
    session_id: params.sessionId,
    model: params.model,
    input_tokens: params.inputTokens ?? 0,
    output_tokens: params.outputTokens ?? 0,
  });
}

export async function logAiSecurityEvent(params: {
  sessionId?: string | null;
  eventType: string;
  severity?: "info" | "warning" | "blocked";
  details?: Record<string, unknown>;
}) {
  const supabase = createServiceSupabase();
  await supabase.from("ai_security_events").insert({
    session_id: params.sessionId ?? null,
    event_type: params.eventType,
    severity: params.severity ?? "warning",
    details: params.details ?? {},
  });
}
