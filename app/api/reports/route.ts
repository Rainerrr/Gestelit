import { NextResponse } from "next/server";
import { createReport } from "@/lib/data/reports";
import { uploadImageToStorage } from "@/lib/utils/storage";
import type { ReportType } from "@/lib/types";

const VALID_REPORT_TYPES: ReportType[] = ["malfunction", "general", "scrap"];

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const type = formData.get("type");
  const stationId = formData.get("stationId");
  const sessionId = formData.get("sessionId");
  const stationReasonId = formData.get("stationReasonId") ?? formData.get("reasonId");
  const reportReasonId = formData.get("reportReasonId");
  const description = formData.get("description");
  const image = formData.get("image");
  const workerId = formData.get("workerId");

  // Validate type
  if (!type || typeof type !== "string" || !VALID_REPORT_TYPES.includes(type as ReportType)) {
    return NextResponse.json({ error: "INVALID_REPORT_TYPE" }, { status: 400 });
  }

  const reportType = type as ReportType;

  // Malfunction reports require station_id
  if (reportType === "malfunction" && (!stationId || typeof stationId !== "string")) {
    return NextResponse.json({ error: "MISSING_STATION_ID" }, { status: 400 });
  }

  // General and scrap reports require session_id
  if ((reportType === "general" || reportType === "scrap") && (!sessionId || typeof sessionId !== "string")) {
    return NextResponse.json({ error: "MISSING_SESSION_ID" }, { status: 400 });
  }

  // Handle image upload
  let imageUrl: string | null = null;
  if (image instanceof File && image.size > 0) {
    try {
      const bucket = reportType === "malfunction" ? "malfunction-images" : "report-images";
      const pathPrefix = reportType === "malfunction"
        ? (stationId as string)
        : (sessionId as string);

      const uploadResult = await uploadImageToStorage(image, {
        bucket,
        pathPrefix,
      });
      imageUrl = uploadResult.publicUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : "UPLOAD_FAILED";
      return NextResponse.json(
        { error: "IMAGE_UPLOAD_FAILED", details: message },
        { status: 400 }
      );
    }
  }

  try {
    const report = await createReport({
      type: reportType,
      station_id: typeof stationId === "string" && stationId.trim().length > 0 ? stationId : null,
      session_id: typeof sessionId === "string" && sessionId.trim().length > 0 ? sessionId : null,
      reported_by_worker_id:
        typeof workerId === "string" && workerId.trim().length > 0 ? workerId : null,
      station_reason_id:
        typeof stationReasonId === "string" && stationReasonId.trim().length > 0
          ? stationReasonId
          : null,
      report_reason_id:
        typeof reportReasonId === "string" && reportReasonId.trim().length > 0
          ? reportReasonId
          : null,
      description:
        typeof description === "string" && description.trim().length > 0 ? description : null,
      image_url: imageUrl,
    });

    return NextResponse.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "REPORT_CREATE_FAILED", details: message },
      { status: 500 }
    );
  }
}
