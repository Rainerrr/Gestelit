import { createServiceSupabase } from "@/lib/supabase/client";
import type {
  MaintenanceService,
  ServiceMaintenanceInfo,
  StationMaintenanceDetail,
  MaintenanceStatus,
  Worker,
} from "@/lib/types";

const STATUS_ORDER: Record<MaintenanceStatus, number> = {
  overdue: 0,
  due_soon: 1,
  ok: 2,
  not_tracked: 3,
};

/**
 * Calculate maintenance status for a single service.
 */
export function calculateServiceInfo(
  service: MaintenanceService
): ServiceMaintenanceInfo {
  if (!service.last_serviced) {
    return {
      ...service,
      next_service_date: null,
      days_until_due: null,
      maintenance_status: "not_tracked",
    };
  }

  const lastDate = new Date(service.last_serviced);
  const nextDate = new Date(lastDate);
  nextDate.setDate(nextDate.getDate() + service.interval_days);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  nextDate.setHours(0, 0, 0, 0);

  const diffTime = nextDate.getTime() - today.getTime();
  const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let status: MaintenanceStatus;
  if (daysUntilDue < 0) {
    status = "overdue";
  } else if (daysUntilDue <= 7) {
    status = "due_soon";
  } else {
    status = "ok";
  }

  return {
    ...service,
    next_service_date: nextDate.toISOString().split("T")[0],
    days_until_due: daysUntilDue,
    maintenance_status: status,
  };
}

/**
 * Determine the worst (most urgent) status across services.
 */
function worstStatus(services: ServiceMaintenanceInfo[]): MaintenanceStatus {
  if (services.length === 0) return "not_tracked";
  let worst: MaintenanceStatus = "not_tracked";
  for (const s of services) {
    if (STATUS_ORDER[s.maintenance_status] < STATUS_ORDER[worst]) {
      worst = s.maintenance_status;
    }
  }
  return worst;
}

/**
 * Fetch all stations with maintenance tracking enabled, returning multi-service detail.
 * Sorted by worst_status (most urgent first), then by station name.
 */
export async function fetchMaintenanceStations(): Promise<
  StationMaintenanceDetail[]
> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("stations")
    .select(
      "id, name, code, station_type, maintenance_enabled, maintenance_services"
    )
    .eq("maintenance_enabled", true)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch maintenance stations: ${error.message}`);
  }

  const results: StationMaintenanceDetail[] = (data ?? []).map((row) => {
    const rawServices = (row.maintenance_services ?? []) as MaintenanceService[];
    const services = rawServices.map(calculateServiceInfo);
    return {
      id: row.id as string,
      name: row.name as string,
      code: row.code as string,
      station_type: row.station_type as string,
      maintenance_enabled: true,
      services,
      worst_status: worstStatus(services),
    };
  });

  // Sort by worst_status urgency, then name
  results.sort((a, b) => {
    const diff = STATUS_ORDER[a.worst_status] - STATUS_ORDER[b.worst_status];
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  return results;
}

/**
 * Mark a specific service as completed for a station.
 * Updates the service entry in the JSONB array.
 */
export async function completeStationMaintenance(
  stationId: string,
  serviceId: string,
  completionDate?: string,
  workerId?: string | null
): Promise<{
  success: boolean;
  last_serviced: string;
  next_service_date: string | null;
}> {
  const supabase = createServiceSupabase();
  const dateToUse =
    completionDate ?? new Date().toISOString().split("T")[0];

  // Fetch current station
  const { data: station, error: fetchError } = await supabase
    .from("stations")
    .select("maintenance_enabled, maintenance_services")
    .eq("id", stationId)
    .single();

  if (fetchError || !station) {
    throw new Error("Station not found");
  }

  if (!station.maintenance_enabled) {
    throw new Error("Maintenance tracking not enabled for this station");
  }

  const services = (station.maintenance_services ?? []) as MaintenanceService[];
  const serviceIndex = services.findIndex((s) => s.id === serviceId);

  if (serviceIndex === -1) {
    throw new Error("Service not found");
  }

  // Update the specific service
  services[serviceIndex] = {
    ...services[serviceIndex],
    last_serviced: dateToUse,
    last_service_worker_id: workerId ?? null,
  };

  const { error: updateError } = await supabase
    .from("stations")
    .update({
      maintenance_services: services,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stationId);

  if (updateError) {
    throw new Error(`Failed to update maintenance: ${updateError.message}`);
  }

  // Calculate next service date
  let nextDate: string | null = null;
  const intervalDays = services[serviceIndex].interval_days;
  if (intervalDays) {
    const next = new Date(dateToUse);
    next.setDate(next.getDate() + intervalDays);
    nextDate = next.toISOString().split("T")[0];
  }

  return {
    success: true,
    last_serviced: dateToUse,
    next_service_date: nextDate,
  };
}

/**
 * Fetch workers permitted for a specific station.
 */
export async function fetchStationWorkers(
  stationId: string
): Promise<Pick<Worker, "id" | "full_name" | "worker_code">[]> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("worker_stations")
    .select("workers:worker_id(id, full_name, worker_code)")
    .eq("station_id", stationId);

  if (error) {
    throw new Error(`Failed to fetch station workers: ${error.message}`);
  }

  // Supabase returns nested join; flatten and filter active workers
  const workers = (data ?? [])
    .map((row) => row.workers as unknown as { id: string; full_name: string; worker_code: string; is_active?: boolean })
    .filter((w) => w != null);

  return workers.map((w) => ({
    id: w.id,
    full_name: w.full_name,
    worker_code: w.worker_code,
  }));
}

/**
 * Trigger the database function to check for maintenance due and create notifications.
 */
export async function checkMaintenanceDueNotifications(): Promise<void> {
  const supabase = createServiceSupabase();

  const { error } = await supabase.rpc("check_maintenance_due_and_notify");

  if (error) {
    throw new Error(
      `Failed to check maintenance notifications: ${error.message}`
    );
  }
}
