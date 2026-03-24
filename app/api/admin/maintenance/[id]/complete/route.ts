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
    service_id?: string;
    completion_date?: string;
    worker_id?: string | null;
  };

  if (!body.service_id) {
    return NextResponse.json({ error: "MISSING_SERVICE_ID" }, { status: 400 });
  }

  try {
    const result = await completeStationMaintenance(
      stationId,
      body.service_id,
      body.completion_date,
      body.worker_id
    );

    return NextResponse.json({
      success: result.success,
      last_serviced: result.last_serviced,
      next_service_date: result.next_service_date,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "COMPLETION_FAILED";
    console.error("[admin-maintenance] Complete failed", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
