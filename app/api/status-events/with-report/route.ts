import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";
import { uploadImageToStorage } from "@/lib/utils/storage";
import type { ReportType, StatusEventState } from "@/lib/types";
import {
  requireSessionOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";

/**
 * Atomic endpoint that creates a status event and report together.
 * If report creation fails, the status event is rolled back.
 * This ensures the status only changes when the report is successfully created.
 */
export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const sessionId = formData.get("sessionId");
  const statusDefinitionId = formData.get("statusDefinitionId");
  const reportType = formData.get("reportType");
  const stationId = formData.get("stationId");
  const stationReasonId = formData.get("stationReasonId");
  const reportReasonId = formData.get("reportReasonId");
  const description = formData.get("description");
  const image = formData.get("image");
  const workerId = formData.get("workerId");

  // Validate required fields
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "MISSING_SESSION_ID" }, { status: 400 });
  }

  if (!statusDefinitionId || typeof statusDefinitionId !== "string") {
    return NextResponse.json({ error: "MISSING_STATUS_DEFINITION_ID" }, { status: 400 });
  }

  if (!reportType || typeof reportType !== "string") {
    return NextResponse.json({ error: "MISSING_REPORT_TYPE" }, { status: 400 });
  }

  const validReportTypes: ReportType[] = ["malfunction", "general", "scrap"];
  if (!validReportTypes.includes(reportType as ReportType)) {
    return NextResponse.json({ error: "INVALID_REPORT_TYPE" }, { status: 400 });
  }

  // Verify session ownership
  try {
    await requireSessionOwnership(request, sessionId);
  } catch (error) {
    return createErrorResponse(error, "UNAUTHORIZED");
  }

  const supabase = createServiceSupabase();

  // Get current status so we can rollback if needed
  const { data: currentSession, error: sessionError } = await supabase
    .from("sessions")
    .select("current_status_id")
    .eq("id", sessionId)
    .single();

  if (sessionError) {
    return NextResponse.json(
      { error: "SESSION_NOT_FOUND", details: sessionError.message },
      { status: 404 }
    );
  }

  const previousStatusId = currentSession.current_status_id;

  // Step 1: Create the status event
  const { data: statusEvent, error: statusError } = await supabase.rpc(
    "create_status_event_atomic",
    {
      p_session_id: sessionId,
      p_status_definition_id: statusDefinitionId,
      p_station_reason_id: typeof stationReasonId === "string" ? stationReasonId : null,
      p_note: typeof description === "string" ? description : null,
      p_image_url: null,
      p_report_id: null,
    }
  );

  if (statusError) {
    return NextResponse.json(
      { error: "STATUS_EVENT_FAILED", details: statusError.message },
      { status: 500 }
    );
  }

  const statusEventId = statusEvent?.id;

  // Step 2: Upload image if provided
  let imageUrl: string | null = null;
  if (image instanceof File && image.size > 0) {
    try {
      const bucket = reportType === "malfunction" ? "malfunction-images" : "report-images";
      const pathPrefix = reportType === "malfunction"
        ? (typeof stationId === "string" ? stationId : sessionId)
        : sessionId;

      const uploadResult = await uploadImageToStorage(image, {
        bucket,
        pathPrefix,
      });
      imageUrl = uploadResult.publicUrl;
    } catch (error) {
      // Image upload failed - rollback status event
      await rollbackStatusEvent(supabase, sessionId, statusEventId, previousStatusId);

      const message = error instanceof Error ? error.message : "UPLOAD_FAILED";
      return NextResponse.json(
        { error: "IMAGE_UPLOAD_FAILED", details: message },
        { status: 400 }
      );
    }
  }

  // Step 3: Create the report linked to the status event
  try {
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .insert({
        type: reportType as ReportType,
        station_id: typeof stationId === "string" && stationId.trim().length > 0 ? stationId : null,
        session_id: sessionId,
        reported_by_worker_id: typeof workerId === "string" && workerId.trim().length > 0 ? workerId : null,
        description: typeof description === "string" && description.trim().length > 0 ? description : null,
        image_url: imageUrl,
        station_reason_id: typeof stationReasonId === "string" && stationReasonId.trim().length > 0 ? stationReasonId : null,
        report_reason_id: typeof reportReasonId === "string" && reportReasonId.trim().length > 0 ? reportReasonId : null,
        status_event_id: statusEventId,
      })
      .select("*")
      .single();

    if (reportError) {
      // Report creation failed - rollback status event
      await rollbackStatusEvent(supabase, sessionId, statusEventId, previousStatusId);

      return NextResponse.json(
        { error: "REPORT_CREATE_FAILED", details: reportError.message },
        { status: 500 }
      );
    }

    // If this is a scrap report, mark the session as having submitted scrap report
    if (reportType === "scrap") {
      await supabase
        .from("sessions")
        .update({ scrap_report_submitted: true })
        .eq("id", sessionId);
    }

    return NextResponse.json({
      event: statusEvent,
      report,
    });
  } catch (error) {
    // Unexpected error - rollback status event
    await rollbackStatusEvent(supabase, sessionId, statusEventId, previousStatusId);

    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "REPORT_CREATE_FAILED", details: message },
      { status: 500 }
    );
  }
}

/**
 * Rollback a status event by deleting it and restoring the previous status.
 */
async function rollbackStatusEvent(
  supabase: ReturnType<typeof createServiceSupabase>,
  sessionId: string,
  statusEventId: string | null,
  previousStatusId: string | null
): Promise<void> {
  try {
    // Delete the newly created status event
    if (statusEventId) {
      await supabase
        .from("status_events")
        .delete()
        .eq("id", statusEventId);
    }

    // Restore the session's current_status_id to the previous value
    await supabase
      .from("sessions")
      .update({
        current_status_id: previousStatusId,
        last_status_change_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    // Reopen the previous status event if it exists
    if (previousStatusId) {
      await supabase
        .from("status_events")
        .update({ ended_at: null })
        .eq("session_id", sessionId)
        .eq("status_definition_id", previousStatusId)
        .order("started_at", { ascending: false })
        .limit(1);
    }
  } catch (error) {
    console.error("[status-events/with-report] Failed to rollback:", error);
  }
}
