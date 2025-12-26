import { NextResponse } from "next/server";
import {
  createStatusDefinition,
  fetchStatusDefinitionsByStationIds,
} from "@/lib/data/status-definitions";
import type { MachineState, StatusScope } from "@/lib/types";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }
  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get("stationId");
  const stationIdsParam = searchParams.get("stationIds");
  const stationIds = stationIdsParam
    ? stationIdsParam.split(",").filter(Boolean)
    : stationId
      ? [stationId]
      : [];

  try {
    const statuses = await fetchStatusDefinitionsByStationIds(stationIds);
    return NextResponse.json({ statuses });
  } catch (error) {
    return NextResponse.json(
      { error: "STATUS_DEFINITIONS_FETCH_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as {
    scope?: StatusScope;
    station_id?: string | null;
    label_he?: string;
    label_ru?: string | null;
    color_hex?: string;
    machine_state?: MachineState;
    requires_malfunction_report?: boolean;
  } | null;

  if (!body?.scope || !body.label_he || !body.machine_state) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const status = await createStatusDefinition({
      scope: body.scope,
      station_id: body.station_id,
      label_he: body.label_he,
      label_ru: body.label_ru,
      color_hex: body.color_hex,
      machine_state: body.machine_state,
      requires_malfunction_report: body.requires_malfunction_report,
    });
    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json(
      { error: "STATUS_DEFINITION_CREATE_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}

