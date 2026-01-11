import { NextResponse } from "next/server";
import { getSessionPipelineContext } from "@/lib/data/sessions";
import {
  requireSessionOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";

/**
 * GET /api/sessions/pipeline?sessionId=xxx
 *
 * Returns the production pipeline context for a session:
 * - Neighboring stations (previous/next)
 * - WIP balances (upstream available, our waiting output)
 * - Position information
 *
 * Used by the ProductionPipeline component for real-time visualization.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "SESSION_ID_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    // Verify session belongs to authenticated worker
    await requireSessionOwnership(request, sessionId);

    const context = await getSessionPipelineContext(sessionId);

    return NextResponse.json({ context });
  } catch (error) {
    return createErrorResponse(error, "PIPELINE_CONTEXT_FAILED");
  }
}
