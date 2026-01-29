import { NextResponse } from "next/server";
import {
  AdminActionError,
  createStation,
  fetchAllStations,
  type StationWithStats,
} from "@/lib/data/admin-management";
import { invalidateStationsCache } from "@/lib/cache/static-cache";
import type { StationReason, StationType } from "@/lib/types";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

type StationPayload = {
  name?: string;
  code?: string;
  station_type?: StationType;
  is_active?: boolean;
  station_reasons?: StationReason[] | null;
  maintenance_enabled?: boolean;
  maintenance_last_date?: string | null;
  maintenance_interval_days?: number | null;
};

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

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const stationType = searchParams.get("stationType") ?? undefined;
  const startsWith = searchParams.get("startsWith") ?? undefined;

  try {
    const stations = await fetchAllStations({
      search,
      stationType: stationType ?? null,
      startsWith,
    });
    return NextResponse.json<{ stations: StationWithStats[] }>({ stations });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as StationPayload | null;

  if (!body?.name || !body.code || !body.station_type) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const station = await createStation({
      name: body.name,
      code: body.code,
      station_type: body.station_type,
      is_active: body.is_active ?? true,
      station_reasons: body.station_reasons ?? [],
      maintenance_enabled: body.maintenance_enabled ?? false,
      maintenance_last_date: body.maintenance_last_date ?? null,
      maintenance_interval_days: body.maintenance_interval_days ?? null,
    });

    await invalidateStationsCache();
    return NextResponse.json({ station });
  } catch (error) {
    return respondWithError(error);
  }
}
