import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { createServiceSupabase } from "@/lib/supabase/client";
import type {
  SessionStatus,
  StationType,
  StatusEventState,
  MalfunctionReportStatus,
} from "@/lib/types";

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
  /** Total completed across ALL sessions (from job_item_progress - terminal only) */
  totalCompletedGood: number;
  /** Step-level tracking for non-terminal stations */
  jobItemStepId: string | null;
  stepPosition: number | null;
  isTerminal: boolean;
  /** Total at THIS step across ALL sessions */
  stepTotalGood: number;
};

export type SessionDetail = {
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
  scrapReports: SessionScrapReport[];
  productionPeriods: ProductionPeriod[];
};

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
  current_status_id,
  last_status_change_at,
  forced_closed_at,
  worker_full_name_snapshot,
  station_name_snapshot,
  jobs:jobs(job_number, planned_quantity),
  stations:stations(name, station_type),
  workers:workers(full_name)
`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminPassword(request);

    const { id: sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json(
        { error: "SESSION_ID_REQUIRED" },
        { status: 400 },
      );
    }

    const supabase = createServiceSupabase();

    const { data, error } = await supabase
      .from("sessions")
      .select(SESSION_SELECT)
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      console.error(`[session-detail] Failed to fetch session ${sessionId}`, error);
      return NextResponse.json(
        { error: "SESSION_FETCH_FAILED" },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "SESSION_NOT_FOUND" },
        { status: 404 },
      );
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
      rows.forEach((row) => {
        if (row.status_definitions?.machine_state !== state) {
          return;
        }
        const startTs = new Date(row.started_at).getTime();
        const endTs = row.ended_at
          ? new Date(row.ended_at).getTime()
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

    // Collect unique step IDs for step-level totals calculation
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
          totalCompletedGood: event.job_items.job_item_progress?.completed_good ?? 0,
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

    const session: SessionDetail = {
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
      totalGood,
      totalScrap,
      plannedQuantity: row.jobs?.planned_quantity ?? null,
      forcedClosedAt: row.forced_closed_at,
      durationSeconds,
      stoppageTimeSeconds,
      setupTimeSeconds,
      malfunctions,
      generalReports,
      scrapReports,
      productionPeriods,
    };

    return NextResponse.json({ session });
  } catch (error) {
    return createErrorResponse(error);
  }
}
