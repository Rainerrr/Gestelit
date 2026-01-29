import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { completeStationMaintenance } from "@/lib/data/maintenance";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id: stationId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    completion_date?: string;
  };

  try {
    const result = await completeStationMaintenance(
      stationId,
      body.completion_date
    );

    return NextResponse.json({
      success: result.success,
      last_maintenance_date: result.last_maintenance_date,
      next_maintenance_date: result.next_maintenance_date,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "COMPLETION_FAILED";
    console.error("[admin-maintenance] Complete failed", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
