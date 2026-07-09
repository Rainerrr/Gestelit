import { NextResponse } from "next/server";
import { requireSalesSessionUser } from "@/lib/auth/sales-session";
import { fetchSalesUserClients } from "@/lib/data/sales-log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSalesSessionUser();
    const url = new URL(request.url);
    return NextResponse.json(await fetchSalesUserClients(user.id, {
      search: url.searchParams.get("search"),
      limit: Number(url.searchParams.get("limit") ?? 12),
    }));
  } catch {
    return NextResponse.json({ error: "SALES_UNAUTHORIZED" }, { status: 401 });
  }
}
