import { NextResponse } from "next/server";
import { fetchAvailableStationsForLine } from "@/lib/data/production-lines";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

/**
 * GET /api/admin/production-lines/available-stations
 *
 * Returns all stations that are available for assignment to a production line.
 * These are stations that are either:
 * - Not assigned to any line, OR
 * - Already assigned to the specified line (for editing)
 *
 * Query params:
 * - lineId: Optional - if provided, includes stations already in this line
 */
export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { searchParams } = new URL(request.url);
  const lineId = searchParams.get("lineId") ?? undefined;

  try {
    const stations = await fetchAvailableStationsForLine(lineId);
    return NextResponse.json({ stations });
  } catch (error) {
    return createErrorResponse(error, "AVAILABLE_STATIONS_FETCH_FAILED");
  }
}
