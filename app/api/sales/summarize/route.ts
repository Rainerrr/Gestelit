import { NextResponse } from "next/server";
import { requireSalesSessionUser } from "@/lib/auth/sales-session";
import { checkInMemoryRateLimit } from "@/lib/ai/rate-limit";
import { summarizeSalesActivityNote } from "@/lib/data/sales-ai";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireSalesSessionUser();
    const rate = checkInMemoryRateLimit(`sales-user:${user.id}`);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "RATE_LIMITED", resetAt: new Date(rate.resetAt).toISOString() },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    return NextResponse.json(await summarizeSalesActivityNote({
      rawNote: body?.rawNote,
      eventType: body?.eventType,
      customerName: body?.customerName,
      salesperson: user.full_name,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "SALES_SUMMARY_AI_FAILED";
    const status = message === "SALES_UNAUTHORIZED" ? 401 : message === "NOTE_REQUIRED" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
