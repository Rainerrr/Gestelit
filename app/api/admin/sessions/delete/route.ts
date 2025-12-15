import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

type Payload = {
  ids?: string[];
};

export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as Payload | null;
  const ids = body?.ids?.filter(Boolean) ?? [];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "NO_SESSION_IDS_PROVIDED" },
      { status: 400 },
    );
  }

  try {
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("sessions")
      .delete()
      .in("id", ids)
      .select("id");

    if (error) {
      throw error;
    }

    const deleted = data?.length ?? 0;
    return NextResponse.json({ deleted });
  } catch (error) {
    console.error("[admin-delete-sessions] failed", error);
    return NextResponse.json(
      { error: "DELETE_SESSIONS_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}
