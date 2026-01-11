import { NextResponse } from "next/server";
import { fetchAllowedStationsForJobAndWorker } from "@/lib/data/stations";
import { jobHasJobItems } from "@/lib/data/job-items";
import {
  requireWorkerOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { isValidUUID } from "@/lib/utils/validation";

type RouteParams = {
  params: Promise<{ jobId: string }>;
};

/**
 * GET /api/jobs/[jobId]/allowed-stations?workerId=xxx
 *
 * Returns stations that are:
 * 1. Assigned to the worker (worker_stations)
 * 2. Part of the job's job_items (via job_item_stations)
 *
 * This is the intersection model for worker flow.
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

    // Fetch intersection of worker's stations and job's allowed stations
    const stations = await fetchAllowedStationsForJobAndWorker(jobId, workerId);

    return NextResponse.json(stations);
  } catch (error) {
    return createErrorResponse(error, "ALLOWED_STATIONS_FAILED");
  }
}
