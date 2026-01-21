import { NextResponse } from "next/server";
import {
  AdminActionError,
  createWorker,
  fetchAllWorkers,
  type WorkerWithStats,
} from "@/lib/data/admin-management";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

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

  console.error("[admin-workers] unexpected", error);
  return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 500 });
};

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }
  const { searchParams } = new URL(request.url);
  const department = searchParams.get("department");
  const search = searchParams.get("search");
  const startsWith = searchParams.get("startsWith");

  try {
    const workers = await fetchAllWorkers({
      department: department ?? undefined,
      search: search ?? undefined,
      startsWith: startsWith ?? undefined,
    });
    return NextResponse.json<{ workers: WorkerWithStats[] }>({ workers });
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

  const body = (await request.json().catch(() => null)) as WorkerPayload | null;

  if (!body?.worker_code || !body.full_name) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const worker = await createWorker({
      worker_code: body.worker_code,
      full_name: body.full_name,
      role: body.role ?? "worker",
      department: body.department ?? null,
      is_active: body.is_active ?? true,
    });

    return NextResponse.json({ worker });
  } catch (error) {
    return respondWithError(error);
  }
}
