import { NextResponse } from "next/server";
import { fetchBinaPurchasing } from "@/lib/data/bina";
import { pagingParams, requireBinaAdmin, routeError } from "../_route-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireBinaAdmin(request);
    return NextResponse.json(await fetchBinaPurchasing(pagingParams(request)));
  } catch (error) {
    return routeError(error, "BINA_PURCHASING_FAILED");
  }
}
