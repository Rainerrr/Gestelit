import { NextResponse } from "next/server";
import { getOrCreateJob } from "@/lib/data/jobs";
import { createSession } from "@/lib/data/sessions";
import {
  requireWorkerOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";

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
    // Verify workerId matches authenticated worker
    await requireWorkerOwnership(request, workerId);

    const job = await getOrCreateJob(jobNumber);
    const session = await createSession({
      worker_id: workerId,
      station_id: stationId,
      job_id: job.id,
    });

    return NextResponse.json({ job, session });
  } catch (error) {
    return createErrorResponse(error, "JOB_SESSION_FAILED");
  }
}

