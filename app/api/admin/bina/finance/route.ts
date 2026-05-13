import { NextResponse } from "next/server";
import { fetchBinaFinance } from "@/lib/data/bina";
import { pagingParams, requireBinaAdmin, routeError } from "../_route-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireBinaAdmin(request);
    return NextResponse.json(await fetchBinaFinance(pagingParams(request)));
  } catch (error) {
    return routeError(error, "BINA_FINANCE_FAILED");
  }
}
