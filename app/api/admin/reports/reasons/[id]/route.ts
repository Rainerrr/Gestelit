import { NextResponse } from "next/server";
import { requireAdminPassword, createErrorResponse } from "@/lib/auth/permissions";
import { updateReportReason, deleteReportReason } from "@/lib/data/report-reasons";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const reason = await updateReportReason(id, {
      label_he: typeof body.label_he === "string" ? body.label_he : undefined,
      label_ru: body.label_ru !== undefined ? body.label_ru : undefined,
      sort_order: typeof body.sort_order === "number" ? body.sort_order : undefined,
      is_active: typeof body.is_active === "boolean" ? body.is_active : undefined,
    });

    return NextResponse.json({ reason });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "REASON_UPDATE_FAILED", details: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id } = await params;

  try {
    await deleteReportReason(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "REASON_DELETE_FAILED", details: message },
      { status: 500 }
    );
  }
}
