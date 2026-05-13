import { NextResponse } from "next/server";
import { createErrorResponse, requireAdminPassword } from "@/lib/auth/permissions";
import { runBinaAiChat } from "@/lib/ai/chat-orchestrator";
import { checkInMemoryRateLimit } from "@/lib/ai/rate-limit";
import { generateSecureToken } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";
const MAX_MESSAGE_CHARS = Number(process.env.AI_MAX_PROMPT_CHARS ?? 4000);

async function rateLimitKey(request: Request, sessionToken?: string) {
  if (sessionToken) return `session:${sessionToken}`;
  const headerPassword = request.headers.get("X-Admin-Password");
  if (headerPassword) {
    const { createHash } = await import("node:crypto");
    return `header:${createHash("sha256").update(headerPassword).digest("hex")}`;
  }
  return `anon:${generateSecureToken(8)}`;
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminPassword(request, { allowQueryPassword: false });
    const limiterKey = await rateLimitKey(request, auth.sessionToken);
    const rate = checkInMemoryRateLimit(limiterKey);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "RATE_LIMITED", resetAt: new Date(rate.resetAt).toISOString() },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))),
            "X-RateLimit-Limit": String(rate.limit),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.message !== "string" || !body.message.trim()) {
      return NextResponse.json({ error: "INVALID_MESSAGE" }, { status: 400 });
    }

    if (body.message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json({ error: "MESSAGE_TOO_LONG", maxChars: MAX_MESSAGE_CHARS }, { status: 413 });
    }

    const response = await runBinaAiChat({
      message: body.message.trim(),
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
      context: body.context && typeof body.context === "object" ? body.context : {},
    });

    return NextResponse.json(response);
  } catch (error) {
    return createErrorResponse(error, "AI_CHAT_FAILED");
  }
}
