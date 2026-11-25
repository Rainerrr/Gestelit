import { NextResponse } from "next/server";
import { fetchBinaManufacturingOverview } from "@/lib/data/bina";
import { requireBinaAdmin, routeError } from "../_route-utils";
import { cachedFor } from "@/lib/server/memory-cache";

export const dynamic = "force-dynamic";
const CACHE_TTL_MS = 2 * 60 * 1000;

export async function GET(request: Request) {
  try {
    await requireBinaAdmin(request);
    const overview = await cachedFor("bina:manufacturing-overview:2024-11", CACHE_TTL_MS, fetchBinaManufacturingOverview);
    return NextResponse.json({ overview });
  } catch (error) {
    return routeError(error, "BINA_OVERVIEW_FAILED");
  }
}
