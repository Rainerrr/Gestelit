import { NextResponse } from "next/server";
import { requireWorker } from "@/lib/auth/permissions";
import { getJobItemsAtStation } from "@/lib/data/job-items";

/**
 * GET /api/stations/[stationId]/job-items
 *
 * Returns all active job items available at a specific station.
 * Used for the station-first selection flow.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ stationId: string }> }
) {
  try {
    // Authenticate worker
    await requireWorker(request);

    const { stationId } = await params;

    if (!stationId) {
      return NextResponse.json(
        { error: "MISSING_STATION_ID" },
        { status: 400 }
      );
    }

    // Get job items at station
    const jobItems = await getJobItemsAtStation(stationId);

    return NextResponse.json({ jobItems });
  } catch (error) {
    console.error("[stations/[stationId]/job-items] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }
}
