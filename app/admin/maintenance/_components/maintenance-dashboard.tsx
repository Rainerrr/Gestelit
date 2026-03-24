"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  Cpu,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { fetchMaintenanceStationsApi, completeMaintenanceApi } from "@/lib/api/maintenance";
import { useNotification } from "@/contexts/NotificationContext";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { cn } from "@/lib/utils";
import type { StationMaintenanceDetail, ServiceMaintenanceInfo, MaintenanceStatus } from "@/lib/types";
import { MaintenanceServiceCard } from "./maintenance-service-card";
import { CompleteMaintenanceDialog } from "./complete-maintenance-dialog";

export const MaintenanceDashboard = () => {
  const { hasAccess } = useAdminGuard();
  const [stations, setStations] = useState<StationMaintenanceDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStations, setExpandedStations] = useState<Set<string>>(new Set());
  const [selectedService, setSelectedService] = useState<ServiceMaintenanceInfo | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [selectedStationName, setSelectedStationName] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { notify } = useNotification();

  const loadStations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { stations: data } = await fetchMaintenanceStationsApi();
      setStations(data);

      // Auto-expand stations with overdue services
      const autoExpand = new Set<string>();
      for (const s of data) {
        if (s.worst_status === "overdue") {
          autoExpand.add(s.id);
        }
      }
      setExpandedStations(autoExpand);
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בטעינת נתונים";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (hasAccess) {
      void loadStations();
    }
  }, [hasAccess]);

  const toggleStation = (stationId: string) => {
    setExpandedStations((prev) => {
      const next = new Set(prev);
      if (next.has(stationId)) {
        next.delete(stationId);
      } else {
        next.add(stationId);
      }
      return next;
    });
  };

  const handleMarkServiceComplete = (
    station: StationMaintenanceDetail,
    service: ServiceMaintenanceInfo
  ) => {
    setSelectedService(service);
    setSelectedStationId(station.id);
    setSelectedStationName(station.name);
    setDialogOpen(true);
  };

  const handleConfirmComplete = async (
    serviceId: string,
    completionDate: string,
    workerId?: string | null
  ) => {
    if (!selectedStationId) return;

    try {
      await completeMaintenanceApi(selectedStationId, serviceId, completionDate, workerId);
      notify({
        title: "טיפול הושלם",
        message: `הטיפול סומן כהושלם בהצלחה`,
        variant: "success",
      });
      setDialogOpen(false);
      setSelectedService(null);
      setSelectedStationId(null);
      setSelectedStationName(null);
      await loadStations();
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בשמירה";
      notify({ title: "שגיאה", message, variant: "error" });
    }
  };

  // Compute summary counts across all stations
  const summaryOverdue = stations.reduce(
    (sum, s) => sum + s.services.filter((sv) => sv.maintenance_status === "overdue").length,
    0
  );
  const summaryDueSoon = stations.reduce(
    (sum, s) => sum + s.services.filter((sv) => sv.maintenance_status === "due_soon").length,
    0
  );
  const summaryOk = stations.reduce(
    (sum, s) => sum + s.services.filter((sv) => sv.maintenance_status === "ok").length,
    0
  );

  const getServiceCounts = (station: StationMaintenanceDetail) => {
    const overdue = station.services.filter((s) => s.maintenance_status === "overdue").length;
    const dueSoon = station.services.filter((s) => s.maintenance_status === "due_soon").length;
    const ok = station.services.filter((s) => s.maintenance_status === "ok").length;
    return { overdue, dueSoon, ok };
  };

  if (hasAccess === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Wrench className="h-12 w-12 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <AdminLayout
      header={
        <AdminPageHeader
          icon={Wrench}
          title="מעקב טיפולים"
        />
      }
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Wrench className="h-12 w-12 animate-spin text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">טוען נתוני טיפולים...</p>
            </div>
          </div>
        ) : stations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">אין תחנות עם מעקב טיפולים</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              לא הוגדרו תחנות עם מעקב טיפולים. עבור לדף ניהול להוספת תחנות והפעלת מעקב טיפולים.
            </p>
          </div>
        ) : (
          <>
            {/* Spotlight summary badges */}
            <div className="flex flex-wrap gap-3">
              {summaryOverdue > 0 && (
                <Badge className="bg-red-500/10 border border-red-500/30 text-red-400 gap-1.5 font-medium text-sm px-3 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {summaryOverdue} באיחור
                </Badge>
              )}
              {summaryDueSoon > 0 && (
                <Badge className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 gap-1.5 font-medium text-sm px-3 py-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {summaryDueSoon} בקרוב
                </Badge>
              )}
              {summaryOk > 0 && (
                <Badge className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 gap-1.5 font-medium text-sm px-3 py-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {summaryOk} תקין
                </Badge>
              )}
            </div>

            {/* Station accordions */}
            <div className="space-y-3">
              {stations.map((station) => {
                const expanded = expandedStations.has(station.id);
                const counts = getServiceCounts(station);

                return (
                  <div
                    key={station.id}
                    className={cn(
                      "rounded-xl border overflow-hidden transition-all duration-300",
                      expanded
                        ? "border-primary/40 bg-card/60 shadow-lg shadow-primary/5"
                        : "border-border bg-card/40 hover:border-border/80"
                    )}
                  >
                    {/* Station header */}
                    <button
                      type="button"
                      onClick={() => toggleStation(station.id)}
                      className={cn(
                        "w-full flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 px-4 sm:px-5 py-4 text-right transition-colors",
                        expanded ? "bg-primary/5" : "hover:bg-accent/30"
                      )}
                    >
                      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                        <div
                          className={cn(
                            "flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg border transition-colors",
                            expanded ? "bg-primary/10 border-primary/30" : "bg-secondary border-border"
                          )}
                        >
                          <Cpu
                            className={cn(
                              "h-5 w-5 transition-colors",
                              expanded ? "text-primary" : "text-muted-foreground"
                            )}
                          />
                        </div>

                        <div className="flex flex-col items-start min-w-0 flex-1">
                          <h3 className="text-base font-semibold text-foreground truncate max-w-full">
                            {station.name}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{station.code}</span>
                            <span className="text-border">·</span>
                            <span>{station.station_type}</span>
                          </div>
                        </div>

                        {/* Expand/collapse icon - mobile */}
                        <div
                          className={cn(
                            "flex sm:hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                            expanded ? "bg-primary/10" : "bg-secondary"
                          )}
                        >
                          {expanded ? (
                            <ChevronUp className="h-4 w-4 text-primary" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
                        {counts.overdue > 0 && (
                          <Badge className="bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 gap-1.5 font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            {counts.overdue} באיחור
                          </Badge>
                        )}
                        {counts.dueSoon > 0 && (
                          <Badge className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 gap-1.5 font-medium">
                            <Clock className="h-3 w-3" />
                            {counts.dueSoon} בקרוב
                          </Badge>
                        )}
                        {counts.ok > 0 && (
                          <Badge className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 gap-1.5 font-medium">
                            <CheckCircle2 className="h-3 w-3" />
                            {counts.ok} תקין
                          </Badge>
                        )}

                        {/* Expand/collapse icon - desktop */}
                        <div
                          className={cn(
                            "hidden sm:flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                            expanded ? "bg-primary/10" : "bg-secondary"
                          )}
                        >
                          {expanded ? (
                            <ChevronUp className="h-4 w-4 text-primary" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expanded content - service rows */}
                    {expanded && (
                      <div className="border-t border-border/60 p-4 space-y-3 bg-card/20">
                        {station.services.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            אין טיפולים מוגדרים לתחנה זו.
                          </p>
                        ) : (
                          station.services.map((service) => (
                            <MaintenanceServiceCard
                              key={service.id}
                              service={service}
                              onComplete={() => handleMarkServiceComplete(station, service)}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <CompleteMaintenanceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        service={selectedService}
        stationId={selectedStationId}
        stationName={selectedStationName}
        onConfirm={handleConfirmComplete}
      />
    </AdminLayout>
  );
};
