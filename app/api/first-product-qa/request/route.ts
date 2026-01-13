import { NextResponse } from "next/server";
import { createFirstProductQARequest } from "@/lib/data/first-product-qa";
import { createErrorResponse } from "@/lib/auth/permissions";
import { uploadImageToStorage } from "@/lib/utils/storage";

/**
 * First Product QA Request Endpoint
 *
 * POST /api/first-product-qa/request
 *
 * Creates a new first product QA request (report with is_first_product_qa=true).
 * Accepts multipart form data for optional image upload.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const jobItemId = formData.get("jobItemId") as string | null;
    const stationId = formData.get("stationId") as string | null;
    const sessionId = formData.get("sessionId") as string | null;
    const workerId = formData.get("workerId") as string | null;
    const description = formData.get("description") as string | null;
    const image = formData.get("image") as File | null;

    // Validate required fields
    if (!jobItemId || !stationId) {
      return NextResponse.json(
        { error: "MISSING_PARAMS", message: "jobItemId and stationId are required" },
        { status: 400 }
      );
    }

    // Upload image if provided
    let imageUrl: string | null = null;
    if (image && image.size > 0) {
      const uploadResult = await uploadImageToStorage(image, {
        bucket: "reports",
        pathPrefix: "first-product-qa",
      });
      imageUrl = uploadResult.publicUrl;
    }

    // Create the QA request
    const report = await createFirstProductQARequest({
      jobItemId,
      stationId,
      sessionId,
      workerId,
      description,
      imageUrl,
    });

    return NextResponse.json({ report });
  } catch (error) {
    return createErrorResponse(error, "QA_REQUEST_FAILED");
  }
}
