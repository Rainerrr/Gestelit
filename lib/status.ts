import type { StatusDefinition } from "@/lib/types";

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

export type StatusDictionary = {
  global: Map<string, StatusDefinition>;
  station: Map<string, Map<string, StatusDefinition>>;
  order: string[];
};

export const ALLOWED_STATUS_COLORS: string[] = [
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f97316", // orange
  "#ef4444", // red
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#14b8a6", // teal
  "#84cc16", // lime
  "#eab308", // yellow
  "#ec4899", // pink
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#64748b", // slate
  "#94a3b8", // slate-400
];

const DEFAULT_COLOR_HEX = "#94a3b8";

export const isValidStatusColor = (hex: string): boolean =>
  ALLOWED_STATUS_COLORS.includes(hex.toLowerCase());

export const hexToRgba = (hex: string, alpha: number): string => {
  const trimmed = hex.replace("#", "");
  const bigint = parseInt(trimmed, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const generateBadgeClasses = (hex: string): string =>
  getColorStyle(hex).badge;

export const generateDotClass = (hex: string): string =>
  getColorStyle(hex).dot;

const COLOR_STYLES: Record<string, StatusColorConfig> = {
  "#10b981": {
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
  "#f59e0b": {
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
  "#f97316": {
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
  "#ef4444": {
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
  "#3b82f6": {
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
  "#8b5cf6": {
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
  "#06b6d4": {
    hex: "#06b6d4",
    badge: "bg-cyan-100 text-cyan-800",
    dot: "bg-cyan-500",
    softBg: "bg-cyan-50",
    softText: "text-cyan-900",
    border: "border-cyan-500",
    ring: "ring-cyan-200",
    shadow: "shadow-[0_10px_25px_rgba(6,182,212,0.22)]",
    timerBorder: "border-cyan-200",
    timerShadow: "shadow-[0_0_35px_rgba(6,182,212,0.22)]",
  },
  "#14b8a6": {
    hex: "#14b8a6",
    badge: "bg-teal-100 text-teal-800",
    dot: "bg-teal-500",
    softBg: "bg-teal-50",
    softText: "text-teal-900",
    border: "border-teal-500",
    ring: "ring-teal-200",
    shadow: "shadow-[0_10px_25px_rgba(20,184,166,0.22)]",
    timerBorder: "border-teal-200",
    timerShadow: "shadow-[0_0_35px_rgba(20,184,166,0.22)]",
  },
  "#84cc16": {
    hex: "#84cc16",
    badge: "bg-lime-100 text-lime-800",
    dot: "bg-lime-500",
    softBg: "bg-lime-50",
    softText: "text-lime-900",
    border: "border-lime-500",
    ring: "ring-lime-200",
    shadow: "shadow-[0_10px_25px_rgba(132,204,22,0.22)]",
    timerBorder: "border-lime-200",
    timerShadow: "shadow-[0_0_35px_rgba(132,204,22,0.22)]",
  },
  "#eab308": {
    hex: "#eab308",
    badge: "bg-yellow-100 text-yellow-800",
    dot: "bg-yellow-500",
    softBg: "bg-yellow-50",
    softText: "text-yellow-900",
    border: "border-yellow-500",
    ring: "ring-yellow-200",
    shadow: "shadow-[0_10px_25px_rgba(234,179,8,0.22)]",
    timerBorder: "border-yellow-200",
    timerShadow: "shadow-[0_0_35px_rgba(234,179,8,0.22)]",
  },
  "#ec4899": {
    hex: "#ec4899",
    badge: "bg-pink-100 text-pink-800",
    dot: "bg-pink-500",
    softBg: "bg-pink-50",
    softText: "text-pink-900",
    border: "border-pink-500",
    ring: "ring-pink-200",
    shadow: "shadow-[0_10px_25px_rgba(236,72,153,0.22)]",
    timerBorder: "border-pink-200",
    timerShadow: "shadow-[0_0_35px_rgba(236,72,153,0.22)]",
  },
  "#6366f1": {
    hex: "#6366f1",
    badge: "bg-indigo-100 text-indigo-800",
    dot: "bg-indigo-500",
    softBg: "bg-indigo-50",
    softText: "text-indigo-900",
    border: "border-indigo-500",
    ring: "ring-indigo-200",
    shadow: "shadow-[0_10px_25px_rgba(99,102,241,0.22)]",
    timerBorder: "border-indigo-200",
    timerShadow: "shadow-[0_0_35px_rgba(99,102,241,0.22)]",
  },
  "#0ea5e9": {
    hex: "#0ea5e9",
    badge: "bg-sky-100 text-sky-800",
    dot: "bg-sky-500",
    softBg: "bg-sky-50",
    softText: "text-sky-900",
    border: "border-sky-500",
    ring: "ring-sky-200",
    shadow: "shadow-[0_10px_25px_rgba(14,165,233,0.22)]",
    timerBorder: "border-sky-200",
    timerShadow: "shadow-[0_0_35px_rgba(14,165,233,0.22)]",
  },
  "#64748b": {
    hex: "#64748b",
    badge: "bg-slate-200 text-slate-800",
    dot: "bg-slate-500",
    softBg: "bg-slate-100",
    softText: "text-slate-900",
    border: "border-slate-500",
    ring: "ring-slate-200",
    shadow: "shadow-[0_10px_25px_rgba(100,116,139,0.18)]",
    timerBorder: "border-slate-200",
    timerShadow: "shadow-[0_0_35px_rgba(100,116,139,0.18)]",
  },
  "#94a3b8": {
    hex: "#94a3b8",
    badge: "bg-slate-100 text-slate-800 border border-slate-200",
    dot: "bg-slate-400",
    softBg: "bg-slate-50",
    softText: "text-slate-900",
    border: "border-slate-300",
    ring: "ring-slate-200",
    shadow: "shadow-[0_10px_25px_rgba(148,163,184,0.18)]",
    timerBorder: "border-slate-200",
    timerShadow: "shadow-[0_0_35px_rgba(148,163,184,0.18)]",
  },
};

const getColorStyle = (hex: string): StatusColorConfig =>
  COLOR_STYLES[hex] ?? COLOR_STYLES[DEFAULT_COLOR_HEX];

export const buildStatusDictionary = (
  definitions: StatusDefinition[] = [],
): StatusDictionary => {
  const globalDefs = definitions
    .filter((item) => item.scope === "global")
    .sort(
      (a, b) =>
        new Date(a.created_at ?? 0).getTime() -
        new Date(b.created_at ?? 0).getTime(),
    );

  const stationDefs = definitions.filter(
    (item) => item.scope === "station" && item.station_id,
  );

  const global = new Map<string, StatusDefinition>();
  globalDefs.forEach((item) => {
    global.set(item.id, item);
  });

  const station = new Map<string, Map<string, StatusDefinition>>();
  stationDefs.forEach((item) => {
    const stationId = item.station_id as string;
    const bucket = station.get(stationId) ?? new Map<string, StatusDefinition>();
    bucket.set(item.id, item);
    station.set(stationId, bucket);
  });

  const order = globalDefs.map((item) => item.id);

  return { global, station, order };
};

export type StatusScopeKind = "global" | "station" | "unknown";

export const getStatusScope = (
  id: string,
  dictionary?: StatusDictionary,
): StatusScopeKind => {
  if (!dictionary) return "unknown";
  if (dictionary.global.has(id)) return "global";
  for (const bucket of dictionary.station.values()) {
    if (bucket.has(id)) {
      return "station";
    }
  }
  return "unknown";
};

export const resolveStatusDefinition = (
  dictionary: StatusDictionary | undefined,
  id: string,
  stationId?: string | null,
): StatusDefinition | undefined => {
  if (!dictionary) {
    return undefined;
  }

  if (stationId) {
    const stationMap = dictionary.station.get(stationId);
    const stationSpecific = stationMap?.get(id);
    if (stationSpecific) return stationSpecific;
  }

  return dictionary.global.get(id);
};

export const getStatusLabel = (
  id: string,
  dictionary?: StatusDictionary,
  stationId?: string | null,
): string => resolveStatusDefinition(dictionary, id, stationId)?.label_he ?? id;

export const getStatusHex = (
  id: string,
  dictionary?: StatusDictionary,
  stationId?: string | null,
): string =>
  resolveStatusDefinition(dictionary, id, stationId)?.color_hex ??
  DEFAULT_COLOR_HEX;

export const getStatusBadgeClass = (
  id: string,
  dictionary?: StatusDictionary,
  stationId?: string | null,
): string => {
  const hex = getStatusHex(id, dictionary, stationId);
  return getColorStyle(hex).badge;
};

export const getStatusDotClass = (
  id: string,
  dictionary?: StatusDictionary,
  stationId?: string | null,
): string => {
  const hex = getStatusHex(id, dictionary, stationId);
  return getColorStyle(hex).dot;
};
