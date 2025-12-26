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

    const sessions = await fetchRecentSessionsData({
      workerId,
      stationId,
      jobNumber,
      limit,
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    return createErrorResponse(error);
  }
}

