import type { StatusEventState } from "@/lib/types";

export const STATUS_LABELS: Record<StatusEventState, string> = {
  setup: "כיוונים",
  production: "ייצור",
  stopped: "עצירה",
  fault: "תקלה",
  waiting_client: "המתנה ללקוח",
  plate_change: "שינוי גלופות",
};

export const STATUS_BADGE_STYLES: Record<StatusEventState, string> = {
  setup: "bg-amber-100 text-amber-800",
  production: "bg-emerald-100 text-emerald-800",
  stopped: "bg-slate-100 text-slate-700",
  fault: "bg-red-100 text-red-700",
  waiting_client: "bg-yellow-100 text-yellow-800",
  plate_change: "bg-indigo-100 text-indigo-800",
};

export const STOPPAGE_STATUSES: StatusEventState[] = [
  "stopped",
  "fault",
  "waiting_client",
  "plate_change",
];

export const STATUS_ORDER: StatusEventState[] = [
  "production",
  "setup",
  "stopped",
  "fault",
  "waiting_client",
  "plate_change",
];



