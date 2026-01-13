import { NextResponse } from "next/server";
import {
  getJobItemById,
  updateJobItem,
  deleteJobItem,
} from "@/lib/data/job-items";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

type RouteParams = {
  params: Promise<{ id: string; itemId: string }>;
};

/**
 * GET /api/admin/jobs/[id]/items/[itemId]
 *
 * Get a job item by ID with full details.
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { itemId } = await params;

  try {
    const item = await getJobItemById(itemId);
    if (!item) {
      return NextResponse.json(
        { error: "JOB_ITEM_NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json({ item });
  } catch (error) {
    return createErrorResponse(error, "JOB_ITEM_FETCH_FAILED");
  }
}

/**
 * PUT /api/admin/jobs/[id]/items/[itemId]
 *
 * Update a job item.
 * Body: { planned_quantity?: number, is_active?: boolean }
 *
 * Note: kind, station_id, and production_line_id cannot be changed after creation.
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { itemId } = await params;
  const body = await request.json().catch(() => null);

  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json(
      { error: "NO_FIELDS_TO_UPDATE" },
      { status: 400 },
    );
  }

  // Validate planned_quantity if provided
  if (body.planned_quantity !== undefined) {
    if (typeof body.planned_quantity !== "number" || body.planned_quantity <= 0) {
      return NextResponse.json(
        { error: "INVALID_QUANTITY", message: "planned_quantity must be a positive number" },
        { status: 400 },
      );
    }
  }

  try {
    const item = await updateJobItem(itemId, {
      planned_quantity: body.planned_quantity,
      is_active: body.is_active,
    });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "JOB_ITEM_INVALID_QUANTITY") {
        return NextResponse.json(
          { error: "INVALID_QUANTITY" },
          { status: 400 },
        );
      }
    }
    return createErrorResponse(error, "JOB_ITEM_UPDATE_FAILED");
  }
}

/**
 * DELETE /api/admin/jobs/[id]/items/[itemId]
 *
 * Delete a job item.
 * Fails if the job item has active sessions.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { itemId } = await params;

  try {
    await deleteJobItem(itemId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "JOB_ITEM_HAS_ACTIVE_SESSIONS") {
        return NextResponse.json(
          { error: "HAS_ACTIVE_SESSIONS", message: "Cannot delete job item with active sessions" },
          { status: 409 },
        );
      }
    }
    return createErrorResponse(error, "JOB_ITEM_DELETE_FAILED");
  }
}
