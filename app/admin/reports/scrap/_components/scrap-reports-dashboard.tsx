"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, RefreshCw, CheckCircle2, AlertTriangle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchScrapReportsAdminApi,
  updateReportStatusAdminApi,
} from "@/lib/api/admin-management";
import type { StationWithScrapReports } from "@/lib/data/reports";
import { StationScrapCard } from "./station-scrap-card";

export const ScrapReportsDashboard = () => {
  const [stations, setStations] = useState<StationWithScrapReports[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    setError(null);

    try {
      const data = await fetchScrapReportsAdminApi();
      setStations(data.stations);
    } catch (err) {
      console.error("[scrap-reports] Failed to fetch:", err);
      setError(err instanceof Error ? err.message : "FETCH_FAILED");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleApprove = async (id: string) => {
    setIsUpdating(true);
    try {
      await updateReportStatusAdminApi(id, "approved");
      await fetchData();
    } catch (err) {
      console.error("[scrap-reports] Failed to approve:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRefresh = () => {
    void fetchData(true);
  };

  const totalNew = stations.reduce((sum, s) => sum + s.newCount, 0);
  const totalApproved = stations.reduce((sum, s) => sum + s.approvedCount, 0);

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-foreground">דיווחי פסולים</h2>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing}
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 ml-2 ${isRefreshing ? "animate-spin" : ""}`} />
          רענון
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/50 px-5 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Trash2 className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{totalNew}</p>
            <p className="text-xs text-muted-foreground">ממתינים לאישור</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/50 px-5 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{totalApproved}</p>
            <p className="text-xs text-muted-foreground">אושרו</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/50 px-5 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stations.length}</p>
            <p className="text-xs text-muted-foreground">תחנות עם דיווחים</p>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">טוען דיווחים...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground">שגיאה בטעינת הנתונים</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={handleRefresh} size="sm">
            נסה שנית
          </Button>
        </div>
      ) : stations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground">אין דיווחי פסולים</p>
            <p className="text-sm text-muted-foreground">לא נמצאו דיווחים על פסולים</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {stations.map((stationData, index) => (
            <StationScrapCard
              key={stationData.station.id}
              data={stationData}
              onApprove={handleApprove}
              isUpdating={isUpdating}
              defaultExpanded={index === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
};
