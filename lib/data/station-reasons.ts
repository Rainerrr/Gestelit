import type { StationReason } from "@/lib/types";

export const GENERAL_STATION_REASON_ID = "general-malfunction";

export const GENERAL_STATION_REASON: StationReason = {
  id: GENERAL_STATION_REASON_ID,
  label_he: "תקלת כללית",
  label_ru: "Общая неисправность",
  is_active: true,
};

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
    { ...GENERAL_STATION_REASON },
    ...normalized,
  ]);

  // Ensure the default keeps canonical labels even if already present
  return merged.map((reason) =>
    reason.id === GENERAL_STATION_REASON_ID
      ? { ...GENERAL_STATION_REASON }
      : reason,
  );
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

