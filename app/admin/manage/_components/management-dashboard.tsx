"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import {
  assignWorkerStationAdminApi,
  clearDepartmentAdminApi,
  createStationAdminApi,
  createWorkerAdminApi,
  deleteStationAdminApi,
  deleteWorkerAdminApi,
  fetchDepartmentsAdminApi,
  fetchStationsAdminApi,
  fetchWorkerAssignmentsAdminApi,
  fetchWorkersAdminApi,
  removeWorkerStationAdminApi,
  updateStationAdminApi,
  updateWorkerAdminApi,
} from "@/lib/api/admin-management";
import type { Station, Worker } from "@/lib/types";
import type { StationWithStats, WorkerWithStats } from "@/lib/data/admin-management";
import { WorkersManagement } from "./workers-management";
import { StationsManagement } from "./stations-management";
import { DepartmentManager } from "./department-manager";
import { AdminLayout } from "../../_components/admin-layout";

type ActiveTab = "workers" | "stations";

const errorCopy: Record<string, string> = {
  WORKER_CODE_EXISTS: "קוד עובד כבר קיים.",
  WORKER_HAS_ACTIVE_SESSIONS: "לא ניתן למחוק עובד עם סשן פעיל.",
  STATION_CODE_EXISTS: "קוד תחנה כבר קיים.",
  STATION_HAS_ACTIVE_SESSIONS: "לא ניתן למחוק תחנה עם סשן פעיל.",
  ASSIGNMENT_EXISTS: "לעובד כבר יש הרשאה לתחנה.",
  ASSIGNMENT_NOT_FOUND: "ההרשאה לא נמצאה.",
  ASSIGNMENT_DELETE_FAILED: "מחיקת ההרשאה נכשלה.",
  STATION_DELETE_FAILED: "לא ניתן למחוק תחנה כרגע.",
};

export const ManagementDashboard = () => {
  const { hasAccess } = useAdminGuard();
  const [activeTab, setActiveTab] = useState<ActiveTab>("workers");
  const [workers, setWorkers] = useState<WorkerWithStats[]>([]);
  const [stations, setStations] = useState<StationWithStats[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [startsWith, setStartsWith] = useState<string | null>(null);
  const [isLoadingWorkers, setIsLoadingWorkers] = useState<boolean>(true);
  const [isLoadingStations, setIsLoadingStations] = useState<boolean>(true);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const hebrewLetters = useMemo(
    () => ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ", "ק", "ר", "ש", "ת"],
    [],
  );
  const filteredStations = useMemo(() => {
    if (!search.trim()) return stations;
    const term = search.trim().toLowerCase();
    return stations.filter(
      ({ station }) =>
        station.name.toLowerCase().includes(term) ||
        station.code.toLowerCase().includes(term),
    );
  }, [stations, search]);

  const friendlyError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "UNKNOWN_ERROR";
    setBannerError(errorCopy[message] ?? "משהו השתבש, נסה שוב.");
  }, []);

  const loadDepartments = useCallback(async () => {
    try {
      const response = await fetchDepartmentsAdminApi();
      setDepartments(response.departments);
    } catch (error) {
      friendlyError(error);
    }
  }, [friendlyError]);

  const loadWorkers = useCallback(async () => {
    setIsLoadingWorkers(true);
    setBannerError(null);
    try {
      const { workers: data } = await fetchWorkersAdminApi({
        department: departmentFilter ?? undefined,
        search: search.trim() || undefined,
        startsWith: startsWith ?? undefined,
      });
      setWorkers(data);
    } catch (error) {
      friendlyError(error);
    } finally {
      setIsLoadingWorkers(false);
    }
  }, [departmentFilter, friendlyError, search, startsWith]);

  const loadStations = useCallback(async () => {
    setIsLoadingStations(true);
    setBannerError(null);
    try {
      const { stations: data } = await fetchStationsAdminApi();
      setStations(data);
    } catch (error) {
      friendlyError(error);
    } finally {
      setIsLoadingStations(false);
    }
  }, [friendlyError]);

  useEffect(() => {
    if (hasAccess !== true) return;
    void loadDepartments();
    void loadStations();
  }, [hasAccess, loadDepartments, loadStations]);

  useEffect(() => {
    if (hasAccess !== true || activeTab !== "workers") return;
    void loadWorkers();
  }, [hasAccess, activeTab, loadWorkers]);

  const handleAddWorker = async (payload: Partial<Worker>) => {
    setBannerError(null);
    try {
      await createWorkerAdminApi({
        worker_code: payload.worker_code ?? "",
        full_name: payload.full_name ?? "",
        language: payload.language ?? "auto",
        role: payload.role ?? "worker",
        department: payload.department ?? null,
        is_active: payload.is_active ?? true,
      });
      await Promise.all([loadWorkers(), loadDepartments()]);
    } catch (error) {
      friendlyError(error);
    }
  };

  const handleUpdateWorker = async (id: string, payload: Partial<Worker>) => {
    setBannerError(null);
    try {
      await updateWorkerAdminApi(id, {
        worker_code: payload.worker_code,
        full_name: payload.full_name,
        language: payload.language,
        role: payload.role,
        department: payload.department ?? null,
        is_active: payload.is_active,
      });
      await Promise.all([loadWorkers(), loadDepartments()]);
    } catch (error) {
      friendlyError(error);
    }
  };

  const handleDeleteWorker = async (id: string) => {
    setBannerError(null);
    try {
      await deleteWorkerAdminApi(id);
      await Promise.all([loadWorkers(), loadDepartments()]);
    } catch (error) {
      friendlyError(error);
    }
  };

  const handleFetchAssignments = async (workerId: string) => {
    const { stations: assigned } = await fetchWorkerAssignmentsAdminApi(workerId);
    return assigned;
  };

  const handleAssignStation = async (workerId: string, stationId: string) => {
    try {
      await assignWorkerStationAdminApi(workerId, stationId);
      await loadWorkers();
    } catch (error) {
      friendlyError(error);
      throw error;
    }
  };

  const handleRemoveStation = async (workerId: string, stationId: string) => {
    try {
      await removeWorkerStationAdminApi(workerId, stationId);
      await loadWorkers();
    } catch (error) {
      friendlyError(error);
      throw error;
    }
  };

  const handleAddStation = async (payload: Partial<Station>) => {
    setBannerError(null);
    try {
      await createStationAdminApi({
        name: payload.name ?? "",
        code: payload.code ?? "",
        station_type: payload.station_type ?? "other",
        is_active: payload.is_active ?? true,
        station_reasons: payload.station_reasons,
      });
      await loadStations();
    } catch (error) {
      friendlyError(error);
    }
  };

  const handleUpdateStation = async (id: string, payload: Partial<Station>) => {
    setBannerError(null);
    try {
      await updateStationAdminApi(id, {
        name: payload.name,
        code: payload.code,
        station_type: payload.station_type ?? "other",
        is_active: payload.is_active,
        station_reasons: payload.station_reasons,
      });
      await loadStations();
    } catch (error) {
      friendlyError(error);
    }
  };

  const handleUpdateStationChecklists = async (
    id: string,
    payload: {
      start_checklist: Station["start_checklist"];
      end_checklist: Station["end_checklist"];
    },
  ) => {
    setBannerError(null);
    try {
      await updateStationAdminApi(id, {
        start_checklist: payload.start_checklist ?? [],
        end_checklist: payload.end_checklist ?? [],
      });
      await loadStations();
    } catch (error) {
      friendlyError(error);
      throw error;
    }
  };

  const handleDeleteStation = async (id: string) => {
    setBannerError(null);
    try {
      await deleteStationAdminApi(id);
      await loadStations();
    } catch (error) {
      friendlyError(error);
    }
  };

  const handleClearDepartment = async (department: string) => {
    try {
      await clearDepartmentAdminApi(department);
      await Promise.all([loadWorkers(), loadDepartments()]);
    } catch (error) {
      friendlyError(error);
    }
  };

  if (hasAccess === null) {
    return (
      <Card className="flex min-h-[60vh] items-center justify-center border border-slate-200 text-slate-600">
        טוען הרשאות...
      </Card>
    );
  }

  if (hasAccess === false) {
    return null;
  }

  return (
    <AdminLayout
      header={
        <div className="flex flex-col gap-4 text-right">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 text-right">
              <p className="text-xs text-slate-500">ניהול</p>
              <h1 className="text-2xl font-semibold text-slate-900">
                ניהול עובדים ותחנות
              </h1>
              <p className="text-sm text-slate-500">
                הוספה, עריכה והרשאות של עובדים ומכונות.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={activeTab === "workers" ? "default" : "outline"}
                onClick={() => setActiveTab("workers")}
                aria-label="עובדים"
              >
                עובדים
              </Button>
              <Button
                variant={activeTab === "stations" ? "default" : "outline"}
                onClick={() => setActiveTab("stations")}
                aria-label="תחנות"
              >
                תחנות
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="חיפוש"
                placeholder={
                  activeTab === "workers"
                    ? "חיפוש עובד לפי שם או קוד"
                    : "חיפוש תחנה לפי שם או קוד"
                }
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-64"
              />
              {activeTab === "workers" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={departmentFilter === null ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setDepartmentFilter(null)}
                  >
                    כל המחלקות
                  </Badge>
                  {departments.map((dept) => (
                    <Badge
                      key={dept}
                      variant={departmentFilter === dept ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setDepartmentFilter(dept)}
                    >
                      {dept}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
            {activeTab === "workers" ? (
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant={startsWith === null ? "default" : "outline"}
                  onClick={() => setStartsWith(null)}
                >
                  כל האותיות
                </Button>
                {hebrewLetters.map((letter) => (
                  <Button
                    key={letter}
                    size="sm"
                    variant={startsWith === letter ? "default" : "outline"}
                    onClick={() => setStartsWith(letter)}
                  >
                    {letter}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
          {bannerError ? (
            <Alert
              variant="destructive"
              className="border-red-200 bg-red-50 text-right text-sm text-red-700"
            >
              <AlertTitle>שגיאה</AlertTitle>
              <AlertDescription>{bannerError}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        {activeTab === "workers" ? (
          <>
            <WorkersManagement
              workers={workers}
              isLoading={isLoadingWorkers}
              onAdd={handleAddWorker}
              onEdit={handleUpdateWorker}
              onDelete={handleDeleteWorker}
              onFetchAssignments={handleFetchAssignments}
              onAssignStation={handleAssignStation}
              onRemoveStation={handleRemoveStation}
              stations={stations.map((row) => row.station)}
              departments={departments}
            />
            <Separator />
            <DepartmentManager
              departments={departments}
              onClear={handleClearDepartment}
            />
          </>
        ) : (
          <StationsManagement
            stations={filteredStations}
            isLoading={isLoadingStations}
            onAdd={handleAddStation}
            onEdit={handleUpdateStation}
            onDelete={handleDeleteStation}
            onEditChecklists={handleUpdateStationChecklists}
          />
        )}
      </div>
    </AdminLayout>
  );
};