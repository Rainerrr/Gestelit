import { NextRequest, NextResponse } from "next/server";
import { AdminActionError, deleteWorker, updateWorker } from "@/lib/data/admin-management";

type WorkerPayload = {
  worker_code?: string;
  full_name?: string;
  language?: string | null;
  role?: "worker" | "admin";
  department?: string | null;
  is_active?: boolean;
};

const respondWithError = (error: unknown) => {
  if (error instanceof AdminActionError) {
    return NextResponse.json(
      { error: error.code, details: error.details ?? error.message },
      { status: error.status },
    );
  }

  console.error("[admin-worker-id] unexpected", error);
  return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 500 });
};

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const body = (await request.json().catch(() => null)) as WorkerPayload | null;
  if (!body) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const worker = await updateWorker(id, {
      worker_code: body.worker_code,
      full_name: body.full_name,
      language: body.language,
      role: body.role,
      department: body.department,
      is_active: body.is_active,
    });

    return NextResponse.json({ worker });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await deleteWorker(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respondWithError(error);
  }
}

