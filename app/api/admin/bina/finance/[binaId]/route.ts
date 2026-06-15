import { NextResponse } from "next/server";
import { fetchBinaFinanceDetail } from "@/lib/data/bina";
import { requireBinaAdmin, routeError } from "../../_route-utils";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ binaId: string }> },
) {
  try {
    await requireBinaAdmin(request);
    const { binaId } = await params;
    const url = new URL(request.url);
    return NextResponse.json(await fetchBinaFinanceDetail(decodeURIComponent(binaId), url.searchParams.get("kind")));
  } catch (error) {
    return routeError(error, "BINA_FINANCE_DETAIL_FAILED");
  }
}
