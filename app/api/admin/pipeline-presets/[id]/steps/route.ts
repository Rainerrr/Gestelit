import { NextResponse } from "next/server";
import { updatePipelinePresetSteps } from "@/lib/data/pipeline-presets";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * PUT /api/admin/pipeline-presets/[id]/steps
 *
 * Replace all steps in a pipeline preset.
 * Body: { station_ids: string[] }
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  if (!body || !Array.isArray(body.station_ids)) {
    return NextResponse.json(
      { error: "STATION_IDS_REQUIRED" },
      { status: 400 },
    );
  }

  // Validate station_ids are all strings
  if (!body.station_ids.every((id: unknown) => typeof id === "string")) {
    return NextResponse.json(
      { error: "INVALID_STATION_IDS" },
      { status: 400 },
    );
  }

  try {
    const steps = await updatePipelinePresetSteps(id, body.station_ids);
    return NextResponse.json({ steps });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_STATION_IN_PRESET") {
      return NextResponse.json(
        { error: "DUPLICATE_STATION" },
        { status: 400 },
      );
    }
    return createErrorResponse(error, "PIPELINE_STEPS_UPDATE_FAILED");
  }
}
