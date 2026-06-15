import { NextResponse } from "next/server";
import { updateSalesActivity } from "@/lib/data/sales-log";
import { requireSalesAdmin, salesRouteError } from "../_route-utils";
import { SalesValidationError } from "@/lib/data/sales-log-utils";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSalesAdmin(request);
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new SalesValidationError("INVALID_ACTIVITY_ID");
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
    }
    return NextResponse.json(await updateSalesActivity(id, body));
  } catch (error) {
    return salesRouteError(error, "SALES_LOG_UPDATE_FAILED");
  }
}
