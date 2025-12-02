import { createServiceSupabase } from "@/lib/supabase/client";
import type { Job } from "@/lib/types";

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
  Pick<Job, "customer_name" | "description" | "planned_quantity">
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

