import { NextResponse } from "next/server";
import { requireSalesSessionUser } from "@/lib/auth/sales-session";
import { updateSalesActivityForUser } from "@/lib/data/sales-log";
import type { SalesActivityInput } from "@/lib/data/sales-log";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireSalesSessionUser();
    const { id } = await context.params;
    const body = await request.json().catch(() => null) as Partial<SalesActivityInput> | null;
    if (!body) {
      return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
    }
    const activity = await updateSalesActivityForUser(user.id, id, body);
    return NextResponse.json({ activity });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SALES_ACTIVITY_UPDATE_FAILED";
    const status = message === "SALES_UNAUTHORIZED" ? 401 : message === "SALES_ACTIVITY_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
