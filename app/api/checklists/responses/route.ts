import { NextResponse } from "next/server";
import { saveChecklistResponses } from "@/lib/data/checklists";
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
    await saveChecklistResponses(
      body.sessionId,
      body.stationId,
      body.kind,
      body.responses,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "CHECKLIST_RESPONSE_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}

