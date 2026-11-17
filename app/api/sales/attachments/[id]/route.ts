import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getSalesSessionUser } from "@/lib/auth/sales-session";
import { createServiceSupabase } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const [{ id }, user, admin] = await Promise.all([
    context.params,
    getSalesSessionUser(),
    hasAdminSession(),
  ]);

  if (!user && !admin) {
    return NextResponse.json({ error: "SALES_UNAUTHORIZED" }, { status: 401 });
  }

  const supabase = createServiceSupabase();
  const { data: attachment, error } = await supabase
    .from("sales_activity_attachments")
    .select("id,sales_user_id,storage_bucket,storage_path")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "SALES_ATTACHMENT_LOOKUP_FAILED" }, { status: 500 });
  }
  if (!attachment) {
    return NextResponse.json({ error: "SALES_ATTACHMENT_NOT_FOUND" }, { status: 404 });
  }
  const canViewTeam = user?.scopes.includes("sales_team_view") ?? false;
  if (!admin && !canViewTeam && attachment.sales_user_id !== user?.id) {
    return NextResponse.json({ error: "SALES_ATTACHMENT_FORBIDDEN" }, { status: 403 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(attachment.storage_bucket)
    .createSignedUrl(attachment.storage_path, 60);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "SALES_ATTACHMENT_SIGN_FAILED" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, 307);
}
