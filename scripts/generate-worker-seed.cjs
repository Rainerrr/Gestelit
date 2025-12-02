const fs = require("node:fs");
const path = require("node:path");
const { loadWorkerSheetRows } = require("./worker-sheet.cjs");

const STATION_METADATA = {
  H2: { code: "H2", station_type: "digital_press" },
  H8: { code: "H8", station_type: "digital_press" },
  CD: { code: "CD", station_type: "digital_press" },
  "קיפול 1/4": { code: "FOLD_QTR", station_type: "folding" },
  "קיפול 1": { code: "FOLD_1", station_type: "folding" },
  "קיפול 2": { code: "FOLD_2", station_type: "folding" },
  "קיפול NBO": { code: "FOLD_NBO", station_type: "folding" },
  "איסוף 20 תאים": { code: "GATHER_20", station_type: "binding" },
  "דבק קטנה": { code: "GLUE_SMALL", station_type: "binding" },
  "דבק גדולה": { code: "GLUE_LARGE", station_type: "binding" },
  למינציה: { code: "LAMINATION", station_type: "lamination" },
  "חיתוך 1": { code: "CUT_1", station_type: "cutting" },
  "חיתוך 2": { code: "CUT_2", station_type: "cutting" },
  קוגלר: { code: "KUGLER", station_type: "binding" },
  "סגירת ספירלה 1": { code: "SPIRAL_CLOSE_1", station_type: "binding" },
  "סגירת ספירלה 2": { code: "SPIRAL_CLOSE_2", station_type: "binding" },
  דרוג: { code: "STACK_STEP", station_type: "binding" },
  "חרור ידני לספירלה": { code: "SPIRAL_PUNCH_HAND", station_type: "binding" },
  "חרור חור": { code: "PUNCH_HOLE", station_type: "binding" },
  "שרינק קטנה": { code: "SHRINK_SMALL", station_type: "shrink" },
  "שרינק גדולה": { code: "SHRINK_LARGE", station_type: "shrink" },
  "לוחות דפוס": { code: "PLATE_MAKING", station_type: "prepress" },
  "דפוס דיגיטלי": { code: "DIGITAL_PRESS_GENERIC", station_type: "digital_press" },
  "חיתוך מדבקות": { code: "CUT_LABELS", station_type: "cutting" },
  ביגים: { code: "SCORING", station_type: "cutting" },
  סיכות: { code: "STAPLES", station_type: "binding" },
};

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

function buildSeed() {
  const rows = loadWorkerSheetRows();
  if (!rows.length) {
    throw new Error("Excel sheet is empty");
  }

  const [header, ...workerRows] = rows;
  const stationNames = header.slice(2).filter(Boolean);

  const stations = stationNames.map((name) => {
    const meta = STATION_METADATA[name];
    if (!meta) {
      throw new Error(`Missing station metadata for column: ${name}`);
    }

    return { name, ...meta };
  });

  const workers = workerRows
    .map((row) => {
      const fullName = row?.[0];
      const workerCode = row?.[1];
      if (!fullName || !workerCode) {
        return null;
      }

      const normalizedCode = String(workerCode).replace(/\s+/g, "");
      const assignments = stationNames.reduce((acc, stationName, idx) => {
        const cell = row?.[idx + 2];
        if (typeof cell === "string" && cell.trim().toUpperCase() === "X") {
          acc.push(STATION_METADATA[stationName].code);
        }
        return acc;
      }, []);

      return {
        full_name: String(fullName).trim(),
        worker_code: normalizedCode,
        assignments,
      };
    })
    .filter(Boolean);

  const stationValues = stations
    .map(
      (station) =>
        `  (${sqlString(station.name)}, ${sqlString(station.code)}, ${sqlString(station.station_type)}, true)`,
    )
    .join(",\n");

  const workerValues = workers
    .map(
      (worker) =>
        `  (${sqlString(worker.full_name)}, ${sqlString(worker.worker_code)}, 'auto', 'worker', true)`,
    )
    .join(",\n");

  const assignmentPairs = workers
    .flatMap((worker) =>
      worker.assignments.map((stationCode) => [
        worker.worker_code,
        stationCode,
      ]),
    )
    .map(
      ([workerCode, stationCode]) =>
        `  (${sqlString(workerCode)}, ${sqlString(stationCode)})`,
    )
    .join(",\n");

  const statements = [
    "-- Seed data generated from lib/mocks/רשימת עובדים ת.ז 25.11.2025.xlsx",
    "-- Run node scripts/generate-worker-seed.cjs after updating the spreadsheet.",
    "begin;",
    "",
    "-- Stations",
    "insert into stations (name, code, station_type, is_active)",
    "values",
    stationValues,
    "on conflict (code) do update",
    "set",
    "  name = excluded.name,",
    "  station_type = excluded.station_type,",
    "  is_active = true;",
    "",
    "-- Workers",
    "insert into workers (full_name, worker_code, language, role, is_active)",
    "values",
    workerValues,
    "on conflict (worker_code) do update",
    "set",
    "  full_name = excluded.full_name,",
    "  is_active = excluded.is_active,",
    "  language = excluded.language;",
  ];

  if (assignmentPairs) {
    statements.push(
      "",
      "-- Worker to station assignments",
      "insert into worker_stations (worker_id, station_id)",
      "select w.id, s.id",
      "from (values",
      assignmentPairs,
      ") as pair(worker_code, station_code)",
      "join workers w on w.worker_code = pair.worker_code",
      "join stations s on s.code = pair.station_code",
      "on conflict (worker_id, station_id) do nothing;",
    );
  }

  statements.push("", "commit;", "");

  return statements.join("\n");
}

const seedSql = buildSeed();
const outputPath = path.join(__dirname, "..", "supabase", "seed.sql");
fs.writeFileSync(outputPath, seedSql, "utf8");
console.log(`Wrote seed data to ${outputPath}`);

