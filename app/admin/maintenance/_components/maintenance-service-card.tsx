"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { ServiceMaintenanceInfo, MaintenanceStatus } from "@/lib/types";

type MaintenanceServiceCardProps = {
  service: ServiceMaintenanceInfo;
  onComplete: () => void;
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "לא הוגדר";
  return new Date(dateStr).toLocaleDateString("he-IL");
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

export const MaintenanceServiceCard = ({
  service,
  onComplete,
}: MaintenanceServiceCardProps) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-4 py-3">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-foreground">{service.name}</h4>
          {getStatusBadge(service.maintenance_status)}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            טיפול אחרון: <span className="font-medium text-foreground/80">{formatDate(service.last_serviced)}</span>
          </span>
          <span>
            טיפול הבא: <span className="font-medium text-foreground/80">{formatDate(service.next_service_date)}</span>
          </span>
          <span>
            מרווח: <span className="font-medium text-foreground/80">{service.interval_days} ימים</span>
          </span>
        </div>

        {service.maintenance_status === "overdue" && service.days_until_due !== null && (
          <div className="rounded-md bg-red-500/10 px-2 py-0.5 text-xs text-red-500 font-medium inline-block">
            באיחור של {Math.abs(service.days_until_due)} ימים
          </div>
        )}
      </div>

      <Button
        onClick={onComplete}
        size="sm"
        variant={service.maintenance_status === "overdue" ? "default" : "outline"}
        className="shrink-0"
      >
        <CheckCircle2 className="h-4 w-4 ml-1" />
        סמן כבוצע
      </Button>
    </div>
  );
};
