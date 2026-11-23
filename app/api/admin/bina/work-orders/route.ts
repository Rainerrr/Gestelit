import { BINA_OPERATIONAL_START } from "@/lib/bina/operational-scope";
import { NextResponse } from "next/server";
import { fetchBinaWorkOrders } from "@/lib/data/bina";
import { pagingParams, requireBinaAdmin, routeError } from "../_route-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireBinaAdmin(request);
    const result = await fetchBinaWorkOrders({ ...pagingParams(request), dateFrom: new URL(request.url).searchParams.get("history") === "all" ? undefined : BINA_OPERATIONAL_START, incomingOnly: new URL(request.url).searchParams.get("incoming") === "true" });
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error, "BINA_WORK_ORDERS_FAILED");
  }
}
