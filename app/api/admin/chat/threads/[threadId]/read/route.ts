import { NextResponse } from "next/server";
import {
  createErrorResponse,
  requireAdminPassword,
} from "@/lib/auth/permissions";
import { getChatThread, markChatThreadRead } from "@/lib/data/chat";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdminPassword(request, { allowQueryPassword: false });
    const { threadId } = await context.params;
    await getChatThread(threadId);
    await markChatThreadRead({ threadId, readerType: "admin" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return createErrorResponse(error);
  }
}
