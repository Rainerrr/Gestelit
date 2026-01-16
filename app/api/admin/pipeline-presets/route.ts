import { NextResponse } from "next/server";
import {
  fetchAllPipelinePresets,
  createPipelinePreset,
} from "@/lib/data/pipeline-presets";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

/**
 * GET /api/admin/pipeline-presets
 *
 * Returns all pipeline presets with their steps.
 * Query params:
 * - includeInactive: "true" to include inactive presets
 */
export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  try {
    const presets = await fetchAllPipelinePresets({
      includeInactive,
      includeSteps: true,
    });
    return NextResponse.json({ presets });
  } catch (error) {
    return createErrorResponse(error, "PIPELINE_PRESETS_FETCH_FAILED");
  }
}

/**
 * POST /api/admin/pipeline-presets
 *
 * Create a new pipeline preset.
 * Body: { name: string, description?: string, is_active?: boolean, station_ids?: string[] }
 */
export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = await request.json().catch(() => null);

  if (!body?.name?.trim()) {
    return NextResponse.json(
      { error: "NAME_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    const preset = await createPipelinePreset({
      name: body.name.trim(),
      description: body.description ?? null,
      is_active: body.is_active ?? true,
      station_ids: body.station_ids ?? [],
    });
    return NextResponse.json({ preset });
  } catch (error) {
    return createErrorResponse(error, "PIPELINE_PRESET_CREATE_FAILED");
  }
}
