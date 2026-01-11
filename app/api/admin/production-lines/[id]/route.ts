import { NextResponse } from "next/server";
import {
  getProductionLineById,
  updateProductionLine,
  deleteProductionLine,
} from "@/lib/data/production-lines";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/admin/production-lines/[id]
 *
 * Get a production line by ID with its stations.
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await params;

  try {
    const line = await getProductionLineById(id);
    if (!line) {
      return NextResponse.json(
        { error: "PRODUCTION_LINE_NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json({ line });
  } catch (error) {
    return createErrorResponse(error, "PRODUCTION_LINE_FETCH_FAILED");
  }
}

/**
 * PUT /api/admin/production-lines/[id]
 *
 * Update a production line.
 * Body: { name?: string, code?: string | null, is_active?: boolean }
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json(
      { error: "NO_FIELDS_TO_UPDATE" },
      { status: 400 },
    );
  }

  try {
    const line = await updateProductionLine(id, {
      name: body.name,
      code: body.code,
      is_active: body.is_active,
    });
    return NextResponse.json({ line });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PRODUCTION_LINE_CODE_EXISTS") {
        return NextResponse.json(
          { error: "CODE_ALREADY_EXISTS" },
          { status: 400 },
        );
      }
    }
    return createErrorResponse(error, "PRODUCTION_LINE_UPDATE_FAILED");
  }
}

/**
 * DELETE /api/admin/production-lines/[id]
 *
 * Delete a production line.
 * Fails if the line has active job items.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await params;

  try {
    await deleteProductionLine(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PRODUCTION_LINE_HAS_ACTIVE_JOBS") {
        return NextResponse.json(
          { error: "HAS_ACTIVE_JOBS", message: "Cannot delete line with active job items" },
          { status: 409 },
        );
      }
    }
    return createErrorResponse(error, "PRODUCTION_LINE_DELETE_FAILED");
  }
}
