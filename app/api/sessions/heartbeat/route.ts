import { NextResponse } from "next/server";
import {
  recordSessionHeartbeat,
  recordSessionHeartbeatWithInstance,
} from "@/lib/data/sessions";

type HeartbeatPayload = {
  sessionId?: string;
  instanceId?: string;
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
    // If instanceId provided, use instance-aware heartbeat
    if (payload.instanceId) {
      const result = await recordSessionHeartbeatWithInstance(
        payload.sessionId,
        payload.instanceId,
      );

      if (!result.success) {
        // Return 409 Conflict for instance mismatch
        if (result.error === "INSTANCE_MISMATCH") {
          return NextResponse.json(
            { ok: false, error: "INSTANCE_MISMATCH" },
            { status: 409 },
          );
        }
        // Return 404 for session not found
        if (result.error === "SESSION_NOT_FOUND") {
          return NextResponse.json(
            { ok: false, error: "SESSION_NOT_FOUND" },
            { status: 404 },
          );
        }
        // Return 410 Gone for session no longer active (abandoned/discarded)
        if (result.error === "SESSION_NOT_ACTIVE") {
          return NextResponse.json(
            { ok: false, error: "SESSION_NOT_ACTIVE" },
            { status: 410 },
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    // Fallback to legacy heartbeat (no instance tracking)
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

