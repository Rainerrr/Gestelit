import { NextResponse } from "next/server";
import { fetchActiveStatusDefinitions } from "@/lib/data/status-definitions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get("stationId");

  if (!stationId) {
    return NextResponse.json(
      { error: "MISSING_STATION_ID" },
      { status: 400 },
    );
  }

  try {
    const statuses = await fetchActiveStatusDefinitions(stationId);
    return NextResponse.json({ statuses });
  } catch (error) {
    return NextResponse.json(
      { error: "FAILED_TO_FETCH_STATUSES", details: String(error) },
      { status: 500 },
    );
  }
}










