import { createServiceSupabase } from "@/lib/supabase/client";
import type { Job } from "@/lib/types";

export type JobWithStats = {
  job: Job;
  totalGood: number;
  totalScrap: number;
  sessionCount: number;
  isCompleted: boolean;
  /** Derived from SUM(job_items.planned_quantity) */
  plannedQuantity: number | null;
};

export async function findJobByNumber(
  jobNumber: string,
): Promise<Job | null> {
  const normalized = jobNumber.trim();
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("job_number", normalized)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch job: ${error.message}`);
  }

  return (data as Job) ?? null;
}

type JobInput = Partial<
  Pick<Job, "customer_name" | "description">
  // planned_quantity removed - now tracked per job_item
>;

export async function getOrCreateJob(
  jobNumber: string,
  payload: JobInput = {},
): Promise<Job> {
  const existing = await findJobByNumber(jobNumber);
  if (existing) {
    return existing;
  }

  const supabase = createServiceSupabase();
  const insertPayload = {
    job_number: jobNumber.trim(),
    ...payload,
  };

  const { data, error } = await supabase
    .from("jobs")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create job: ${error.message}`);
  }

  return data as Job;
}

// ============================================
// ADMIN JOB MANAGEMENT FUNCTIONS
// ============================================

export async function fetchAllJobsWithStats(options?: {
  search?: string;
  status?: "active" | "completed" | "all";
}): Promise<JobWithStats[]> {
  const supabase = createServiceSupabase();

  // Use raw SQL for aggregation since Supabase JS doesn't support GROUP BY with aggregates
  const { data, error } = await supabase.rpc("get_jobs_with_stats");

  if (error) {
    throw new Error(`Failed to fetch jobs: ${error.message}`);
  }

  // Transform raw data to JobWithStats
  // Note: planned_quantity is now derived from SUM(job_items.planned_quantity) by the RPC
  let jobs: JobWithStats[] = (data ?? []).map((row: {
    id: string;
    job_number: string;
    customer_name: string | null;
    description: string | null;
    planned_quantity: number | null; // Now derived from job_items
    created_at: string;
    updated_at: string;
    total_good: number; // Now derived from status_events
    total_scrap: number; // Now derived from status_events
    session_count: number;
  }) => ({
    job: {
      id: row.id,
      job_number: row.job_number,
      customer_name: row.customer_name,
      description: row.description,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    totalGood: row.total_good ?? 0,
    totalScrap: row.total_scrap ?? 0,
    sessionCount: row.session_count ?? 0,
    isCompleted:
      row.planned_quantity !== null &&
      row.planned_quantity > 0 &&
      (row.total_good ?? 0) >= row.planned_quantity,
    plannedQuantity: row.planned_quantity,
  }));

  // Apply search filter
  if (options?.search) {
    const searchLower = options.search.toLowerCase();
    jobs = jobs.filter(
      (j) =>
        j.job.job_number.toLowerCase().includes(searchLower) ||
        (j.job.customer_name?.toLowerCase().includes(searchLower) ?? false),
    );
  }

  // Apply status filter
  if (options?.status === "completed") {
    jobs = jobs.filter((j) => j.isCompleted);
  } else if (options?.status === "active") {
    jobs = jobs.filter((j) => !j.isCompleted);
  }

  return jobs;
}

export async function createJobAdmin(payload: {
  job_number: string;
  customer_name?: string | null;
  description?: string | null;
  // planned_quantity removed - now set per job_item
}): Promise<Job> {
  const supabase = createServiceSupabase();

  // Check if job_number already exists
  const existing = await findJobByNumber(payload.job_number);
  if (existing) {
    throw new Error("JOB_NUMBER_EXISTS");
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      job_number: payload.job_number.trim(),
      customer_name: payload.customer_name ?? null,
      description: payload.description ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`JOB_CREATE_FAILED: ${error.message}`);
  }

  return data as Job;
}

export async function updateJob(
  id: string,
  payload: Partial<{
    customer_name: string | null;
    description: string | null;
    // planned_quantity removed - now set per job_item
  }>,
): Promise<Job> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("jobs")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`JOB_UPDATE_FAILED: ${error.message}`);
  }

  return data as Job;
}

export async function deleteJob(id: string): Promise<void> {
  const supabase = createServiceSupabase();

  // Check for active sessions first
  const hasActive = await hasActiveSessionsForJob(id);
  if (hasActive) {
    throw new Error("JOB_HAS_ACTIVE_SESSIONS");
  }

  const { error } = await supabase.from("jobs").delete().eq("id", id);

  if (error) {
    throw new Error(`JOB_DELETE_FAILED: ${error.message}`);
  }
}

export async function hasActiveSessionsForJob(jobId: string): Promise<boolean> {
  const supabase = createServiceSupabase();

  const { count, error } = await supabase
    .from("sessions")
    .select("*", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to check active sessions: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

export async function getJobById(id: string): Promise<Job | null> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch job: ${error.message}`);
  }

  return (data as Job) ?? null;
}

