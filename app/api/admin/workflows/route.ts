import { NextResponse } from "next/server";
import { requireAdminPassword } from "@/lib/auth/permissions";
import { aiErrorResponse, isAiSessionId } from "@/lib/ai/http";
import { createServiceSupabase } from "@/lib/supabase/client";
import { getPipelinePresetById } from "@/lib/data/pipeline-presets";
import { invalidatePipelinePresetsCache } from "@/lib/cache/static-cache";
import { validateAgentMap } from "@/lib/workflows/agent";

export async function POST(request: Request) {
  try {
    await requireAdminPassword(request, { allowQueryPassword: false });
    const raw = await request.text();
    if (raw.length > 120000)
      return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
    const b = JSON.parse(raw);
    if (
      (b.id != null && !isAiSessionId(b.id)) ||
      typeof b.name !== "string" ||
      !b.name.trim() ||
      b.name.length > 160 ||
      !Array.isArray(b.station_ids) ||
      !b.station_ids.length ||
      b.station_ids.length > 30 ||
      !b.station_ids.every(isAiSessionId) ||
      new Set(b.station_ids).size !== b.station_ids.length
    )
      return NextResponse.json({ error: "INVALID_WORKFLOW" }, { status: 400 });
    let agents;
    try {
      agents = validateAgentMap(b.agents, b.station_ids);
    } catch {
      return NextResponse.json(
        { error: "INVALID_AGENT_CONFIG" },
        { status: 400 },
      );
    }
    const flags: Record<string, boolean> = {};
    for (const id of b.station_ids) {
      const flag = b.flags?.[id];
      if (flag !== undefined && typeof flag !== "boolean")
        return NextResponse.json(
          { error: "INVALID_APPROVAL_FLAG" },
          { status: 400 },
        );
      flags[id] = flag ?? false;
    }
    const db = createServiceSupabase();
    const { data: id, error } = await db.rpc("save_workflow_preset", {
      p_id: b.id ?? null,
      p_name: b.name.trim(),
      p_station_ids: b.station_ids,
      p_flags: flags,
      p_agents: agents,
    });
    if (error)
      return NextResponse.json(
        { error: "WORKFLOW_SAVE_FAILED" },
        { status: 409 },
      );
    await invalidatePipelinePresetsCache();
    return NextResponse.json({ preset: await getPipelinePresetById(id) });
  } catch (error) {
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    return aiErrorResponse(error, "WORKFLOW_SAVE_FAILED");
  }
}
