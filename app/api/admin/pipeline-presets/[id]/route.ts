import { NextResponse } from "next/server";
import {
  getPipelinePresetById,
  updatePipelinePreset,
  deletePipelinePreset,
  isPipelinePresetInUse,
} from "@/lib/data/pipeline-presets";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/admin/pipeline-presets/[id]
 *
 * Get a single pipeline preset by ID with its steps.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await context.params;

  try {
    const preset = await getPipelinePresetById(id);
    if (!preset) {
      return NextResponse.json(
        { error: "PRESET_NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json({ preset });
  } catch (error) {
    return createErrorResponse(error, "PIPELINE_PRESET_FETCH_FAILED");
  }
}

/**
 * PUT /api/admin/pipeline-presets/[id]
 *
 * Update a pipeline preset's metadata.
 * Body: { name?: string }
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "INVALID_BODY" },
      { status: 400 },
    );
  }

  try {
    const preset = await updatePipelinePreset(id, {
      name: body.name,
    });
    return NextResponse.json({ preset });
  } catch (error) {
    return createErrorResponse(error, "PIPELINE_PRESET_UPDATE_FAILED");
  }
}

/**
 * DELETE /api/admin/pipeline-presets/[id]
 *
 * Delete a pipeline preset.
 * Fails if the preset is in use by active job items.
 * Query params:
 * - checkOnly: "true" to only check if deletion is possible
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const checkOnly = searchParams.get("checkOnly") === "true";

  try {
    // Check if in use
    const inUse = await isPipelinePresetInUse(id);

    if (checkOnly) {
      return NextResponse.json({ inUse });
    }

    if (inUse) {
      return NextResponse.json(
        { error: "PRESET_IN_USE" },
        { status: 400 },
      );
    }

    await deletePipelinePreset(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "PIPELINE_PRESET_IN_USE") {
      return NextResponse.json(
        { error: "PRESET_IN_USE" },
        { status: 400 },
      );
    }
    return createErrorResponse(error, "PIPELINE_PRESET_DELETE_FAILED");
  }
}
