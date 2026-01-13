import { NextResponse } from "next/server";
import { fetchStationsWithOccupancy } from "@/lib/data/stations";
import { requireWorker } from "@/lib/auth/permissions";

export async function GET(request: Request) {
  // Authenticate worker
  const workerResult = await requireWorker(request);
  if (workerResult instanceof NextResponse) {
    return workerResult;
  }

  const { searchParams } = new URL(request.url);
  const workerId = searchParams.get("workerId");

  if (!workerId) {
    return NextResponse.json(
      { error: "MISSING_WORKER_ID" },
      { status: 400 },
    );
  }

  // Verify the authenticated worker matches the requested workerId
  if (workerResult.id !== workerId) {
    return NextResponse.json(
      { error: "WORKER_MISMATCH" },
      { status: 403 },
    );
  }

  try {
    const stations = await fetchStationsWithOccupancy(workerId);
    return NextResponse.json(stations);
  } catch (error) {
    console.error("[stations/with-occupancy] Failed to fetch stations", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
