import { NextResponse } from "next/server";
import { requireWorker } from "@/lib/auth/permissions";
import { getJobItemCountsByStation } from "@/lib/data/job-items";

/**
 * GET /api/stations/job-item-counts?workerId={id}
 *
 * Returns a map of station IDs to uncompleted job item counts
 * for all stations assigned to the specified worker.
 */
export async function GET(request: Request) {
  try {
    // Authenticate worker
    const worker = await requireWorker(request);

    // Get workerId from query params
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get("workerId");

    if (!workerId) {
      return NextResponse.json(
        { error: "MISSING_WORKER_ID" },
        { status: 400 }
      );
    }

    // Validate worker ID matches authenticated worker
    if (workerId !== worker.id) {
      return NextResponse.json(
        { error: "WORKER_ID_MISMATCH" },
        { status: 403 }
      );
    }

    // Get job item counts
    const countsMap = await getJobItemCountsByStation(workerId);

    // Convert Map to plain object for JSON serialization
    const counts: Record<string, number> = {};
    for (const [stationId, count] of countsMap) {
      counts[stationId] = count;
    }

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("[stations/job-item-counts] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }
}
