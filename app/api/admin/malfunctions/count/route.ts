import { NextResponse } from "next/server";
import { requireAdminPassword, createErrorResponse } from "@/lib/auth/permissions";
import { getOpenMalfunctionsCount } from "@/lib/data/malfunctions";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  try {
    const count = await getOpenMalfunctionsCount();
    return NextResponse.json({ count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "FETCH_FAILED", details: message },
      { status: 500 }
    );
  }
}
