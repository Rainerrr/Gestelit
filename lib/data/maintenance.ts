import { createServiceSupabase } from "@/lib/supabase/client";
import type { Station, StationMaintenanceInfo, MaintenanceStatus } from "@/lib/types";

/**
 * Calculate maintenance status from station data
 */
function calculateMaintenanceInfo(station: Station): StationMaintenanceInfo {
  const { maintenance_last_date, maintenance_interval_days, maintenance_enabled } = station;

  // Not tracked if maintenance not enabled or missing data
  if (!maintenance_enabled || !maintenance_last_date || !maintenance_interval_days) {
    return {
      id: station.id,
      name: station.name,
      code: station.code,
      maintenance_enabled: maintenance_enabled ?? false,
      maintenance_last_date: maintenance_last_date ?? null,
      maintenance_interval_days: maintenance_interval_days ?? null,
      next_maintenance_date: null,
      days_until_due: null,
      maintenance_status: "not_tracked",
    };
  }

  // Calculate next maintenance date
  const lastDate = new Date(maintenance_last_date);
  const nextDate = new Date(lastDate);
  nextDate.setDate(nextDate.getDate() + maintenance_interval_days);

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
    id: station.id,
    name: station.name,
    code: station.code,
    maintenance_enabled: true,
    maintenance_last_date,
    maintenance_interval_days,
    next_maintenance_date: nextDate.toISOString().split("T")[0],
    days_until_due: daysUntilDue,
    maintenance_status: status,
  };
}

/**
 * Fetch all stations with maintenance tracking enabled, sorted by urgency.
 * Overdue stations first, then due_soon, then ok.
 */
export async function fetchMaintenanceStations(): Promise<StationMaintenanceInfo[]> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("stations")
    .select("id, name, code, maintenance_enabled, maintenance_last_date, maintenance_interval_days")
    .eq("maintenance_enabled", true)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch maintenance stations: ${error.message}`);
  }

  const stations = (data ?? []) as Station[];
  const maintenanceInfos = stations.map(calculateMaintenanceInfo);

  // Sort by urgency: overdue first (most negative days), then due_soon, then ok
  maintenanceInfos.sort((a, b) => {
    const statusOrder: Record<MaintenanceStatus, number> = {
      overdue: 0,
      due_soon: 1,
      ok: 2,
      not_tracked: 3,
    };

    const statusDiff = statusOrder[a.maintenance_status] - statusOrder[b.maintenance_status];
    if (statusDiff !== 0) return statusDiff;

    // Within same status, sort by days until due (ascending - most urgent first)
    const aDays = a.days_until_due ?? Infinity;
    const bDays = b.days_until_due ?? Infinity;
    return aDays - bDays;
  });

  return maintenanceInfos;
}

/**
 * Mark maintenance as completed for a station.
 * Updates last_maintenance_date to the specified date (defaults to today).
 */
export async function completeStationMaintenance(
  stationId: string,
  completionDate?: string
): Promise<{
  success: boolean;
  last_maintenance_date: string;
  next_maintenance_date: string | null;
}> {
  const supabase = createServiceSupabase();

  const dateToUse = completionDate ?? new Date().toISOString().split("T")[0];

  // First fetch the station to get the interval
  const { data: station, error: fetchError } = await supabase
    .from("stations")
    .select("maintenance_enabled, maintenance_interval_days")
    .eq("id", stationId)
    .single();

  if (fetchError || !station) {
    throw new Error("Station not found");
  }

  if (!station.maintenance_enabled) {
    throw new Error("Maintenance tracking not enabled for this station");
  }

  // Update the last maintenance date
  const { error: updateError } = await supabase
    .from("stations")
    .update({
      maintenance_last_date: dateToUse,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stationId);

  if (updateError) {
    throw new Error(`Failed to update maintenance: ${updateError.message}`);
  }

  // Calculate next maintenance date
  let nextDate: string | null = null;
  if (station.maintenance_interval_days) {
    const next = new Date(dateToUse);
    next.setDate(next.getDate() + station.maintenance_interval_days);
    nextDate = next.toISOString().split("T")[0];
  }

  return {
    success: true,
    last_maintenance_date: dateToUse,
    next_maintenance_date: nextDate,
  };
}

/**
 * Trigger the database function to check for maintenance due and create notifications.
 */
export async function checkMaintenanceDueNotifications(): Promise<void> {
  const supabase = createServiceSupabase();

  const { error } = await supabase.rpc("check_maintenance_due_and_notify");

  if (error) {
    throw new Error(`Failed to check maintenance notifications: ${error.message}`);
  }
}
