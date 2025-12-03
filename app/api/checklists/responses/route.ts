import { NextResponse } from "next/server";
import {
  markEndChecklistCompleted,
  markSessionStarted,
} from "@/lib/data/sessions";
import type { ChecklistKind } from "@/lib/types";

type ChecklistResponsePayload = {
  sessionId: string;
  stationId: string;
  kind: ChecklistKind;
  responses: Array<{
    item_id: string;
    value_bool?: boolean;
    value_text?: string | null;
  }>;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | ChecklistResponsePayload
    | null;

  if (
    !body?.sessionId ||
    !body.stationId ||
    !body.kind ||
    !Array.isArray(body.responses)
  ) {
    return NextResponse.json(
      { error: "INVALID_PAYLOAD" },
      { status: 400 },
    );
  }

  try {
    let session = null;
    if (body.kind === "start") {
      session = await markSessionStarted(body.sessionId);
    } else if (body.kind === "end") {
      session = await markEndChecklistCompleted(body.sessionId);
    }
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    return NextResponse.json(
      { error: "CHECKLIST_RESPONSE_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}

