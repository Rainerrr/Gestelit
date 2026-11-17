import { NextResponse } from "next/server";
import {
  createErrorResponse,
  requireAdminPassword,
} from "@/lib/auth/permissions";
import {
  getChatThread,
  updateChatThread,
  type ChatPriority,
  type ChatThreadStatus,
} from "@/lib/data/chat";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireAdminPassword(request, { allowQueryPassword: false });
    const { threadId } = await context.params;
    const thread = await getChatThread(threadId);
    return NextResponse.json({ thread });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdminPassword(request, { allowQueryPassword: false });
    const { threadId } = await context.params;
    const body = await request.json();
    const thread = await updateChatThread(threadId, {
      status: body?.status as ChatThreadStatus | undefined,
      priority: body?.priority as ChatPriority | undefined,
    });
    return NextResponse.json({ thread });
  } catch (error) {
    return createErrorResponse(error);
  }
}
