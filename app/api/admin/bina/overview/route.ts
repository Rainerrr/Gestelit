import { NextResponse } from "next/server";
import { fetchBinaDashboardSummary, fetchBinaOverview } from "@/lib/data/bina";
import { requireBinaAdmin, routeError } from "../_route-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireBinaAdmin(request);
    const [overview, dashboard] = await Promise.all([
      fetchBinaOverview(),
      fetchBinaDashboardSummary(),
    ]);
    return NextResponse.json({ overview, dashboard });
  } catch (error) {
    return routeError(error, "BINA_OVERVIEW_FAILED");
  }
}
