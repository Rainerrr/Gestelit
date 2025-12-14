import { NextResponse } from "next/server";
import { getStationActiveReasons } from "@/lib/data/stations";
import type { StationReason } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get("stationId");

  if (!stationId) {
    return NextResponse.json({ error: "STATION_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const reasons = await getStationActiveReasons(stationId);
    return NextResponse.json<{ reasons: StationReason[] }>({ reasons });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "STATION_NOT_FOUND") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "REASONS_FETCH_FAILED", details: message },
      { status: 500 },
    );
  }
}

