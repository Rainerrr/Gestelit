import type { Notification, NotificationType, NotificationActionType } from "@/lib/types";
import { clearAdminLoggedIn } from "./auth-helpers";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.message === "string"
          ? payload.message
          : "REQUEST_FAILED";

    if (response.status === 401 || payload.error === "UNAUTHORIZED") {
      if (typeof window !== "undefined") {
        clearAdminLoggedIn();
        if (window.location.pathname.startsWith("/admin")) {
          window.location.href = "/";
        }
      }
    }

    throw new Error(message);
  }

  return response.json();
}

export async function fetchNotificationsAdminApi(options?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<{ notifications: Notification[] }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", options.limit.toString());
  if (options?.unreadOnly) params.set("unread_only", "true");

  const response = await fetch(`/api/admin/notifications?${params.toString()}`, {
    credentials: "include",
  });
  return handleResponse(response);
}

export async function createNotificationAdminApi(payload: {
  notification_type: NotificationType;
  title: string;
  message: string;
  action_type?: NotificationActionType | null;
  action_payload?: Record<string, unknown> | null;
}): Promise<{ notification: Notification }> {
  const response = await fetch("/api/admin/notifications", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function updateNotificationAdminApi(
  id: string,
  updates: { is_read?: boolean; is_dismissed?: boolean },
): Promise<{ success: boolean }> {
  const response = await fetch(`/api/admin/notifications/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return handleResponse(response);
}

export async function cleanupNotificationsAdminApi(options?: { deleteAll?: boolean }): Promise<{ success: boolean }> {
  const response = await fetch("/api/admin/notifications/cleanup", {
    method: "POST",
    credentials: "include",
    headers: options?.deleteAll ? { "Content-Type": "application/json" } : undefined,
    body: options?.deleteAll ? JSON.stringify({ deleteAll: true }) : undefined,
  });
  return handleResponse(response);
}

export async function checkDueJobsAdminApi(): Promise<{ success: boolean }> {
  const response = await fetch("/api/admin/notifications/check-due-jobs", {
    method: "POST",
    credentials: "include",
  });
  return handleResponse(response);
}
