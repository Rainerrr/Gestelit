import { NextResponse } from "next/server";
import {
  updateProductionLineStations,
  getProductionLineById,
} from "@/lib/data/production-lines";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { isValidUUID, areValidUUIDs } from "@/lib/utils/validation";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * PUT /api/admin/production-lines/[id]/stations
 *
 * Update the stations in a production line with new ordering.
 * Replaces all existing stations with the new list.
 *
 * Body: { stationIds: string[] }
 * - stationIds: Ordered array of station IDs (position = index + 1)
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await params;

  // Validate production line ID format
  if (!isValidUUID(id)) {
    return NextResponse.json(
      { error: "INVALID_LINE_ID", message: "Invalid production line ID format" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);

  if (!body?.stationIds || !Array.isArray(body.stationIds)) {
    return NextResponse.json(
      { error: "STATION_IDS_REQUIRED" },
      { status: 400 },
    );
  }

  // Validate all items are valid UUIDs
  if (!areValidUUIDs(body.stationIds)) {
    return NextResponse.json(
      { error: "INVALID_STATION_IDS", message: "All station IDs must be valid UUIDs" },
      { status: 400 },
    );
  }

  try {
    await updateProductionLineStations(id, body.stationIds);

    // Return the updated production line with stations
    const line = await getProductionLineById(id);
    return NextResponse.json({ line });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PRODUCTION_LINE_HAS_ACTIVE_JOBS") {
        return NextResponse.json(
          { error: "HAS_ACTIVE_JOBS", message: "Cannot modify stations - line has active job items" },
          { status: 409 },
        );
      }
      if (error.message === "STATION_ALREADY_IN_LINE") {
        return NextResponse.json(
          { error: "STATION_ALREADY_IN_LINE", message: "One or more stations are already assigned to another line" },
          { status: 400 },
        );
      }
    }
    return createErrorResponse(error, "STATIONS_UPDATE_FAILED");
  }
}
