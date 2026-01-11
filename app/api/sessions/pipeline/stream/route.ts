import { NextResponse } from "next/server";
import {
  createErrorResponse,
  requireSessionOwnership,
} from "@/lib/auth/permissions";
import { getSessionPipelineContext } from "@/lib/data/sessions";
import type { SessionPipelineContext } from "@/lib/api/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StreamEvent =
  | { type: "initial"; context: SessionPipelineContext }
  | { type: "update"; context: SessionPipelineContext }
  | { type: "error"; message: string };

const encoder = new TextEncoder();

const serialize = (payload: StreamEvent): Uint8Array =>
  encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

const POLL_INTERVAL_MS = 2500; // Poll every 2.5 seconds for WIP changes
const KEEPALIVE_INTERVAL_MS = 25_000;

/**
 * GET /api/sessions/pipeline/stream?sessionId=xxx
 *
 * SSE endpoint that streams pipeline context updates for real-time WIP visualization.
 * Polls wip_balances every 2.5 seconds and sends updates when changes are detected.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "SESSION_ID_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    await requireSessionOwnership(request, sessionId);
  } catch (error) {
    return createErrorResponse(error);
  }

  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let isClosing = false;
  let lastContext: SessionPipelineContext | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: StreamEvent) => {
        try {
          controller.enqueue(serialize(payload));
        } catch {
          // Stream may be closed
        }
      };

      const sendError = (message: string) => {
        try {
          controller.enqueue(serialize({ type: "error", message }));
        } catch {
          // Stream may be closed
        }
      };

      const cleanup = () => {
        if (isClosing) return;
        isClosing = true;

        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      request.signal.addEventListener("abort", cleanup);

      // Keep-alive heartbeat
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          cleanup();
        }
      }, KEEPALIVE_INTERVAL_MS);

      // Helper to check if context has meaningfully changed
      const hasChanged = (
        prev: SessionPipelineContext | null,
        next: SessionPipelineContext,
      ): boolean => {
        if (!prev) return true;
        return (
          prev.upstreamWip !== next.upstreamWip ||
          prev.waitingOutput !== next.waitingOutput ||
          prev.currentPosition !== next.currentPosition ||
          prev.isTerminal !== next.isTerminal ||
          prev.prevStation?.wipAvailable !== next.prevStation?.wipAvailable ||
          prev.nextStation?.wipAvailable !== next.nextStation?.wipAvailable
        );
      };

      // Initial fetch
      try {
        const context = await getSessionPipelineContext(sessionId);
        lastContext = context;
        send({ type: "initial", context });
      } catch (error) {
        console.error("[pipeline-stream] Initial fetch failed:", error);
        sendError("INITIAL_FETCH_FAILED");
        cleanup();
        return;
      }

      // Poll for changes
      pollInterval = setInterval(async () => {
        if (isClosing) return;

        try {
          const context = await getSessionPipelineContext(sessionId);

          if (hasChanged(lastContext, context)) {
            lastContext = context;
            send({ type: "update", context });
          }
        } catch (error) {
          console.error("[pipeline-stream] Poll failed:", error);
          // Don't send error for transient poll failures, just skip
        }
      }, POLL_INTERVAL_MS);
    },

    cancel() {
      isClosing = true;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    },
  });

  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
