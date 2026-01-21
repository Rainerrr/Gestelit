import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/auth/permissions";
import {
  checkFirstProductApprovalForSession,
  createFirstProductApprovalRequest,
} from "@/lib/data/first-product-qa";
import { createServiceSupabase } from "@/lib/supabase/client";
import { uploadImageToStorage } from "@/lib/utils/storage";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/sessions/[id]/first-product-approval
 *
 * Check if session needs first product approval and get current status.
 * Returns:
 * - required: boolean - whether approval is required for this step
 * - status: "not_required" | "needs_submission" | "pending" | "approved"
 * - pendingReport: Report | null
 * - approvedReport: Report | null
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;
    const worker = await requireWorker(request);

    // Get session to find the job_item_step_id
    const supabase = createServiceSupabase();
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("job_item_step_id, worker_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "SESSION_NOT_FOUND" },
        { status: 404 }
      );
    }

    // Verify worker owns this session
    if (session.worker_id !== worker.id) {
      return NextResponse.json(
        { error: "UNAUTHORIZED" },
        { status: 403 }
      );
    }

    // If no job item step is bound, approval is not required
    if (!session.job_item_step_id) {
      return NextResponse.json({
        required: false,
        status: "not_required",
        pendingReport: null,
        approvedReport: null,
      });
    }

    const approvalStatus = await checkFirstProductApprovalForSession(
      sessionId,
      session.job_item_step_id
    );

    return NextResponse.json(approvalStatus);
  } catch (err) {
    console.error("GET /api/sessions/[id]/first-product-approval error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/sessions/[id]/first-product-approval
 *
 * Submit a first product approval report for the session.
 * Body (form-data):
 * - description?: string
 * - image?: File
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: sessionId } = await context.params;
    const worker = await requireWorker(request);

    // Get session to find the job_item_step_id
    const supabase = createServiceSupabase();
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("job_item_step_id, worker_id, station_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "SESSION_NOT_FOUND" },
        { status: 404 }
      );
    }

    // Verify worker owns this session
    if (session.worker_id !== worker.id) {
      return NextResponse.json(
        { error: "UNAUTHORIZED" },
        { status: 403 }
      );
    }

    if (!session.job_item_step_id) {
      return NextResponse.json(
        { error: "NO_JOB_ITEM_BOUND" },
        { status: 400 }
      );
    }

    // Check if this step requires approval
    const { data: step, error: stepError } = await supabase
      .from("job_item_steps")
      .select("requires_first_product_approval")
      .eq("id", session.job_item_step_id)
      .single();

    if (stepError) {
      return NextResponse.json(
        { error: "STEP_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (!step.requires_first_product_approval) {
      return NextResponse.json(
        { error: "APPROVAL_NOT_REQUIRED" },
        { status: 400 }
      );
    }

    // Check if already has pending or approved report for this session
    const currentStatus = await checkFirstProductApprovalForSession(
      sessionId,
      session.job_item_step_id
    );

    if (currentStatus.status === "approved") {
      return NextResponse.json(
        { error: "ALREADY_APPROVED" },
        { status: 400 }
      );
    }

    if (currentStatus.status === "pending") {
      return NextResponse.json(
        { error: "ALREADY_PENDING", pendingReport: currentStatus.pendingReport },
        { status: 400 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const description = formData.get("description") as string | null;
    const image = formData.get("image") as File | null;

    // Upload image if provided
    let imageUrl: string | null = null;
    if (image && image.size > 0) {
      const uploadResult = await uploadImageToStorage(image, {
        bucket: "reports",
        pathPrefix: "first-product-approval",
      });
      imageUrl = uploadResult.publicUrl;
    }

    // Create the approval request
    const report = await createFirstProductApprovalRequest({
      sessionId,
      jobItemStepId: session.job_item_step_id,
      workerId: worker.id,
      description: description ?? null,
      imageUrl,
    });

    return NextResponse.json({
      success: true,
      report,
      status: "pending",
    });
  } catch (err) {
    console.error("POST /api/sessions/[id]/first-product-approval error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
