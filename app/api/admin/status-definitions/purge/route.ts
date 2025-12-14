import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";

type BlockedStatus = {
  id: string;
  station_id?: string | null;
  label?: string | null;
  eventsCount?: number;
  sessionsCount?: number;
  reason?: string;
};

type PurgeResult = {
  total: number;
  deleted: string[];
  blocked: BlockedStatus[];
  fallbackId: string | null;
};

export async function POST(request: Request) {
  const supabase = createServiceSupabase();
  const { searchParams } = new URL(request.url);
  const confirmed = searchParams.get("confirm") === "true";
  const fallbackParam = searchParams.get("fallback");
  const fallbackIdParam = searchParams.get("fallbackId");

  if (!confirmed) {
    return NextResponse.json(
      {
        error: "CONFIRM_REQUIRED",
        hint: "POST with ?confirm=true to purge station statuses. Optional ?fallback=global or ?fallbackId=<uuid> to reassign in-use statuses.",
      },
      { status: 400 },
    );
  }

  let fallbackId: string | null = null;
  if (fallbackIdParam) {
    fallbackId = fallbackIdParam;
  } else if (fallbackParam === "global") {
    const { data: fallback, error: fallbackError } = await supabase
      .from("status_definitions")
      .select("id")
      .eq("scope", "global")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fallbackError) {
      return NextResponse.json(
        { error: "FALLBACK_LOOKUP_FAILED", details: fallbackError.message },
        { status: 500 },
      );
    }

    fallbackId = fallback?.id ?? null;
    if (!fallbackId) {
      return NextResponse.json(
        { error: "FALLBACK_NOT_FOUND", hint: "Create at least one global status or pass ?fallbackId=<uuid>" },
        { status: 400 },
      );
    }
  }

  const { data: statuses, error: fetchError } = await supabase
    .from("status_definitions")
    .select("id, label_he, station_id, scope")
    .eq("scope", "station");

  if (fetchError) {
    return NextResponse.json(
      { error: "FETCH_FAILED", details: fetchError.message },
      { status: 500 },
    );
  }

  const blocked: BlockedStatus[] = [];
  const deletable: string[] = [];

  for (const status of statuses ?? []) {
    const statusId = status.id;

    const { count: eventsCount, error: eventsError } = await supabase
      .from("status_events")
      .select("id", { head: true, count: "exact" })
      .eq("status_definition_id", statusId);

    if (eventsError) {
      blocked.push({
        id: statusId,
        station_id: status.station_id ?? null,
        label: status.label_he,
        reason: `status_events lookup failed: ${eventsError.message}`,
      });
      continue;
    }

    const { count: sessionsCount, error: sessionsError } = await supabase
      .from("sessions")
      .select("id", { head: true, count: "exact" })
      .eq("current_status_id", statusId);

    if (sessionsError) {
      blocked.push({
        id: statusId,
        station_id: status.station_id ?? null,
        label: status.label_he,
        reason: `sessions lookup failed: ${sessionsError.message}`,
      });
      continue;
    }

    if ((eventsCount ?? 0) > 0 || (sessionsCount ?? 0) > 0) {
      blocked.push({
        id: statusId,
        station_id: status.station_id ?? null,
        label: status.label_he,
        eventsCount: eventsCount ?? 0,
        sessionsCount: sessionsCount ?? 0,
        reason: "in use",
      });
      continue;
    }

    deletable.push(statusId);
  }

  // Reassign in-use statuses to fallback if provided
  if (fallbackId && blocked.length > 0) {
    const stillBlocked: BlockedStatus[] = [];
    for (const status of blocked) {
      if (status.reason === "in use") {
        const { error: reassignEventsError } = await supabase
          .from("status_events")
          .update({ status_definition_id: fallbackId })
          .eq("status_definition_id", status.id);

        if (reassignEventsError) {
          stillBlocked.push({
            ...status,
            reason: `reassign events failed: ${reassignEventsError.message}`,
          });
          continue;
        }

        const { error: reassignSessionsError } = await supabase
          .from("sessions")
          .update({ current_status_id: fallbackId })
          .eq("current_status_id", status.id);

        if (reassignSessionsError) {
          stillBlocked.push({
            ...status,
            reason: `reassign sessions failed: ${reassignSessionsError.message}`,
          });
          continue;
        }

        deletable.push(status.id);
      } else {
        stillBlocked.push(status);
      }
    }
    blocked.length = 0;
    blocked.push(...stillBlocked);
  }

  if (deletable.length > 0) {
    const { error: deleteError } = await supabase
      .from("status_definitions")
      .delete()
      .in("id", deletable);

    if (deleteError) {
      return NextResponse.json(
        {
          error: "DELETE_FAILED",
          details: deleteError.message,
          attempted: deletable.length,
          blocked,
          fallbackId,
        },
        { status: 500 },
      );
    }
  }

  const result: PurgeResult = {
    total: statuses?.length ?? 0,
    deleted: deletable,
    blocked,
    fallbackId,
  };

  return NextResponse.json(result);
}

