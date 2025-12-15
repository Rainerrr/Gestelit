import { NextResponse } from "next/server";
import { startStatusEvent } from "@/lib/data/sessions";
import type { StatusEventState } from "@/lib/types";
import {
  requireSessionOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";

type StatusPayload = {
  sessionId: string;
  statusDefinitionId: StatusEventState;
  stationReasonId?: string | null;
  note?: string | null;
  imageUrl?: string | null;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | StatusPayload
    | null;

  if (!body?.sessionId || !body.statusDefinitionId) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    // Verify session belongs to authenticated worker
    await requireSessionOwnership(request, body.sessionId);

    const event = await startStatusEvent({
      session_id: body.sessionId,
      status_definition_id: body.statusDefinitionId,
      station_reason_id: body.stationReasonId,
      note: body.note,
      image_url: body.imageUrl,
    });

    return NextResponse.json({ event });
  } catch (error) {
    return createErrorResponse(error, "STATUS_EVENT_FAILED");
  }
}

