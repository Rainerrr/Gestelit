import { NextResponse } from "next/server";
import { fetchBinaOverview } from "@/lib/data/bina";
import { requireBinaAdmin, routeError } from "../_route-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireBinaAdmin(request);
    const overview = await fetchBinaOverview();
    return NextResponse.json({ overview });
  } catch (error) {
    return routeError(error, "BINA_OVERVIEW_FAILED");
  }
}
