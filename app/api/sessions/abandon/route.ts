import { NextResponse } from "next/server";
import { abandonActiveSession } from "@/lib/data/sessions";
import type { SessionAbandonReason } from "@/lib/types";

const ALLOWED_REASONS: SessionAbandonReason[] = ["worker_choice", "expired"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const sessionId = body?.sessionId as string | undefined;
  const reason =
    (body?.reason as SessionAbandonReason | undefined) ?? "worker_choice";

  if (!sessionId) {
    return NextResponse.json(
      { error: "SESSION_ID_REQUIRED" },
      { status: 400 },
    );
  }

  if (!ALLOWED_REASONS.includes(reason)) {
    return NextResponse.json(
      { error: "INVALID_REASON" },
      { status: 400 },
    );
  }

  try {
    await abandonActiveSession(sessionId, reason);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[sessions/abandon] Failed to close session", error);
    return NextResponse.json(
      { error: "SESSION_ABANDON_FAILED" },
      { status: 500 },
    );
  }
}

