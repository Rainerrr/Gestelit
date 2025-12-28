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
};

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
      workers: { full_name: string | null; worker_code: string | null } | null;
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
        workers:reported_by_worker_id(full_name, worker_code)
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
    }));

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
      totalGood: row.total_good ?? 0,
      totalScrap: row.total_scrap ?? 0,
      plannedQuantity: row.jobs?.planned_quantity ?? null,
      forcedClosedAt: row.forced_closed_at,
      durationSeconds,
      stoppageTimeSeconds,
      setupTimeSeconds,
      malfunctions,
    };

    return NextResponse.json({ session });
  } catch (error) {
    return createErrorResponse(error);
  }
}
