"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Wrench, AlertTriangle, CheckCircle2, Clock, Calendar } from "lucide-react";
import { fetchMaintenanceStationsApi, completeMaintenanceApi } from "@/lib/api/maintenance";
import { useNotification } from "@/contexts/NotificationContext";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import type { StationMaintenanceInfo, MaintenanceStatus } from "@/lib/types";
import { CompleteMaintenanceDialog } from "./complete-maintenance-dialog";

export const MaintenanceDashboard = () => {
  const { hasAccess } = useAdminGuard();
  const [stations, setStations] = useState<StationMaintenanceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStation, setSelectedStation] = useState<StationMaintenanceInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { notify } = useNotification();

  const loadStations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { stations: data } = await fetchMaintenanceStationsApi();
      setStations(data);
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

  const handleMarkComplete = (station: StationMaintenanceInfo) => {
    setSelectedStation(station);
    setDialogOpen(true);
  };

  const handleConfirmComplete = async (completionDate: string) => {
    if (!selectedStation) return;

    try {
      await completeMaintenanceApi(selectedStation.id, completionDate);
      notify({
        title: "טיפול הושלם",
        message: `טיפול תחנה ${selectedStation.name} סומן כהושלם`,
        variant: "success",
      });
      setDialogOpen(false);
      setSelectedStation(null);
      await loadStations();
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בשמירה";
      notify({
        title: "שגיאה",
        message,
        variant: "error",
      });
    }
  };

  const getStatusBadge = (status: MaintenanceStatus) => {
    switch (status) {
      case "overdue":
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            באיחור
          </Badge>
        );
      case "due_soon":
        return (
          <Badge variant="outline" className="flex items-center gap-1 border-yellow-500/50 bg-yellow-500/10 text-yellow-500">
            <Clock className="h-3 w-3" />
            בקרוב
          </Badge>
        );
      case "ok":
        return (
          <Badge variant="outline" className="flex items-center gap-1 border-emerald-500/50 bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-3 w-3" />
            תקין
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "לא הוגדר";
    return new Date(dateStr).toLocaleDateString("he-IL");
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stations.map((station) => (
              <div
                key={station.id}
                className="rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{station.name}</h3>
                    <p className="text-xs text-muted-foreground">{station.code}</p>
                  </div>
                  {getStatusBadge(station.maintenance_status)}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">טיפול אחרון:</span>
                    <span className="font-medium text-foreground">
                      {formatDate(station.maintenance_last_date)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">טיפול הבא:</span>
                    <span className="font-medium text-foreground">
                      {formatDate(station.next_maintenance_date)}
                    </span>
                  </div>

                  {station.maintenance_interval_days && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">מרווח:</span>
                      <span className="font-medium text-foreground">
                        {station.maintenance_interval_days} ימים
                      </span>
                    </div>
                  )}

                  {station.maintenance_status === "overdue" && station.days_until_due !== null && (
                    <div className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500 font-medium">
                      באיחור של {Math.abs(station.days_until_due)} ימים
                    </div>
                  )}
                </div>

                <Button
                  onClick={() => handleMarkComplete(station)}
                  className="w-full mt-4"
                  variant={station.maintenance_status === "overdue" ? "default" : "outline"}
                >
                  <CheckCircle2 className="h-4 w-4 ml-2" />
                  סמן כבוצע
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <CompleteMaintenanceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        station={selectedStation}
        onConfirm={handleConfirmComplete}
      />
    </AdminLayout>
  );
};
