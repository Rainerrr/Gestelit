import { createServiceSupabase } from "@/lib/supabase/client";
import type { ReportReason } from "@/lib/types";

// Create a new report reason
type CreateReportReasonPayload = {
  label_he: string;
  label_ru?: string | null;
  sort_order?: number;
};

export async function createReportReason(
  payload: CreateReportReasonPayload
): Promise<ReportReason> {
  const supabase = createServiceSupabase();

  const labelHe = payload.label_he.trim();
  if (!labelHe) {
    throw new Error("REASON_LABEL_HE_REQUIRED");
  }

  const { data, error } = await supabase
    .from("report_reasons")
    .insert({
      label_he: labelHe,
      label_ru: payload.label_ru?.trim() ?? null,
      sort_order: payload.sort_order ?? 0,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create report reason: ${error.message}`);
  }

  return data as ReportReason;
}

// Update a report reason
type UpdateReportReasonPayload = {
  label_he?: string;
  label_ru?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export async function updateReportReason(
  id: string,
  payload: UpdateReportReasonPayload
): Promise<ReportReason> {
  const supabase = createServiceSupabase();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.label_he !== undefined) {
    const labelHe = payload.label_he.trim();
    if (!labelHe) {
      throw new Error("REASON_LABEL_HE_REQUIRED");
    }
    updates.label_he = labelHe;
  }

  if (payload.label_ru !== undefined) {
    updates.label_ru = payload.label_ru?.trim() ?? null;
  }

  if (payload.sort_order !== undefined) {
    updates.sort_order = payload.sort_order;
  }

  if (payload.is_active !== undefined) {
    updates.is_active = payload.is_active;
  }

  const { data, error } = await supabase
    .from("report_reasons")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update report reason: ${error.message}`);
  }

  return data as ReportReason;
}

// Delete a report reason (soft delete by setting is_active = false)
export async function deleteReportReason(id: string): Promise<void> {
  const supabase = createServiceSupabase();

  // Check if reason is in use
  const { count, error: countError } = await supabase
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("report_reason_id", id);

  if (countError) {
    throw new Error(`Failed to check reason usage: ${countError.message}`);
  }

  if (count && count > 0) {
    // Soft delete if in use
    const { error } = await supabase
      .from("report_reasons")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      throw new Error(`Failed to deactivate report reason: ${error.message}`);
    }
  } else {
    // Hard delete if not in use
    const { error } = await supabase
      .from("report_reasons")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(`Failed to delete report reason: ${error.message}`);
    }
  }
}

// Fetch all report reasons (optionally filter by active only)
export async function fetchReportReasons(options?: {
  activeOnly?: boolean;
}): Promise<ReportReason[]> {
  const supabase = createServiceSupabase();

  let query = supabase
    .from("report_reasons")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (options?.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch report reasons: ${error.message}`);
  }

  return (data as ReportReason[]) ?? [];
}

// Get a single report reason by ID
export async function getReportReasonById(id: string): Promise<ReportReason | null> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("report_reasons")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch report reason: ${error.message}`);
  }

  return data as ReportReason | null;
}

// Reorder report reasons
export async function reorderReportReasons(
  orderedIds: string[]
): Promise<void> {
  const supabase = createServiceSupabase();

  // Update sort_order for each reason
  const updates = orderedIds.map((id, index) =>
    supabase
      .from("report_reasons")
      .update({ sort_order: index, updated_at: new Date().toISOString() })
      .eq("id", id)
  );

  const results = await Promise.all(updates);

  const errors = results.filter((r) => r.error);
  if (errors.length > 0) {
    throw new Error(`Failed to reorder reasons: ${errors[0].error?.message}`);
  }
}
