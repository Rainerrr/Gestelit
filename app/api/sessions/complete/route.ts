import { NextResponse } from "next/server";
import { completeSession } from "@/lib/data/sessions";
import {
  requireSessionOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const sessionId = body?.sessionId as string | undefined;

  if (!sessionId) {
    return NextResponse.json(
      { error: "SESSION_ID_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    // Verify session belongs to authenticated worker
    await requireSessionOwnership(request, sessionId);

    const session = await completeSession(sessionId);
    return NextResponse.json({ session });
  } catch (error) {
    return createErrorResponse(error, "SESSION_COMPLETE_FAILED");
  }
}

