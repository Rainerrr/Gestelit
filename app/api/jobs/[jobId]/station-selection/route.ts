import { NextResponse } from "next/server";
import { fetchJobItemsForStationSelection, jobHasJobItems } from "@/lib/data/job-items";
import {
  requireWorkerOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { isValidUUID } from "@/lib/utils/validation";

type RouteParams = {
  params: Promise<{ jobId: string }>;
};

/**
 * GET /api/jobs/[jobId]/station-selection?workerId=xxx
 *
 * Returns job items structured for station selection UI.
 * Each job item contains its pipeline stations with:
 * - Position and terminal status
 * - Whether the worker is assigned to each station
 * - Occupancy status for each station
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { jobId } = await params;

  // Validate job ID format
  if (!isValidUUID(jobId)) {
    return NextResponse.json(
      { error: "INVALID_JOB_ID", message: "Invalid job ID format" },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(request.url);
  const workerId = searchParams.get("workerId");

  if (!workerId) {
    return NextResponse.json(
      { error: "WORKER_ID_REQUIRED" },
      { status: 400 },
    );
  }

  // Validate worker ID format
  if (!isValidUUID(workerId)) {
    return NextResponse.json(
      { error: "INVALID_WORKER_ID", message: "Invalid worker ID format" },
      { status: 400 },
    );
  }

  try {
    // Verify workerId matches authenticated worker
    await requireWorkerOwnership(request, workerId);

    // Check if job has any job_items configured
    const hasItems = await jobHasJobItems(jobId);
    if (!hasItems) {
      return NextResponse.json(
        { error: "JOB_NOT_CONFIGURED", message: "Job has no production items configured" },
        { status: 400 },
      );
    }

    // Fetch job items with station selection info
    const jobItems = await fetchJobItemsForStationSelection(jobId, workerId);

    return NextResponse.json({ jobItems });
  } catch (error) {
    return createErrorResponse(error, "STATION_SELECTION_FAILED");
  }
}
