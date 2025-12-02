import { NextResponse } from "next/server";
import { fetchWorkerByCode } from "@/lib/data/workers";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const workerCode = body?.workerCode as string | undefined;

  if (!workerCode) {
    return NextResponse.json(
      { error: "WORKER_CODE_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    const worker = await fetchWorkerByCode(workerCode);
    if (!worker) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ worker });
  } catch (error) {
    return NextResponse.json(
      { error: "LOGIN_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}

