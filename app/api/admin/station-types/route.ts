import { NextResponse } from "next/server";
import {
  AdminActionError,
  clearStationType,
  fetchStationTypeList,
} from "@/lib/data/admin-management";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

const respondWithError = (error: unknown) => {
  if (error instanceof AdminActionError) {
    return NextResponse.json(
      { error: error.code, details: error.details ?? error.message },
      { status: error.status },
    );
  }

  console.error("[admin-station-types] unexpected", error);
  return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 500 });
};

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }
  try {
    const stationTypes = await fetchStationTypeList();
    return NextResponse.json({ stationTypes });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as { station_type?: string } | null;
  const stationType = body?.station_type?.trim();

  if (!stationType) {
    return NextResponse.json({ error: "INVALID_STATION_TYPE" }, { status: 400 });
  }

  try {
    await clearStationType(stationType);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respondWithError(error);
  }
}

