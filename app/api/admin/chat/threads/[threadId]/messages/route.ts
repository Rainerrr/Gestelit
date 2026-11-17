import { NextResponse } from "next/server";
import {
  createErrorResponse,
  requireAdminPassword,
} from "@/lib/auth/permissions";
import {
  createChatMessage,
  getChatThread,
  listChatMessages,
} from "@/lib/data/chat";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireAdminPassword(request, { allowQueryPassword: false });
    const { threadId } = await context.params;
    await getChatThread(threadId);

    const { searchParams } = new URL(request.url);
    const messages = await listChatMessages(threadId, {
      limit: Number.parseInt(searchParams.get("limit") ?? "80", 10),
      after: searchParams.get("after"),
    });
    return NextResponse.json({ messages });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireAdminPassword(request, { allowQueryPassword: false });
    const { threadId } = await context.params;
    const thread = await getChatThread(threadId);
    if (thread.status === "closed") {
      return NextResponse.json({ error: "THREAD_CLOSED" }, { status: 409 });
    }

    const body = await request.json();
    const message = await createChatMessage({
      threadId,
      senderType: "admin",
      senderLabel: "מנהל",
      body: body?.body,
      clientMessageId:
        typeof body?.clientMessageId === "string" ? body.clientMessageId : null,
    });
    return NextResponse.json({ message });
  } catch (error) {
    return createErrorResponse(error);
  }
}
