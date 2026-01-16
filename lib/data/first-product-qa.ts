import { createServiceSupabase } from "@/lib/supabase/client";
import type { Report } from "@/lib/types";

// ============================================
// TYPES
// ============================================

export type FirstProductQAStatus = {
  /** Whether QA has been approved for this job item at this station */
  approved: boolean;
  /** If there's a pending (not yet approved) QA request */
  pendingReport: Report | null;
  /** If approved, the approved report */
  approvedReport: Report | null;
};

export type CreateFirstProductQARequestPayload = {
  jobItemId: string;
  stationId: string;
  sessionId?: string | null;
  workerId?: string | null;
  description?: string | null;
  imageUrl?: string | null;
};

// ============================================
// FUNCTIONS
// ============================================

/**
 * Check if first product QA has been approved for a job item at a station.
 *
 * QA is approved if there's a report with:
 * - is_first_product_qa = true
 * - job_item_id = the specified job item
 * - station_id = the specified station
 * - status = 'approved'
 *
 * Returns the status along with any pending or approved reports.
 */
export async function checkFirstProductQAApproval(
  jobItemId: string,
  stationId: string
): Promise<FirstProductQAStatus> {
  const supabase = createServiceSupabase();

  // Query for all first product QA reports for this job item + station
  const { data: reports, error } = await supabase
    .from("reports")
    .select("*")
    .eq("is_first_product_qa", true)
    .eq("job_item_id", jobItemId)
    .eq("station_id", stationId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to check QA approval: ${error.message}`);
  }

  // Find approved and pending reports
  const approvedReport = reports?.find((r) => r.status === "approved") ?? null;
  const pendingReport = reports?.find((r) => r.status === "new") ?? null;

  return {
    approved: approvedReport !== null,
    pendingReport: pendingReport as Report | null,
    approvedReport: approvedReport as Report | null,
  };
}

/**
 * Create a first product QA request.
 *
 * Creates a report with:
 * - type: 'general' (uses standard general report approval flow)
 * - is_first_product_qa: true
 * - status: 'new' (set by database trigger for general reports)
 */
export async function createFirstProductQARequest(
  payload: CreateFirstProductQARequestPayload
): Promise<Report> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("reports")
    .insert({
      type: "general",
      is_first_product_qa: true,
      job_item_id: payload.jobItemId,
      station_id: payload.stationId,
      session_id: payload.sessionId ?? null,
      reported_by_worker_id: payload.workerId ?? null,
      description: payload.description ?? null,
      image_url: payload.imageUrl ?? null,
      // status is set by database trigger based on type ('new' for general)
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create QA request: ${error.message}`);
  }

  return data as Report;
}

/**
 * Get all pending first product QA requests.
 * Used by admin to see what needs approval.
 */
export async function getPendingFirstProductQARequests(): Promise<Report[]> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("is_first_product_qa", true)
    .eq("status", "new")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch pending QA requests: ${error.message}`);
  }

  return (data ?? []) as Report[];
}

/**
 * Count pending first product QA requests.
 * Used for notification badges.
 */
export async function getPendingFirstProductQACount(): Promise<number> {
  const supabase = createServiceSupabase();

  const { count, error } = await supabase
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("is_first_product_qa", true)
    .eq("status", "new");

  if (error) {
    throw new Error(`Failed to count pending QA requests: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Check if a station requires first product QA.
 */
export async function stationRequiresFirstProductQA(
  stationId: string
): Promise<boolean> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("stations")
    .select("requires_first_product_qa")
    .eq("id", stationId)
    .single();

  if (error) {
    throw new Error(`Failed to check station QA requirement: ${error.message}`);
  }

  return data?.requires_first_product_qa === true;
}
