export type WorkerRole = "worker" | "admin";
export type StationType = string;
export type SessionStatus = "active" | "completed" | "aborted";
export type ChecklistKind = "start" | "end";
export type StatusScope = "global" | "station";
export type MachineState = "production" | "setup" | "stoppage";
export type StatusCode = string; // status_definition.id
export type StatusEventState = StatusCode;
export type SessionAbandonReason = "worker_choice" | "expired";

export interface Worker {
  id: string;
  worker_code: string;
  full_name: string;
  role: WorkerRole;
  department?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Station {
  id: string;
  name: string;
  code: string;
  station_type: StationType;
  is_active: boolean;
  start_checklist?: StationChecklistItem[] | null;
  end_checklist?: StationChecklistItem[] | null;
  station_reasons?: StationReason[] | null;
  station_statuses?: StatusDefinition[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface WorkerStation {
  id: string;
  worker_id: string;
  station_id: string;
}

export interface Job {
  id: string;
  job_number: string;
  customer_name?: string | null;
  description?: string | null;
  /** Target completion date for the job (YYYY-MM-DD format) */
  due_date?: string | null;
  // planned_quantity removed - use SUM(job_items.planned_quantity) instead
  created_at?: string;
  updated_at?: string;
}

export interface Session {
  id: string;
  worker_id: string;
  station_id: string;
  job_id: string | null;
  status: SessionStatus;
  current_status_id?: StatusEventState | null;
  started_at: string;
  ended_at?: string | null;
  // total_good/total_scrap removed - derive from SUM(status_events.quantity_*)
  last_seen_at?: string | null;
  forced_closed_at?: string | null;
  last_status_change_at?: string | null;
  scrap_report_submitted?: boolean;
  // Job item tracking (for pipeline WIP)
  job_item_id?: string | null;
  /** @deprecated Use job_item_step_id */
  job_item_station_id?: string | null;
  job_item_step_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WorkerResumeSession {
  session: Session;
  station: Station | null;
  job: Job | null;
  graceExpiresAt: string;
  /** Session totals derived from status_events for the current job item */
  sessionTotals?: {
    good: number;
    scrap: number;
    jobItemId: string | null;
  };
}

export interface StatusEvent {
  id: string;
  session_id: string;
  status_definition_id: StatusEventState;
  station_reason_id?: string | null;
  note?: string | null;
  image_url?: string | null;
  report_id?: string | null;
  started_at: string;
  ended_at?: string | null;
  /** Good units produced during this status event period */
  quantity_good?: number | null;
  /** Scrap units during this status event period */
  quantity_scrap?: number | null;
  /** The job item being worked on during this status event */
  job_item_id?: string | null;
  /** The specific pipeline step being worked on */
  job_item_step_id?: string | null;
}

export interface StationReason {
  id: string;
  label_he: string;
  label_ru: string;
  is_active: boolean;
}

// Unified Reports System
export type ReportType = "malfunction" | "general" | "scrap";
export type MalfunctionReportStatus = "open" | "known" | "solved";
export type SimpleReportStatus = "new" | "approved";
export type ReportStatus = MalfunctionReportStatus | SimpleReportStatus;
export type StatusReportType = "none" | "malfunction" | "general";

export interface ReportReason {
  id: string;
  label_he: string;
  label_ru?: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface Report {
  id: string;
  type: ReportType;
  station_id?: string | null;
  session_id?: string | null;
  reported_by_worker_id?: string | null;
  description?: string | null;
  image_url?: string | null;
  station_reason_id?: string | null;
  report_reason_id?: string | null;
  status_event_id?: string | null;
  /** Links QA reports to specific job items */
  job_item_id?: string | null;
  /** True for first product QA approval requests */
  is_first_product_qa?: boolean;
  status: ReportStatus;
  status_changed_at?: string | null;
  status_changed_by?: string | null;
  admin_notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface StatusEventForReport {
  id: string;
  started_at: string;
  ended_at: string | null;
  status_definition: Pick<
    StatusDefinition,
    "id" | "label_he" | "label_ru" | "color_hex" | "machine_state"
  > | null;
}

export interface ReportWithDetails extends Report {
  station?: Station | null;
  session?: Session | null;
  reporter?: Pick<Worker, "id" | "full_name" | "worker_code"> | null;
  report_reason?: ReportReason | null;
  status_event?: StatusEventForReport | null;
  /** Job item details for QA reports */
  job_item?: Pick<JobItem, "id" | "name"> | null;
}

export interface StationChecklistItem {
  id: string;
  order_index: number;
  label_he: string;
  label_ru: string;
  is_required: boolean;
}

export interface StationChecklist {
  kind: ChecklistKind;
  items: StationChecklistItem[];
}

export interface StatusDefinition {
  id: string;
  scope: StatusScope;
  station_id?: string | null;
  label_he: string;
  label_ru?: string | null;
  color_hex: string;
  machine_state: MachineState;
  report_type?: StatusReportType;
  is_protected?: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================
// PIPELINE PRESETS (NEW)
// ============================================

export interface PipelinePreset {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface PipelinePresetStep {
  id: string;
  pipeline_preset_id: string;
  station_id: string;
  position: number;
  /** Default value for requires_first_product_approval when creating job items from this preset */
  requires_first_product_approval?: boolean;
  created_at?: string;
  station?: Station;
}

export interface PipelinePresetWithSteps extends PipelinePreset {
  steps: PipelinePresetStep[];
}

// ============================================
// JOB ITEMS + WIP (Pipeline-Only Model)
// ============================================

/**
 * Job item represents a product with a pipeline workflow.
 * Post Phase 5: All items use the pipeline model with job_item_steps.
 * The kind, station_id, and production_line_id columns have been removed.
 */
export interface JobItem {
  id: string;
  job_id: string;
  /** Required name for the job item/product */
  name: string;
  planned_quantity: number;
  is_active: boolean;
  /** Reference to the preset used to create this pipeline (provenance) */
  pipeline_preset_id?: string | null;
  /** True once production has started - prevents pipeline modification */
  is_pipeline_locked?: boolean;
  created_at?: string;
  updated_at?: string;
  pipeline_preset?: Pick<PipelinePreset, "id" | "name">;
}

/** Pipeline step for a job item (renamed from JobItemStation) */
export interface JobItemStep {
  id: string;
  job_item_id: string;
  station_id: string;
  position: number;
  is_terminal: boolean;
  /** When true, workers must submit and get approval for first product report before entering production status */
  requires_first_product_approval?: boolean;
  created_at?: string;
  station?: Station;
}

/**
 * @deprecated Use JobItemStep instead
 */
export type JobItemStation = JobItemStep;

export interface JobItemProgress {
  job_item_id: string;
  completed_good: number;
  updated_at?: string;
}

export interface JobItemWithDetails extends JobItem {
  /** @deprecated Use job_item_steps */
  job_item_stations?: JobItemStep[];
  job_item_steps?: JobItemStep[];
  progress?: JobItemProgress;
  wip_balances?: WipBalance[];
}

export interface WipBalance {
  id: string;
  job_item_id: string;
  /** @deprecated Use job_item_step_id */
  job_item_station_id?: string;
  job_item_step_id: string;
  good_available: number;
  updated_at?: string;
}

export interface WipConsumption {
  id: string;
  job_item_id: string;
  consuming_session_id: string;
  /** @deprecated Use from_job_item_step_id */
  from_job_item_station_id?: string;
  from_job_item_step_id: string;
  good_used: number;
  created_at?: string;
}

export interface SessionWipAccounting {
  session_id: string;
  job_item_id: string;
  /** @deprecated Use job_item_step_id */
  job_item_station_id?: string;
  job_item_step_id: string;
  // Good accounting
  total_good: number;
  pulled_good: number;
  originated_good: number;
  // Scrap accounting (symmetric with good)
  total_scrap: number;
  pulled_scrap: number;
  originated_scrap: number;
}

export interface SessionUpdateResult {
  success: boolean;
  error_code?: string | null;
  session_id: string;
  total_good: number;
  total_scrap: number;
}

// ============================================
// LIVE JOB PROGRESS (Admin Dashboard)
// ============================================

export interface WipStationData {
  /** @deprecated Use jobItemStepId */
  jobItemStationId?: string;
  jobItemStepId: string;
  stationId: string;
  stationName: string;
  position: number;
  isTerminal: boolean;
  goodAvailable: number;
  hasActiveSession: boolean;
}

export interface LiveJobItemAssignment {
  jobItem: JobItemWithDetails;
  wipDistribution: WipStationData[];
  completedGood: number;
  plannedQuantity: number;
}

export interface LiveJobProgress {
  job: Job;
  jobItems: LiveJobItemAssignment[];
  activeSessionCount: number;
  activeStationIds: string[];
}

// ============================================
// STATION SELECTION (Worker Flow)
// ============================================

export interface StationOccupancy {
  isOccupied: boolean;
  isGracePeriod: boolean;
  occupiedBy?: {
    workerId: string;
    workerName: string;
    sessionId: string;
    lastSeenAt: string;
    graceExpiresAt: string;
  };
}

export interface PipelineStationOption {
  id: string;
  name: string;
  code: string;
  position: number;
  isTerminal: boolean;
  isWorkerAssigned: boolean;
  occupancy: StationOccupancy;
  /** @deprecated Use jobItemStepId */
  jobItemStationId?: string;
  jobItemStepId: string;
}

export interface StationSelectionJobItem {
  id: string;
  name: string;
  plannedQuantity: number;
  pipelineStations: PipelineStationOption[];
}
