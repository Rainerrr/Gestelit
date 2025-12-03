import { NextResponse } from "next/server";
import { recordSessionHeartbeat } from "@/lib/data/sessions";

type HeartbeatPayload = {
  sessionId?: string;
  closing?: boolean;
};

export async function POST(request: Request) {
  let payload: HeartbeatPayload | null = null;
  try {
    const raw = await request.text();
    payload = raw ? (JSON.parse(raw) as HeartbeatPayload) : null;
  } catch (error) {
    console.error("[heartbeat] Failed to parse request body", error);
    payload = null;
  }

  if (!payload?.sessionId) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    await recordSessionHeartbeat(payload.sessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      `[heartbeat] Failed to record heartbeat for ${payload.sessionId}`,
      error,
    );
    return NextResponse.json({ ok: false });
  }
}

