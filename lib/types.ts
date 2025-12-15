import type { SupportedLanguage } from "@/lib/i18n/translations";

export type WorkerRole = "worker" | "admin";
export type StationType = string;
export type SessionStatus = "active" | "completed" | "aborted";
export type ChecklistKind = "start" | "end";
export type StatusScope = "global" | "station";
export type StatusCode = string; // status_definition.id
export type StatusEventState = StatusCode;
export type SessionAbandonReason = "worker_choice" | "expired";

export interface Worker {
  id: string;
  worker_code: string;
  full_name: string;
  language?: SupportedLanguage | "auto" | null;
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
  planned_quantity?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface Session {
  id: string;
  worker_id: string;
  station_id: string;
  job_id: string;
  status: SessionStatus;
  current_status_id?: StatusEventState | null;
  started_at: string;
  ended_at?: string | null;
  total_good: number;
  total_scrap: number;
  last_seen_at?: string | null;
  forced_closed_at?: string | null;
  last_status_change_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WorkerResumeSession {
  session: Session;
  station: Station | null;
  job: Job | null;
  graceExpiresAt: string;
}

export interface StatusEvent {
  id: string;
  session_id: string;
  status_definition_id: StatusEventState;
  station_reason_id?: string | null;
  note?: string | null;
  image_url?: string | null;
  started_at: string;
  ended_at?: string | null;
}

export interface StationReason {
  id: string;
  label_he: string;
  label_ru: string;
  is_active: boolean;
}

export interface Malfunction {
  id: string;
  station_id: string;
  station_reason_id?: string | null;
  description?: string | null;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string;
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
  created_at?: string;
  updated_at?: string;
}
