import { NextResponse } from "next/server";
import { fetchAvailableStationsForPreset } from "@/lib/data/pipeline-presets";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

/**
 * GET /api/admin/pipeline-presets/available-stations
 *
 * Returns all active stations that can be used in pipeline presets.
 * Unlike production lines, stations can appear in multiple presets.
 */
export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  try {
    const stations = await fetchAvailableStationsForPreset();
    return NextResponse.json({ stations });
  } catch (error) {
    return createErrorResponse(error, "STATIONS_FETCH_FAILED");
  }
}
