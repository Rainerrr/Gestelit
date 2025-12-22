import { NextResponse } from "next/server";
import { requireAdminPassword, createErrorResponse } from "@/lib/auth/permissions";
import { updateMalfunctionStatus } from "@/lib/data/malfunctions";
import type { MalfunctionStatus } from "@/lib/types";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const { status, adminNotes } = body as {
    status?: MalfunctionStatus;
    adminNotes?: string;
  };

  if (!status || !["open", "known", "solved"].includes(status)) {
    return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
  }

  try {
    const malfunction = await updateMalfunctionStatus({
      malfunctionId: id,
      status,
      adminNotes,
      changedBy: "admin",
    });

    return NextResponse.json({ malfunction });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "UPDATE_FAILED", details: message },
      { status: 500 }
    );
  }
}
