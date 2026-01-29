import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import {
  fetchMaintenanceStations,
  checkMaintenanceDueNotifications,
} from "@/lib/data/maintenance";
import type { StationMaintenanceInfo } from "@/lib/types";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  try {
    const stations = await fetchMaintenanceStations();
    return NextResponse.json<{ stations: StationMaintenanceInfo[] }>({ stations });
  } catch (error) {
    console.error("[admin-maintenance] GET failed", error);
    return NextResponse.json({ error: "FETCH_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  // Trigger maintenance notification check
  try {
    await checkMaintenanceDueNotifications();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin-maintenance] POST failed", error);
    return NextResponse.json({ error: "CHECK_FAILED" }, { status: 500 });
  }
}
