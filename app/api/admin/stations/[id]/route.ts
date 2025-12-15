import { NextRequest, NextResponse } from "next/server";
import { AdminActionError, deleteStation, updateStation } from "@/lib/data/admin-management";
import type { StationChecklistItem, StationReason, StationType } from "@/lib/types";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

type StationPayload = {
  name?: string;
  code?: string;
  station_type?: StationType;
  is_active?: boolean;
  station_reasons?: StationReason[] | null;
  start_checklist?: StationChecklistItem[] | null;
  end_checklist?: StationChecklistItem[] | null;
};

const respondWithError = (error: unknown) => {
  if (error instanceof AdminActionError) {
    return NextResponse.json(
      { error: error.code, details: error.details ?? error.message },
      { status: error.status },
    );
  }

  console.error("[admin-station-id] unexpected", error);
  return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 500 });
};

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as StationPayload | null;
  if (!body) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  if (body.start_checklist !== undefined && Array.isArray(body.start_checklist) && body.start_checklist.length === 0) {
    return NextResponse.json({ error: "INVALID_PAYLOAD", message: "start_checklist must include at least one item" }, { status: 400 });
  }

  if (body.end_checklist !== undefined && Array.isArray(body.end_checklist) && body.end_checklist.length === 0) {
    return NextResponse.json({ error: "INVALID_PAYLOAD", message: "end_checklist must include at least one item" }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const station = await updateStation(id, {
      name: body.name,
      code: body.code,
      station_type: body.station_type,
      is_active: body.is_active,
      station_reasons: body.station_reasons,
      start_checklist: body.start_checklist,
      end_checklist: body.end_checklist,
    });

    return NextResponse.json({ station });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  try {
    const { id } = await context.params;
    await deleteStation(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respondWithError(error);
  }
}

