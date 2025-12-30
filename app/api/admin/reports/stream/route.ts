import { NextResponse } from "next/server";
import type {
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
  RealtimePostgresDeletePayload,
} from "@supabase/supabase-js";
import {
  createErrorResponse,
  requireAdminPassword,
} from "@/lib/auth/permissions";
import {
  getGeneralReports,
  getMalfunctionReportsGroupedByStation,
  getScrapReportsGroupedByStation,
  type StationWithReports,
  type StationWithScrapReports,
} from "@/lib/data/reports";
import { createServiceSupabase } from "@/lib/supabase/client";
import type { ReportWithDetails, ReportType } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ReportRow = {
  id: string;
  type: ReportType;
  status: string;
};

type StatusEventRow = {
  id: string;
  ended_at: string | null;
};

type StreamEvent =
  | { type: "initial"; data: ReportsData }
  | { type: "update"; data: ReportsData }
  | { type: "error"; message: string };

type ReportsData = {
  general: ReportWithDetails[];
  malfunction: StationWithReports[];
  scrap: StationWithScrapReports[];
};

const encoder = new TextEncoder();

const serialize = (payload: StreamEvent): Uint8Array =>
  encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

async function fetchAllReports(): Promise<ReportsData> {
  const [general, malfunction, scrap] = await Promise.all([
    getGeneralReports(),
    getMalfunctionReportsGroupedByStation(),
    getScrapReportsGroupedByStation(),
  ]);

  return { general, malfunction, scrap };
}

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const supabase = createServiceSupabase();
  let reportsChannel: ReturnType<typeof supabase.channel> | null = null;
  let statusEventsChannel: ReturnType<typeof supabase.channel> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let isClosing = false;
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: StreamEvent) => controller.enqueue(serialize(payload));
      const sendError = (message: string) =>
        controller.enqueue(serialize({ type: "error", message }));

      const clearHeartbeat = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
      };

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 25_000);

      const closeChannels = async () => {
        if (isClosing) return;
        isClosing = true;
        clearHeartbeat();
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
          debounceTimeout = null;
        }

        const channels = [reportsChannel, statusEventsChannel];
        reportsChannel = null;
        statusEventsChannel = null;

        try {
          for (const ch of channels) {
            if (ch) await supabase.removeChannel(ch);
          }
        } catch (error) {
          console.error("[reports-stream] Failed to remove realtime channels", error);
        }

        try {
          controller.close();
        } catch {
          // no-op
        }
      };

      request.signal.addEventListener("abort", () => {
        void closeChannels();
      });

      // Send initial data
      try {
        const data = await fetchAllReports();
        send({ type: "initial", data });
      } catch (error) {
        console.error("[reports-stream] Failed to fetch initial reports", error);
        sendError("INITIAL_FETCH_FAILED");
      }

      // Debounced refetch - when any change happens, wait 100ms then refetch all
      const scheduleRefetch = () => {
        if (isClosing) return;
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }
        debounceTimeout = setTimeout(async () => {
          debounceTimeout = null;
          if (isClosing) return;
          try {
            const data = await fetchAllReports();
            send({ type: "update", data });
          } catch (error) {
            console.error("[reports-stream] Failed to refetch reports", error);
            sendError("REFETCH_FAILED");
          }
        }, 100);
      };

      // Handle changes to reports table
      const handleReportChange = (
        _payload:
          | RealtimePostgresInsertPayload<ReportRow>
          | RealtimePostgresUpdatePayload<ReportRow>
          | RealtimePostgresDeletePayload<ReportRow>
      ) => {
        scheduleRefetch();
      };

      // Handle changes to status_events table (for ended_at updates)
      const handleStatusEventChange = (
        _payload:
          | RealtimePostgresInsertPayload<StatusEventRow>
          | RealtimePostgresUpdatePayload<StatusEventRow>
          | RealtimePostgresDeletePayload<StatusEventRow>
      ) => {
        scheduleRefetch();
      };

      // Subscribe to reports table
      reportsChannel = supabase
        .channel("admin-reports-stream")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "reports" },
          handleReportChange
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "reports" },
          handleReportChange
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "reports" },
          handleReportChange
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") return;
          if (status === "CHANNEL_ERROR" || status === "CLOSED") {
            if (!isClosing && reportsChannel) {
              console.error("[reports-stream] Reports channel closed", error);
              sendError("REPORTS_CHANNEL_CLOSED");
              void closeChannels();
            }
          }
        });

      // Subscribe to status_events table for ended_at changes
      statusEventsChannel = supabase
        .channel("admin-status-events-stream")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "status_events" },
          handleStatusEventChange
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") return;
          if (status === "CHANNEL_ERROR" || status === "CLOSED") {
            if (!isClosing && statusEventsChannel) {
              console.error("[reports-stream] Status events channel closed", error);
              // Don't close everything for status events channel error - reports still works
            }
          }
        });
    },
    async cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (debounceTimeout) clearTimeout(debounceTimeout);
      try {
        if (reportsChannel) await supabase.removeChannel(reportsChannel);
        if (statusEventsChannel) await supabase.removeChannel(statusEventsChannel);
        await supabase.removeAllChannels();
      } catch (error) {
        console.error("[reports-stream] Failed to cancel stream", error);
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
