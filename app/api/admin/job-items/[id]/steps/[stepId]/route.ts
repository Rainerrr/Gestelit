import { NextRequest, NextResponse } from "next/server";
import { requireAdminPassword } from "@/lib/auth/permissions";
import { updateJobItemStep } from "@/lib/data/job-items";

type RouteContext = {
  params: Promise<{ id: string; stepId: string }>;
};

/**
 * PATCH /api/admin/job-items/[id]/steps/[stepId]
 *
 * Update a job item step's flags.
 * Body:
 * - requires_first_product_approval?: boolean
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireAdminPassword(request);
    const { stepId } = await context.params;

    const body = await request.json();
    const { requires_first_product_approval } = body;

    const updatedStep = await updateJobItemStep(stepId, {
      requires_first_product_approval,
    });

    return NextResponse.json(updatedStep);
  } catch (err) {
    console.error("PATCH /api/admin/job-items/[id]/steps/[stepId] error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
