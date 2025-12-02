import { NextResponse } from "next/server";
import { getOrCreateJob } from "@/lib/data/jobs";
import { createSession } from "@/lib/data/sessions";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const workerId = body?.workerId as string | undefined;
  const stationId = body?.stationId as string | undefined;
  const jobNumber = body?.jobNumber as string | undefined;

  if (!workerId || !stationId || !jobNumber) {
    return NextResponse.json(
      { error: "MISSING_FIELDS" },
      { status: 400 },
    );
  }

  try {
    const job = await getOrCreateJob(jobNumber);
    const session = await createSession({
      worker_id: workerId,
      station_id: stationId,
      job_id: job.id,
    });

    return NextResponse.json({ job, session });
  } catch (error) {
    return NextResponse.json(
      { error: "JOB_SESSION_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}

