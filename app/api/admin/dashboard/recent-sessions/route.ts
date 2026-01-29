import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { fetchRecentSessions as fetchRecentSessionsData } from "@/lib/data/admin-dashboard";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);

    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get("workerId") || undefined;
    const stationId = searchParams.get("stationId") || undefined;
    const jobNumber = searchParams.get("jobNumber") || undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

    // Date range parameters for scale (avoid full table scans)
    const sinceParam = searchParams.get("since");
    const untilParam = searchParams.get("until");
    const since = sinceParam ? new Date(sinceParam) : undefined;
    const until = untilParam ? new Date(untilParam) : undefined;

    const sessions = await fetchRecentSessionsData({
      workerId,
      stationId,
      jobNumber,
      limit,
      since,
      until,
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    return createErrorResponse(error);
  }
}

