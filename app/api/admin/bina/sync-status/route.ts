import { NextResponse } from "next/server";
import { fetchBinaSyncStatus, summarizeSyncFreshness } from "@/lib/data/bina";
import { requireBinaAdmin, routeError } from "../_route-utils";
import { cachedFor } from "@/lib/server/memory-cache";

export const dynamic = "force-dynamic";
const CACHE_TTL_MS = 2 * 60 * 1000;

export async function GET(request: Request) {
  try {
    await requireBinaAdmin(request);
    const status = await cachedFor("bina:sync-status", CACHE_TTL_MS, fetchBinaSyncStatus);
    return NextResponse.json({ ...status, summary: summarizeSyncFreshness(status) });
  } catch (error) {
    return routeError(error, "BINA_SYNC_STATUS_FAILED");
  }
}
