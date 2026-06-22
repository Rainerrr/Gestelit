import { NextResponse } from "next/server";
import { fetchBinaFinanceSummary } from "@/lib/data/bina";
import { requireBinaAdmin, routeError } from "../../_route-utils";
import { cachedFor } from "@/lib/server/memory-cache";

export const dynamic = "force-dynamic";
const CACHE_TTL_MS = 2 * 60 * 1000;

export async function GET(request: Request) {
  try {
    await requireBinaAdmin(request);
    return NextResponse.json(await cachedFor("bina:finance-summary", CACHE_TTL_MS, fetchBinaFinanceSummary));
  } catch (error) {
    return routeError(error, "BINA_FINANCE_SUMMARY_FAILED");
  }
}
