import { NextResponse } from "next/server";
import { fetchReasonsByType } from "@/lib/data/reasons";
import type { ReasonType } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as ReasonType | null;

  try {
    const reasons = await fetchReasonsByType(type ?? "stop");
    return NextResponse.json({ reasons });
  } catch (error) {
    return NextResponse.json(
      { error: "REASONS_FETCH_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}

