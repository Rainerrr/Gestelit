import { NextResponse } from "next/server";
import { getAvailableJobsForStation } from "@/lib/data/job-items";
import { createErrorResponse } from "@/lib/auth/permissions";

type RouteParams = {
  params: Promise<{ stationId: string }>;
};

/**
 * GET /api/stations/[stationId]/available-jobs
 *
 * Returns jobs that have active job items for this station.
 * Used when worker enters production status and needs to select a job.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { stationId } = await params;

  if (!stationId) {
    return NextResponse.json(
      { error: "STATION_ID_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    const jobs = await getAvailableJobsForStation(stationId);
    return NextResponse.json({ jobs });
  } catch (error) {
    return createErrorResponse(error, "FETCH_AVAILABLE_JOBS_FAILED");
  }
}
