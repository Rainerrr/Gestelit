import { NextResponse } from "next/server";
import type {
  RealtimePostgresDeletePayload,
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from "@supabase/supabase-js";
import {
  createErrorResponse,
  requireAdminPassword,
} from "@/lib/auth/permissions";
import {
  type ActiveSession,
  fetchActiveSessionById,
  fetchActiveSessions,
} from "@/lib/data/admin-dashboard";
import { createServiceSupabase } from "@/lib/supabase/client";
import type { SessionStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SessionRow = {
  id: string;
  status: SessionStatus;
  ended_at: string | null;
};

type StreamEvent =
  | { type: "initial"; sessions: ActiveSession[] }
  | { type: "insert" | "update"; session: ActiveSession }
  | { type: "delete"; sessionId: string }
  | { type: "error"; message: string };

const encoder = new TextEncoder();

const serialize = (payload: StreamEvent): Uint8Array =>
  encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const supabase = createServiceSupabase();
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: StreamEvent) => controller.enqueue(serialize(payload));
      const sendError = (message: string) =>
        controller.enqueue(serialize({ type: "error", message }));

      channel = supabase.channel("admin-active-sessions-stream");

      const clearHeartbeat = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
      };

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 25_000);

      const closeChannel = async () => {
        clearHeartbeat();
        try {
          if (channel) {
            await supabase.removeChannel(channel);
          }
        } catch (error) {
          console.error("[admin-dashboard] Failed to remove realtime channel", error);
        }
        try {
          controller.close();
        } catch {
          // no-op
        }
      };

        request.signal.addEventListener("abort", () => {
          void closeChannel();
        });

      try {
        const sessions = await fetchActiveSessions();
        send({ type: "initial", sessions });
      } catch (error) {
        console.error("[admin-dashboard] Failed to fetch initial active sessions", error);
        sendError("INITIAL_FETCH_FAILED");
      }

      const handleChange = async (
        payload:
          | RealtimePostgresInsertPayload<SessionRow>
          | RealtimePostgresUpdatePayload<SessionRow>
          | RealtimePostgresDeletePayload<SessionRow>,
      ) => {
        const newRow = payload.new as SessionRow | null;
        const oldRow = payload.old as SessionRow | null;

        if (payload.eventType === "DELETE") {
          const sessionId = oldRow?.id ?? newRow?.id;
          if (sessionId) {
            send({ type: "delete", sessionId });
          }
          return;
        }

        if (!newRow?.id) {
          return;
        }

        const isActive = newRow.status === "active" && !newRow.ended_at;
        const wasActive = oldRow?.status === "active" && !oldRow?.ended_at;

        if (!isActive) {
          if (wasActive) {
            send({ type: "delete", sessionId: newRow.id });
          }
          return;
        }

        try {
          const session = await fetchActiveSessionById(newRow.id);
          if (!session) {
            send({ type: "delete", sessionId: newRow.id });
            return;
          }

          send({
            type: wasActive ? "update" : "insert",
            session,
          });
        } catch (error) {
          console.error("[admin-dashboard] Failed to hydrate session from change payload", error);
          sendError("SESSION_REFRESH_FAILED");
        }
      };

      channel = channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "sessions",
            filter: "status=in.(active,completed,aborted)",
          },
          handleChange,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "sessions",
            filter: "status=in.(active,completed,aborted)",
          },
          handleChange,
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "sessions",
          },
          handleChange,
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") {
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "CLOSED") {
            console.error(
              "[admin-dashboard] Realtime channel closed",
              error,
            );
            sendError("CHANNEL_CLOSED");
            void closeChannel();
          }
        });
    },
    async cancel() {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      try {
        if (channel) {
          await supabase.removeChannel(channel);
        }
        await supabase.removeAllChannels();
      } catch (error) {
        console.error("[admin-dashboard] Failed to cancel stream", error);
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
