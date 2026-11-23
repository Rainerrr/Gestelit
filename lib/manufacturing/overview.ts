import type { LiveJobProgress } from "@/lib/types";

export function israelDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function summarizeJob(entry: LiveJobProgress, today: string) {
  const items = entry.jobItems;
  const planned = items.reduce((sum, item) => sum + item.plannedQuantity, 0);
  const good = items.reduce((sum, item) => sum + item.completedGood, 0);
  const scrap = items.reduce((sum, item) => sum + item.completedScrap, 0);
  // Completion is per item: overproduction of one product cannot complete another.
  const completed =
    items.length > 0 &&
    items.every(
      (item) =>
        item.plannedQuantity > 0 &&
        item.completedGood + item.completedScrap >= item.plannedQuantity,
    );
  const needsSetup =
    !items.length ||
    items.some(
      (item) => item.plannedQuantity <= 0 || !item.wipDistribution.length,
    );
  const due = entry.job.due_date?.slice(0, 10) ?? null;
  const overdue = !completed && !!due && due < today;
  const dueToday = !completed && due === today;
  const credited = items.reduce(
    (sum, item) =>
      sum +
      Math.min(item.plannedQuantity, item.completedGood + item.completedScrap),
    0,
  );
  return {
    ...entry,
    planned,
    good,
    scrap,
    completed,
    needsSetup,
    overdue,
    dueToday,
    percent:
      planned > 0
        ? Math.min(completed ? 100 : 99, Math.round((credited / planned) * 100))
        : 0,
  };
}

export function buildOverview(jobs: LiveJobProgress[], today: string, includeTests = false) {
  const rows = jobs
    .filter((entry) => includeTests || !entry.job.is_test)
    .map((job) => summarizeJob(job, today))
    .filter((job) => !job.completed || job.activeSessionCount > 0);
  rows.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      Number(b.dueToday) - Number(a.dueToday) ||
      Number(b.needsSetup) - Number(a.needsSetup) ||
      (a.job.due_date ?? "9999").localeCompare(b.job.due_date ?? "9999") ||
      a.job.job_number.localeCompare(b.job.job_number),
  );
  return {
    rows,
    overdue: rows.filter((j) => j.overdue).length,
    dueToday: rows.filter((j) => j.dueToday).length,
    needsSetup: rows.filter((j) => j.needsSetup).length,
    waiting: rows.filter((j) => !j.completed && j.activeSessionCount === 0)
      .length,
  };
}
