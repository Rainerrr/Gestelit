"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Users, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import {
  assignWorkerStationAdminApi,
  clearDepartmentAdminApi,
  clearStationTypeAdminApi,
  createStationAdminApi,
  createWorkerAdminApi,
  deleteStationAdminApi,
  deleteWorkerAdminApi,
  fetchDepartmentsAdminApi,
  fetchStationsAdminApi,
  fetchStationTypesAdminApi,
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
import { StationTypeManager } from "./station-type-manager";
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
  const [stationTypes, setStationTypes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [stationTypeFilter, setStationTypeFilter] = useState<string | null>(null);
  const [startsWith, setStartsWith] = useState<string | null>(null);
  const [isLoadingWorkers, setIsLoadingWorkers] = useState<boolean>(true);
  const [isLoadingStations, setIsLoadingStations] = useState<boolean>(true);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  const hebrewLetters = useMemo(
    () => ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ", "ק", "ר", "ש", "ת"],
    [],
  );
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

  const loadStationTypes = useCallback(async () => {
    try {
      const response = await fetchStationTypesAdminApi();
      setStationTypes(response.stationTypes);
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
      const { stations: data } = await fetchStationsAdminApi({
        search: search.trim() || undefined,
        stationType: stationTypeFilter ?? undefined,
        startsWith: startsWith ?? undefined,
      });
      setStations(data);
    } catch (error) {
      friendlyError(error);
    } finally {
      setIsLoadingStations(false);
    }
  }, [friendlyError, search, stationTypeFilter, startsWith]);

  useEffect(() => {
    if (hasAccess !== true) return;
    void loadDepartments();
    void loadStationTypes();
    void loadStations();
  }, [hasAccess, loadDepartments, loadStationTypes, loadStations]);

  useEffect(() => {
    if (hasAccess !== true || activeTab !== "workers") return;
    void loadWorkers();
  }, [hasAccess, activeTab, loadWorkers]);

  useEffect(() => {
    if (hasAccess !== true || activeTab !== "stations") return;
    void loadStations();
  }, [hasAccess, activeTab, loadStations]);

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
      // Don't refresh immediately - let the dialog show success message
      // Refresh will happen when dialog closes
    } catch (error) {
      friendlyError(error);
    }
  };

  const handleDeleteWorker = async (id: string) => {
    setBannerError(null);
    setBannerSuccess(null);
    try {
      await deleteWorkerAdminApi(id);
      setBannerSuccess("העובד נמחק בהצלחה.");
      await Promise.all([loadWorkers(), loadDepartments()]);
      // Clear success message after 5 seconds
      setTimeout(() => setBannerSuccess(null), 5000);
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
      // Don't refresh immediately - let the dialog show success message
      // Refresh will happen when dialog closes
    } catch (error) {
      friendlyError(error);
      throw error;
    }
  };

  const handleRemoveStation = async (workerId: string, stationId: string) => {
    try {
      await removeWorkerStationAdminApi(workerId, stationId);
      // Don't refresh immediately - let the dialog show success message
      // Refresh will happen when dialog closes
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
      await Promise.all([loadStations(), loadStationTypes()]);
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
      // Don't refresh immediately - let the dialog show success message
      // Refresh will happen when dialog closes
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
      // Don't refresh immediately - let the dialog show success message
      // Refresh will happen when dialog closes
    } catch (error) {
      friendlyError(error);
      throw error;
    }
  };

  const handleDeleteStation = async (id: string) => {
    setBannerError(null);
    setBannerSuccess(null);
    try {
      await deleteStationAdminApi(id);
      setBannerSuccess("התחנה נמחקה בהצלחה.");
      await Promise.all([loadStations(), loadStationTypes()]);
      // Clear success message after 5 seconds
      setTimeout(() => setBannerSuccess(null), 5000);
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

  const handleClearStationType = async (stationType: string) => {
    try {
      await clearStationTypeAdminApi(stationType);
      setStationTypeFilter((current) => (current === stationType ? null : current));
      await Promise.all([loadStations(), loadStationTypes()]);
    } catch (error) {
      friendlyError(error);
    }
  };

  if (hasAccess === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/50 text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-500" />
          </div>
          <span>טוען הרשאות...</span>
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
        <div className="flex flex-col gap-4 text-right">
          <div className="space-y-1 text-right">
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.2em]">ניהול</p>
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight lg:text-3xl">
              ניהול עובדים ותחנות
            </h1>
            <p className="text-sm text-zinc-500">
              הוספה, עריכה והרשאות של עובדים ומכונות.
            </p>
          </div>

          {/* Prominent Tab Switcher */}
          <div className="flex justify-center py-3">
            <div className="inline-flex items-center gap-2 p-2 rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-sm shadow-xl shadow-black/20">
              <button
                type="button"
                onClick={() => setActiveTab("workers")}
                aria-label="עובדים"
                className={`relative flex items-center gap-3 px-10 py-4 text-lg font-semibold rounded-xl transition-all duration-200 ${
                  activeTab === "workers"
                    ? "bg-amber-500 text-zinc-900 shadow-lg shadow-amber-500/25"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                }`}
              >
                <Users className={`h-5 w-5 ${activeTab === "workers" ? "text-zinc-900" : ""}`} />
                עובדים
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("stations")}
                aria-label="תחנות"
                className={`relative flex items-center gap-3 px-10 py-4 text-lg font-semibold rounded-xl transition-all duration-200 ${
                  activeTab === "stations"
                    ? "bg-amber-500 text-zinc-900 shadow-lg shadow-amber-500/25"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                }`}
              >
                <Cpu className={`h-5 w-5 ${activeTab === "stations" ? "text-zinc-900" : ""}`} />
                תחנות
              </button>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm p-4">
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
                className="w-72 max-w-full border-zinc-700 bg-zinc-800/80 text-zinc-100 placeholder:text-zinc-500 focus:ring-amber-500/30 focus:border-amber-500/50"
              />
              <div className="flex flex-wrap items-center gap-2">
                {activeTab === "workers" ? (
                  <>
                    <Badge
                      variant={departmentFilter === null ? "default" : "outline"}
                      className={`cursor-pointer transition-colors ${departmentFilter === null ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"}`}
                      onClick={() => setDepartmentFilter(null)}
                    >
                      כל המחלקות
                    </Badge>
                    {departments.map((dept) => (
                      <Badge
                        key={dept}
                        variant={departmentFilter === dept ? "default" : "outline"}
                        className={`cursor-pointer transition-colors ${departmentFilter === dept ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"}`}
                        onClick={() => setDepartmentFilter(dept)}
                      >
                        {dept}
                      </Badge>
                    ))}
                  </>
                ) : (
                  <>
                    <Badge
                      variant={stationTypeFilter === null ? "default" : "outline"}
                      className={`cursor-pointer transition-colors ${stationTypeFilter === null ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"}`}
                      onClick={() => setStationTypeFilter(null)}
                    >
                      כל הסוגים
                    </Badge>
                    {stationTypes.map((type) => (
                      <Badge
                        key={type}
                        variant={stationTypeFilter === type ? "default" : "outline"}
                        className={`cursor-pointer transition-colors ${stationTypeFilter === type ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"}`}
                        onClick={() => setStationTypeFilter(type)}
                      >
                        {type}
                      </Badge>
                    ))}
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStartsWith(null)}
                className={startsWith === null
                  ? "bg-amber-500 text-zinc-900 border-amber-500 hover:bg-amber-400 hover:border-amber-400 font-medium"
                  : "border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"}
              >
                כל האותיות
              </Button>
              {hebrewLetters.map((letter) => (
                <Button
                  key={letter}
                  size="sm"
                  variant="outline"
                  onClick={() => setStartsWith(letter)}
                  className={startsWith === letter
                    ? "bg-amber-500 text-zinc-900 border-amber-500 hover:bg-amber-400 hover:border-amber-400 font-medium"
                    : "border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"}
                >
                  {letter}
                </Button>
              ))}
            </div>
          </div>
          {bannerError ? (
            <Alert
              variant="destructive"
              className="border-red-500/30 bg-red-500/10 text-right text-sm text-red-400"
            >
              <AlertTitle className="text-red-300">שגיאה</AlertTitle>
              <AlertDescription>{bannerError}</AlertDescription>
            </Alert>
          ) : null}
          {bannerSuccess ? (
            <Alert className="border-emerald-500/30 bg-emerald-500/10 text-right text-sm text-emerald-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <div>
                  <AlertTitle className="text-emerald-300">הצלחה</AlertTitle>
                  <AlertDescription>{bannerSuccess}</AlertDescription>
                </div>
              </div>
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
              onRefresh={async () => {
                await Promise.all([loadWorkers(), loadDepartments()]);
              }}
            />
            <Separator />
            <DepartmentManager
              departments={departments}
              onClear={handleClearDepartment}
            />
          </>
        ) : (
          <StationsManagement
            stations={stations}
            isLoading={isLoadingStations}
            onAdd={handleAddStation}
            onEdit={handleUpdateStation}
            onDelete={handleDeleteStation}
            onEditChecklists={handleUpdateStationChecklists}
            stationTypes={stationTypes}
            onRefresh={async () => {
              await Promise.all([loadStations(), loadStationTypes()]);
            }}
          />
        )}
        {activeTab === "stations" ? (
          <>
            <Separator />
            <StationTypeManager stationTypes={stationTypes} onClear={handleClearStationType} />
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
};