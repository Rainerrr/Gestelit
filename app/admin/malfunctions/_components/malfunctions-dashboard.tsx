"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Eye, RefreshCw, CheckCircle2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { fetchMalfunctionsAdminApi, updateMalfunctionStatusAdminApi } from "@/lib/api/admin-management";
import type { StationWithMalfunctions } from "@/lib/data/malfunctions";
import type { MalfunctionStatus } from "@/lib/types";
import { StationMalfunctionsCard } from "./station-malfunctions-card";

export const MalfunctionsDashboard = () => {
  const { hasAccess } = useAdminGuard();
  const [stations, setStations] = useState<StationWithMalfunctions[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    setError(null);

    try {
      const data = await fetchMalfunctionsAdminApi();
      setStations(data.stations);
    } catch (err) {
      console.error("[malfunctions] Failed to fetch:", err);
      setError(err instanceof Error ? err.message : "FETCH_FAILED");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (hasAccess) {
      void fetchData();
    }
  }, [hasAccess, fetchData]);

  const handleStatusChange = async (id: string, status: MalfunctionStatus) => {
    setIsUpdating(true);
    try {
      await updateMalfunctionStatusAdminApi(id, status);
      // Refetch data after status change
      await fetchData();
    } catch (err) {
      console.error("[malfunctions] Failed to update status:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRefresh = () => {
    void fetchData(true);
  };

  // Calculate totals
  const totalOpen = stations.reduce((sum, s) => sum + s.openCount, 0);
  const totalKnown = stations.reduce((sum, s) => sum + s.knownCount, 0);
  const totalMalfunctions = totalOpen + totalKnown;

  if (hasAccess === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <p className="font-mono text-sm text-muted-foreground tracking-wider">טוען נתונים...</p>
        </div>
      </div>
    );
  }

  if (hasAccess === false) {
    return null;
  }

  return (
    <AdminLayout
      header={
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Wrench className="h-5 w-5 text-primary" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">
                  ניהול תקלות
                </span>
              </div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight lg:text-3xl">
                תקלות תחנות
              </h1>
              <p className="text-sm text-muted-foreground max-w-xl">
                צפייה וניהול תקלות שדווחו על ידי העובדים. תקלות שטופלו יועברו לארכיון.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="w-full sm:w-auto border-input bg-secondary text-foreground/80 hover:bg-accent hover:text-foreground"
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 ml-2 ${isRefreshing ? "animate-spin" : ""}`} />
                רענון
              </Button>
              <Button
                variant="outline"
                asChild
                className="w-full sm:w-auto border-input bg-secondary text-foreground/80 hover:bg-accent hover:text-foreground"
                size="sm"
              >
                <Link href="/">חזרה למסך הבית</Link>
              </Button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card/50 px-5 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalOpen}</p>
                <p className="text-xs text-muted-foreground">תקלות חדשות</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card/50 px-5 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Eye className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalKnown}</p>
                <p className="text-xs text-muted-foreground">בטיפול</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card/50 px-5 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                <Wrench className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stations.length}</p>
                <p className="text-xs text-muted-foreground">תחנות עם תקלות</p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
            </div>
            <p className="text-sm text-muted-foreground">טוען תקלות...</p>
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
              <p className="text-lg font-medium text-foreground">אין תקלות פתוחות</p>
              <p className="text-sm text-muted-foreground">כל התקלות טופלו בהצלחה!</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {stations.map((stationData, index) => (
              <StationMalfunctionsCard
                key={stationData.station.id}
                data={stationData}
                onStatusChange={handleStatusChange}
                isUpdating={isUpdating}
                defaultExpanded={index === 0}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};
