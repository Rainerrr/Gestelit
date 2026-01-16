"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Users, Cpu, Briefcase, Wrench, Workflow } from "lucide-react";
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
  fetchJobsAdminApi,
  createJobAdminApi,
  updateJobAdminApi,
  deleteJobAdminApi,
  fetchPipelinePresetsAdminApi,
  createPipelinePresetAdminApi,
  updatePipelinePresetAdminApi,
  deletePipelinePresetAdminApi,
  checkPipelinePresetInUseAdminApi,
  updatePipelinePresetStepsAdminApi,
  fetchAvailableStationsForPresetAdminApi,
} from "@/lib/api/admin-management";
import type { Job, Station, Worker, PipelinePresetWithSteps } from "@/lib/types";
import type { StationWithStats, WorkerWithStats } from "@/lib/data/admin-management";
import type { JobWithStats } from "@/lib/data/jobs";
import { WorkersManagement } from "./workers-management";
import { StationsManagement } from "./stations-management";
import { JobsManagement } from "./jobs-management";
import { DepartmentManager } from "./department-manager";
import { StationTypeManager } from "./station-type-manager";
import { GlobalStatusesManagement } from "./global-statuses-management";
import { PipelinePresetsManagement } from "./pipeline-presets-management";
import { PipelinePresetStepsDialog } from "./pipeline-preset-steps-dialog";
import { AdminLayout } from "../../_components/admin-layout";
import { AdminPageHeader, MobileBottomBar } from "../../_components/admin-page-header";

type ActiveTab = "workers" | "stations" | "jobs" | "presets";
type JobStatusFilter = "all" | "active" | "completed";

const errorCopy: Record<string, string> = {
  WORKER_CODE_EXISTS: "קוד עובד כבר קיים.",
  WORKER_HAS_ACTIVE_SESSIONS: "לא ניתן למחוק עובד עם סשן פעיל.",
  STATION_CODE_EXISTS: "קוד תחנה כבר קיים.",
  STATION_HAS_ACTIVE_SESSIONS: "לא ניתן למחוק תחנה עם סשן פעיל.",
  ASSIGNMENT_EXISTS: "לעובד כבר יש הרשאה לתחנה.",
  ASSIGNMENT_NOT_FOUND: "ההרשאה לא נמצאה.",
  ASSIGNMENT_DELETE_FAILED: "מחיקת ההרשאה נכשלה.",
  STATION_DELETE_FAILED: "לא ניתן למחוק תחנה כרגע.",
  JOB_NUMBER_EXISTS: "מספר עבודה כבר קיים במערכת.",
  JOB_HAS_ACTIVE_SESSIONS: "לא ניתן למחוק עבודה עם סשן פעיל.",
  JOB_NOT_FOUND: "עבודה לא נמצאה.",
  JOB_CREATE_FAILED: "יצירת עבודה נכשלה.",
  JOB_UPDATE_FAILED: "עדכון עבודה נכשל.",
  JOB_DELETE_FAILED: "מחיקת עבודה נכשלה.",
  CODE_ALREADY_EXISTS: "קוד קו ייצור כבר קיים במערכת.",
  HAS_ACTIVE_JOBS: "לא ניתן למחוק קו ייצור עם עבודות פעילות.",
  PRODUCTION_LINE_NOT_FOUND: "קו ייצור לא נמצא.",
  PRODUCTION_LINE_CREATE_FAILED: "יצירת קו ייצור נכשלה.",
  PRODUCTION_LINE_UPDATE_FAILED: "עדכון קו ייצור נכשל.",
  PRODUCTION_LINE_DELETE_FAILED: "מחיקת קו ייצור נכשלה.",
  STATION_ALREADY_IN_LINE: "אחת או יותר מהתחנות כבר משויכת לקו אחר.",
  PRESET_IN_USE: "לא ניתן למחוק תבנית שבשימוש בעבודות פעילות.",
  PRESET_NOT_FOUND: "תבנית לא נמצאה.",
  PIPELINE_PRESET_CREATE_FAILED: "יצירת תבנית צינור נכשלה.",
  PIPELINE_PRESET_UPDATE_FAILED: "עדכון תבנית צינור נכשל.",
  PIPELINE_PRESET_DELETE_FAILED: "מחיקת תבנית צינור נכשלה.",
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
  const [startsWith, setStartsWith] = useState<string | null>(null);
  const [isLoadingWorkers, setIsLoadingWorkers] = useState<boolean>(true);
  const [isLoadingStations, setIsLoadingStations] = useState<boolean>(true);
  const [jobs, setJobs] = useState<JobWithStats[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState<boolean>(true);
  const [jobStatusFilter, setJobStatusFilter] = useState<JobStatusFilter>("all");
  const [pipelinePresets, setPipelinePresets] = useState<PipelinePresetWithSteps[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState<boolean>(true);
  const [editingPresetSteps, setEditingPresetSteps] = useState<PipelinePresetWithSteps | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Track if initial data has been loaded to prevent re-running on callback changes
  const initialLoadDoneRef = useRef(false);

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

  const loadJobs = useCallback(async () => {
    setIsLoadingJobs(true);
    setBannerError(null);
    try {
      const { jobs: data } = await fetchJobsAdminApi({
        search: search.trim() || undefined,
        status: jobStatusFilter,
      });
      setJobs(data);
    } catch (error) {
      friendlyError(error);
    } finally {
      setIsLoadingJobs(false);
    }
  }, [friendlyError, search, jobStatusFilter]);

  const loadPipelinePresets = useCallback(async () => {
    setIsLoadingPresets(true);
    setBannerError(null);
    try {
      const { presets } = await fetchPipelinePresetsAdminApi({ includeInactive: true });
      setPipelinePresets(presets);
    } catch (error) {
      friendlyError(error);
    } finally {
      setIsLoadingPresets(false);
    }
  }, [friendlyError]);

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

  // Load jobs when on jobs tab (handles filter changes)
  useEffect(() => {
    if (hasAccess !== true || activeTab !== "jobs") return;
    void loadJobs();
  }, [hasAccess, activeTab, loadJobs]);

  // Load pipeline presets when on presets tab
  useEffect(() => {
    if (hasAccess !== true || activeTab !== "presets") return;
    void loadPipelinePresets();
  }, [hasAccess, activeTab, loadPipelinePresets]);

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

  const handleAddJob = async (payload: Partial<Job>) => {
    setBannerError(null);
    try {
      await createJobAdminApi({
        job_number: payload.job_number ?? "",
        customer_name: payload.customer_name ?? null,
        description: payload.description ?? null,
      });
      await loadJobs();
    } catch (error) {
      friendlyError(error);
    }
  };

  const handleUpdateJob = async (id: string, payload: Partial<Job>) => {
    setBannerError(null);
    try {
      await updateJobAdminApi(id, {
        customer_name: payload.customer_name,
        description: payload.description,
      });
    } catch (error) {
      friendlyError(error);
    }
  };

  const handleDeleteJob = async (id: string) => {
    setBannerError(null);
    setBannerSuccess(null);
    try {
      await deleteJobAdminApi(id);
      setBannerSuccess("העבודה נמחקה בהצלחה.");
      await loadJobs();
      setTimeout(() => setBannerSuccess(null), 5000);
    } catch (error) {
      friendlyError(error);
    }
  };

  // Pipeline Presets Handlers
  const handleAddPipelinePreset = async (payload: { name: string; description?: string | null; is_active?: boolean }) => {
    setBannerError(null);
    try {
      await createPipelinePresetAdminApi(payload);
      await loadPipelinePresets();
    } catch (error) {
      friendlyError(error);
      throw error;
    }
  };

  const handleUpdatePipelinePreset = async (id: string, payload: { name?: string; description?: string | null; is_active?: boolean }) => {
    setBannerError(null);
    try {
      await updatePipelinePresetAdminApi(id, payload);
    } catch (error) {
      friendlyError(error);
      throw error;
    }
  };

  const handleDeletePipelinePreset = async (id: string) => {
    setBannerError(null);
    setBannerSuccess(null);
    try {
      await deletePipelinePresetAdminApi(id);
      setBannerSuccess("התבנית נמחקה בהצלחה.");
      await loadPipelinePresets();
      setTimeout(() => setBannerSuccess(null), 5000);
    } catch (error) {
      friendlyError(error);
      throw error;
    }
  };

  const handleEditPresetSteps = (presetId: string) => {
    const preset = pipelinePresets.find((p) => p.id === presetId);
    if (preset) {
      setEditingPresetSteps(preset);
    }
  };

  const handleSavePresetSteps = async (presetId: string, stationIds: string[]) => {
    setBannerError(null);
    try {
      await updatePipelinePresetStepsAdminApi(presetId, stationIds);
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
      { id: "jobs", label: "עבודות", icon: Briefcase },
      { id: "presets", label: "תבניות צינור", icon: Workflow },
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
                    : "חיפוש עבודה לפי מספר או לקוח"
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
                <>
                  <Badge
                    variant={jobStatusFilter === "all" ? "default" : "outline"}
                    className={`cursor-pointer transition-colors py-1.5 px-3 min-h-[36px] flex items-center ${jobStatusFilter === "all" ? "bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20" : "border-input text-muted-foreground hover:bg-accent hover:text-foreground/80"}`}
                    onClick={() => setJobStatusFilter("all")}
                  >
                    כל העבודות
                  </Badge>
                  <Badge
                    variant={jobStatusFilter === "active" ? "default" : "outline"}
                    className={`cursor-pointer transition-colors py-1.5 px-3 min-h-[36px] flex items-center ${jobStatusFilter === "active" ? "bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20" : "border-input text-muted-foreground hover:bg-accent hover:text-foreground/80"}`}
                    onClick={() => setJobStatusFilter("active")}
                  >
                    בתהליך
                  </Badge>
                  <Badge
                    variant={jobStatusFilter === "completed" ? "default" : "outline"}
                    className={`cursor-pointer transition-colors py-1.5 px-3 min-h-[36px] flex items-center ${jobStatusFilter === "completed" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20" : "border-input text-muted-foreground hover:bg-accent hover:text-foreground/80"}`}
                    onClick={() => setJobStatusFilter("completed")}
                  >
                    הושלמו
                  </Badge>
                </>
              )}
            </div>
          </div>
          {activeTab !== "jobs" && (
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

        {/* Alerts */}
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
        ) : activeTab === "jobs" ? (
          <JobsManagement
            jobs={jobs}
            isLoading={isLoadingJobs}
            onAdd={handleAddJob}
            onEdit={handleUpdateJob}
            onDelete={handleDeleteJob}
            onRefresh={loadJobs}
          />
        ) : (
          <>
            <PipelinePresetsManagement
              presets={pipelinePresets}
              isLoading={isLoadingPresets}
              onAdd={handleAddPipelinePreset}
              onEdit={handleUpdatePipelinePreset}
              onDelete={handleDeletePipelinePreset}
              onEditSteps={handleEditPresetSteps}
              onCheckInUse={handleCheckPresetInUse}
              onRefresh={loadPipelinePresets}
            />
            <PipelinePresetStepsDialog
              preset={editingPresetSteps}
              open={editingPresetSteps !== null}
              onOpenChange={(open) => {
                if (!open) {
                  setEditingPresetSteps(null);
                }
              }}
              onSave={handleSavePresetSteps}
              onFetchAvailableStations={handleFetchAvailableStationsForPreset}
            />
          </>
        )}
      </div>
    </AdminLayout>
  );
};