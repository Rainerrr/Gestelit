import type { StationReason } from "@/lib/types";

export const GENERAL_STATION_REASON_ID = "general-malfunction";
export const GENERAL_REPORT_REASON_ID = "general-report";

export const GENERAL_STATION_REASON: StationReason = {
  id: GENERAL_STATION_REASON_ID,
  label_he: "תקלת כללית",
  label_ru: "Общая неисправность",
  is_active: true,
};

export const GENERAL_REPORT_REASON: StationReason = {
  id: GENERAL_REPORT_REASON_ID,
  label_he: "דיווח כללי",
  label_ru: "Общий отчёт",
  is_active: true,
};

export const DEFAULT_REASONS: StationReason[] = [
  GENERAL_STATION_REASON,
  GENERAL_REPORT_REASON,
];

const generateReasonId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `reason-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const sanitizeReason = (reason: StationReason): StationReason | null => {
  const id = (reason.id || "").trim() || generateReasonId();
  const label_he = (reason.label_he || "").trim();
  const label_ru = (reason.label_ru || "").trim();
  if (!label_he || !label_ru) {
    return null;
  }

  return {
    id,
    label_he,
    label_ru,
    is_active: reason.is_active ?? true,
  };
};

const dedupeById = (reasons: StationReason[]): StationReason[] => {
  const seen = new Set<string>();
  const result: StationReason[] = [];
  for (const reason of reasons) {
    if (seen.has(reason.id)) continue;
    seen.add(reason.id);
    result.push(reason);
  }
  return result;
};

export const mergeStationReasonsWithDefault = (
  stationReasons?: StationReason[] | null,
): StationReason[] => {
  const normalized = (stationReasons ?? [])
    .map(sanitizeReason)
    .filter(Boolean) as StationReason[];

  const merged = dedupeById([
    ...DEFAULT_REASONS,
    ...normalized,
  ]);

  // Ensure the defaults keep canonical labels even if already present
  return merged.map((reason) => {
    if (reason.id === GENERAL_STATION_REASON_ID) {
      return { ...GENERAL_STATION_REASON };
    }
    if (reason.id === GENERAL_REPORT_REASON_ID) {
      return { ...GENERAL_REPORT_REASON };
    }
    return reason;
  });
};

export const getActiveStationReasons = (
  stationReasons?: StationReason[] | null,
): StationReason[] =>
  mergeStationReasonsWithDefault(stationReasons).filter(
    (reason) => reason.is_active,
  );

export const validateUniqueLabels = (reasons: StationReason[]) => {
  const seenHe = new Set<string>();
  const seenRu = new Set<string>();
  for (const reason of reasons) {
    const he = reason.label_he.trim();
    const ru = reason.label_ru.trim();
    if (seenHe.has(he) || seenRu.has(ru)) {
      throw new Error("REASON_LABELS_MUST_BE_UNIQUE");
    }
    seenHe.add(he);
    seenRu.add(ru);
  }
};



