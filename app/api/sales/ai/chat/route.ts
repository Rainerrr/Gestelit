import { NextResponse } from "next/server";
import { requireSalesScope } from "@/lib/auth/sales-session";
import { checkInMemoryRateLimit } from "@/lib/ai/rate-limit";
import { runSalesChat } from "@/lib/data/sales-chat";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireSalesScope("sales_ai_query");
    const rate = checkInMemoryRateLimit(`sales-chat:${user.id}`);
    if (!rate.allowed) {
      return NextResponse.json({ error: "SALES_AI_RATE_LIMITED" }, { status: 429 });
    }
    const body = await request.json().catch(() => null);
    const answer = await runSalesChat({
      message: typeof body?.message === "string" ? body.message : "",
      salesUserId: user.id,
      salesperson: user.full_name,
      canViewTeam: user.is_admin,
      requestedScope: body?.scope === "team" ? "team" : "personal",
      dateFrom: typeof body?.dateFrom === "string" ? body.dateFrom : null,
      dateTo: typeof body?.dateTo === "string" ? body.dateTo : null,
    });
    return NextResponse.json(answer);
  } catch (error) {
    const code = error instanceof Error ? error.message : "SALES_AI_FAILED";
    const status = code === "SALES_UNAUTHORIZED"
      ? 401
      : code === "SALES_AI_MESSAGE_REQUIRED" || code === "SALES_AI_REQUEST_BLOCKED"
        ? 400
        : 500;
    if (status === 500) console.error("SALES_AI_FAILED", error);
    return NextResponse.json({ error: code }, { status });
  }
}
