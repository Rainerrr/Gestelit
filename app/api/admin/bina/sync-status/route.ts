import { NextResponse } from "next/server";
import { fetchBinaSyncStatus, summarizeSyncFreshness } from "@/lib/data/bina";
import { requireBinaAdmin, routeError } from "../_route-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireBinaAdmin(request);
    const status = await fetchBinaSyncStatus();
    return NextResponse.json({ ...status, summary: summarizeSyncFreshness(status) });
  } catch (error) {
    return routeError(error, "BINA_SYNC_STATUS_FAILED");
  }
}
