import { NextResponse } from "next/server";
import { requireAdminPassword, createErrorResponse } from "@/lib/auth/permissions";
import { getOpenMalfunctionsGroupedByStation, getArchivedMalfunctionsGroupedByStation } from "@/lib/data/malfunctions";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("archived") === "true";

  try {
    const data = await getOpenMalfunctionsGroupedByStation();

    if (includeArchived) {
      const archivedData = await getArchivedMalfunctionsGroupedByStation();
      return NextResponse.json({ stations: data, archived: archivedData });
    }

    return NextResponse.json({ stations: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "FETCH_FAILED", details: message },
      { status: 500 }
    );
  }
}
