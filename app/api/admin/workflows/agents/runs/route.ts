import { NextResponse } from "next/server";
import { requireAdminPassword } from "@/lib/auth/permissions";
import { aiErrorResponse, isAiSessionId } from "@/lib/ai/http";
import { checkInMemoryRateLimit } from "@/lib/ai/rate-limit";
import { createServiceSupabase } from "@/lib/supabase/client";
import { validateAgentConfig } from "@/lib/workflows/agent";
import { generateWorkflowAgentResult } from "@/lib/workflows/run-agent";

export async function POST(request: Request) {
  let runId: string | null = null;
  const db = createServiceSupabase();
  try {
    await requireAdminPassword(request, { allowQueryPassword: false });
    const b = await request.json().catch(() => null);
    if (!b || !isAiSessionId(b.stepId) || !isAiSessionId(b.requestId))
      return NextResponse.json({ error: "INVALID_AGENT_RUN" }, { status: 400 });
    const { data: existing, error: existingError } = await db
      .from("workflow_agent_runs")
      .select("id,status,result,job_item_step_id")
      .eq("request_id", b.requestId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing)
      return existing.job_item_step_id === b.stepId
        ? NextResponse.json({ run: existing })
        : NextResponse.json({ error: "REQUEST_ID_CONFLICT" }, { status: 409 });
    if (!checkInMemoryRateLimit("admin:workflow-agent", { limit: 8 }).allowed)
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    const { data: step, error } = await db
      .from("job_item_steps")
      .select(
        "id,position,is_terminal,requires_first_product_approval,agent_config,stations(name,code),job_items!inner(id,name,planned_quantity,is_active,jobs(job_number,customer_name,description,due_date))",
      )
      .eq("id", b.stepId)
      .single();
    if (error || !step)
      return NextResponse.json({ error: "STEP_NOT_FOUND" }, { status: 404 });
    // Supabase relation shapes vary with generated types, normalize without trusting caller context.
    const item = (Array.isArray(step.job_items)
      ? step.job_items[0]
      : step.job_items) as unknown as {
      id: string;
      name: string;
      planned_quantity: number;
      is_active: boolean;
      jobs: unknown;
    };
    if (!item?.is_active)
      return NextResponse.json({ error: "JOB_ITEM_INACTIVE" }, { status: 409 });
    const config = validateAgentConfig(step.agent_config);
    if (!config)
      return NextResponse.json(
        { error: "NO_AGENT_CONFIGURED" },
        { status: 409 },
      );
    const snapshot: Record<string, unknown> = {
      station: step.stations,
      position: step.position,
      isTerminal: step.is_terminal,
      requiresFirstProductApproval: step.requires_first_product_approval,
      capturedAt: new Date().toISOString(),
    };
    if (config.includeJobContext) {
      const { data: route, error: routeError } = await db
        .from("job_item_steps")
        .select("id,position,is_terminal,requires_first_product_approval,stations(name,code)")
        .eq("job_item_id", item.id)
        .order("position", { ascending: true });
      if (routeError) throw routeError;
      snapshot.route = route;
      snapshot.nextStation = route?.find((entry) => entry.position > step.position)?.stations ?? null;
      snapshot.job = {
        product: item.name,
        plannedQuantity: item.planned_quantity,
        details: item.jobs,
      };
    }
    if (config.includeProgress) {
      const { data: progress, error: progressError } = await db
        .from("wip_balances")
        .select("good_reported,scrap_reported")
        .eq("job_item_step_id", step.id)
        .maybeSingle();
      if (progressError) throw progressError;
      snapshot.stationProgress = progress;
    }
    const { data: run, error: insertError } = await db
      .from("workflow_agent_runs")
      .insert({
        request_id: b.requestId,
        job_item_step_id: step.id,
        agent_config: config,
        input_snapshot: snapshot,
      })
      .select("id")
      .single();
    if (insertError)
      return NextResponse.json(
        { error: "RUN_ALREADY_REQUESTED_OR_UNAVAILABLE" },
        { status: 409 },
      );
    runId = run.id;
    const result = await generateWorkflowAgentResult(
      config,
      snapshot,
      request.signal,
    );
    const { data: saved, error: saveError } = await db
      .from("workflow_agent_runs")
      .update({
        status: "pending_review",
        result,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("status", "running")
      .select("id,status,result,created_at,job_item_step_id")
      .single();
    if (saveError) throw saveError;
    return NextResponse.json({ run: saved });
  } catch (error) {
    if (runId)
      await db
        .from("workflow_agent_runs")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", runId)
        .eq("status", "running");
    return aiErrorResponse(error, "WORKFLOW_AGENT_FAILED");
  }
}
export async function PATCH(request: Request) {
  try {
    await requireAdminPassword(request, { allowQueryPassword: false });
    const b = await request.json().catch(() => null);
    if (
      !b ||
      !isAiSessionId(b.id) ||
      !["approved", "rejected"].includes(b.status)
    )
      return NextResponse.json({ error: "INVALID_REVIEW" }, { status: 400 });
    const { data, error } = await createServiceSupabase()
      .from("workflow_agent_runs")
      .update({ status: b.status, reviewed_at: new Date().toISOString() })
      .eq("id", b.id)
      .eq("status", "pending_review")
      .select("id,status,reviewed_at")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return NextResponse.json(
        { error: "RUN_ALREADY_REVIEWED_OR_MISSING" },
        { status: 409 },
      );
    return NextResponse.json({ run: data });
  } catch (error) {
    return aiErrorResponse(error, "WORKFLOW_AGENT_REVIEW_FAILED");
  }
}
