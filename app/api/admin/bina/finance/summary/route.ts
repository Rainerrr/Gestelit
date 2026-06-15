import { NextResponse } from "next/server";
import { fetchBinaFinanceSummary } from "@/lib/data/bina";
import { requireBinaAdmin, routeError } from "../../_route-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireBinaAdmin(request);
    return NextResponse.json(await fetchBinaFinanceSummary());
  } catch (error) {
    return routeError(error, "BINA_FINANCE_SUMMARY_FAILED");
  }
}
