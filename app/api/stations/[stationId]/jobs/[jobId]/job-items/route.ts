import { NextResponse } from "next/server";
import { getJobItemsForStationAndJob } from "@/lib/data/job-items";
import { createErrorResponse } from "@/lib/auth/permissions";

type RouteParams = {
  params: Promise<{ stationId: string; jobId: string }>;
};

/**
 * GET /api/stations/[stationId]/jobs/[jobId]/job-items
 *
 * Returns job items for a specific job that include this station.
 * Used when worker selects a job and needs to choose a job item.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { stationId, jobId } = await params;

  if (!stationId) {
    return NextResponse.json(
      { error: "STATION_ID_REQUIRED" },
      { status: 400 },
    );
  }

  if (!jobId) {
    return NextResponse.json(
      { error: "JOB_ID_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    const jobItems = await getJobItemsForStationAndJob(stationId, jobId);
    return NextResponse.json({ jobItems });
  } catch (error) {
    return createErrorResponse(error, "FETCH_JOB_ITEMS_FAILED");
  }
}
