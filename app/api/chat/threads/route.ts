import { NextResponse } from "next/server";
import { createErrorResponse, requireWorker } from "@/lib/auth/permissions";
import {
  createWorkerChatThread,
  listWorkerChatThreads,
  type ChatPriority,
} from "@/lib/data/chat";

export async function GET(request: Request) {
  try {
    const worker = await requireWorker(request);
    const { searchParams } = new URL(request.url);
    const threads = await listWorkerChatThreads(worker.id, {
      sessionId: searchParams.get("sessionId"),
      limit: Number.parseInt(searchParams.get("limit") ?? "30", 10),
    });
    return NextResponse.json({ threads });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const worker = await requireWorker(request);
    const body = await request.json();
    const sessionId = body?.sessionId as string | undefined;
    if (!sessionId) {
      return NextResponse.json({ error: "SESSION_ID_REQUIRED" }, { status: 400 });
    }

    const payload = await createWorkerChatThread(worker, {
      sessionId,
      subject: typeof body?.subject === "string" ? body.subject : null,
      priority: (body?.priority as ChatPriority | undefined) ?? "normal",
      body: body?.body ?? null,
      clientMessageId:
        typeof body?.clientMessageId === "string" ? body.clientMessageId : null,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return createErrorResponse(error);
  }
}
