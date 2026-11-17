import { NextResponse } from "next/server";
import { createErrorResponse, requireWorker } from "@/lib/auth/permissions";
import { assertWorkerThreadAccess, markChatThreadRead } from "@/lib/data/chat";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const worker = await requireWorker(request);
    const { threadId } = await context.params;
    await assertWorkerThreadAccess(threadId, worker.id);
    await markChatThreadRead({ threadId, readerType: "worker", workerId: worker.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return createErrorResponse(error);
  }
}
