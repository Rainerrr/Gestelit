import { NextResponse } from "next/server";
import { fetchBinaWeekly } from "@/lib/data/bina-weekly";
import { requireBinaAdmin, routeError } from "../_route-utils";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireBinaAdmin(request);
    const result = await fetchBinaWeekly(new URL(request.url).searchParams.get("start") ?? undefined);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_WEEK_START") return NextResponse.json({ error: error.message }, { status: 400 });
    return routeError(error, "WEEKLY_DATA_UNAVAILABLE");
  }
}
