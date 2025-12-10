import type { StatusEventState } from "@/lib/types";

type StatusColorConfig = {
  hex: string;
  badge: string;
  dot: string;
  softBg: string;
  softText: string;
  border: string;
  ring: string;
  shadow: string;
  timerBorder: string;
  timerShadow: string;
};

export const STATUS_LABELS: Record<StatusEventState, string> = {
  setup: "כיוונים",
  production: "ייצור",
  stopped: "עצירה",
  fault: "תקלה",
  waiting_client: "המתנה ללקוח",
  plate_change: "שינוי גלופות",
};

export const STATUS_ORDER: StatusEventState[] = [
  "production",
  "setup",
  "stopped",
  "fault",
  "waiting_client",
  "plate_change",
];

export const STOPPAGE_STATUSES: StatusEventState[] = [
  "stopped",
  "fault",
  "waiting_client",
  "plate_change",
];

export const STATUS_COLORS: Record<StatusEventState, StatusColorConfig> = {
  setup: {
    hex: "#f59e0b",
    badge: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
    softBg: "bg-amber-50",
    softText: "text-amber-900",
    border: "border-amber-500",
    ring: "ring-amber-200",
    shadow: "shadow-[0_10px_25px_rgba(245,158,11,0.28)]",
    timerBorder: "border-amber-200",
    timerShadow: "shadow-[0_0_35px_rgba(245,158,11,0.28)]",
  },
  production: {
    hex: "#10b981",
    badge: "bg-emerald-100 text-emerald-800",
    dot: "bg-emerald-500",
    softBg: "bg-emerald-50",
    softText: "text-emerald-900",
    border: "border-emerald-500",
    ring: "ring-emerald-200",
    shadow: "shadow-[0_10px_25px_rgba(16,185,129,0.25)]",
    timerBorder: "border-emerald-200",
    timerShadow: "shadow-[0_0_35px_rgba(16,185,129,0.25)]",
  },
  stopped: {
    hex: "#f97316",
    badge: "bg-orange-100 text-orange-800",
    dot: "bg-orange-500",
    softBg: "bg-orange-50",
    softText: "text-orange-900",
    border: "border-orange-500",
    ring: "ring-orange-200",
    shadow: "shadow-[0_10px_25px_rgba(249,115,22,0.25)]",
    timerBorder: "border-orange-200",
    timerShadow: "shadow-[0_0_35px_rgba(249,115,22,0.25)]",
  },
  fault: {
    hex: "#ef4444",
    badge: "bg-rose-100 text-rose-800",
    dot: "bg-rose-500",
    softBg: "bg-rose-50",
    softText: "text-rose-900",
    border: "border-rose-500",
    ring: "ring-rose-200",
    shadow: "shadow-[0_10px_25px_rgba(244,63,94,0.25)]",
    timerBorder: "border-rose-200",
    timerShadow: "shadow-[0_0_35px_rgba(244,63,94,0.25)]",
  },
  waiting_client: {
    hex: "#3b82f6",
    badge: "bg-blue-100 text-blue-800",
    dot: "bg-blue-500",
    softBg: "bg-blue-50",
    softText: "text-blue-900",
    border: "border-blue-500",
    ring: "ring-blue-200",
    shadow: "shadow-[0_10px_25px_rgba(59,130,246,0.22)]",
    timerBorder: "border-blue-200",
    timerShadow: "shadow-[0_0_35px_rgba(59,130,246,0.22)]",
  },
  plate_change: {
    hex: "#8b5cf6",
    badge: "bg-purple-100 text-purple-800",
    dot: "bg-purple-500",
    softBg: "bg-purple-50",
    softText: "text-purple-900",
    border: "border-purple-500",
    ring: "ring-purple-200",
    shadow: "shadow-[0_10px_25px_rgba(139,92,246,0.22)]",
    timerBorder: "border-purple-200",
    timerShadow: "shadow-[0_0_35px_rgba(139,92,246,0.22)]",
  },
};

export const STATUS_BADGE_STYLES = STATUS_ORDER.reduce(
  (acc, status) => {
    acc[status] = STATUS_COLORS[status].badge;
    return acc;
  },
  {} as Record<StatusEventState, string>,
);

export const getStatusHex = (statusKey: string): string =>
  STATUS_COLORS[statusKey as StatusEventState]?.hex ?? "#94a3b8";

