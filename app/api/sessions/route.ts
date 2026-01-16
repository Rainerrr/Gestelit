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
  const jobId = body?.jobId as string | null | undefined; // Now optional
  const instanceId = body?.instanceId as string | undefined;

  // workerId and stationId are required, jobId is now optional
  if (!workerId || !stationId) {
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

    // Job item resolution (only if jobId is provided)
    let jobItemId: string | null = null;
    let jobItemStepId: string | null = null;

    if (jobId) {
      // Check if job has job_items configured
      const hasItems = await jobHasJobItems(jobId);
      if (!hasItems) {
        // Job is not configured with production items
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

      jobItemId = resolution.jobItem.id;
      jobItemStepId = resolution.jobItemStation.id;
    }
    // If no jobId, session is created without job binding
    // Job/job item will be bound later when entering production status

    // Use atomic RPC to close existing sessions and create new one in single transaction
    // This eliminates race conditions where multiple tabs could create simultaneous sessions
    const supabase = createServiceSupabase();

    // Fetch the stop status ID to pass to the RPC (avoid hardcoded lookups in SQL)
    const stopStatus = await getProtectedStatusDefinition("stop");

    const { data, error } = await supabase.rpc("create_session_atomic", {
      p_worker_id: workerId,
      p_station_id: stationId,
      p_job_id: jobId ?? null,
      p_instance_id: instanceId ?? null,
      p_job_item_id: jobItemId,
      p_job_item_step_id: jobItemStepId,
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
