import { NextRequest, NextResponse } from "next/server";
import { updateJob, deleteJob, getJobById } from "@/lib/data/jobs";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

type JobPayload = {
  customer_name?: string | null;
  description?: string | null;
  due_date?: string | null;
  // planned_quantity removed - now set per job_item
};

const respondWithError = (error: unknown) => {
  if (error instanceof Error) {
    const message = error.message;
    // Check for known error codes
    if (
      message === "JOB_HAS_ACTIVE_SESSIONS" ||
      message === "JOB_NOT_FOUND" ||
      message.startsWith("JOB_UPDATE_FAILED") ||
      message.startsWith("JOB_DELETE_FAILED")
    ) {
      return NextResponse.json(
        { error: message.split(":")[0] },
        { status: 400 },
      );
    }
  }

  console.error("[admin-job-id] unexpected", error);
  return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 500 });
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  try {
    const { id } = await context.params;
    const job = await getJobById(id);

    if (!job) {
      return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as JobPayload | null;
  if (!body) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const job = await updateJob(id, {
      customer_name: body.customer_name,
      description: body.description,
      due_date: body.due_date,
    });

    return NextResponse.json({ job });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  try {
    const { id } = await context.params;
    await deleteJob(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respondWithError(error);
  }
}
