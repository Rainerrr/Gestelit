import type { Station, Worker, WorkerStation } from "@/lib/types";

const defaultStationReasons = [
  {
    id: "general-malfunction",
    label_he: "תקלת כללית",
    label_ru: "Общая неисправность",
    is_active: true,
  },
];

export const mockWorkers: Worker[] = [
  {
    id: "worker-1",
    worker_code: "4582",
    full_name: "דנה כהן",
    language: "he",
    role: "worker",
    is_active: true,
  },
  {
    id: "worker-2",
    worker_code: "5120",
    full_name: "Иван Петров",
    language: "ru",
    role: "worker",
    is_active: true,
  },
];

export const mockStations: Station[] = [
  {
    id: "station-1",
    name: "HP Indigo 7900",
    code: "DIG-01",
    station_type: "digital_press",
    is_active: true,
    start_checklist: [
      {
        id: "mock-dig-start-1",
        order_index: 1,
        label_he: "בדיקת דלקת ראשי הדפסה",
        label_ru: "Проверка голов печати",
        is_required: true,
      },
      {
        id: "mock-dig-start-2",
        order_index: 2,
        label_he: "אישור קובץ מול גלופות",
        label_ru: "Сверка файла с формами",
        is_required: true,
      },
    ],
    end_checklist: [
      {
        id: "mock-dig-end-1",
        order_index: 1,
        label_he: "ניקוי תחנה וסגירת חומרים",
        label_ru: "Очистка станции и закрытие материалов",
        is_required: true,
      },
      {
        id: "mock-dig-end-2",
        order_index: 2,
        label_he: "דיווח נתונים במערכת",
        label_ru: "Ввод данных в систему",
        is_required: true,
      },
    ],
    station_reasons: defaultStationReasons,
  },
  {
    id: "station-2",
    name: "Komori LS640",
    code: "OFF-02",
    station_type: "offset",
    is_active: true,
    start_checklist: [
      {
        id: "mock-offset-start-1",
        order_index: 1,
        label_he: "יישור גלופות",
        label_ru: "Выравнивание форм",
        is_required: true,
      },
    ],
    end_checklist: [
      {
        id: "mock-offset-end-1",
        order_index: 1,
        label_he: "כיבוי מכונה מבוקר",
        label_ru: "Контролируемое отключение станка",
        is_required: true,
      },
    ],
    station_reasons: defaultStationReasons,
  },
  {
    id: "station-3",
    name: "Polar 92 XT",
    code: "CUT-05",
    station_type: "cutting",
    is_active: true,
    start_checklist: [],
    end_checklist: [],
    station_reasons: defaultStationReasons,
  },
];

export const mockWorkerStations: WorkerStation[] = [
  {
    id: "ws-1",
    worker_id: "worker-1",
    station_id: "station-1",
  },
  {
    id: "ws-2",
    worker_id: "worker-1",
    station_id: "station-2",
  },
  {
    id: "ws-3",
    worker_id: "worker-2",
    station_id: "station-3",
  },
];

