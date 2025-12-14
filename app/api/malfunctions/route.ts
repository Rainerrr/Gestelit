import { NextResponse } from "next/server";
import { createMalfunction } from "@/lib/data/malfunctions";
import { uploadImageToStorage } from "@/lib/utils/storage";

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const stationId = formData.get("stationId");
  const stationReasonId =
    formData.get("stationReasonId") ?? formData.get("reasonId");
  const description = formData.get("description");
  const image = formData.get("image");

  if (!stationId || typeof stationId !== "string") {
    return NextResponse.json({ error: "MISSING_STATION_ID" }, { status: 400 });
  }

  let imageUrl: string | null = null;
  if (image instanceof File && image.size > 0) {
    try {
      const uploadResult = await uploadImageToStorage(image, {
        bucket: "malfunction-images",
        pathPrefix: stationId,
      });
      imageUrl = uploadResult.publicUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : "UPLOAD_FAILED";
      return NextResponse.json(
        { error: "IMAGE_UPLOAD_FAILED", details: message },
        { status: 400 },
      );
    }
  }

  try {
    const malfunction = await createMalfunction({
      station_id: stationId,
      station_reason_id:
        typeof stationReasonId === "string" && stationReasonId.trim().length > 0
          ? stationReasonId
          : null,
      description:
        typeof description === "string" && description.trim().length > 0
          ? description
          : null,
      image_url: imageUrl,
    });

    return NextResponse.json({ malfunction });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { error: "MALFUNCTION_CREATE_FAILED", details: message },
      { status: 500 },
    );
  }
}

