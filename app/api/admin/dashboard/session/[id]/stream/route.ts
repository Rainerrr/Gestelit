import { NextResponse } from "next/server";
import type {
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
  RealtimePostgresDeletePayload,
} from "@supabase/supabase-js";
import {
  createErrorResponse,
  requireAdminPassword,
} from "@/lib/auth/permissions";
import { createServiceSupabase } from "@/lib/supabase/client";
import type {
  SessionStatus,
  StationType,
  StatusEventState,
  MalfunctionReportStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Types for realtime payloads
type SessionRow = {
  id: string;
  status: SessionStatus;
  current_status_id: StatusEventState | null;
  total_good: number;
  total_scrap: number;
  ended_at: string | null;
};

type StatusEventRow = {
  id: string;
  session_id: string;
  ended_at: string | null;
};

type ReportRow = {
  id: string;
  session_id: string;
  type: string;
  status: string;
};

// Export types for client consumption
export type SessionMalfunctionReport = {
  id: string;
  stationReasonId: string | null;
  description: string | null;
  imageUrl: string | null;
  status: MalfunctionReportStatus;
  createdAt: string;
  reporterName: string | null;
  reporterCode: string | null;
  statusEventId: string | null;
  statusEventStartedAt: string | null;
  statusEventEndedAt: string | null;
  statusDefinitionLabelHe: string | null;
  statusDefinitionColorHex: string | null;
};

export type SessionGeneralReport = {
  id: string;
  reportReasonId: string | null;
  reportReasonLabel: string | null;
  description: string | null;
  imageUrl: string | null;
  status: "new" | "approved";
  createdAt: string;
  reporterName: string | null;
  reporterCode: string | null;
  statusEventId: string | null;
  statusEventStartedAt: string | null;
  statusEventEndedAt: string | null;
  statusDefinitionLabelHe: string | null;
  statusDefinitionColorHex: string | null;
};

export type SessionDetailStream = {
  id: string;
  jobId: string;
  jobNumber: string;
  stationId: string | null;
  stationName: string;
  stationType: StationType | null;
  workerId: string;
  workerName: string;
  status: SessionStatus;
  currentStatus: StatusEventState | null;
  lastStatusChangeAt: string;
  startedAt: string;
  endedAt: string | null;
  totalGood: number;
  totalScrap: number;
  plannedQuantity: number | null;
  forcedClosedAt: string | null;
  durationSeconds: number;
  stoppageTimeSeconds: number;
  setupTimeSeconds: number;
  malfunctions: SessionMalfunctionReport[];
  generalReports: SessionGeneralReport[];
};

type StreamEvent =
  | { type: "initial"; data: SessionDetailStream }
  | { type: "update"; data: SessionDetailStream }
  | { type: "error"; message: string };

type RawSession = {
  id: string;
  worker_id: string | null;
  station_id: string | null;
  job_id: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  total_good: number;
  total_scrap: number;
  forced_closed_at: string | null;
  current_status_id?: StatusEventState | null;
  current_status_code?: StatusEventState | null;
  last_status_change_at: string | null;
  worker_full_name_snapshot: string | null;
  station_name_snapshot: string | null;
  jobs: { job_number: string | null; planned_quantity: number | null } | null;
  stations: { name: string | null; station_type: StationType | null } | null;
  workers: { full_name: string | null } | null;
};

const SESSION_SELECT = `
  id,
  worker_id,
  station_id,
  job_id,
  status,
  started_at,
  ended_at,
  total_good,
  total_scrap,
  current_status_id,
  last_status_change_at,
  forced_closed_at,
  worker_full_name_snapshot,
  station_name_snapshot,
  jobs:jobs(job_number, planned_quantity),
  stations:stations(name, station_type),
  workers:workers(full_name)
`;

const encoder = new TextEncoder();

const serialize = (payload: StreamEvent): Uint8Array =>
  encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

async function fetchSessionDetail(sessionId: string): Promise<SessionDetailStream | null> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) {
    console.error(`[session-stream] Failed to fetch session ${sessionId}`, error);
    return null;
  }

  const row = data as unknown as RawSession;

  const endedAt = row.ended_at;
  const endTime = endedAt ? new Date(endedAt).getTime() : Date.now();
  const startTime = new Date(row.started_at).getTime();
  const durationSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));

  // Calculate stoppage and setup time for this session using machine_state
  const { data: stoppageData } = await supabase
    .from("status_events")
    .select(`
      started_at,
      ended_at,
      status_definitions!inner(machine_state)
    `)
    .eq("session_id", sessionId)
    .eq("status_definitions.machine_state", "stoppage");

  const { data: setupData } = await supabase
    .from("status_events")
    .select(`
      started_at,
      ended_at,
      status_definitions!inner(machine_state)
    `)
    .eq("session_id", sessionId)
    .eq("status_definitions.machine_state", "setup");

  type MachineStateEventRow = {
    started_at: string;
    ended_at: string | null;
    status_definitions: { machine_state: string } | null;
  };

  const nowTs = Date.now();

  const calculateMachineStateTime = (rows: MachineStateEventRow[], state: string): number => {
    let totalSeconds = 0;
    rows.forEach((r) => {
      if (r.status_definitions?.machine_state !== state) {
        return;
      }
      const startTs = new Date(r.started_at).getTime();
      const endTs = r.ended_at
        ? new Date(r.ended_at).getTime()
        : nowTs;
      const durationMs = Math.max(0, endTs - startTs);
      totalSeconds += Math.floor(durationMs / 1000);
    });
    return totalSeconds;
  };

  const stoppageRows = (stoppageData as unknown as MachineStateEventRow[]) ?? [];
  const setupRows = (setupData as unknown as MachineStateEventRow[]) ?? [];
  const stoppageTimeSeconds = calculateMachineStateTime(stoppageRows, "stoppage");
  const setupTimeSeconds = calculateMachineStateTime(setupRows, "setup");

  // Fetch malfunction reports linked to this session
  type RawMalfunctionReport = {
    id: string;
    station_reason_id: string | null;
    description: string | null;
    image_url: string | null;
    status: MalfunctionReportStatus;
    created_at: string;
    status_event_id: string | null;
    workers: { full_name: string | null; worker_code: string | null } | null;
    status_events: {
      started_at: string;
      ended_at: string | null;
      status_definitions: { label_he: string | null; color_hex: string | null } | null;
    } | null;
  };

  const { data: malfunctionsData } = await supabase
    .from("reports")
    .select(`
      id,
      station_reason_id,
      description,
      image_url,
      status,
      created_at,
      status_event_id,
      workers:reported_by_worker_id(full_name, worker_code),
      status_events:status_event_id(started_at, ended_at, status_definitions(label_he, color_hex))
    `)
    .eq("session_id", sessionId)
    .eq("type", "malfunction")
    .order("created_at", { ascending: false });

  const malfunctions: SessionMalfunctionReport[] = (
    (malfunctionsData as unknown as RawMalfunctionReport[]) ?? []
  ).map((m) => ({
    id: m.id,
    stationReasonId: m.station_reason_id,
    description: m.description,
    imageUrl: m.image_url,
    status: m.status,
    createdAt: m.created_at,
    reporterName: m.workers?.full_name ?? null,
    reporterCode: m.workers?.worker_code ?? null,
    statusEventId: m.status_event_id,
    statusEventStartedAt: m.status_events?.started_at ?? null,
    statusEventEndedAt: m.status_events?.ended_at ?? null,
    statusDefinitionLabelHe: m.status_events?.status_definitions?.label_he ?? null,
    statusDefinitionColorHex: m.status_events?.status_definitions?.color_hex ?? null,
  }));

  // Fetch general reports linked to this session
  type RawGeneralReport = {
    id: string;
    report_reason_id: string | null;
    description: string | null;
    image_url: string | null;
    status: "new" | "approved";
    created_at: string;
    status_event_id: string | null;
    workers: { full_name: string | null; worker_code: string | null } | null;
    report_reasons: { label_he: string | null } | null;
    status_events: {
      started_at: string;
      ended_at: string | null;
      status_definitions: { label_he: string | null; color_hex: string | null } | null;
    } | null;
  };

  const { data: generalReportsData } = await supabase
    .from("reports")
    .select(`
      id,
      report_reason_id,
      description,
      image_url,
      status,
      created_at,
      status_event_id,
      workers:reported_by_worker_id(full_name, worker_code),
      report_reasons:report_reason_id(label_he),
      status_events:status_event_id(started_at, ended_at, status_definitions(label_he, color_hex))
    `)
    .eq("session_id", sessionId)
    .eq("type", "general")
    .order("created_at", { ascending: false });

  const generalReports: SessionGeneralReport[] = (
    (generalReportsData as unknown as RawGeneralReport[]) ?? []
  ).map((r) => ({
    id: r.id,
    reportReasonId: r.report_reason_id,
    reportReasonLabel: r.report_reasons?.label_he ?? null,
    description: r.description,
    imageUrl: r.image_url,
    status: r.status,
    createdAt: r.created_at,
    reporterName: r.workers?.full_name ?? null,
    reporterCode: r.workers?.worker_code ?? null,
    statusEventId: r.status_event_id,
    statusEventStartedAt: r.status_events?.started_at ?? null,
    statusEventEndedAt: r.status_events?.ended_at ?? null,
    statusDefinitionLabelHe: r.status_events?.status_definitions?.label_he ?? null,
    statusDefinitionColorHex: r.status_events?.status_definitions?.color_hex ?? null,
  }));

  return {
    id: row.id,
    jobId: row.job_id,
    jobNumber: row.jobs?.job_number ?? "לא ידוע",
    stationId: row.station_id ?? null,
    stationName: row.stations?.name ?? row.station_name_snapshot ?? "לא משויך",
    stationType: row.stations?.station_type ?? null,
    workerId: row.worker_id ?? "",
    workerName: row.workers?.full_name ?? row.worker_full_name_snapshot ?? "לא משויך",
    status: row.status,
    currentStatus: row.current_status_id ?? row.current_status_code ?? null,
    lastStatusChangeAt: row.last_status_change_at ?? row.started_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totalGood: row.total_good ?? 0,
    totalScrap: row.total_scrap ?? 0,
    plannedQuantity: row.jobs?.planned_quantity ?? null,
    forcedClosedAt: row.forced_closed_at,
    durationSeconds,
    stoppageTimeSeconds,
    setupTimeSeconds,
    malfunctions,
    generalReports,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id: sessionId } = await params;

  if (!sessionId) {
    return NextResponse.json(
      { error: "SESSION_ID_REQUIRED" },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabase();
  let sessionsChannel: ReturnType<typeof supabase.channel> | null = null;
  let statusEventsChannel: ReturnType<typeof supabase.channel> | null = null;
  let reportsChannel: ReturnType<typeof supabase.channel> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let isClosing = false;
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: StreamEvent) => controller.enqueue(serialize(payload));
      const sendError = (message: string) =>
        controller.enqueue(serialize({ type: "error", message }));

      const clearHeartbeat = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
      };

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 25_000);

      const closeChannels = async () => {
        if (isClosing) return;
        isClosing = true;
        clearHeartbeat();
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
          debounceTimeout = null;
        }

        const channels = [sessionsChannel, statusEventsChannel, reportsChannel];
        sessionsChannel = null;
        statusEventsChannel = null;
        reportsChannel = null;

        try {
          for (const ch of channels) {
            if (ch) await supabase.removeChannel(ch);
          }
        } catch (error) {
          console.error("[session-stream] Failed to remove realtime channels", error);
        }

        try {
          controller.close();
        } catch {
          // no-op
        }
      };

      request.signal.addEventListener("abort", () => {
        void closeChannels();
      });

      // Send initial data
      try {
        const data = await fetchSessionDetail(sessionId);
        if (!data) {
          sendError("SESSION_NOT_FOUND");
          void closeChannels();
          return;
        }
        send({ type: "initial", data });
      } catch (error) {
        console.error("[session-stream] Failed to fetch initial session", error);
        sendError("INITIAL_FETCH_FAILED");
        void closeChannels();
        return;
      }

      // Debounced refetch - when any change happens, wait 100ms then refetch all
      const scheduleRefetch = () => {
        if (isClosing) return;
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }
        debounceTimeout = setTimeout(async () => {
          debounceTimeout = null;
          if (isClosing) return;
          try {
            const data = await fetchSessionDetail(sessionId);
            if (data) {
              send({ type: "update", data });
            }
          } catch (error) {
            console.error("[session-stream] Failed to refetch session", error);
            sendError("REFETCH_FAILED");
          }
        }, 100);
      };

      // Handle changes to sessions table
      const handleSessionChange = (
        _payload:
          | RealtimePostgresInsertPayload<SessionRow>
          | RealtimePostgresUpdatePayload<SessionRow>
          | RealtimePostgresDeletePayload<SessionRow>
      ) => {
        scheduleRefetch();
      };

      // Handle changes to status_events table
      const handleStatusEventChange = (
        _payload:
          | RealtimePostgresInsertPayload<StatusEventRow>
          | RealtimePostgresUpdatePayload<StatusEventRow>
          | RealtimePostgresDeletePayload<StatusEventRow>
      ) => {
        scheduleRefetch();
      };

      // Handle changes to reports table
      const handleReportChange = (
        _payload:
          | RealtimePostgresInsertPayload<ReportRow>
          | RealtimePostgresUpdatePayload<ReportRow>
          | RealtimePostgresDeletePayload<ReportRow>
      ) => {
        scheduleRefetch();
      };

      // Subscribe to sessions table for this specific session
      sessionsChannel = supabase
        .channel(`session-stream-${sessionId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
          handleSessionChange
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") return;
          if (status === "CHANNEL_ERROR" || status === "CLOSED") {
            if (!isClosing && sessionsChannel) {
              console.error("[session-stream] Sessions channel closed", error);
              sendError("SESSIONS_CHANNEL_CLOSED");
              void closeChannels();
            }
          }
        });

      // Subscribe to status_events table for this session
      statusEventsChannel = supabase
        .channel(`session-status-events-stream-${sessionId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "status_events", filter: `session_id=eq.${sessionId}` },
          handleStatusEventChange
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") return;
          if (status === "CHANNEL_ERROR" || status === "CLOSED") {
            if (!isClosing && statusEventsChannel) {
              console.error("[session-stream] Status events channel closed", error);
              // Don't close everything - still useful without status events
            }
          }
        });

      // Subscribe to reports table for this session
      reportsChannel = supabase
        .channel(`session-reports-stream-${sessionId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "reports", filter: `session_id=eq.${sessionId}` },
          handleReportChange
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "reports", filter: `session_id=eq.${sessionId}` },
          handleReportChange
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "reports", filter: `session_id=eq.${sessionId}` },
          handleReportChange
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") return;
          if (status === "CHANNEL_ERROR" || status === "CLOSED") {
            if (!isClosing && reportsChannel) {
              console.error("[session-stream] Reports channel closed", error);
              // Don't close everything - still useful without reports updates
            }
          }
        });
    },
    async cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (debounceTimeout) clearTimeout(debounceTimeout);
      try {
        if (sessionsChannel) await supabase.removeChannel(sessionsChannel);
        if (statusEventsChannel) await supabase.removeChannel(statusEventsChannel);
        if (reportsChannel) await supabase.removeChannel(reportsChannel);
        await supabase.removeAllChannels();
      } catch (error) {
        console.error("[session-stream] Failed to cancel stream", error);
      }
    },
  });

  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
