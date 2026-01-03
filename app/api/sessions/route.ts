import { NextResponse } from "next/server";
import {
  createSession,
  closeActiveSessionsForWorker,
} from "@/lib/data/sessions";
import { isStationOccupied } from "@/lib/data/stations";
import {
  requireWorkerOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";

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

    // Close any existing active sessions for this worker
    // This enforces single-session-per-worker constraint
    await closeActiveSessionsForWorker(workerId);

    const session = await createSession({
      worker_id: workerId,
      station_id: stationId,
      job_id: jobId,
      active_instance_id: instanceId,
    });

    return NextResponse.json({ session });
  } catch (error) {
    return createErrorResponse(error, "SESSION_CREATE_FAILED");
  }
}
