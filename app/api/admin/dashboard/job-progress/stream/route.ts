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
import { fetchActiveJobsWithProgress } from "@/lib/data/admin-dashboard";
import { createServiceSupabase } from "@/lib/supabase/client";
import type { LiveJobProgress } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SessionRow = {
  id: string;
  job_id: string | null;
  station_id: string | null;
  status: string;
  ended_at: string | null;
};

type WipBalanceRow = {
  id: string;
  job_item_step_id: string;
  balance: number;
};

type JobItemProgressRow = {
  id: string;
  job_item_id: string;
  completed_good: number;
  completed_scrap: number;
};

type StreamEvent =
  | { type: "initial"; jobs: LiveJobProgress[] }
  | { type: "update"; jobs: LiveJobProgress[] }
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
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
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

      channel = supabase.channel("admin-job-progress-stream");

      const clearHeartbeat = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
      };

      const clearDebounce = () => {
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
          debounceTimeout = null;
        }
      };

      heartbeat = setInterval(() => {
        if (isClosing) return;
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 25_000);

      const closeChannel = async () => {
        if (isClosing) {
          return;
        }
        isClosing = true;
        clearHeartbeat();
        clearDebounce();
        const channelToClose = channel;
        channel = null;
        try {
          if (channelToClose) {
            await supabase.removeChannel(channelToClose);
          }
        } catch (error) {
          console.error("[job-progress-stream] Failed to remove realtime channel", error);
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

      // Send initial data
      try {
        const jobs = await fetchActiveJobsWithProgress();
        send({ type: "initial", jobs });
      } catch (error) {
        console.error("[job-progress-stream] Failed to fetch initial job progress", error);
        sendError("INITIAL_FETCH_FAILED");
      }

      // Debounced refetch - multiple changes in quick succession only trigger one refetch
      const debouncedRefetch = () => {
        clearDebounce();
        debounceTimeout = setTimeout(async () => {
          if (isClosing) return;
          try {
            const jobs = await fetchActiveJobsWithProgress();
            send({ type: "update", jobs });
          } catch (error) {
            console.error("[job-progress-stream] Failed to refetch job progress", error);
            sendError("REFETCH_FAILED");
          }
        }, 500); // 500ms debounce
      };

      // Handle session changes (new sessions, ended sessions, job changes)
      const handleSessionChange = (
        payload:
          | RealtimePostgresInsertPayload<SessionRow>
          | RealtimePostgresUpdatePayload<SessionRow>
          | RealtimePostgresDeletePayload<SessionRow>,
      ) => {
        if (isClosing) return;
        // Refetch on any session change that might affect job progress
        debouncedRefetch();
      };

      // Handle WIP balance changes
      const handleWipChange = (
        payload:
          | RealtimePostgresInsertPayload<WipBalanceRow>
          | RealtimePostgresUpdatePayload<WipBalanceRow>
          | RealtimePostgresDeletePayload<WipBalanceRow>,
      ) => {
        if (isClosing) return;
        debouncedRefetch();
      };

      // Handle job item progress changes
      const handleProgressChange = (
        payload:
          | RealtimePostgresInsertPayload<JobItemProgressRow>
          | RealtimePostgresUpdatePayload<JobItemProgressRow>
          | RealtimePostgresDeletePayload<JobItemProgressRow>,
      ) => {
        if (isClosing) return;
        debouncedRefetch();
      };

      channel = channel
        // Session changes (active sessions starting/ending)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "sessions",
          },
          handleSessionChange,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "sessions",
          },
          handleSessionChange,
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "sessions",
          },
          handleSessionChange,
        )
        // WIP balance changes
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "wip_balances",
          },
          handleWipChange,
        )
        // Job item progress changes
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "job_item_progress",
          },
          handleProgressChange,
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") {
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "CLOSED") {
            if (!isClosing && channel) {
              console.error("[job-progress-stream] Realtime channel closed", error);
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
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      try {
        if (channel) {
          await supabase.removeChannel(channel);
        }
        await supabase.removeAllChannels();
      } catch (error) {
        console.error("[job-progress-stream] Failed to cancel stream", error);
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
