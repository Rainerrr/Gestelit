"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Users, Cpu, Wrench, Workflow } from "lucide-react";
import { useNotification } from "@/contexts/NotificationContext";
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
  fetchPipelinePresetsAdminApi,
  createPipelinePresetAdminApi,
  updatePipelinePresetAdminApi,
  deletePipelinePresetAdminApi,
  checkPipelinePresetInUseAdminApi,
  updatePipelinePresetStepsAdminApi,
  fetchAvailableStationsForPresetAdminApi,
} from "@/lib/api/admin-management";
import type { Station, Worker, PipelinePresetWithSteps } from "@/lib/types";
import type { StationWithStats, WorkerWithStats } from "@/lib/data/admin-management";
import { WorkersManagement } from "./workers-management";
import { StationsManagement } from "./stations-management";
import { DepartmentManager } from "./department-manager";
import { StationTypeManager } from "./station-type-manager";
import { GlobalStatusesManagement } from "./global-statuses-management";
import { PipelinePresetsManagement } from "./pipeline-presets-management";
import { PipelinePresetEditDialog } from "./pipeline-preset-edit-dialog";
import { AdminLayout } from "../../_components/admin-layout";
import { AdminPageHeader, MobileBottomBar } from "../../_components/admin-page-header";

type ActiveTab = "workers" | "stations" | "presets";

const errorCopy: Record<string, string> = {
  WORKER_CODE_EXISTS: "קוד עובד כבר קיים.",
  WORKER_HAS_ACTIVE_SESSIONS: "לא ניתן למחוק עובד עם סשן פעיל.",
  STATION_CODE_EXISTS: "קוד תחנה כבר קיים.",
  STATION_HAS_ACTIVE_SESSIONS: "לא ניתן למחוק תחנה עם סשן פעיל.",
  ASSIGNMENT_EXISTS: "לעובד כבר יש הרשאה לתחנה.",
  ASSIGNMENT_NOT_FOUND: "ההרשאה לא נמצאה.",
  ASSIGNMENT_DELETE_FAILED: "מחיקת ההרשאה נכשלה.",
  STATION_DELETE_FAILED: "לא ניתן למחוק תחנה כרגע.",
  CODE_ALREADY_EXISTS: "קוד קו ייצור כבר קיים במערכת.",
  HAS_ACTIVE_JOBS: "לא ניתן למחוק קו ייצור עם עבודות פעילות.",
  PRODUCTION_LINE_NOT_FOUND: "קו ייצור לא נמצא.",
  PRODUCTION_LINE_CREATE_FAILED: "יצירת קו ייצור נכשלה.",
  PRODUCTION_LINE_UPDATE_FAILED: "עדכון קו ייצור נכשל.",
  PRODUCTION_LINE_DELETE_FAILED: "מחיקת קו ייצור נכשלה.",
  STATION_ALREADY_IN_LINE: "אחת או יותר מהתחנות כבר משויכת לקו אחר.",
  PRESET_IN_USE: "לא ניתן למחוק תבנית שבשימוש בעבודות פעילות.",
  PRESET_NOT_FOUND: "תבנית לא נמצאה.",
  PIPELINE_PRESET_CREATE_FAILED: "יצירת תבנית תהליך נכשלה.",
  PIPELINE_PRESET_UPDATE_FAILED: "עדכון תבנית תהליך נכשל.",
  PIPELINE_PRESET_DELETE_FAILED: "מחיקת תבנית תהליך נכשלה.",
  DUPLICATE_STATION: "לא ניתן להוסיף את אותה תחנה פעמיים.",
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
  const [stationFilterForPresets, setStationFilterForPresets] = useState<string | null>(null);
  const [availableStationsForFilter, setAvailableStationsForFilter] = useState<Station[]>([]);
  const [startsWith, setStartsWith] = useState<string | null>(null);
  const [isLoadingWorkers, setIsLoadingWorkers] = useState<boolean>(true);
  const [isLoadingStations, setIsLoadingStations] = useState<boolean>(true);
  const [pipelinePresets, setPipelinePresets] = useState<PipelinePresetWithSteps[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState<boolean>(true);

  // Unified dialog state
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [presetDialogMode, setPresetDialogMode] = useState<"create" | "edit">("create");
  const [editingPreset, setEditingPreset] = useState<PipelinePresetWithSteps | null>(null);

  const { notify } = useNotification();

  // Track if initial data has been loaded to prevent re-running on callback changes
  const initialLoadDoneRef = useRef(false);

  const hebrewLetters = useMemo(
    () => ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ", "ק", "ר", "ש", "ת"],
    [],
  );
  const friendlyError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "UNKNOWN_ERROR";
    notify({
      title: "שגיאה",
      message: errorCopy[message] ?? "משהו השתבש, נסה שוב.",
      variant: "error",
    });
  }, [notify]);

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

  const loadPipelinePresets = useCallback(async () => {
    setIsLoadingPresets(true);
    try {
      const { presets } = await fetchPipelinePresetsAdminApi();
      setPipelinePresets(presets);
    } catch (error) {
      friendlyError(error);
    } finally {
      setIsLoadingPresets(false);
    }
  }, [friendlyError]);

  // Load stations for filter when on presets tab
  const loadStationsForFilter = useCallback(async () => {
    try {
      const { stations } = await fetchAvailableStationsForPresetAdminApi();
      setAvailableStationsForFilter(stations);
    } catch {
      // Silently fail - filter will just not be available
    }
  }, []);

  // Initial load - runs ONCE when hasAccess becomes true
  // Loads departments, station types, and stations (needed for worker permissions)
  useEffect(() => {
    if (hasAccess !== true || initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    void loadDepartments();
    void loadStationTypes();
    void loadStations();
  }, [hasAccess, loadDepartments, loadStationTypes, loadStations]);

  // Load workers when on workers tab (handles filter changes)
  useEffect(() => {
    if (hasAccess !== true || activeTab !== "workers") return;
    void loadWorkers();
  }, [hasAccess, activeTab, loadWorkers]);

  // Load stations when on stations tab (handles filter changes)
  useEffect(() => {
    if (hasAccess !== true || activeTab !== "stations") return;
    void loadStations();
  }, [hasAccess, activeTab, loadStations]);

  // Load pipeline presets and filter stations when on presets tab
  useEffect(() => {
    if (hasAccess !== true || activeTab !== "presets") return;
    void loadPipelinePresets();
    void loadStationsForFilter();
  }, [hasAccess, activeTab, loadPipelinePresets, loadStationsForFilter]);

  // Filter presets by station and search
  const filteredPresets = useMemo(() => {
    let result = pipelinePresets;
    if (stationFilterForPresets) {
      result = result.filter((p) => p.steps.some((s) => s.station_id === stationFilterForPresets));
    }
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(searchLower));
    }
    return result;
  }, [pipelinePresets, stationFilterForPresets, search]);

  const handleAddWorker = async (payload: Partial<Worker>) => {
    try {
      await createWorkerAdminApi({
        worker_code: payload.worker_code ?? "",
        full_name: payload.full_name ?? "",
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
    try {
      await updateWorkerAdminApi(id, {
        worker_code: payload.worker_code,
        full_name: payload.full_name,
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
    try {
      await deleteWorkerAdminApi(id);
      notify({ title: "הצלחה", message: "העובד נמחק בהצלחה.", variant: "success" });
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
    try {
      await createStationAdminApi({
        name: payload.name ?? "",
        code: payload.code ?? "",
        station_type: payload.station_type ?? "other",
        is_active: payload.is_active ?? true,
        station_reasons: payload.station_reasons,
        maintenance_enabled: payload.maintenance_enabled,
        maintenance_last_date: payload.maintenance_last_date,
        maintenance_interval_days: payload.maintenance_interval_days,
      });
      await Promise.all([loadStations(), loadStationTypes()]);
    } catch (error) {
      friendlyError(error);
    }
  };

  const handleUpdateStation = async (id: string, payload: Partial<Station>) => {
    try {
      await updateStationAdminApi(id, {
        name: payload.name,
        code: payload.code,
        station_type: payload.station_type ?? "other",
        is_active: payload.is_active,
        station_reasons: payload.station_reasons,
        maintenance_enabled: payload.maintenance_enabled,
        maintenance_last_date: payload.maintenance_last_date,
        maintenance_interval_days: payload.maintenance_interval_days,
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
    try {
      await deleteStationAdminApi(id);
      notify({ title: "הצלחה", message: "התחנה נמחקה בהצלחה.", variant: "success" });
      await Promise.all([loadStations(), loadStationTypes()]);
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

  // Pipeline Presets Handlers
  const handleOpenAddPresetDialog = () => {
    setEditingPreset(null);
    setPresetDialogMode("create");
    setPresetDialogOpen(true);
  };

  const handleOpenEditPresetDialog = (preset: PipelinePresetWithSteps) => {
    setEditingPreset(preset);
    setPresetDialogMode("edit");
    setPresetDialogOpen(true);
  };

  const handleSavePreset = async (payload: {
    name: string;
    stationIds: string[];
    firstProductApprovalFlags: Record<string, boolean>;
  }) => {
    try {
      if (presetDialogMode === "create") {
        // Create new preset with steps and QA flags
        await createPipelinePresetAdminApi({
          name: payload.name,
          station_ids: payload.stationIds,
          first_product_approval_flags: payload.firstProductApprovalFlags,
        });
      } else if (editingPreset) {
        // Update existing preset name and steps with QA flags
        await updatePipelinePresetAdminApi(editingPreset.id, { name: payload.name });
        await updatePipelinePresetStepsAdminApi(
          editingPreset.id,
          payload.stationIds,
          payload.firstProductApprovalFlags,
        );
      }
      await loadPipelinePresets();
    } catch (error) {
      friendlyError(error);
      throw error;
    }
  };

  const handleDeletePipelinePreset = async (id: string) => {
    try {
      await deletePipelinePresetAdminApi(id);
      notify({ title: "הצלחה", message: "התבנית נמחקה בהצלחה.", variant: "success" });
      await loadPipelinePresets();
    } catch (error) {
      friendlyError(error);
      throw error;
    }
  };

  const handleFetchAvailableStationsForPreset = async () => {
    const { stations } = await fetchAvailableStationsForPresetAdminApi();
    return stations;
  };

  const handleCheckPresetInUse = async (presetId: string) => {
    try {
      const { inUse } = await checkPipelinePresetInUseAdminApi(presetId);
      return inUse;
    } catch {
      return false;
    }
  };

  if (hasAccess === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-xl border border-border bg-card/50 text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
          </div>
          <span>טוען הרשאות...</span>
        </div>
      </div>
    );
  }

  if (hasAccess === false) {
    return null;
  }

  const capsuleConfig = {
    options: [
      { id: "workers", label: "עובדים", icon: Users },
      { id: "stations", label: "תחנות", icon: Cpu },
      { id: "presets", label: "תבניות תהליך", icon: Workflow },
    ],
    activeId: activeTab,
    onChange: (id: string) => setActiveTab(id as ActiveTab),
  };

  return (
    <AdminLayout
      header={
        <AdminPageHeader
          icon={Wrench}
          title="ניהול"
          capsules={capsuleConfig}
        />
      }
      mobileBottomBar={<MobileBottomBar capsules={capsuleConfig} />}
    >
      <div className="space-y-4 pb-mobile-nav">

        {/* Filters */}
        <div className="space-y-3 rounded-xl border border-border bg-card/50 backdrop-blur-sm p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
            <Input
              aria-label="חיפוש"
              placeholder={
                activeTab === "workers"
                  ? "חיפוש עובד לפי שם או קוד"
                  : activeTab === "stations"
                    ? "חיפוש תחנה לפי שם או קוד"
                    : "חיפוש תבנית לפי שם"
              }
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full sm:w-72 border-input bg-secondary text-foreground placeholder:text-muted-foreground focus:ring-primary/30 focus:border-primary/50"
            />
            <div className="flex flex-wrap items-center gap-2">
              {activeTab === "workers" ? (
                <>
                  <Badge
                    variant={departmentFilter === null ? "default" : "outline"}
                    className={`cursor-pointer transition-colors py-1.5 px-3 min-h-[36px] flex items-center ${departmentFilter === null ? "bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20" : "border-input text-muted-foreground hover:bg-accent hover:text-foreground/80"}`}
                    onClick={() => setDepartmentFilter(null)}
                  >
                    כל המחלקות
                  </Badge>
                  {departments.map((dept) => (
                    <Badge
                      key={dept}
                      variant={departmentFilter === dept ? "default" : "outline"}
                      className={`cursor-pointer transition-colors py-1.5 px-3 min-h-[36px] flex items-center ${departmentFilter === dept ? "bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20" : "border-input text-muted-foreground hover:bg-accent hover:text-foreground/80"}`}
                      onClick={() => setDepartmentFilter(dept)}
                    >
                      {dept}
                    </Badge>
                  ))}
                </>
              ) : activeTab === "stations" ? (
                <>
                  <Badge
                    variant={stationTypeFilter === null ? "default" : "outline"}
                    className={`cursor-pointer transition-colors py-1.5 px-3 min-h-[36px] flex items-center ${stationTypeFilter === null ? "bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20" : "border-input text-muted-foreground hover:bg-accent hover:text-foreground/80"}`}
                    onClick={() => setStationTypeFilter(null)}
                  >
                    כל הסוגים
                  </Badge>
                  {stationTypes.map((type) => (
                    <Badge
                      key={type}
                      variant={stationTypeFilter === type ? "default" : "outline"}
                      className={`cursor-pointer transition-colors py-1.5 px-3 min-h-[36px] flex items-center ${stationTypeFilter === type ? "bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20" : "border-input text-muted-foreground hover:bg-accent hover:text-foreground/80"}`}
                      onClick={() => setStationTypeFilter(type)}
                    >
                      {type}
                    </Badge>
                  ))}
                </>
              ) : (
                /* Presets tab - station filter badges */
                <>
                  <Badge
                    variant={stationFilterForPresets === null ? "default" : "outline"}
                    className={`cursor-pointer transition-colors py-1.5 px-3 min-h-[36px] flex items-center ${stationFilterForPresets === null ? "bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20" : "border-input text-muted-foreground hover:bg-accent hover:text-foreground/80"}`}
                    onClick={() => setStationFilterForPresets(null)}
                  >
                    כל התחנות
                  </Badge>
                  {availableStationsForFilter.slice(0, 8).map((station) => (
                    <Badge
                      key={station.id}
                      variant={stationFilterForPresets === station.id ? "default" : "outline"}
                      className={`cursor-pointer transition-colors py-1.5 px-3 min-h-[36px] flex items-center ${stationFilterForPresets === station.id ? "bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20" : "border-input text-muted-foreground hover:bg-accent hover:text-foreground/80"}`}
                      onClick={() => setStationFilterForPresets(station.id)}
                    >
                      {station.name}
                    </Badge>
                  ))}
                  {availableStationsForFilter.length > 8 && (
                    <Badge variant="outline" className="border-input text-muted-foreground py-1.5 px-3 min-h-[36px] flex items-center">
                      +{availableStationsForFilter.length - 8}
                    </Badge>
                  )}
                </>
              )}
            </div>
          </div>
          {/* Hebrew letter filter - hidden for presets tab */}
          {activeTab !== "presets" && (
            <div className="hidden sm:flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStartsWith(null)}
                className={startsWith === null
                  ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:border-primary font-medium"
                  : "border-input bg-secondary/50 text-foreground/80 hover:bg-muted hover:text-foreground"}
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
                    ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:border-primary font-medium"
                    : "border-input bg-secondary/50 text-foreground/80 hover:bg-muted hover:text-foreground"}
                >
                  {letter}
                </Button>
                ))}
            </div>
          )}
        </div>

        {/* Content */}
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
        ) : activeTab === "stations" ? (
          <>
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
            <Separator />
            <StationTypeManager stationTypes={stationTypes} onClear={handleClearStationType} />
            <Separator />
            <GlobalStatusesManagement />
          </>
        ) : (
          <>
            <PipelinePresetsManagement
              presets={filteredPresets}
              isLoading={isLoadingPresets}
              onEdit={handleOpenEditPresetDialog}
              onDelete={handleDeletePipelinePreset}
              onCheckInUse={handleCheckPresetInUse}
              onAdd={handleOpenAddPresetDialog}
            />
            <PipelinePresetEditDialog
              mode={presetDialogMode}
              preset={editingPreset}
              open={presetDialogOpen}
              onOpenChange={(open) => {
                setPresetDialogOpen(open);
                if (!open) {
                  setEditingPreset(null);
                }
              }}
              onSave={handleSavePreset}
              onDelete={handleDeletePipelinePreset}
              onFetchAvailableStations={handleFetchAvailableStationsForPreset}
            />
          </>
        )}
      </div>
    </AdminLayout>
  );
};
