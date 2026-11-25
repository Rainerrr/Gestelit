import { createHash } from "node:crypto";
import { createServiceSupabase } from "@/lib/supabase/client";
import { buildFollowUpCalendar } from "@/lib/calendar";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token))
    return new Response("Not found", { status: 404 });
  const db = createServiceSupabase();
  const { data: subscription, error } = await db
    .from("sales_calendar_subscriptions")
    .select("sales_user_id")
    .eq("token_hash", createHash("sha256").update(token).digest("hex"))
    .is("revoked_at", null)
    .maybeSingle();
  if (error) return new Response("Unavailable", { status: 503 });
  if (!subscription) return new Response("Not found", { status: 404 });
  const { data: allowed, error: scopeError } = await db.rpc(
    "sales_user_has_scope",
    {
      p_sales_user_id: subscription.sales_user_id,
      p_scope_key: "sales_personal_view",
    },
  );
  if (scopeError) return new Response("Unavailable", { status: 503 });
  if (!allowed) return new Response("Not found", { status: 404 });
  const { data: rows, error: rowsError } = await db
    .from("sales_activity_logs")
    .select(
      "id,customer_name,customer_code,ai_next_action,next_action_date,status,updated_at",
    )
    .eq("sales_user_id", subscription.sales_user_id)
    .not("next_action_date", "is", null)
    .order("next_action_date", { ascending: false })
    .limit(2001);
  if (rowsError || (rows?.length ?? 0) > 2000)
    return new Response("Calendar unavailable", { status: 503 });
  const body = buildFollowUpCalendar(
    (rows ?? []).map((row) => ({
      id: row.id,
      date: row.next_action_date?.slice(0, 10),
      customerName: row.customer_name,
      customerCode: row.customer_code,
      nextAction: row.ai_next_action,
      updatedAt: row.updated_at,
      cancelled: ["done", "won", "lost"].includes(row.status),
    })),
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline; filename=gestelit-follow-ups.ics",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
