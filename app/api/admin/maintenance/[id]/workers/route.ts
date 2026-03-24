import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { fetchStationWorkers } from "@/lib/data/maintenance";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id: stationId } = await context.params;

  try {
    const workers = await fetchStationWorkers(stationId);
    return NextResponse.json({ workers });
  } catch (error) {
    console.error("[admin-maintenance] Fetch workers failed", error);
    return NextResponse.json({ error: "FETCH_FAILED" }, { status: 500 });
  }
}
