import { NextResponse } from "next/server";
import { startStatusEvent } from "@/lib/data/sessions";
import type { StatusEventState } from "@/lib/types";

type StatusPayload = {
  sessionId: string;
  status: StatusEventState;
  reasonId?: string | null;
  note?: string | null;
  imageUrl?: string | null;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | StatusPayload
    | null;

  if (!body?.sessionId || !body.status) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const event = await startStatusEvent({
      session_id: body.sessionId,
      status: body.status,
      reason_id: body.reasonId,
      note: body.note,
      image_url: body.imageUrl,
    });

    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json(
      { error: "STATUS_EVENT_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}

