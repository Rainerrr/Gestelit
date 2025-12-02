import { createServiceSupabase } from "@/lib/supabase/client";
import type {
  Session,
  SessionStatus,
  StatusEvent,
  StatusEventState,
} from "@/lib/types";

type SessionPayload = {
  worker_id: string;
  station_id: string;
  job_id: string;
  started_at?: string;
};

export async function createSession(
  payload: SessionPayload,
): Promise<Session> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      ...payload,
      status: "active" satisfies SessionStatus,
      started_at: payload.started_at ?? new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }

  return data as Session;
}

export async function completeSession(
  sessionId: string,
): Promise<Session> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("sessions")
    .update({
      status: "completed" satisfies SessionStatus,
      ended_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to complete session: ${error.message}`);
  }

  return data as Session;
}

type TotalsPayload = {
  total_good?: number;
  total_scrap?: number;
};

export async function updateSessionTotals(
  sessionId: string,
  totals: TotalsPayload,
): Promise<Session> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("sessions")
    .update(totals)
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update session totals: ${error.message}`);
  }

  return data as Session;
}

async function closeOpenStatusEvents(sessionId: string) {
  const supabase = createServiceSupabase();
  const { error } = await supabase
    .from("status_events")
    .update({ ended_at: new Date().toISOString() })
    .is("ended_at", null)
    .eq("session_id", sessionId);

  if (error) {
    throw new Error(`Failed to close open status events: ${error.message}`);
  }
}

type StatusEventPayload = {
  session_id: string;
  status: StatusEventState;
  reason_id?: string | null;
  note?: string | null;
  image_url?: string | null;
  started_at?: string;
};

export async function startStatusEvent(
  payload: StatusEventPayload,
): Promise<StatusEvent> {
  await closeOpenStatusEvents(payload.session_id);
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("status_events")
    .insert({
      ...payload,
      started_at: payload.started_at ?? new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create status event: ${error.message}`);
  }

  return data as StatusEvent;
}

