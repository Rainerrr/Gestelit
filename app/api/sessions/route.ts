import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";
import {
  isStationOccupied,
  isStationAllowedForJobAndWorker,
} from "@/lib/data/stations";
import type { Session } from "@/lib/types";
import {
  jobHasJobItems,
  resolveJobItemForStation,
} from "@/lib/data/job-items";
import {
  requireWorkerOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { getProtectedStatusDefinition } from "@/lib/data/status-definitions";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const workerId = body?.workerId as string | undefined;
  const stationId = body?.stationId as string | undefined;
  const jobId = body?.jobId as string | undefined;
  const instanceId = body?.instanceId as string | undefined;

  if (!workerId || !stationId || !jobId) {
    return NextResponse.json(
      { error: "MISSING_FIELDS" },
      { status: 400 },
    );
  }

  try {
    // Verify workerId matches authenticated worker
    await requireWorkerOwnership(request, workerId);

    // Check if station is occupied by another worker
    const occupancy = await isStationOccupied(stationId, workerId);
    if (occupancy.occupied) {
      return NextResponse.json(
        {
          error: "STATION_OCCUPIED",
          occupiedBy: occupancy.occupiedBy,
        },
        { status: 409 },
      );
    }

    // Check if job has job_items configured
    const hasItems = await jobHasJobItems(jobId);
    if (!hasItems) {
      // Job is not configured with production items
      // This is now a hard block - consistent with UI behavior in station page
      return NextResponse.json(
        { error: "JOB_NOT_CONFIGURED", message: "Job has no production items configured" },
        { status: 400 },
      );
    }

    // Validate station is allowed for this job and worker
    const isAllowed = await isStationAllowedForJobAndWorker(stationId, jobId, workerId);
    if (!isAllowed) {
      return NextResponse.json(
        { error: "STATION_NOT_ALLOWED", message: "Station is not part of this job's production line" },
        { status: 400 },
      );
    }

    // Resolve job item and step for this job + station combination
    const resolution = await resolveJobItemForStation(jobId, stationId);
    if (!resolution) {
      return NextResponse.json(
        { error: "JOB_ITEM_NOT_FOUND", message: "No job item found for this station" },
        { status: 400 },
      );
    }

    // Use atomic RPC to close existing sessions and create new one in single transaction
    // This eliminates race conditions where multiple tabs could create simultaneous sessions
    const supabase = createServiceSupabase();

    // Fetch the stop status ID to pass to the RPC (avoid hardcoded lookups in SQL)
    const stopStatus = await getProtectedStatusDefinition("stop");

    const { data, error } = await supabase.rpc("create_session_atomic", {
      p_worker_id: workerId,
      p_station_id: stationId,
      p_job_id: jobId,
      p_instance_id: instanceId ?? null,
      p_job_item_id: resolution.jobItem.id,
      p_job_item_station_id: resolution.jobItemStation.id,
      p_initial_status_id: stopStatus.id,
    });

    if (error) {
      // Handle unique constraint violation (concurrent creation attempt)
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "SESSION_ALREADY_EXISTS", message: "Worker already has an active session" },
          { status: 409 },
        );
      }
      throw new Error(`Failed to create session: ${error.message}`);
    }

    const session = data as Session;
    return NextResponse.json({ session });
  } catch (error) {
    return createErrorResponse(error, "SESSION_CREATE_FAILED");
  }
}
