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
import { fetchNotifications } from "@/lib/data/notifications";
import { createServiceSupabase } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NotificationRow = {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  action_type: string | null;
  action_payload: Record<string, unknown> | null;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
};

type StreamEvent =
  | { type: "initial"; notifications: Notification[] }
  | { type: "insert"; notification: Notification }
  | { type: "update"; notification: Notification }
  | { type: "delete"; notificationId: string }
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
  let isClosing = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: StreamEvent) => {
        if (isClosing) return;
        controller.enqueue(serialize(payload));
      };
      const sendError = (message: string) => {
        if (isClosing) return;
        controller.enqueue(serialize({ type: "error", message }));
      };

      channel = supabase.channel("admin-notifications-stream");

      const clearHeartbeat = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
      };

      heartbeat = setInterval(() => {
        if (isClosing) return;
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 25_000);

      const closeChannel = async () => {
        if (isClosing) return;
        isClosing = true;
        clearHeartbeat();
        const channelToClose = channel;
        channel = null;
        try {
          if (channelToClose) {
            await supabase.removeChannel(channelToClose);
          }
        } catch (error) {
          console.error("[notifications-stream] Failed to remove realtime channel", error);
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

      // Send initial notifications
      try {
        const notifications = await fetchNotifications({ limit: 50 });
        send({ type: "initial", notifications });
      } catch (error) {
        console.error("[notifications-stream] Failed to fetch initial notifications", error);
        sendError("INITIAL_FETCH_FAILED");
      }

      const handleChange = (
        payload:
          | RealtimePostgresInsertPayload<NotificationRow>
          | RealtimePostgresUpdatePayload<NotificationRow>
          | RealtimePostgresDeletePayload<NotificationRow>,
      ) => {
        const newRow = payload.new as NotificationRow | null;
        const oldRow = payload.old as NotificationRow | null;

        if (payload.eventType === "DELETE") {
          const id = oldRow?.id ?? newRow?.id;
          if (id) {
            send({ type: "delete", notificationId: id });
          }
          return;
        }

        if (!newRow?.id) return;

        // If notification became dismissed, treat as delete for the client
        if (newRow.is_dismissed) {
          send({ type: "delete", notificationId: newRow.id });
          return;
        }

        const notification: Notification = {
          id: newRow.id,
          notification_type: newRow.notification_type as Notification["notification_type"],
          title: newRow.title,
          message: newRow.message,
          action_type: newRow.action_type as Notification["action_type"],
          action_payload: newRow.action_payload,
          is_read: newRow.is_read,
          is_dismissed: newRow.is_dismissed,
          created_at: newRow.created_at,
        };

        send({
          type: payload.eventType === "INSERT" ? "insert" : "update",
          notification,
        });
      };

      channel = channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications" },
          handleChange,
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications" },
          handleChange,
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "notifications" },
          handleChange,
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") return;
          if (status === "CHANNEL_ERROR" || status === "CLOSED") {
            if (!isClosing && channel) {
              console.error("[notifications-stream] Realtime channel closed", error);
              sendError("CHANNEL_CLOSED");
              void closeChannel();
            }
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
        console.error("[notifications-stream] Failed to cancel stream", error);
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
