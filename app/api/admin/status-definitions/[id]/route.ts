import { NextResponse } from "next/server";
import {
  deleteStatusDefinition,
  updateStatusDefinition,
} from "@/lib/data/status-definitions";
import { invalidateStatusDefinitionsCache } from "@/lib/cache/static-cache";
import type { MachineState, StatusScope } from "@/lib/types";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

type StatusUpdatePayload = {
  scope?: StatusScope;
  station_id?: string | null;
  label_he?: string;
  label_ru?: string | null;
  color_hex?: string;
  machine_state?: MachineState;
  report_type?: "none" | "malfunction" | "general";
};

type StatusDefinitionRouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: StatusDefinitionRouteContext) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as
    | StatusUpdatePayload
    | null;
  if (!body) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "initial",
        hypothesisId: "H2",
        location: "app/api/admin/status-definitions/[id]/route.ts:PUT:start",
        message: "update route start",
        data: { id, body },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    const status = await updateStatusDefinition(id, body);
    await invalidateStatusDefinitionsCache();
    fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "initial",
        hypothesisId: "H2",
        location: "app/api/admin/status-definitions/[id]/route.ts:PUT:success",
        message: "update route success",
        data: { id },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    return NextResponse.json({ status });
  } catch (error) {
    fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "initial",
        hypothesisId: "H2",
        location: "app/api/admin/status-definitions/[id]/route.ts:PUT:error",
        message: "update route error",
        data: { id, error: String(error) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    return NextResponse.json(
      { error: "STATUS_DEFINITION_UPDATE_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: StatusDefinitionRouteContext,
) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  }
  try {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "initial",
        hypothesisId: "H3",
        location: "app/api/admin/status-definitions/[id]/route.ts:DELETE:start",
        message: "delete route start",
        data: { id },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    await deleteStatusDefinition(id);
    await invalidateStatusDefinitionsCache();
    fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "initial",
        hypothesisId: "H3",
        location: "app/api/admin/status-definitions/[id]/route.ts:DELETE:success",
        message: "delete route success",
        data: { id },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    fetch("http://127.0.0.1:7242/ingest/e9e360f1-cac8-4774-88a3-e97a664d1472", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "initial",
        hypothesisId: "H3",
        location: "app/api/admin/status-definitions/[id]/route.ts:DELETE:error",
        message: "delete route error",
        data: { id, error: String(error) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    const message = String(error);
    if (message.includes("STATUS_DELETE_FORBIDDEN_RESERVED")) {
      return NextResponse.json(
        { error: "STATUS_DELETE_FORBIDDEN_RESERVED" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "STATUS_DEFINITION_DELETE_FAILED", details: message },
      { status: 500 },
    );
  }
}

