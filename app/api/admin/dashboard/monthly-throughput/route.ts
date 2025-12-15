import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import {
  fetchMonthlyJobThroughput as fetchMonthlyJobThroughputData,
} from "@/lib/data/admin-dashboard";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");
    const workerId = searchParams.get("workerId") || undefined;
    const stationId = searchParams.get("stationId") || undefined;
    const jobNumber = searchParams.get("jobNumber") || undefined;

    if (!yearParam || !monthParam) {
      return NextResponse.json(
        { error: "YEAR_AND_MONTH_REQUIRED" },
        { status: 400 },
      );
    }

    const year = Number.parseInt(yearParam, 10);
    const month = Number.parseInt(monthParam, 10);

    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "INVALID_YEAR_OR_MONTH" },
        { status: 400 },
      );
    }

    const throughput = await fetchMonthlyJobThroughputData({
      year,
      month,
      workerId,
      stationId,
      jobNumber,
    });

    return NextResponse.json({ throughput });
  } catch (error) {
    return createErrorResponse(error);
  }
}

