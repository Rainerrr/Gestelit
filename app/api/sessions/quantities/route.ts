import { NextResponse } from "next/server";
import { updateSessionQuantitiesAtomic } from "@/lib/data/sessions";
import {
  requireSessionOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";

type TotalsPayload = {
  sessionId: string;
  total_good?: number;
  total_scrap?: number;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | TotalsPayload
    | null;

  if (!body?.sessionId) {
    return NextResponse.json(
      { error: "SESSION_ID_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    // Verify session belongs to authenticated worker
    await requireSessionOwnership(request, body.sessionId);

    // Use the atomic RPC which handles WIP management for production lines
    // For legacy sessions (no job_item_id), the RPC falls back to simple UPDATE
    const result = await updateSessionQuantitiesAtomic(
      body.sessionId,
      body.total_good ?? 0,
      body.total_scrap ?? 0,
    );

    // Check if the RPC returned an error
    if (!result.success) {
      // Handle known error codes with user-friendly messages
      if (result.error_code === "WIP_DOWNSTREAM_CONSUMED") {
        return NextResponse.json(
          {
            error: "WIP_DOWNSTREAM_CONSUMED",
            message: "Cannot reduce quantity - already consumed by downstream station",
          },
          { status: 409 },
        );
      }
      if (result.error_code === "SESSION_NOT_FOUND") {
        return NextResponse.json(
          { error: "SESSION_NOT_FOUND" },
          { status: 404 },
        );
      }
      // Other error codes
      return NextResponse.json(
        { error: result.error_code ?? "QUANTITY_UPDATE_FAILED" },
        { status: 400 },
      );
    }

    // Return session-like object with updated totals
    return NextResponse.json({
      session: {
        id: result.session_id,
        total_good: result.total_good,
        total_scrap: result.total_scrap,
      },
    });
  } catch (error) {
    return createErrorResponse(error, "SESSION_TOTALS_FAILED");
  }
}

