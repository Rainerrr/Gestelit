import type { StationMaintenanceInfo } from "@/lib/types";
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

function createAdminRequestInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  };
}

export async function fetchMaintenanceStationsApi(): Promise<{
  stations: StationMaintenanceInfo[];
}> {
  const response = await fetch("/api/admin/maintenance", createAdminRequestInit());
  return handleResponse(response);
}

export async function completeMaintenanceApi(
  stationId: string,
  completionDate?: string
): Promise<{
  success: boolean;
  last_maintenance_date?: string;
  next_maintenance_date?: string;
}> {
  const response = await fetch(
    `/api/admin/maintenance/${stationId}/complete`,
    createAdminRequestInit({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completion_date: completionDate }),
    })
  );
  return handleResponse(response);
}

export async function triggerMaintenanceCheckApi(): Promise<{ success: boolean }> {
  const response = await fetch(
    "/api/admin/maintenance",
    createAdminRequestInit({ method: "POST" })
  );
  return handleResponse(response);
}
