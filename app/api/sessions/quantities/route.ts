import { NextResponse } from "next/server";
import { updateSessionTotals } from "@/lib/data/sessions";

type TotalsPayload = {
  sessionId: string;
  total_good?: number;
  total_scrap?: number;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | TotalsPayload
    | null;

  if (!body?.sessionId) {
    return NextResponse.json(
      { error: "SESSION_ID_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    const session = await updateSessionTotals(body.sessionId, {
      total_good: body.total_good,
      total_scrap: body.total_scrap,
    });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: "SESSION_TOTALS_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}

