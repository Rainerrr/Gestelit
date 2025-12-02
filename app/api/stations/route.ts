import { NextResponse } from "next/server";
import { fetchStationsForWorker } from "@/lib/data/stations";

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
    const stations = await fetchStationsForWorker(workerId);
    return NextResponse.json({ stations });
  } catch (error) {
    return NextResponse.json(
      { error: "FETCH_STATIONS_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}

