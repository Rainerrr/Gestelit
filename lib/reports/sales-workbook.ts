import "server-only";

import ExcelJS from "exceljs";
import type { SalesListParams, SalesReportData } from "@/lib/data/sales-log";

const COLORS = {
  ink: "172033",
  muted: "667085",
  border: "D7DFEA",
  brand: "5B21B6",
  brandSoft: "EDE9FE",
  blue: "2563EB",
  blueSoft: "DBEAFE",
  green: "15803D",
  greenSoft: "DCFCE7",
  amber: "B45309",
  amberSoft: "FEF3C7",
  red: "B91C1C",
  redSoft: "FEE2E2",
  surface: "F8FAFC",
  white: "FFFFFF",
};

const eventLabels: Record<string, string> = {
  meeting: "פגישה",
  call: "שיחה",
  lead: "ליד",
  sale: "מכירה",
  follow_up: "פולואפ",
};

const statusLabels: Record<string, string> = {
  new: "חדש",
  open: "פתוח",
  follow_up: "צריך לחזור",
  won: "נסגר",
  lost: "לא נסגר",
  done: "בוצע",
};

export type SalesWorkbookOptions = {
  scope: "admin" | "personal";
  ownerName?: string;
  filters?: SalesListParams;
};

function asDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function styleTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string) {
  sheet.mergeCells("A1:H1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = title;
  titleCell.font = { name: "Arial", size: 22, bold: true, color: { argb: COLORS.white } };
  titleCell.alignment = { horizontal: "right", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.brand } };
  sheet.getRow(1).height = 38;

  sheet.mergeCells("A2:H2");
  const subtitleCell = sheet.getCell("A2");
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: "Arial", size: 10, color: { argb: COLORS.muted } };
  subtitleCell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.surface } };
  sheet.getRow(2).height = 26;
}

function sectionHeader(sheet: ExcelJS.Worksheet, row: number, title: string, endColumn = 8) {
  sheet.mergeCells(row, 1, row, endColumn);
  const cell = sheet.getCell(row, 1);
  cell.value = title;
  cell.font = { name: "Arial", size: 12, bold: true, color: { argb: COLORS.ink } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.brandSoft } };
  cell.alignment = { horizontal: "right", vertical: "middle" };
  cell.border = { bottom: { style: "thin", color: { argb: COLORS.border } } };
  sheet.getRow(row).height = 25;
}

function metric(sheet: ExcelJS.Worksheet, row: number, column: number, label: string, value: string | number, tone = COLORS.blueSoft) {
  const labelCell = sheet.getCell(row, column);
  const valueCell = sheet.getCell(row + 1, column);
  labelCell.value = label;
  valueCell.value = value;
  for (const cell of [labelCell, valueCell]) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tone } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.border } },
      bottom: { style: "thin", color: { argb: COLORS.border } },
      left: { style: "thin", color: { argb: COLORS.border } },
      right: { style: "thin", color: { argb: COLORS.border } },
    };
  }
  labelCell.font = { name: "Arial", size: 9, color: { argb: COLORS.muted } };
  valueCell.font = { name: "Arial", size: 15, bold: true, color: { argb: COLORS.ink } };
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function setupSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ rightToLeft: true, state: "frozen", ySplit: 2 }];
  sheet.properties.defaultRowHeight = 20;
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  sheet.headerFooter.oddFooter = "&RGestelit | &D &T&Cעמוד &P מתוך &N";
}

function addSummarySheet(workbook: ExcelJS.Workbook, report: SalesReportData, options: SalesWorkbookOptions) {
  const sheet = workbook.addWorksheet("סיכום", { properties: { tabColor: { argb: COLORS.brand } } });
  setupSheet(sheet);
  sheet.columns = Array.from({ length: 8 }, () => ({ width: 18 }));
  const scopeLabel = options.scope === "admin" ? "דוח ניהולי" : `דוח אישי · ${options.ownerName ?? "איש מכירות"}`;
  styleTitle(sheet, "דוח מכירות Gestelit", `${scopeLabel} | ${new Date(report.dateFrom).toLocaleDateString("he-IL")} - ${new Date(report.dateTo).toLocaleDateString("he-IL")} | הופק ${new Date(report.generatedAt).toLocaleString("he-IL")}`);

  sectionHeader(sheet, 4, "תמונת מצב");
  metric(sheet, 5, 1, "פעילויות", report.summary.analytics.filteredCount, COLORS.blueSoft);
  metric(sheet, 5, 2, "פולואפים פתוחים", report.summary.openFollowUps, COLORS.amberSoft);
  metric(sheet, 5, 3, "פולואפים באיחור", report.summary.overdueFollowUps, report.summary.overdueFollowUps ? COLORS.redSoft : COLORS.greenSoft);
  metric(sheet, 5, 4, "פתוח", report.summary.analytics.funnel.open, COLORS.blueSoft);
  metric(sheet, 5, 5, "זכיות", report.summary.analytics.funnel.won, COLORS.greenSoft);
  metric(sheet, 5, 6, "אבד", report.summary.analytics.funnel.lost, COLORS.redSoft);
  metric(sheet, 5, 7, "שיעור זכייה", `${Math.round(report.summary.analytics.funnel.winRate * 100)}%`, COLORS.greenSoft);
  metric(sheet, 5, 8, "שיוך לאינדקס", `${report.summary.analytics.dataQuality.clientLinkRate}%`, COLORS.brandSoft);
  sheet.getRow(5).height = 24;
  sheet.getRow(6).height = 34;

  sectionHeader(sheet, 8, "כספים לפי מטבע - ללא ערבוב מטבעות");
  sheet.getRow(9).values = ["מטבע", "פייפליין פתוח", "הכנסה שנסגרה", "עסקאות פתוחות", "זכיות"];
  styleTableHeader(sheet.getRow(9));
  let row = 10;
  for (const currency of report.summary.analytics.currencies) {
    sheet.getRow(row).values = [currency.currency, money(currency.estimatedPipeline, currency.currency), money(currency.wonRevenue, currency.currency), currency.openCount, currency.wonCount];
    styleBodyRow(sheet.getRow(row), row % 2 === 0);
    row += 1;
  }
  if (row === 10) {
    sheet.getCell("A10").value = "אין סכומים בתקופה שנבחרה";
    sheet.getCell("A10").font = { italic: true, color: { argb: COLORS.muted } };
    row += 1;
  }

  sectionHeader(sheet, row + 1, "לקוחות והזדמנויות מובילים");
  const headerRow = row + 2;
  sheet.getRow(headerRow).values = ["לקוח", "איש מכירות", "קבוצה", "פעילויות", "פייפליין", "פעולה הבאה", "ציון עדיפות", "פעילות אחרונה"];
  styleTableHeader(sheet.getRow(headerRow));
  let opportunityRow = headerRow + 1;
  for (const item of report.summary.analytics.opportunities.slice(0, 15)) {
    sheet.getRow(opportunityRow).values = [item.customerName, item.salesperson, item.customerGroup, item.activityCount, item.estimatedPipeline, item.nextActionDate ? asDate(item.nextActionDate) : null, item.priorityScore, asDate(item.lastActivityAt)];
    sheet.getCell(opportunityRow, 5).numFmt = "#,##0.00";
    sheet.getCell(opportunityRow, 6).numFmt = "dd/mm/yyyy";
    sheet.getCell(opportunityRow, 8).numFmt = "dd/mm/yyyy hh:mm";
    styleBodyRow(sheet.getRow(opportunityRow), opportunityRow % 2 === 0);
    opportunityRow += 1;
  }

  sectionHeader(sheet, opportunityRow + 1, "איכות דיווח");
  const quality = report.summary.analytics.dataQuality;
  const qualityRows = [
    ["שיוך לקוח לאינדקס", quality.clientLinkRate],
    ["תיעוד סכום", quality.valueCaptureRate],
    ["תיעוד איש קשר", quality.contactCaptureRate],
    ["פעולה הבאה", quality.nextActionRate],
    ["סגירת תוצאה", quality.outcomeClosureRate],
  ];
  qualityRows.forEach(([label, value], index) => {
    const target = opportunityRow + 2 + index;
    sheet.getRow(target).values = [label, `${value}%`];
    styleBodyRow(sheet.getRow(target), index % 2 === 0);
  });
}

function styleTableHeader(row: ExcelJS.Row) {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ink } };
    cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
  });
}

function styleBodyRow(row: ExcelJS.Row, alternate: boolean) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: "Arial", size: 10, color: { argb: COLORS.ink } };
    cell.alignment = { horizontal: "right", vertical: "top", wrapText: true };
    if (alternate) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.surface } };
    cell.border = { bottom: { style: "hair", color: { argb: COLORS.border } } };
  });
}

function addActivitySheet(workbook: ExcelJS.Workbook, report: SalesReportData) {
  const sheet = workbook.addWorksheet("פעילויות", { properties: { tabColor: { argb: COLORS.blue } } });
  setupSheet(sheet);
  sheet.views = [{ rightToLeft: true, state: "frozen", ySplit: 4 }];
  sheet.columns = [
    { width: 20 }, { width: 16 }, { width: 14 }, { width: 24 }, { width: 13 }, { width: 20 },
    { width: 14 }, { width: 42 }, { width: 42 }, { width: 24 }, { width: 15 }, { width: 16 }, { width: 14 },
    { width: 18 }, { width: 17 }, { width: 15 }, { width: 15 },
  ];
  styleTitle(sheet, "פירוט פעילויות", `${report.rows.length} רשומות | כל הסכומים נשמרים במטבע המקורי`);
  sheet.mergeCells("A3:Q3");
  sheet.getCell("A3").value = "הערות וסיכומי AI מופיעים לצורך בקרה תפעולית. מקור הנתונים הוא דיווחי המשתמשים במערכת.";
  sheet.getCell("A3").font = { name: "Arial", size: 9, italic: true, color: { argb: COLORS.muted } };
  sheet.getCell("A3").alignment = { horizontal: "right" };
  const headers = ["תאריך ושעה", "איש מכירות", "סוג פעילות", "לקוח", "קוד לקוח", "איש קשר", "קשר בפועל", "תיאור", "סיכום AI", "פעולה הבאה", "תאריך פעולה", "סטטוס", "מטבע", "פייפליין", "הכנסה בפועל", "קבוצה", "אזור"];
  sheet.getRow(4).values = headers;
  styleTableHeader(sheet.getRow(4));
  sheet.autoFilter = { from: "A4", to: "Q4" };

  report.rows.forEach((item, index) => {
    const rowIndex = index + 5;
    const row = sheet.getRow(rowIndex);
    row.values = [
      asDate(item.event_at), item.salesperson, eventLabels[item.event_type] ?? item.event_type,
      item.customer_name, item.customer_code, item.contact_person,
      item.contact_occurred === true ? "כן" : item.contact_occurred === false ? "לא" : "לא סומן",
      item.raw_note, item.ai_summary,
      item.ai_next_action, item.next_action_date ? asDate(item.next_action_date) : null,
      statusLabels[item.status] ?? item.status, item.currency || "ILS", Number(item.estimated_revenue ?? 0),
      Number(item.actual_revenue ?? 0), item.customer_group, item.area,
    ];
    row.getCell(1).numFmt = "dd/mm/yyyy hh:mm";
    row.getCell(11).numFmt = "dd/mm/yyyy";
    row.getCell(14).numFmt = "#,##0.00";
    row.getCell(15).numFmt = "#,##0.00";
    row.height = 34;
    styleBodyRow(row, index % 2 === 1);
    const status = item.status;
    row.getCell(12).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: status === "won" ? COLORS.greenSoft : status === "lost" ? COLORS.redSoft : status === "follow_up" ? COLORS.amberSoft : COLORS.blueSoft },
    };
  });
}

function addPerformanceSheet(workbook: ExcelJS.Workbook, report: SalesReportData, personal: boolean) {
  const sheet = workbook.addWorksheet(personal ? "הביצועים שלי" : "ביצועי צוות", { properties: { tabColor: { argb: COLORS.green } } });
  setupSheet(sheet);
  sheet.columns = [{ width: 24 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 17 }, { width: 17 }, { width: 12 }, { width: 20 }];
  styleTitle(sheet, personal ? "הביצועים שלי" : "ביצועי צוות", "תוצאה לצד פעילות; הכנסות ופייפליין מוצגים לפי מטבע");
  sheet.getRow(4).values = ["איש מכירות", "מטבע", "פעילויות", "לקוחות", "זכיות", "שיעור המרה", "פייפליין", "באיחור", "פעילות אחרונה"];
  styleTableHeader(sheet.getRow(4));
  report.summary.analytics.reps.forEach((rep, index) => {
    const row = sheet.getRow(index + 5);
    row.values = [rep.salesperson, rep.currency, rep.activityCount, rep.uniqueClients, rep.wonCount, rep.conversionRate, rep.estimatedPipeline, rep.overdueFollowUps, asDate(rep.lastActivityAt)];
    row.getCell(6).numFmt = "0%";
    row.getCell(7).numFmt = "#,##0.00";
    row.getCell(9).numFmt = "dd/mm/yyyy hh:mm";
    styleBodyRow(row, index % 2 === 1);
  });
}

function addMetadataSheet(workbook: ExcelJS.Workbook, report: SalesReportData, options: SalesWorkbookOptions) {
  const sheet = workbook.addWorksheet("פרטי הדוח", { properties: { tabColor: { argb: COLORS.muted } } });
  setupSheet(sheet);
  sheet.columns = [{ width: 26 }, { width: 64 }];
  styleTitle(sheet, "פרטי הדוח", "עקיבות, חתך והגדרות שימוש");
  const filters = options.filters ?? {};
  const rows: Array<[string, string | number]> = [
    ["היקף הרשאה", options.scope === "admin" ? "ניהולי - כל הרשומות המורשות" : `אישי - ${options.ownerName ?? "משתמש מחובר"}`],
    ["הופק בתאריך", new Date(report.generatedAt).toLocaleString("he-IL")],
    ["מתאריך", new Date(report.dateFrom).toLocaleString("he-IL")],
    ["עד תאריך", new Date(report.dateTo).toLocaleString("he-IL")],
    ["איש מכירות", options.scope === "personal" ? options.ownerName ?? "משתמש מחובר" : filters.salesperson ?? "הכל"],
    ["לקוח", filters.client ?? "הכל"],
    ["סוג פעילות", filters.eventType ? eventLabels[filters.eventType] ?? filters.eventType : "הכל"],
    ["סטטוס", filters.status ? statusLabels[filters.status] ?? filters.status : "הכל"],
    ["מנהל לקוח", filters.accountManager ?? "הכל"],
    ["קבוצת לקוח", filters.customerGroup ?? "הכל"],
    ["אזור", filters.area ?? "הכל"],
    ["מצב קשר", filters.dormancyBucket ?? "הכל"],
    ["כיסוי נתונים", filters.coverage ?? "הכל"],
    ["מספר רשומות", report.rows.length],
    ["כיסוי היסטורי", "פעילויות Gestelit מלאות בטווח הנבחר; CRM היסטורי מ-BINA עדיין לא מחובר"],
    ["הערת מטבע", "המערכת אינה מחברת מטבעות שונים. יש לנתח כל מטבע בנפרד."],
    ["שימוש", "דוח תפעולי לקריאה וניתוח. הנתונים משקפים דיווחי משתמשים ואינם תחליף למערכת הנהלת חשבונות."],
  ];
  sheet.getRow(4).values = ["שדה", "ערך"];
  styleTableHeader(sheet.getRow(4));
  rows.forEach(([label, value], index) => {
    const row = sheet.getRow(index + 5);
    row.values = [label, value];
    styleBodyRow(row, index % 2 === 1);
  });
}

export async function createSalesWorkbook(report: SalesReportData, options: SalesWorkbookOptions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gestelit";
  workbook.company = "Gestelit";
  workbook.created = new Date(report.generatedAt);
  workbook.modified = new Date(report.generatedAt);
  workbook.calcProperties.fullCalcOnLoad = true;

  addSummarySheet(workbook, report, options);
  addActivitySheet(workbook, report);
  addPerformanceSheet(workbook, report, options.scope === "personal");
  addMetadataSheet(workbook, report, options);

  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
