import { NextResponse } from "next/server";
import { requireAdminPassword, createErrorResponse } from "@/lib/auth/permissions";
import { getOpenMalfunctionsGroupedByStation } from "@/lib/data/malfunctions";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  try {
    const data = await getOpenMalfunctionsGroupedByStation();
    return NextResponse.json({ stations: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "FETCH_FAILED", details: message },
      { status: 500 }
    );
  }
}
