import { NextResponse } from "next/server";
import { getGracefulActiveSession } from "@/lib/data/sessions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workerId = searchParams.get("workerId");

  if (!workerId) {
    return NextResponse.json(
      { error: "WORKER_ID_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    const session = await getGracefulActiveSession(workerId);
    return NextResponse.json({ session });
  } catch (error) {
    console.error(
      `[workers/active-session] Failed to fetch session for worker ${workerId}`,
      error,
    );
    return NextResponse.json(
      { error: "ACTIVE_SESSION_FETCH_FAILED" },
      { status: 500 },
    );
  }
}

