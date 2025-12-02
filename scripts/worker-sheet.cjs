const path = require("node:path");
const XLSX = require("xlsx");
const iconv = require("iconv-lite");

const workbookPath = path.join(
  __dirname,
  "..",
  "lib",
  "mocks",
  "רשימת עובדים ת.ז 25.11.2025.xlsx",
);

const decodeCell = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/[\u0590-\u05FF]/.test(trimmed)) {
    return trimmed;
  }

  const buffer = Buffer.alloc(trimmed.length);
  for (let i = 0; i < trimmed.length; i += 1) {
    buffer[i] = trimmed.charCodeAt(i);
  }

  const decoded = iconv.decode(buffer, "win1255").trim();
  return decoded || trimmed;
};

function loadWorkerSheetRows() {
  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  return rawRows.map((row) => row.map((cell) => decodeCell(cell)));
}

module.exports = {
  loadWorkerSheetRows,
};


