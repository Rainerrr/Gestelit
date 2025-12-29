import { NextResponse } from "next/server";
import { requireAdminPassword, createErrorResponse } from "@/lib/auth/permissions";
import { fetchReportReasons, createReportReason } from "@/lib/data/report-reasons";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("activeOnly") === "true";

  try {
    const reasons = await fetchReportReasons({ activeOnly });
    return NextResponse.json({ reasons });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "REASONS_FETCH_FAILED", details: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.label_he !== "string" || !body.label_he.trim()) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const reason = await createReportReason({
      label_he: body.label_he,
      label_ru: typeof body.label_ru === "string" ? body.label_ru : undefined,
      sort_order: typeof body.sort_order === "number" ? body.sort_order : undefined,
    });

    return NextResponse.json({ reason });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "REASON_CREATE_FAILED", details: message },
      { status: 500 }
    );
  }
}
