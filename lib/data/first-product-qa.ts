import { createServiceSupabase } from "@/lib/supabase/client";
import type { Report } from "@/lib/types";

// ============================================
// TYPES
// ============================================

export type FirstProductApprovalStatus = {
  /** Whether approval is required for this session's job item step */
  required: boolean;
  /** Current status of the approval */
  status: "not_required" | "needs_submission" | "pending" | "approved";
  /** If there's a pending (not yet approved) report */
  pendingReport: Report | null;
  /** If approved, the approved report */
  approvedReport: Report | null;
};

export type CreateFirstProductApprovalPayload = {
  sessionId: string;
  jobItemStepId: string;
  workerId?: string | null;
  description?: string | null;
  imageUrl?: string | null;
};

// ============================================
// FUNCTIONS
// ============================================

/**
 * Check if first product approval is required and what status it's in for a session.
 *
 * This is the per-step, per-session system for first product approval.
 * Each session needs its own approval (restarting work = new approval needed).
 *
 * Returns:
 * - not_required: The step doesn't require first product approval
 * - needs_submission: Required but no report submitted yet for this session
 * - pending: Report submitted, waiting for admin approval
 * - approved: Report has been approved
 */
export async function checkFirstProductApprovalForSession(
  sessionId: string,
  jobItemStepId: string
): Promise<FirstProductApprovalStatus> {
  const supabase = createServiceSupabase();

  // First, check if the step requires first product approval
  const { data: step, error: stepError } = await supabase
    .from("job_item_steps")
    .select("requires_first_product_approval, station_id, job_item_id")
    .eq("id", jobItemStepId)
    .single();

  if (stepError) {
    throw new Error(`Failed to fetch job item step: ${stepError.message}`);
  }

  if (!step?.requires_first_product_approval) {
    return {
      required: false,
      status: "not_required",
      pendingReport: null,
      approvedReport: null,
    };
  }

  // Query for first product approval reports for this specific session AND job item
  // Each job item needs its own approval within the session
  const { data: reports, error: reportsError } = await supabase
    .from("reports")
    .select("*")
    .eq("is_first_product_qa", true)
    .eq("session_id", sessionId)
    .eq("job_item_id", step.job_item_id)
    .order("created_at", { ascending: false });

  if (reportsError) {
    throw new Error(`Failed to check approval status: ${reportsError.message}`);
  }

  // Find approved and pending reports
  const approvedReport = reports?.find((r) => r.status === "approved") ?? null;
  const pendingReport = reports?.find((r) => r.status === "new") ?? null;

  if (approvedReport) {
    return {
      required: true,
      status: "approved",
      pendingReport: null,
      approvedReport: approvedReport as Report,
    };
  }

  if (pendingReport) {
    return {
      required: true,
      status: "pending",
      pendingReport: pendingReport as Report,
      approvedReport: null,
    };
  }

  return {
    required: true,
    status: "needs_submission",
    pendingReport: null,
    approvedReport: null,
  };
}

/**
 * Create a first product approval request for a session.
 *
 * Creates a report with:
 * - type: 'general' (uses standard general report approval flow)
 * - is_first_product_qa: true
 * - session_id: the specific session (for per-session tracking)
 * - status: 'new' (set by database trigger for general reports)
 */
export async function createFirstProductApprovalRequest(
  payload: CreateFirstProductApprovalPayload
): Promise<Report> {
  const supabase = createServiceSupabase();

  // Get the station_id and job_item_id from the step
  const { data: step, error: stepError } = await supabase
    .from("job_item_steps")
    .select("station_id, job_item_id")
    .eq("id", payload.jobItemStepId)
    .single();

  if (stepError) {
    throw new Error(`Failed to fetch job item step: ${stepError.message}`);
  }

  const { data, error } = await supabase
    .from("reports")
    .insert({
      type: "general",
      is_first_product_qa: true,
      session_id: payload.sessionId,
      job_item_id: step.job_item_id,
      station_id: step.station_id,
      reported_by_worker_id: payload.workerId ?? null,
      description: payload.description ?? null,
      image_url: payload.imageUrl ?? null,
      // status is set by database trigger based on type ('new' for general)
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create approval request: ${error.message}`);
  }

  return data as Report;
}

/**
 * Check if a job item step requires first product approval.
 */
export async function stepRequiresFirstProductApproval(
  jobItemStepId: string
): Promise<boolean> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("job_item_steps")
    .select("requires_first_product_approval")
    .eq("id", jobItemStepId)
    .single();

  if (error) {
    throw new Error(`Failed to check step approval requirement: ${error.message}`);
  }

  return data?.requires_first_product_approval === true;
}
