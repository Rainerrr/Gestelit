import { createServiceSupabase } from "@/lib/supabase/client";
import type { Worker } from "@/lib/types";

export async function fetchWorkerByCode(
  workerCode: string,
): Promise<Worker | null> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .eq("worker_code", workerCode)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch worker: ${error.message}`);
  }

  return (data as Worker) ?? null;
}

export async function listWorkers(): Promise<Worker[]> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(`Failed to list workers: ${error.message}`);
  }

  return (data as Worker[]) ?? [];
}

