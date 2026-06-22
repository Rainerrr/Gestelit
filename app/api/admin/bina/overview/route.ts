import { NextResponse } from "next/server";
import { fetchBinaDashboardSummary, fetchBinaOverview } from "@/lib/data/bina";
import { requireBinaAdmin, routeError } from "../_route-utils";
import { cachedFor } from "@/lib/server/memory-cache";

export const dynamic = "force-dynamic";
const CACHE_TTL_MS = 2 * 60 * 1000;

export async function GET(request: Request) {
  try {
    await requireBinaAdmin(request);
    const [overview, dashboard] = await Promise.all([
      cachedFor("bina:overview", CACHE_TTL_MS, fetchBinaOverview),
      cachedFor("bina:dashboard-summary", CACHE_TTL_MS, fetchBinaDashboardSummary),
    ]);
    return NextResponse.json({ overview, dashboard });
  } catch (error) {
    return routeError(error, "BINA_OVERVIEW_FAILED");
  }
}
