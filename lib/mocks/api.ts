import {
  mockReasons,
  mockStations,
  mockWorkerStations,
  mockWorkers,
} from "@/lib/mocks/data";
import type {
  ChecklistKind,
  Reason,
  ReasonType,
  Station,
  StationChecklist,
  Worker,
} from "@/lib/types";

export function findMockWorkerByCode(
  workerCode: string,
): Worker | undefined {
  return mockWorkers.find(
    (worker) =>
      worker.worker_code === workerCode.trim() && worker.is_active,
  );
}

export function getMockStationsForWorker(
  workerId: string,
): Station[] {
  const stationIds = mockWorkerStations
    .filter((assignment) => assignment.worker_id === workerId)
    .map((assignment) => assignment.station_id);

  return mockStations.filter(
    (station) => stationIds.includes(station.id) && station.is_active,
  );
}

export function getMockChecklist(
  stationId: string,
  kind: ChecklistKind,
): StationChecklist | null {
  const station = mockStations.find((entry) => entry.id === stationId);
  if (!station) {
    return null;
  }

  const items =
    kind === "start"
      ? station.start_checklist ?? []
      : station.end_checklist ?? [];

  if (!items.length) {
    return null;
  }

  return {
    kind,
    items: [...items].sort((a, b) => a.order_index - b.order_index),
  };
}

export function getMockReasons(type?: ReasonType): Reason[] {
  return mockReasons.filter(
    (reason) => reason.is_active && (!type || reason.type === type),
  );
}

