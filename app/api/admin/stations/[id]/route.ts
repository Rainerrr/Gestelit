import { NextRequest, NextResponse } from "next/server";
import { AdminActionError, deleteStation, updateStation } from "@/lib/data/admin-management";
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

  console.error("[admin-station-id] unexpected", error);
  return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 500 });
};

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const body = (await request.json().catch(() => null)) as StationPayload | null;
  if (!body) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  if (body.station_type && !stationTypes.includes(body.station_type)) {
    return NextResponse.json({ error: "INVALID_STATION_TYPE" }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const station = await updateStation(id, {
      name: body.name,
      code: body.code,
      station_type: body.station_type,
      is_active: body.is_active,
    });

    return NextResponse.json({ station });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await deleteStation(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respondWithError(error);
  }
}

