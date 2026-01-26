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
  /** True for first product QA approval requests */
  isFirstProductQa: boolean;
  /** Job item ID for QA reports */
  jobItemId: string | null;
  /** Job item name for QA reports */
  jobItemName: string | null;
  /** Station name for display */
  stationName: string | null;
};

export type SessionScrapReport = {
  id: string;
  description: string | null;
  imageUrl: string | null;
  status: "new" | "approved";
  createdAt: string;
  reporterName: string | null;
  reporterCode: string | null;
  jobItemId: string | null;
  jobItemName: string | null;
};

export type ProductionPeriod = {
  jobItemId: string;
  jobItemName: string;
  jobNumber: string;
  plannedQuantity: number;
  startedAt: string;
  endedAt: string | null;
  /** Quantity reported in THIS session */
  quantityGood: number;
  quantityScrap: number;
  /** Total completed across ALL sessions (from status_events) */
  totalCompletedGood: number;
  /** Step-level tracking for non-terminal stations */
  jobItemStepId: string | null;
  stepPosition: number | null;
  isTerminal: boolean;
  /** Total at THIS step across ALL sessions */
  stepTotalGood: number;
};

export type SessionDetailStream = {
  id: string;
  jobId: string;
  jobNumber: string;
  stationId: string | null;
  stationName: string;
  stationCode: string | null;
  stationType: StationType | null;
  workerId: string;
  workerName: string;
  workerCode: string | null;
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
  scrapReports: SessionScrapReport[];
  productionPeriods: ProductionPeriod[];
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
  forced_closed_at: string | null;
  current_status_id?: StatusEventState | null;
  current_status_code?: StatusEventState | null;
  last_status_change_at: string | null;
  worker_full_name_snapshot: string | null;
  station_name_snapshot: string | null;
  jobs: { job_number: string | null } | null;
  stations: { name: string | null; code: string | null; station_type: StationType | null } | null;
  workers: { full_name: string | null; worker_code: string | null } | null;
};

const SESSION_SELECT = `
  id,
  worker_id,
  station_id,
  job_id,
  status,
  started_at,
  ended_at,
  current_status_id,
  last_status_change_at,
  forced_closed_at,
  worker_full_name_snapshot,
  station_name_snapshot,
  jobs:jobs(job_number),
  stations:stations(name, code, station_type),
  workers:workers(full_name, worker_code)
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
    is_first_product_qa: boolean | null;
    job_item_id: string | null;
    station_id: string | null;
    workers: { full_name: string | null; worker_code: string | null } | null;
    report_reasons: { label_he: string | null } | null;
    job_items: { name: string } | null;
    stations: { name: string } | null;
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
      is_first_product_qa,
      job_item_id,
      station_id,
      workers:reported_by_worker_id(full_name, worker_code),
      report_reasons:report_reason_id(label_he),
      job_items:job_item_id(name),
      stations:station_id(name),
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
    isFirstProductQa: r.is_first_product_qa ?? false,
    jobItemId: r.job_item_id,
    jobItemName: r.job_items?.name ?? null,
    stationName: r.stations?.name ?? null,
  }));

  // Fetch scrap reports linked to this session
  type RawScrapReport = {
    id: string;
    description: string | null;
    image_url: string | null;
    status: "new" | "approved";
    created_at: string;
    workers: { full_name: string | null; worker_code: string | null } | null;
    status_events: {
      job_item_id: string | null;
      job_items: { name: string } | null;
    } | null;
  };

  const { data: scrapReportsData } = await supabase
    .from("reports")
    .select(`
      id,
      description,
      image_url,
      status,
      created_at,
      workers:reported_by_worker_id(full_name, worker_code),
      status_events:status_event_id(job_item_id, job_items:job_item_id(name))
    `)
    .eq("session_id", sessionId)
    .eq("type", "scrap")
    .order("created_at", { ascending: false });

  const scrapReports: SessionScrapReport[] = (
    (scrapReportsData as unknown as RawScrapReport[]) ?? []
  ).map((r) => ({
    id: r.id,
    description: r.description,
    imageUrl: r.image_url,
    status: r.status,
    createdAt: r.created_at,
    reporterName: r.workers?.full_name ?? null,
    reporterCode: r.workers?.worker_code ?? null,
    jobItemId: r.status_events?.job_item_id ?? null,
    jobItemName: r.status_events?.job_items?.name ?? null,
  }));

  // Fetch production periods - aggregated by job_item for production status events
  type RawProductionEvent = {
    job_item_id: string;
    job_item_step_id: string | null;
    started_at: string;
    ended_at: string | null;
    quantity_good: number | null;
    quantity_scrap: number | null;
    job_items: {
      name: string;
      planned_quantity: number;
      jobs: { job_number: string } | null;
      job_item_progress: { completed_good: number } | null;
    } | null;
    job_item_steps: {
      position: number;
      is_terminal: boolean;
    } | null;
  };

  const { data: productionEventsData } = await supabase
    .from("status_events")
    .select(`
      job_item_id,
      job_item_step_id,
      started_at,
      ended_at,
      quantity_good,
      quantity_scrap,
      job_items:job_item_id(
        name,
        planned_quantity,
        jobs(job_number),
        job_item_progress(completed_good)
      ),
      job_item_steps:job_item_step_id(
        position,
        is_terminal
      ),
      status_definitions!inner(machine_state)
    `)
    .eq("session_id", sessionId)
    .eq("status_definitions.machine_state", "production")
    .not("job_item_id", "is", null)
    .order("started_at", { ascending: true });

  const productionEvents = (productionEventsData as unknown as RawProductionEvent[]) ?? [];

  // Collect unique step IDs for per-step totals calculation
  const stepIds = new Set<string>();
  for (const event of productionEvents) {
    if (event.job_item_step_id) {
      stepIds.add(event.job_item_step_id);
    }
  }

  // Query step totals across ALL sessions
  const stepTotalsMap = new Map<string, number>();
  if (stepIds.size > 0) {
    const { data: stepTotals } = await supabase
      .from("status_events")
      .select("job_item_step_id, quantity_good")
      .in("job_item_step_id", Array.from(stepIds))
      .gt("quantity_good", 0);

    for (const row of stepTotals ?? []) {
      if (row.job_item_step_id && row.quantity_good) {
        const current = stepTotalsMap.get(row.job_item_step_id) ?? 0;
        stepTotalsMap.set(row.job_item_step_id, current + row.quantity_good);
      }
    }
  }


  // Aggregate production events by job_item_id
  const productionMap = new Map<string, {
    jobItemId: string;
    jobItemName: string;
    jobNumber: string;
    plannedQuantity: number;
    startedAt: string;
    endedAt: string | null;
    quantityGood: number;
    quantityScrap: number;
    totalCompletedGood: number;
    jobItemStepId: string | null;
    stepPosition: number | null;
    isTerminal: boolean;
    stepTotalGood: number;
  }>();

  for (const event of productionEvents) {
    if (!event.job_item_id || !event.job_items) continue;

    const existing = productionMap.get(event.job_item_id);
    if (existing) {
      // Update aggregated values
      existing.quantityGood += event.quantity_good ?? 0;
      existing.quantityScrap += event.quantity_scrap ?? 0;
      // Update end time if this event is later
      if (event.ended_at) {
        if (!existing.endedAt || new Date(event.ended_at) > new Date(existing.endedAt)) {
          existing.endedAt = event.ended_at;
        }
      } else {
        existing.endedAt = null; // Still ongoing
      }
    } else {
      productionMap.set(event.job_item_id, {
        jobItemId: event.job_item_id,
        jobItemName: event.job_items.name,
        jobNumber: event.job_items.jobs?.job_number ?? "לא ידוע",
        plannedQuantity: event.job_items.planned_quantity,
        startedAt: event.started_at,
        endedAt: event.ended_at,
        quantityGood: event.quantity_good ?? 0,
        quantityScrap: event.quantity_scrap ?? 0,
        totalCompletedGood: event.job_item_step_id
          ? (stepTotalsMap.get(event.job_item_step_id) ?? 0)
          : 0,
        jobItemStepId: event.job_item_step_id,
        stepPosition: event.job_item_steps?.position ?? null,
        isTerminal: event.job_item_steps?.is_terminal ?? true,
        stepTotalGood: event.job_item_step_id
          ? (stepTotalsMap.get(event.job_item_step_id) ?? 0)
          : 0,
      });
    }
  }

  const productionPeriods: ProductionPeriod[] = Array.from(productionMap.values());

  // Derive session totals from status_events (summed in productionPeriods)
  // This replaces the dropped sessions.total_good/total_scrap columns
  const totalGood = productionPeriods.reduce((sum, p) => sum + p.quantityGood, 0);
  const totalScrap = productionPeriods.reduce((sum, p) => sum + p.quantityScrap, 0);

  return {
    id: row.id,
    jobId: row.job_id,
    jobNumber: row.jobs?.job_number ?? "לא ידוע",
    stationId: row.station_id ?? null,
    stationName: row.stations?.name ?? row.station_name_snapshot ?? "לא משויך",
    stationCode: row.stations?.code ?? null,
    stationType: row.stations?.station_type ?? null,
    workerId: row.worker_id ?? "",
    workerName: row.workers?.full_name ?? row.worker_full_name_snapshot ?? "לא משויך",
    workerCode: row.workers?.worker_code ?? null,
    status: row.status,
    currentStatus: row.current_status_id ?? row.current_status_code ?? null,
    lastStatusChangeAt: row.last_status_change_at ?? row.started_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totalGood,
    totalScrap,
    plannedQuantity: productionPeriods.length > 0 ? productionPeriods[0].plannedQuantity : null,
    forcedClosedAt: row.forced_closed_at,
    durationSeconds,
    stoppageTimeSeconds,
    setupTimeSeconds,
    malfunctions,
    generalReports,
    scrapReports,
    productionPeriods,
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
      const send = (payload: StreamEvent) => {
        if (isClosing) return;
        controller.enqueue(serialize(payload));
      };
      const sendError = (message: string) => {
        if (isClosing) return;
        controller.enqueue(serialize({ type: "error", message }));
      };

      const clearHeartbeat = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
      };

      heartbeat = setInterval(() => {
        if (isClosing) return;
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
