import { NextResponse } from "next/server";
import {
  fetchAllJobsWithStats,
  createJobAdmin,
  type JobWithStats,
} from "@/lib/data/jobs";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

type JobPayload = {
  job_number?: string;
  customer_name?: string | null;
  description?: string | null;
  // planned_quantity removed - now set per job_item
};

const respondWithError = (error: unknown) => {
  if (error instanceof Error) {
    const message = error.message;
    // Check for known error codes
    if (
      message === "JOB_NUMBER_EXISTS" ||
      message.startsWith("JOB_CREATE_FAILED")
    ) {
      return NextResponse.json(
        { error: message.split(":")[0] },
        { status: 400 },
      );
    }
  }

  console.error("[admin-jobs] unexpected", error);
  return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 500 });
};

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const status = searchParams.get("status") as
    | "active"
    | "completed"
    | "all"
    | null;

  try {
    const jobs = await fetchAllJobsWithStats({
      search: search ?? undefined,
      status: status ?? "all",
    });
    return NextResponse.json<{ jobs: JobWithStats[] }>({ jobs });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as JobPayload | null;

  if (!body?.job_number?.trim()) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const job = await createJobAdmin({
      job_number: body.job_number.trim(),
      customer_name: body.customer_name ?? null,
      description: body.description ?? null,
    });

    return NextResponse.json({ job });
  } catch (error) {
    return respondWithError(error);
  }
}
