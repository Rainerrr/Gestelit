const { loadWorkerSheetRows } = require("./worker-sheet.cjs");

const rows = loadWorkerSheetRows();

console.log(JSON.stringify(rows, null, 2));

