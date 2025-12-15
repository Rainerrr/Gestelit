import { NextResponse } from "next/server";
import {
  AdminActionError,
  assignWorkerToStation,
  fetchWorkerStationAssignments,
  removeWorkerStation,
} from "@/lib/data/admin-management";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

type AssignmentPayload = {
  workerId?: string;
  stationId?: string;
};

const respondWithError = (error: unknown) => {
  if (error instanceof AdminActionError) {
    return NextResponse.json(
      { error: error.code, details: error.details ?? error.message },
      { status: error.status },
    );
  }

  console.error("[admin-worker-stations] unexpected", error);
  return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 500 });
};

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }
  const { searchParams } = new URL(request.url);
  const workerId = searchParams.get("workerId");
  if (!workerId) {
    return NextResponse.json({ error: "MISSING_WORKER_ID" }, { status: 400 });
  }

  try {
    const stations = await fetchWorkerStationAssignments(workerId);
    return NextResponse.json({ stations });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as AssignmentPayload | null;
  if (!body?.workerId || !body.stationId) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  try {
    await assignWorkerToStation(body.workerId, body.stationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as AssignmentPayload | null;
  if (!body?.workerId || !body.stationId) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  try {
    await removeWorkerStation(body.workerId, body.stationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respondWithError(error);
  }
}