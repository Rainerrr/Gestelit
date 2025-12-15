import { NextResponse } from "next/server";
import { fetchStationsForWorker } from "@/lib/data/stations";
import {
  requireWorkerOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workerId = searchParams.get("workerId");

  if (!workerId) {
    return NextResponse.json(
      { error: "WORKER_ID_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    // Verify workerId matches authenticated worker
    await requireWorkerOwnership(request, workerId);

    const stations = await fetchStationsForWorker(workerId);
    return NextResponse.json({ stations });
  } catch (error) {
    return createErrorResponse(error, "FETCH_STATIONS_FAILED");
  }
}

