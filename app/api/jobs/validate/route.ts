import { NextResponse } from "next/server";
import { findJobByNumber } from "@/lib/data/jobs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobNumber = searchParams.get("jobNumber");

  if (!jobNumber?.trim()) {
    return NextResponse.json(
      { error: "MISSING_JOB_NUMBER", exists: false },
      { status: 400 },
    );
  }

  try {
    const job = await findJobByNumber(jobNumber.trim());
    return NextResponse.json({
      exists: Boolean(job),
      job: job ?? undefined,
    });
  } catch (error) {
    console.error("[jobs-validate] unexpected", error);
    return NextResponse.json(
      { error: "UNKNOWN_ERROR", exists: false },
      { status: 500 },
    );
  }
}
