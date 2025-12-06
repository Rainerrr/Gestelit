import { NextResponse } from "next/server";
import {
  AdminActionError,
  createStation,
  fetchAllStations,
  type StationWithStats,
} from "@/lib/data/admin-management";
import type { StationType } from "@/lib/types";

type StationPayload = {
  name?: string;
  code?: string;
  station_type?: StationType;
  is_active?: boolean;
};

const stationTypes: StationType[] = [
  "prepress",
  "digital_press",
  "offset",
  "folding",
  "cutting",
  "binding",
  "shrink",
  "lamination",
  "other",
];

const respondWithError = (error: unknown) => {
  if (error instanceof AdminActionError) {
    return NextResponse.json(
      { error: error.code, details: error.details ?? error.message },
      { status: error.status },
    );
  }

  console.error("[admin-stations] unexpected", error);
  return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 500 });
};

export async function GET() {
  try {
    const stations = await fetchAllStations();
    return NextResponse.json<{ stations: StationWithStats[] }>({ stations });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as StationPayload | null;

  if (!body?.name || !body.code || !body.station_type) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  if (!stationTypes.includes(body.station_type)) {
    return NextResponse.json({ error: "INVALID_STATION_TYPE" }, { status: 400 });
  }

  try {
    const station = await createStation({
      name: body.name,
      code: body.code,
      station_type: body.station_type,
      is_active: body.is_active ?? true,
    });

    return NextResponse.json({ station });
  } catch (error) {
    return respondWithError(error);
  }
}
