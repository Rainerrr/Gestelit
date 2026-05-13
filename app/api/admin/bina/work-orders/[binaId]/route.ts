import { NextResponse } from "next/server";
import { fetchBinaWorkOrderDetail } from "@/lib/data/bina";
import { requireBinaAdmin, routeError } from "../../_route-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ binaId: string }> }) {
  try {
    await requireBinaAdmin(request);
    const { binaId } = await context.params;
    const detail = await fetchBinaWorkOrderDetail(decodeURIComponent(binaId));
    return NextResponse.json(detail);
  } catch (error) {
    return routeError(error, "BINA_WORK_ORDER_DETAIL_FAILED");
  }
}
