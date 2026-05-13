import { NextResponse } from "next/server";
import { importBinaWorkOrderToGestelit } from "@/lib/data/bina";
import { requireBinaAdmin, routeError } from "../../../_route-utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ binaId: string }> }) {
  try {
    await requireBinaAdmin(request);
    const { binaId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const payload = {
      pipeline_preset_id: typeof body?.pipeline_preset_id === "string" ? body.pipeline_preset_id : null,
      station_ids: Array.isArray(body?.station_ids) ? body.station_ids.filter((id: unknown) => typeof id === "string") : [],
      allowQuantityFallback: body?.allowQuantityFallback !== false,
      first_product_approval_flags:
        body?.first_product_approval_flags && typeof body.first_product_approval_flags === "object"
          ? body.first_product_approval_flags
          : undefined,
    };
    const result = await importBinaWorkOrderToGestelit(decodeURIComponent(binaId), payload);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error, "BINA_WORK_ORDER_IMPORT_FAILED");
  }
}
