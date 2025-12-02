import type { SupportedLanguage } from "@/lib/i18n/translations";

export type WorkerRole = "worker" | "admin";
export type StationType =
  | "prepress"
  | "digital_press"
  | "offset"
  | "folding"
  | "cutting"
  | "binding"
  | "shrink"
  | "lamination"
  | "other";
export type SessionStatus = "active" | "completed" | "aborted";
export type ChecklistKind = "start" | "end";
export type StatusEventState =
  | "setup"
  | "production"
  | "stopped"
  | "fault"
  | "waiting_client"
  | "plate_change";
export type ReasonType = "stop" | "scrap";

export interface Worker {
  id: string;
  worker_code: string;
  full_name: string;
  language?: SupportedLanguage | "auto" | null;
  role: WorkerRole;
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
  started_at: string;
  ended_at?: string | null;
  total_good: number;
  total_scrap: number;
  created_at?: string;
  updated_at?: string;
}

export interface StatusEvent {
  id: string;
  session_id: string;
  status: StatusEventState;
  reason_id?: string | null;
  note?: string | null;
  image_url?: string | null;
  started_at: string;
  ended_at?: string | null;
}

export interface Reason {
  id: string;
  type: ReasonType;
  label_he: string;
  label_ru: string;
  is_active: boolean;
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

