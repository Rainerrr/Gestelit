import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSalesScope } from "@/lib/auth/sales-session";
import { createServiceSupabase } from "@/lib/supabase/client";
export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const user = await requireSalesScope("sales_personal_view");
    const token = randomBytes(32).toString("hex");
    const { error } = await createServiceSupabase()
      .from("sales_calendar_subscriptions")
      .upsert({
        sales_user_id: user.id,
        token_hash: createHash("sha256").update(token).digest("hex"),
        created_at: new Date().toISOString(),
        revoked_at: null,
      });
    if (error) throw error;
    return NextResponse.json(
      { path: `/api/sales/calendar/feed/${token}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "CALENDAR_FAILED";
    return NextResponse.json(
      { error: code.startsWith("SALES_") ? code : "CALENDAR_FAILED" },
      {
        status:
          code === "SALES_UNAUTHORIZED"
            ? 401
            : code === "SALES_FORBIDDEN"
              ? 403
              : 500,
      },
    );
  }
}
export async function DELETE() {
  try {
    const user = await requireSalesScope("sales_personal_view");
    const { error } = await createServiceSupabase()
      .from("sales_calendar_subscriptions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("sales_user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ revoked: true });
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "CALENDAR_REVOKE_FAILED";
    return NextResponse.json(
      { error: code.startsWith("SALES_") ? code : "CALENDAR_REVOKE_FAILED" },
      {
        status:
          code === "SALES_UNAUTHORIZED"
            ? 401
            : code === "SALES_FORBIDDEN"
              ? 403
              : 500,
      },
    );
  }
}
