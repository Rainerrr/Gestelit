import { NextResponse } from "next/server";
import { fetchChecklist } from "@/lib/data/checklists";
import type { ChecklistKind } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get("stationId");
  const kind = searchParams.get("kind") as ChecklistKind | null;

  if (!stationId || !kind) {
    return NextResponse.json(
      { error: "MISSING_PARAMS" },
      { status: 400 },
    );
  }

  try {
    const checklist = await fetchChecklist(stationId, kind);
    return NextResponse.json({ checklist });
  } catch (error) {
    return NextResponse.json(
      { error: "CHECKLIST_FETCH_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}

