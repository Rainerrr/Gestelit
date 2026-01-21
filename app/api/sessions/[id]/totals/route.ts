import { NextResponse } from "next/server";
import { getSessionCurrentJobItemTotals } from "@/lib/data/sessions";
import {
  requireSessionOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";

/**
 * GET /api/sessions/:id/totals
 *
 * Returns the current job item totals for a session.
 * Totals are derived from status_events (single source of truth).
 *
 * Used by the work page to sync context state with database on resume.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  if (!sessionId) {
    return NextResponse.json(
      { error: "SESSION_ID_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    // Verify session belongs to authenticated worker
    await requireSessionOwnership(request, sessionId);

    const totals = await getSessionCurrentJobItemTotals(sessionId);

    if (!totals) {
      return NextResponse.json(
        { error: "SESSION_NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      good: totals.good,
      scrap: totals.scrap,
      jobItemId: totals.jobItemId,
    });
  } catch (error) {
    return createErrorResponse(error, "SESSION_TOTALS_FAILED");
  }
}
