import { createServiceSupabase } from "@/lib/supabase/client";
import type { Notification, NotificationType, NotificationActionType } from "@/lib/types";

export async function fetchNotifications(options: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<Notification[]> {
  const { limit = 50, unreadOnly = false } = options;
  const supabase = createServiceSupabase();

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("is_dismissed", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq("is_read", false);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[fetchNotifications] Error:", error.message);
    throw new Error("FETCH_NOTIFICATIONS_FAILED");
  }

  return (data ?? []) as Notification[];
}

export async function createNotification(payload: {
  notification_type: NotificationType;
  title: string;
  message: string;
  action_type?: NotificationActionType | null;
  action_payload?: Record<string, unknown> | null;
}): Promise<Notification> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      notification_type: payload.notification_type,
      title: payload.title,
      message: payload.message,
      action_type: payload.action_type ?? null,
      action_payload: payload.action_payload ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[createNotification] Error:", error.message);
    throw new Error("CREATE_NOTIFICATION_FAILED");
  }

  return data as Notification;
}

export async function updateNotification(
  id: string,
  updates: { is_read?: boolean; is_dismissed?: boolean },
): Promise<void> {
  const supabase = createServiceSupabase();

  const { error } = await supabase
    .from("notifications")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("[updateNotification] Error:", error.message);
    throw new Error("UPDATE_NOTIFICATION_FAILED");
  }
}

export async function cleanupOldNotifications(): Promise<void> {
  const supabase = createServiceSupabase();

  const { error } = await supabase.rpc("cleanup_old_notifications");

  if (error) {
    console.error("[cleanupOldNotifications] Error:", error.message);
    throw new Error("CLEANUP_NOTIFICATIONS_FAILED");
  }
}

export async function deleteAllNotifications(): Promise<void> {
  const supabase = createServiceSupabase();

  const { error } = await supabase
    .from("notifications")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all rows

  if (error) {
    console.error("[deleteAllNotifications] Error:", error.message);
    throw new Error("DELETE_ALL_NOTIFICATIONS_FAILED");
  }
}

export async function checkDueJobsAndNotify(): Promise<void> {
  const supabase = createServiceSupabase();

  const { error } = await supabase.rpc("check_due_jobs_and_notify");

  if (error) {
    console.error("[checkDueJobsAndNotify] Error:", error.message);
    throw new Error("CHECK_DUE_JOBS_FAILED");
  }
}
