import { NextResponse } from "next/server";
import { requireAdminPassword } from "@/lib/auth/permissions";
import { aiErrorResponse } from "@/lib/ai/http";
import { createServiceSupabase } from "@/lib/supabase/client";
export async function GET(request: Request) {
  try {
    await requireAdminPassword(request, { allowQueryPassword: false });
    const db = createServiceSupabase();
    const { data: steps, error } = await db
      .from("job_item_steps")
      .select(
        "id,position,agent_config,stations(name,code),job_items!inner(id,name,planned_quantity,is_active,jobs!inner(id,job_number,customer_name))",
      )
      .not("agent_config", "is", null)
      .eq("job_items.is_active", true)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const ids = (steps ?? []).map((s) => s.id);
    const { data: runs, error: runError } = ids.length
      ? await db
          .from("workflow_agent_runs")
          .select(
            "id,job_item_step_id,status,result,created_at,reviewed_at,completed_at",
          )
          .in("job_item_step_id", ids)
          .order("created_at", { ascending: false })
          .limit(200)
      : { data: [], error: null };
    if (runError) throw runError;
    return NextResponse.json({
      steps: steps ?? [],
      runs: runs ?? [],
      limit: 100,
    });
  } catch (error) {
    return aiErrorResponse(error, "WORKFLOW_AGENTS_FETCH_FAILED");
  }
}
